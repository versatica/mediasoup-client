const sdpTransform = require('sdp-transform');
const Logger = require('../../Logger');

const logger = new Logger('RemoteUnifiedPlanSdp');

class RemoteUnifiedPlanSdp
{
	constructor(
		{
			iceParameters,
			iceCandidates,
			dtlsParameters,
			sendingRemoteRtpParametersByKind
		})
	{
		// Transport remote ICE parameters.
		// @type {RTCIceParameters}
		this._remoteIceParameters = iceParameters;

		// Transport remote ICE candidates.
		// @type {Array<RTCIceCandidate>}
		this._remoteIceCandidates = iceCandidates;

		// Transport remote DTLS parameters.
		// @type {RTCDtlsParameters}
		this._remoteDtlsParameters = dtlsParameters;

		// Generic sending RTP parameters for audio and video suitable for the SDP
		// remote answer.
		// @type {RTCRtpParameters}
		this._sendingRemoteRtpParametersByKind = sendingRemoteRtpParametersByKind;

		// SDP global fields.
		// @type {Object}
		this._sdpGlobalFields =
		{
			id      : 1000000,
			version : 0
		};
	}

	updateTransportRemoteIceParameters(iceParameters)
	{
		logger.debug(
			'updateTransportRemoteIceParameters() [iceParameters:%o]',
			iceParameters);

		this._remoteIceParameters = iceParameters;
	}

	updateTransportRemoteDtlsRole(role)
	{
		logger.debug('updateTransportRemoteDtlsRole() [role:%s]', role);

		this._remoteDtlsParameters.role = role;
	}

	createAnswerSdp(localSdpObj)
	{
		logger.debug('createAnswerSdp()');

		const sdpObj = {};
		const bundleMids = (localSdpObj.media || [])
			.filter((m) => m.hasOwnProperty('mid'))
			.map((m) => String(m.mid));

		// Increase our SDP version.
		this._sdpGlobalFields.version++;

		sdpObj.version = 0;
		sdpObj.origin =
		{
			address        : '0.0.0.0',
			ipVer          : 4,
			netType        : 'IN',
			sessionId      : this._sdpGlobalFields.id,
			sessionVersion : this._sdpGlobalFields.version,
			username       : 'mediasoup-client'
		};
		sdpObj.name = '-';
		sdpObj.timing = { start: 0, stop: 0 };
		sdpObj.icelite = this._remoteIceParameters.iceLite ? 'ice-lite' : null;
		sdpObj.msidSemantic =
		{
			semantic : 'WMS',
			token    : '*'
		};

		if (bundleMids.length > 0)
		{
			sdpObj.groups =
			[
				{
					type : 'BUNDLE',
					mids : bundleMids.join(' ')
				}
			];
		}

		sdpObj.media = [];

		// NOTE: We take the latest fingerprint.
		const numFingerprints = this._remoteDtlsParameters.fingerprints.length;

		sdpObj.fingerprint =
		{
			type : this._remoteDtlsParameters.fingerprints[numFingerprints - 1].algorithm,
			hash : this._remoteDtlsParameters.fingerprints[numFingerprints - 1].value
		};

		for (const localMediaObj of localSdpObj.media || [])
		{
			const closed = localMediaObj.direction === 'inactive';
			const kind = localMediaObj.type;
			const codecs = this._sendingRemoteRtpParametersByKind[kind].codecs;
			const headerExtensions =
				this._sendingRemoteRtpParametersByKind[kind].headerExtensions;
			const remoteMediaObj = {};

			remoteMediaObj.type = localMediaObj.type;
			remoteMediaObj.port = 7;
			remoteMediaObj.protocol = 'RTP/SAVPF';
			remoteMediaObj.connection = { ip: '127.0.0.1', version: 4 };
			remoteMediaObj.mid = localMediaObj.mid;

			remoteMediaObj.iceUfrag = this._remoteIceParameters.usernameFragment;
			remoteMediaObj.icePwd = this._remoteIceParameters.password;
			remoteMediaObj.candidates = [];

			for (const candidate of this._remoteIceCandidates)
			{
				const candidateObj = {};

				// mediasoup does not support no rtcp-mux so candidates component is
				// always RTP (1).
				candidateObj.component = 1;
				candidateObj.foundation = candidate.foundation;
				candidateObj.ip = candidate.ip;
				candidateObj.port = candidate.port;
				candidateObj.priority = candidate.priority;
				candidateObj.transport = candidate.protocol;
				candidateObj.type = candidate.type;
				if (candidate.tcpType)
					candidateObj.tcptype = candidate.tcpType;

				remoteMediaObj.candidates.push(candidateObj);
			}

			remoteMediaObj.endOfCandidates = 'end-of-candidates';

			// Announce support for ICE renomination.
			// https://tools.ietf.org/html/draft-thatcher-ice-renomination
			remoteMediaObj.iceOptions = 'renomination';

			switch (this._remoteDtlsParameters.role)
			{
				case 'client':
					remoteMediaObj.setup = 'active';
					break;
				case 'server':
					remoteMediaObj.setup = 'passive';
					break;
			}

			switch (localMediaObj.direction)
			{
				case 'sendrecv':
				case 'sendonly':
					remoteMediaObj.direction = 'recvonly';
					break;
				case 'recvonly':
				case 'inactive':
					remoteMediaObj.direction = 'inactive';
					break;
			}

			remoteMediaObj.rtp = [];
			remoteMediaObj.rtcpFb = [];
			remoteMediaObj.fmtp = [];

			for (const codec of codecs)
			{
				const rtp =
				{
					payload : codec.payloadType,
					codec   : codec.name,
					rate    : codec.clockRate
				};

				if (codec.channels > 1)
					rtp.encoding = codec.channels;

				remoteMediaObj.rtp.push(rtp);

				if (codec.parameters)
				{
					const paramFmtp =
					{
						payload : codec.payloadType,
						config  : ''
					};

					for (const key of Object.keys(codec.parameters))
					{
						if (paramFmtp.config)
							paramFmtp.config += ';';

						paramFmtp.config += `${key}=${codec.parameters[key]}`;
					}

					if (paramFmtp.config)
						remoteMediaObj.fmtp.push(paramFmtp);
				}

				if (codec.rtcpFeedback)
				{
					for (const fb of codec.rtcpFeedback)
					{
						remoteMediaObj.rtcpFb.push(
							{
								payload : codec.payloadType,
								type    : fb.type,
								subtype : fb.parameter || ''
							});
					}
				}
			}

			remoteMediaObj.payloads = codecs
				.map((codec) => codec.payloadType)
				.join(' ');

			// NOTE: Firefox does not like a=extmap lines if a=inactive.
			if (!closed)
			{
				remoteMediaObj.ext = [];

				for (const ext of headerExtensions)
				{
					// Don't add a header extension if not present in the offer.
					const matchedLocalExt = (localMediaObj.ext || [])
						.find((localExt) => localExt.uri === ext.uri);

					if (!matchedLocalExt)
						continue;

					remoteMediaObj.ext.push(
						{
							uri   : ext.uri,
							value : ext.id
						});
				}
			}

			// Simulcast (draft version 03).
			if (localMediaObj.simulcast_03)
			{
				// eslint-disable-next-line camelcase
				remoteMediaObj.simulcast_03 =
				{
					value : localMediaObj.simulcast_03.value.replace(/send/g, 'recv')
				};

				remoteMediaObj.rids = [];

				for (const rid of localMediaObj.rids || [])
				{
					if (rid.direction !== 'send')
						continue;

					remoteMediaObj.rids.push(
						{
							id        : rid.id,
							direction : 'recv'
						});
				}
			}

			remoteMediaObj.rtcpMux = 'rtcp-mux';
			remoteMediaObj.rtcpRsize = 'rtcp-rsize';

			// Push it.
			sdpObj.media.push(remoteMediaObj);
		}

		const sdp = sdpTransform.write(sdpObj);

		return sdp;
	}

	/**
	 * @param {Array<Object>} receiverInfos - Receiver informations.
	 *
	 * @returns {String}
	 */
	createOfferSdp(receiverInfos)
	{
		logger.debug('createOfferSdp()');

		const sdpObj = {};
		const mids = receiverInfos
			.map((receiverInfo) => String(receiverInfo.mid));

		// Increase our SDP version.
		this._sdpGlobalFields.version++;

		sdpObj.version = 0;
		sdpObj.origin =
		{
			address        : '0.0.0.0',
			ipVer          : 4,
			netType        : 'IN',
			sessionId      : this._sdpGlobalFields.id,
			sessionVersion : this._sdpGlobalFields.version,
			username       : 'mediasoup-client'
		};
		sdpObj.name = '-';
		sdpObj.timing = { start: 0, stop: 0 };
		sdpObj.icelite = this._remoteIceParameters.iceLite ? 'ice-lite' : null;
		sdpObj.msidSemantic =
		{
			semantic : 'WMS',
			token    : '*'
		};

		if (mids.length > 0)
		{
			sdpObj.groups =
			[
				{
					type : 'BUNDLE',
					mids : mids.join(' ')
				}
			];
		}

		sdpObj.media = [];

		// NOTE: We take the latest fingerprint.
		const numFingerprints = this._remoteDtlsParameters.fingerprints.length;

		sdpObj.fingerprint =
		{
			type : this._remoteDtlsParameters.fingerprints[numFingerprints - 1].algorithm,
			hash : this._remoteDtlsParameters.fingerprints[numFingerprints - 1].value
		};

		for (const receiverInfo of receiverInfos)
		{
			const {
				mid,
				kind,
				closed,
				streamId,
				trackId,
				rtpParameters
			} = receiverInfo;
			const { codecs, headerExtensions, encodings, rtcp } = rtpParameters;
			const remoteMediaObj = {};

			if (kind !== 'application')
			{
				remoteMediaObj.type = kind;
				remoteMediaObj.port = 7;
				remoteMediaObj.protocol = 'RTP/SAVPF';
				remoteMediaObj.connection = { ip: '127.0.0.1', version: 4 };
				remoteMediaObj.mid = mid;
				remoteMediaObj.msid = `${streamId} ${trackId}`;
			}
			else
			{
				remoteMediaObj.type = kind;
				remoteMediaObj.port = 9;
				remoteMediaObj.protocol = 'DTLS/SCTP';
				remoteMediaObj.connection = { ip: '127.0.0.1', version: 4 };
				remoteMediaObj.mid = mid;
			}

			remoteMediaObj.iceUfrag = this._remoteIceParameters.usernameFragment;
			remoteMediaObj.icePwd = this._remoteIceParameters.password;
			remoteMediaObj.candidates = [];

			for (const candidate of this._remoteIceCandidates)
			{
				const candidateObj = {};

				// mediasoup does not support no rtcp-mux so candidates component is
				// always RTP (1).
				candidateObj.component = 1;
				candidateObj.foundation = candidate.foundation;
				candidateObj.ip = candidate.ip;
				candidateObj.port = candidate.port;
				candidateObj.priority = candidate.priority;
				candidateObj.transport = candidate.protocol;
				candidateObj.type = candidate.type;
				if (candidate.tcpType)
					candidateObj.tcptype = candidate.tcpType;

				remoteMediaObj.candidates.push(candidateObj);
			}

			remoteMediaObj.endOfCandidates = 'end-of-candidates';

			// Announce support for ICE renomination.
			// https://tools.ietf.org/html/draft-thatcher-ice-renomination
			remoteMediaObj.iceOptions = 'renomination';

			remoteMediaObj.setup = 'actpass';

			// Audio or video.
			if (kind !== 'application')
			{
				if (!closed)
					remoteMediaObj.direction = 'sendonly';
				else
					remoteMediaObj.direction = 'inactive';

				remoteMediaObj.rtp = [];
				remoteMediaObj.rtcpFb = [];
				remoteMediaObj.fmtp = [];

				for (const codec of codecs)
				{
					const rtp =
					{
						payload : codec.payloadType,
						codec   : codec.name,
						rate    : codec.clockRate
					};

					if (codec.channels > 1)
						rtp.encoding = codec.channels;

					remoteMediaObj.rtp.push(rtp);

					if (codec.parameters)
					{
						const paramFmtp =
						{
							payload : codec.payloadType,
							config  : ''
						};

						for (const key of Object.keys(codec.parameters))
						{
							if (paramFmtp.config)
								paramFmtp.config += ';';

							paramFmtp.config += `${key}=${codec.parameters[key]}`;
						}

						if (paramFmtp.config)
							remoteMediaObj.fmtp.push(paramFmtp);
					}

					if (codec.rtcpFeedback)
					{
						for (const fb of codec.rtcpFeedback)
						{
							remoteMediaObj.rtcpFb.push(
								{
									payload : codec.payloadType,
									type    : fb.type,
									subtype : fb.parameter || ''
								});
						}
					}
				}

				remoteMediaObj.payloads = codecs
					.map((codec) => codec.payloadType)
					.join(' ');

				// NOTE: Firefox does not like a=extmap lines if a=inactive.
				if (!closed)
				{
					remoteMediaObj.ext = [];

					for (const ext of headerExtensions)
					{
						// Ignore MID RTP extension for receiving media.
						if (ext.uri === 'urn:ietf:params:rtp-hdrext:sdes:mid')
							continue;

						remoteMediaObj.ext.push(
							{
								uri   : ext.uri,
								value : ext.id
							});
					}
				}

				remoteMediaObj.rtcpMux = 'rtcp-mux';
				remoteMediaObj.rtcpRsize = 'rtcp-rsize';

				if (!closed)
				{
					const encoding = encodings[0];
					const ssrc = encoding.ssrc;
					let rtxSsrc;

					if (encoding.rtx && encoding.rtx.ssrc)
						rtxSsrc = encoding.rtx.ssrc;

					remoteMediaObj.ssrcs = [];
					remoteMediaObj.ssrcGroups = [];
					remoteMediaObj.ssrcs.push(
						{
							id        : ssrc,
							attribute : 'cname',
							value     : rtcp.cname
						});

					if (rtxSsrc)
					{
						remoteMediaObj.ssrcs.push(
							{
								id        : rtxSsrc,
								attribute : 'cname',
								value     : rtcp.cname
							});

						// Associate original and retransmission SSRC.
						remoteMediaObj.ssrcGroups.push(
							{
								semantics : 'FID',
								ssrcs     : `${ssrc} ${rtxSsrc}`
							});
					}
				}
			}
			// DataChannel.
			else
			{
				remoteMediaObj.payloads = 5000;
				remoteMediaObj.sctpmap =
				{
					app            : 'webrtc-datachannel',
					maxMessageSize : 256,
					sctpmapNumber  : 5000
				};
			}

			// Push it.
			sdpObj.media.push(remoteMediaObj);
		}

		const sdp = sdpTransform.write(sdpObj);

		return sdp;
	}
}

module.exports = RemoteUnifiedPlanSdp;
