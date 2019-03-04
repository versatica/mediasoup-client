const Logger = require('../../Logger');

const logger = new Logger('RemotePlanBSdp');

class RemotePlanBSdp
{
	constructor(
		{
			iceParameters,
			iceCandidates,
			dtlsParameters,
			sendingRemoteRtpParametersByKind,
			receivingRtpParametersByKind
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

		// Generic receiving RTP parameters for audio and video.
		// @type {RTCRtpParameters}
		this._receivingRtpParametersByKind = receivingRtpParametersByKind;

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

	createAnswerSdpObject(localSdpObj)
	{
		logger.debug('createAnswerSdpObject()');

		const sdpObj = {};
		const mids = (localSdpObj.media || [])
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
		sdpObj.groups =
		[
			{
				type : 'BUNDLE',
				mids : mids.join(' ')
			}
		];
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

			// If video, be ready for simulcast.
			if (kind === 'video')
				remoteMediaObj.xGoogleFlag = 'conference';

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

			remoteMediaObj.rtcpMux = 'rtcp-mux';
			remoteMediaObj.rtcpRsize = 'rtcp-rsize';

			// Push it.
			sdpObj.media.push(remoteMediaObj);
		}

		return sdpObj;
	}

	/**
	 * @param {Array<String>} kinds - Media kinds.
	 * @param {Array<Object>} receiverInfos - Receiver informations.
	 *
	 * @returns {Object} sdpObj
	 */
	createOfferSdpObject(kinds, receiverInfos)
	{
		logger.debug('createOfferSdpObject()');

		const sdpObj = {};
		const mids = kinds;

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
		sdpObj.groups =
		[
			{
				type : 'BUNDLE',
				mids : mids.join(' ')
			}
		];
		sdpObj.media = [];

		// NOTE: We take the latest fingerprint.
		const numFingerprints = this._remoteDtlsParameters.fingerprints.length;

		sdpObj.fingerprint =
		{
			type : this._remoteDtlsParameters.fingerprints[numFingerprints - 1].algorithm,
			hash : this._remoteDtlsParameters.fingerprints[numFingerprints - 1].value
		};

		for (const kind of kinds)
		{
			const codecs = this._receivingRtpParametersByKind[kind].codecs;
			const headerExtensions = this._receivingRtpParametersByKind[kind].headerExtensions;
			const remoteMediaObj = {};

			remoteMediaObj.type = kind;
			remoteMediaObj.port = 7;
			remoteMediaObj.protocol = 'RTP/SAVPF';
			remoteMediaObj.connection = { ip: '127.0.0.1', version: 4 };
			remoteMediaObj.mid = kind;

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

			if (receiverInfos.some((receiverInfo) => receiverInfo.kind === kind))
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

			remoteMediaObj.rtcpMux = 'rtcp-mux';
			remoteMediaObj.rtcpRsize = 'rtcp-rsize';

			remoteMediaObj.ssrcs = [];
			remoteMediaObj.ssrcGroups = [];

			for (const receiverInfo of receiverInfos)
			{
				if (receiverInfo.kind !== kind)
					continue;

				remoteMediaObj.ssrcs.push(
					{
						id        : receiverInfo.ssrc,
						attribute : 'msid',
						value     : `${receiverInfo.streamId} ${receiverInfo.trackId}`
					});

				remoteMediaObj.ssrcs.push(
					{
						id        : receiverInfo.ssrc,
						attribute : 'mslabel',
						value     : receiverInfo.streamId
					});

				remoteMediaObj.ssrcs.push(
					{
						id        : receiverInfo.ssrc,
						attribute : 'label',
						value     : receiverInfo.trackId
					});

				remoteMediaObj.ssrcs.push(
					{
						id        : receiverInfo.ssrc,
						attribute : 'cname',
						value     : receiverInfo.cname
					});

				if (receiverInfo.rtxSsrc)
				{
					remoteMediaObj.ssrcs.push(
						{
							id        : receiverInfo.rtxSsrc,
							attribute : 'msid',
							value     : `${receiverInfo.streamId} ${receiverInfo.trackId}`
						});

					remoteMediaObj.ssrcs.push(
						{
							id        : receiverInfo.rtxSsrc,
							attribute : 'mslabel',
							value     : receiverInfo.streamId
						});

					remoteMediaObj.ssrcs.push(
						{
							id        : receiverInfo.rtxSsrc,
							attribute : 'label',
							value     : receiverInfo.trackId
						});

					remoteMediaObj.ssrcs.push(
						{
							id        : receiverInfo.rtxSsrc,
							attribute : 'cname',
							value     : receiverInfo.cname
						});

					// Associate original and retransmission SSRCs.
					remoteMediaObj.ssrcGroups.push(
						{
							semantics : 'FID',
							ssrcs     : `${receiverInfo.ssrc} ${receiverInfo.rtxSsrc}`
						});
				}
			}

			// Push it.
			sdpObj.media.push(remoteMediaObj);
		}

		return sdpObj;
	}
}

module.exports = RemotePlanBSdp;
