const utils = require('../../utils');

class MediaSection
{
	constructor(
		{
			iceParameters = undefined,
			iceCandidates = undefined,
			dtlsParameters = undefined,
			planB = false
		} = {}
	)
	{
		// SDP media object.
		// @type {Object}
		this._mediaObject = {};

		// Whether this is Plan-B SDP.
		// @type {Boolean}
		this._planB = planB;

		if (iceParameters)
		{
			this.setIceParameters(iceParameters);
		}

		if (iceCandidates)
		{
			this._mediaObject.candidates = [];

			for (const candidate of iceCandidates)
			{
				const candidateObject = {};

				// mediasoup does mandates rtcp-mux so candidates component is always
				// RTP (1).
				candidateObject.component = 1;
				candidateObject.foundation = candidate.foundation;
				candidateObject.ip = candidate.ip;
				candidateObject.port = candidate.port;
				candidateObject.priority = candidate.priority;
				candidateObject.transport = candidate.protocol;
				candidateObject.type = candidate.type;
				if (candidate.tcpType)
					candidateObject.tcptype = candidate.tcpType;

				this._mediaObject.candidates.push(candidateObject);
			}

			this._mediaObject.endOfCandidates = 'end-of-candidates';
			this._mediaObject.iceOptions = 'renomination';
		}

		if (dtlsParameters)
		{
			this.setDtlsRole(dtlsParameters.role);
		}
	}

	/**
	 * @returns {String}
	 */
	get mid()
	{
		return this._mediaObject.mid;
	}

	/**
	 * @returns {Object}
	 */
	getObject()
	{
		return this._mediaObject;
	}

	/**
	 * @param {RTCIceParameters} iceParameters
	 */
	setIceParameters(iceParameters)
	{
		this._mediaObject.iceUfrag = iceParameters.usernameFragment;
		this._mediaObject.icePwd = iceParameters.password;
	}

	disable()
	{
		this._mediaObject.direction = 'inactive';

		delete this._mediaObject.ext;
		delete this._mediaObject.ssrcs;
		delete this._mediaObject.ssrcGroups;
		delete this._mediaObject.simulcast;
		delete this._mediaObject.simulcast_03;
		delete this._mediaObject.rids;
	}
}

class AnswerMediaSection extends MediaSection
{
	constructor(data)
	{
		super(data);

		const {
			offerMediaObject,
			offerRtpParameters,
			answerRtpParameters,
			plainRtpParameters,
			codecOptions
		} = data;

		this._mediaObject.mid = String(offerMediaObject.mid);
		this._mediaObject.type = offerMediaObject.type;

		if (!plainRtpParameters)
		{
			this._mediaObject.connection = { ip: '127.0.0.1', version: 4 };
			this._mediaObject.protocol = offerMediaObject.protocol;
			this._mediaObject.port = 7;
		}
		else
		{
			this._mediaObject.connection =
			{
				ip      : plainRtpParameters.ip,
				version : plainRtpParameters.ipVersion
			};
			this._mediaObject.protocol = 'RTP/AVP';
			this._mediaObject.port = plainRtpParameters.port;
		}

		this._mediaObject.direction = 'recvonly';
		this._mediaObject.rtp = [];
		this._mediaObject.rtcpFb = [];
		this._mediaObject.fmtp = [];

		for (const codec of answerRtpParameters.codecs)
		{
			const rtp =
			{
				payload : codec.payloadType,
				codec   : codec.mimeType.replace(/^.*\//, ''),
				rate    : codec.clockRate
			};

			if (codec.channels > 1)
				rtp.encoding = codec.channels;

			this._mediaObject.rtp.push(rtp);

			const codecParameters = utils.clone(codec.parameters || {});

			if (codecOptions)
			{
				const {
					opusStereo,
					opusFec,
					opusDtx,
					opusMaxPlaybackRate,
					videoGoogleStartBitrate,
					videoGoogleMaxBitrate,
					videoGoogleMinBitrate
				} = codecOptions;

				const offerCodec = offerRtpParameters.codecs
					.find((c) => c.payloadType === codec.payloadType);

				switch (codec.mimeType.toLowerCase())
				{
					case 'audio/opus':
					{
						if (opusStereo !== undefined)
						{
							offerCodec.parameters['sprop-stereo'] = opusStereo ? 1 : 0;
							codecParameters.stereo = opusStereo ? 1 : 0;
						}

						if (opusFec !== undefined)
						{
							offerCodec.parameters.useinbandfec = opusFec ? 1 : 0;
							codecParameters.useinbandfec = opusFec ? 1 : 0;
						}

						if (opusDtx !== undefined)
						{
							offerCodec.parameters.usedtx = opusDtx ? 1 : 0;
							codecParameters.usedtx = opusDtx ? 1 : 0;
						}

						if (opusMaxPlaybackRate !== undefined)
							codecParameters.maxplaybackrate = opusMaxPlaybackRate;

						break;
					}

					case 'video/vp8':
					case 'video/vp9':
					case 'video/h264':
					case 'video/h265':
					{
						if (videoGoogleStartBitrate !== undefined)
							codecParameters['x-google-start-bitrate'] = videoGoogleStartBitrate;

						if (videoGoogleMaxBitrate !== undefined)
							codecParameters['x-google-max-bitrate'] = videoGoogleMaxBitrate;

						if (videoGoogleMinBitrate !== undefined)
							codecParameters['x-google-min-bitrate'] = videoGoogleMinBitrate;

						break;
					}
				}
			}

			const fmtp =
			{
				payload : codec.payloadType,
				config  : ''
			};

			for (const key of Object.keys(codecParameters))
			{
				if (fmtp.config)
					fmtp.config += ';';

				fmtp.config += `${key}=${codecParameters[key]}`;
			}

			if (fmtp.config)
				this._mediaObject.fmtp.push(fmtp);

			if (codec.rtcpFeedback)
			{
				for (const fb of codec.rtcpFeedback)
				{
					this._mediaObject.rtcpFb.push(
						{
							payload : codec.payloadType,
							type    : fb.type,
							subtype : fb.parameter || ''
						});
				}
			}
		}

		this._mediaObject.payloads = answerRtpParameters.codecs
			.map((codec) => codec.payloadType)
			.join(' ');

		this._mediaObject.ext = [];

		for (const ext of answerRtpParameters.headerExtensions)
		{
			// Don't add a header extension if not present in the offer.
			const found = (offerMediaObject.ext || [])
				.some((localExt) => localExt.uri === ext.uri);

			if (!found)
				continue;

			this._mediaObject.ext.push(
				{
					uri   : ext.uri,
					value : ext.id
				});
		}

		// Simulcast.
		if (offerMediaObject.simulcast)
		{
			this._mediaObject.simulcast =
			{
				dir1  : 'recv',
				list1 : offerMediaObject.simulcast.list1
			};

			this._mediaObject.rids = [];

			for (const rid of offerMediaObject.rids || [])
			{
				if (rid.direction !== 'send')
					continue;

				this._mediaObject.rids.push(
					{
						id        : rid.id,
						direction : 'recv'
					});
			}
		}
		// Simulcast (draft version 03).
		else if (offerMediaObject.simulcast_03)
		{
			// eslint-disable-next-line camelcase
			this._mediaObject.simulcast_03 =
			{
				value : offerMediaObject.simulcast_03.value.replace(/send/g, 'recv')
			};

			this._mediaObject.rids = [];

			for (const rid of offerMediaObject.rids || [])
			{
				if (rid.direction !== 'send')
					continue;

				this._mediaObject.rids.push(
					{
						id        : rid.id,
						direction : 'recv'
					});
			}
		}

		this._mediaObject.rtcpMux = 'rtcp-mux';
		this._mediaObject.rtcpRsize = 'rtcp-rsize';

		if (this._planB && this._mediaObject.type === 'video')
			this._mediaObject.xGoogleFlag = 'conference';
	}

	/**
	 * @param {String} role
	 */
	setDtlsRole(role)
	{
		switch (role)
		{
			case 'client':
				this._mediaObject.setup = 'active';
				break;
			case 'server':
				this._mediaObject.setup = 'passive';
				break;
			case 'auto':
				this._mediaObject.setup = 'actpass';
				break;
		}
	}
}

class OfferMediaSection extends MediaSection
{
	constructor(data)
	{
		super(data);

		const {
			plainRtpParameters,
			mid,
			kind,
			offerRtpParameters,
			streamId,
			trackId
		} = data;

		this._mediaObject.mid = String(mid);
		this._mediaObject.type = kind;

		if (!plainRtpParameters)
		{
			this._mediaObject.connection = { ip: '127.0.0.1', version: 4 };
			this._mediaObject.protocol = 'UDP/TLS/RTP/SAVPF';
			this._mediaObject.port = 7;
		}
		else
		{
			this._mediaObject.connection =
			{
				ip      : plainRtpParameters.ip,
				version : plainRtpParameters.ipVersion
			};
			this._mediaObject.protocol = 'RTP/AVP';
			this._mediaObject.port = plainRtpParameters.port;
		}

		this._mediaObject.direction = 'sendonly';
		this._mediaObject.rtp = [];
		this._mediaObject.rtcpFb = [];
		this._mediaObject.fmtp = [];

		if (!this._planB)
			this._mediaObject.msid = `${streamId || '-'} ${trackId}`;

		for (const codec of offerRtpParameters.codecs)
		{
			const rtp =
			{
				payload : codec.payloadType,
				codec   : codec.mimeType.replace(/^.*\//, ''),
				rate    : codec.clockRate
			};

			if (codec.channels > 1)
				rtp.encoding = codec.channels;

			this._mediaObject.rtp.push(rtp);

			if (codec.parameters)
			{
				const fmtp =
				{
					payload : codec.payloadType,
					config  : ''
				};

				for (const key of Object.keys(codec.parameters))
				{
					if (fmtp.config)
						fmtp.config += ';';

					fmtp.config += `${key}=${codec.parameters[key]}`;
				}

				if (fmtp.config)
					this._mediaObject.fmtp.push(fmtp);
			}

			if (codec.rtcpFeedback)
			{
				for (const fb of codec.rtcpFeedback)
				{
					this._mediaObject.rtcpFb.push(
						{
							payload : codec.payloadType,
							type    : fb.type,
							subtype : fb.parameter || ''
						});
				}
			}
		}

		this._mediaObject.payloads = offerRtpParameters.codecs
			.map((codec) => codec.payloadType)
			.join(' ');

		this._mediaObject.ext = [];

		for (const ext of offerRtpParameters.headerExtensions)
		{
			this._mediaObject.ext.push(
				{
					uri   : ext.uri,
					value : ext.id
				});
		}

		this._mediaObject.rtcpMux = 'rtcp-mux';
		this._mediaObject.rtcpRsize = 'rtcp-rsize';

		const encoding = offerRtpParameters.encodings[0];
		const ssrc = encoding.ssrc;
		const rtxSsrc = (encoding.rtx && encoding.rtx.ssrc)
			? encoding.rtx.ssrc
			: undefined;

		this._mediaObject.ssrcs = [];
		this._mediaObject.ssrcGroups = [];

		if (offerRtpParameters.rtcp.cname)
		{
			this._mediaObject.ssrcs.push(
				{
					id        : ssrc,
					attribute : 'cname',
					value     : offerRtpParameters.rtcp.cname
				});
		}

		if (this._planB)
		{
			this._mediaObject.ssrcs.push(
				{
					id        : ssrc,
					attribute : 'msid',
					value     : `${streamId || '-'} ${trackId}`
				});
		}

		if (rtxSsrc)
		{
			if (offerRtpParameters.rtcp.cname)
			{
				this._mediaObject.ssrcs.push(
					{
						id        : rtxSsrc,
						attribute : 'cname',
						value     : offerRtpParameters.rtcp.cname
					});
			}

			if (this._planB)
			{
				this._mediaObject.ssrcs.push(
					{
						id        : rtxSsrc,
						attribute : 'msid',
						value     : `${streamId || '-'} ${trackId}`
					});
			}

			// Associate original and retransmission SSRCs.
			this._mediaObject.ssrcGroups.push(
				{
					semantics : 'FID',
					ssrcs     : `${ssrc} ${rtxSsrc}`
				});
		}
	}

	/**
	 * @param {String} role
	 */
	setDtlsRole(role) // eslint-disable-line no-unused-vars
	{
		// Always 'actpass'.
		this._mediaObject.setup = 'actpass';
	}

	planBReceive({ offerRtpParameters, streamId, trackId })
	{
		const encoding = offerRtpParameters.encodings[0];
		const ssrc = encoding.ssrc;
		const rtxSsrc = (encoding.rtx && encoding.rtx.ssrc)
			? encoding.rtx.ssrc
			: undefined;

		if (offerRtpParameters.rtcp.cname)
		{
			this._mediaObject.ssrcs.push(
				{
					id        : ssrc,
					attribute : 'cname',
					value     : offerRtpParameters.rtcp.cname
				});
		}

		this._mediaObject.ssrcs.push(
			{
				id        : ssrc,
				attribute : 'msid',
				value     : `${streamId || '-'} ${trackId}`
			});

		if (rtxSsrc)
		{
			if (offerRtpParameters.rtcp.cname)
			{
				this._mediaObject.ssrcs.push(
					{
						id        : rtxSsrc,
						attribute : 'cname',
						value     : offerRtpParameters.rtcp.cname
					});
			}

			this._mediaObject.ssrcs.push(
				{
					id        : rtxSsrc,
					attribute : 'msid',
					value     : `${streamId || '-'} ${trackId}`
				});

			// Associate original and retransmission SSRCs.
			this._mediaObject.ssrcGroups.push(
				{
					semantics : 'FID',
					ssrcs     : `${ssrc} ${rtxSsrc}`
				});
		}
	}

	planBStopReceiving({ offerRtpParameters })
	{
		const encoding = offerRtpParameters.encodings[0];
		const ssrc = encoding.ssrc;
		const rtxSsrc = (encoding.rtx && encoding.rtx.ssrc)
			? encoding.rtx.ssrc
			: undefined;

		this._mediaObject.ssrcs = this._mediaObject.ssrcs
			.filter((s) => s.id !== ssrc && s.id !== rtxSsrc);

		if (rtxSsrc)
		{
			this._mediaObject.ssrcGroups = this._mediaObject.ssrcGroups
				.filter((group) => group.ssrcs !== `${ssrc} ${rtxSsrc}`);
		}
	}
}

module.exports =
{
	AnswerMediaSection,
	OfferMediaSection
};
