import sdpTransform from 'sdp-transform';
import Logger from '../../Logger';
import * as utils from '../../utils';

const logger = new Logger('RemoteUnifiedPlanSdp');

class RemoteSdp
{
	constructor(rtpParametersByKind)
	{
		// Generic sending RTP parameters for audio and video.
		// @type {Object}
		this._rtpParametersByKind = rtpParametersByKind;

		// Transport local parameters, including DTLS parameteres.
		// @type {Object}
		this._transportLocalParameters = null;

		// Transport remote parameters, including ICE parameters, ICE candidates
		// and DTLS parameteres.
		// @type {Object}
		this._transportRemoteParameters = null;

		// SDP global fields.
		// @type {Object}
		this._sdpGlobalFields =
		{
			id      : utils.randomNumber(),
			version : 0
		};
	}

	setTransportLocalParameters(transportLocalParameters)
	{
		logger.debug(
			'setTransportLocalParameters() [transportLocalParameters:%o]',
			transportLocalParameters);

		this._transportLocalParameters = transportLocalParameters;
	}

	setTransportRemoteParameters(transportRemoteParameters)
	{
		logger.debug(
			'setTransportRemoteParameters() [transportRemoteParameters:%o]',
			transportRemoteParameters);

		this._transportRemoteParameters = transportRemoteParameters;
	}

	updateTransportRemoteIceParameters(remoteIceParameters)
	{
		logger.debug(
			'updateTransportRemoteIceParameters() [remoteIceParameters:%o]',
			remoteIceParameters);

		this._transportRemoteParameters.iceParameters = remoteIceParameters;
	}
}

class SendRemoteSdp extends RemoteSdp
{
	constructor(rtpParametersByKind)
	{
		super(rtpParametersByKind);
	}

	createAnswerSdp(localSdpObj)
	{
		logger.debug('createAnswerSdp()');

		if (!this._transportLocalParameters)
			throw new Error('no transport local parameters');
		else if (!this._transportRemoteParameters)
			throw new Error('no transport remote parameters');

		const remoteIceParameters = this._transportRemoteParameters.iceParameters;
		const remoteIceCandidates = this._transportRemoteParameters.iceCandidates;
		const remoteDtlsParameters = this._transportRemoteParameters.dtlsParameters;
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
		sdpObj.icelite = remoteIceParameters.iceLite ? 'ice-lite' : null;
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
		const numFingerprints = remoteDtlsParameters.fingerprints.length;

		sdpObj.fingerprint =
		{
			type : remoteDtlsParameters.fingerprints[numFingerprints - 1].algorithm,
			hash : remoteDtlsParameters.fingerprints[numFingerprints - 1].value
		};

		for (const localMediaObj of localSdpObj.media || [])
		{
			const closed = localMediaObj.direction === 'inactive';
			const kind = localMediaObj.type;
			const codecs = this._rtpParametersByKind[kind].codecs;
			const headerExtensions = this._rtpParametersByKind[kind].headerExtensions;
			const remoteMediaObj = {};

			remoteMediaObj.type = localMediaObj.type;
			remoteMediaObj.port = 7;
			remoteMediaObj.protocol = 'RTP/SAVPF';
			remoteMediaObj.connection = { ip: '127.0.0.1', version: 4 };
			remoteMediaObj.mid = localMediaObj.mid;

			remoteMediaObj.iceUfrag = remoteIceParameters.usernameFragment;
			remoteMediaObj.icePwd = remoteIceParameters.password;
			remoteMediaObj.candidates = [];

			for (const candidate of remoteIceCandidates)
			{
				const candidateObj = {};

				// mediasoup does not support non rtcp-mux so candidates component is
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

			switch (remoteDtlsParameters.role)
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

			// Simulcast.
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
}

class RecvRemoteSdp extends RemoteSdp
{
	constructor(rtpParametersByKind)
	{
		super(rtpParametersByKind);
	}

	/**
	 * @param {Array<Object>} consumerInfos - Consumer informations.
	 * @return {String}
	 */
	createOfferSdp(consumerInfos)
	{
		logger.debug('createOfferSdp()');

		if (!this._transportRemoteParameters)
			throw new Error('no transport remote parameters');

		const remoteIceParameters = this._transportRemoteParameters.iceParameters;
		const remoteIceCandidates = this._transportRemoteParameters.iceCandidates;
		const remoteDtlsParameters = this._transportRemoteParameters.dtlsParameters;
		const sdpObj = {};
		const mids = consumerInfos
			.map((info) => String(info.mid));

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
		sdpObj.icelite = remoteIceParameters.iceLite ? 'ice-lite' : null;
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
		const numFingerprints = remoteDtlsParameters.fingerprints.length;

		sdpObj.fingerprint =
		{
			type : remoteDtlsParameters.fingerprints[numFingerprints - 1].algorithm,
			hash : remoteDtlsParameters.fingerprints[numFingerprints - 1].value
		};

		for (const info of consumerInfos)
		{
			const closed = info.closed;
			const kind = info.kind;
			let codecs;
			let headerExtensions;

			if (info.kind !== 'application')
			{
				codecs = this._rtpParametersByKind[kind].codecs;
				headerExtensions = this._rtpParametersByKind[kind].headerExtensions;
			}

			const remoteMediaObj = {};

			if (info.kind !== 'application')
			{
				remoteMediaObj.type = kind;
				remoteMediaObj.port = 7;
				remoteMediaObj.protocol = 'RTP/SAVPF';
				remoteMediaObj.connection = { ip: '127.0.0.1', version: 4 };
				remoteMediaObj.mid = info.mid;
				remoteMediaObj.msid = `${info.streamId} ${info.trackId}`;
			}
			else
			{
				remoteMediaObj.type = kind;
				remoteMediaObj.port = 9;
				remoteMediaObj.protocol = 'DTLS/SCTP';
				remoteMediaObj.connection = { ip: '127.0.0.1', version: 4 };
				remoteMediaObj.mid = info.mid;
			}

			remoteMediaObj.iceUfrag = remoteIceParameters.usernameFragment;
			remoteMediaObj.icePwd = remoteIceParameters.password;
			remoteMediaObj.candidates = [];

			for (const candidate of remoteIceCandidates)
			{
				const candidateObj = {};

				// mediasoup does not support non rtcp-mux so candidates component is
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

			if (info.kind !== 'application')
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
					remoteMediaObj.ssrcs = [];
					remoteMediaObj.ssrcGroups = [];

					remoteMediaObj.ssrcs.push(
						{
							id        : info.ssrc,
							attribute : 'cname',
							value     : info.cname
						});

					if (info.rtxSsrc)
					{
						remoteMediaObj.ssrcs.push(
							{
								id        : info.rtxSsrc,
								attribute : 'cname',
								value     : info.cname
							});

						// Associate original and retransmission SSRC.
						remoteMediaObj.ssrcGroups.push(
							{
								semantics : 'FID',
								ssrcs     : `${info.ssrc} ${info.rtxSsrc}`
							});
					}
				}
			}
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

export default class RemoteUnifiedPlanSdp
{
	constructor(direction, rtpParametersByKind)
	{
		logger.debug(
			'constructor() [direction:%s, rtpParametersByKind:%o]',
			direction, rtpParametersByKind);

		switch (direction)
		{
			case 'send':
				return new SendRemoteSdp(rtpParametersByKind);
			case 'recv':
				return new RecvRemoteSdp(rtpParametersByKind);
		}
	}
}
