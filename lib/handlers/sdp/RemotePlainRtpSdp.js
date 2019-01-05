const sdpTransform = require('sdp-transform');
const Logger = require('../../Logger');

const logger = new Logger('RemotePlainRtpSdp');

class RemotePlainRtpSdp
{
	constructor({ transportRemoteParameters, sendingRtpParametersByKind })
	{
		// Transport remote parameters.
		// @type {Object}
		this._transportRemoteParameters = transportRemoteParameters;

		// Generic sending RTP parameters for audio and video.
		// @type {Object}
		this._sendingRtpParametersByKind = sendingRtpParametersByKind;

		// SDP global fields.
		// @type {Object}
		this._sdpGlobalFields =
		{
			id      : 1000000,
			version : 0
		};
	}

	createAnswerSdp(localSdpObj)
	{
		logger.debug('createAnswerSdp()');

		if (!this._transportRemoteParameters)
			throw new Error('no transport remote parameters');

		const remotePlainRtpParameters =
			this._transportRemoteParameters.plainRtpParameters;
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
			const codecs = this._sendingRtpParametersByKind[kind].codecs;
			const headerExtensions = this._sendingRtpParametersByKind[kind].headerExtensions;
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

		if (!this._transportRemoteParameters)
			throw new Error('no transport remote parameters');

		const remotePlainRtpParameters = this._transportRemoteParameters.plainRtpParameters;
		const sdpObj = {};
		const mids = receiverInfos
			.map((receiverInfo) => String(receiverInfo.mid));

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

			remoteMediaObj.type = kind;
			remoteMediaObj.port = remotePlainRtpParameters.port;
			remoteMediaObj.protocol = 'RTP/AVP';
			remoteMediaObj.connection =
				{
					ip      : remotePlainRtpParameters.ip,
					version : remotePlainRtpParameters.version
				};
			remoteMediaObj.mid = mid;
			remoteMediaObj.msid = `${streamId} ${trackId}`;

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

			// Push it.
			sdpObj.media.push(remoteMediaObj);
		}

		const sdp = sdpTransform.write(sdpObj);

		return sdp;
	}
}

module.exports = RemotePlainRtpSdp;
