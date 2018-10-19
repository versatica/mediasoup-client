import sdpTransform from 'sdp-transform';
import Logger from '../../Logger';
import * as utils from '../../utils';

const logger = new Logger('RemotePlainRtpSdp');

class RemoteSdp
{
	constructor(rtpParametersByKind)
	{
		// Generic sending RTP parameters for audio and video.
		// @type {Object}
		this._rtpParametersByKind = rtpParametersByKind;

		// Transport local parameters, including plain RTP parameteres.
		// @type {Object}
		this._transportLocalParameters = null;

		// Transport remote parameters, including plain RTP parameters.
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

		const remotePlainRtpParameters = this._transportRemoteParameters.plainRtpParameters;
		const sdpObj = {};
		const mids = (localSdpObj.media || [])
			.filter((m) => m.hasOwnProperty('mid'))
			.map((m) => String(m.mid));

		// Increase our SDP version.
		this._sdpGlobalFields.version++;

		sdpObj.version = 0;
		sdpObj.origin =
		{
			address        : remotePlainRtpParameters.ip,
			ipVer          : remotePlainRtpParameters.version,
			netType        : 'IN',
			sessionId      : this._sdpGlobalFields.id,
			sessionVersion : this._sdpGlobalFields.version,
			username       : 'mediasoup-client'
		};
		sdpObj.name = '-';
		sdpObj.timing = { start: 0, stop: 0 };

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

		for (const localMediaObj of localSdpObj.media || [])
		{
			const closed = localMediaObj.direction === 'inactive';
			const kind = localMediaObj.type;
			const codecs = this._rtpParametersByKind[kind].codecs;
			const headerExtensions = this._rtpParametersByKind[kind].headerExtensions;
			const remoteMediaObj = {};

			remoteMediaObj.type = localMediaObj.type;

			remoteMediaObj.port = remotePlainRtpParameters.port;
			remoteMediaObj.protocol = 'RTP/AVP';
			remoteMediaObj.connection =
				{
					ip      : remotePlainRtpParameters.ip,
					version : remotePlainRtpParameters.version
				};
			remoteMediaObj.mid = localMediaObj.mid;

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

		const remotePlainRtpParameters = this._transportRemoteParameters.plainRtpParameters;
		const sdpObj = {};
		const mids = consumerInfos
			.map((info) => String(info.mid));

		// Increase our SDP version.
		this._sdpGlobalFields.version++;

		sdpObj.version = 0;
		sdpObj.origin =
		{
			address        : remotePlainRtpParameters.ip,
			ipVer          : remotePlainRtpParameters.version,
			netType        : 'IN',
			sessionId      : this._sdpGlobalFields.id,
			sessionVersion : this._sdpGlobalFields.version,
			username       : 'mediasoup-client'
		};
		sdpObj.name = '-';
		sdpObj.timing = { start: 0, stop: 0 };

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

		for (const info of consumerInfos)
		{
			const closed = info.closed;
			const kind = info.kind;

			const codecs = this._rtpParametersByKind[kind].codecs;
			const headerExtensions = this._rtpParametersByKind[kind].headerExtensions;

			const remoteMediaObj = {};

			remoteMediaObj.type = kind;
			remoteMediaObj.mid = info.mid;
			remoteMediaObj.msid = `${info.streamId} ${info.trackId}`;

			remoteMediaObj.port = remotePlainRtpParameters.port;
			remoteMediaObj.protocol = 'RTP/AVP';
			remoteMediaObj.connection =
				{
					ip      : remotePlainRtpParameters.ip,
					version : remotePlainRtpParameters.version
				};

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
