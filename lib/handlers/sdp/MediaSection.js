const utils = require('../../utils');

class MediaSection
{
	constructor(
		{
			iceParameters = null,
			iceCandidates = null,
			dtlsParameters = null
		} = {}
	)
	{
		// SDP media object.
		// @type {Object}
		this._mediaObject = {};

		if (iceParameters)
			this.setIceParameters(iceParameters);

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
			this.setDtlsRole(dtlsParameters.role);
	}

	get mid()
	{
		return this._mediaObject.mid;
	}

	get mediaObject()
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

	setInactive()
	{
		this._mediaObject.direction = 'inactive';

		// NOTE: Firefox does not like a=extmap lines if a=inactive.
		delete this._mediaObject.ext;
		delete this._mediaObject.ssrcs;
		delete this._mediaObject.ssrcGroups;
	}
}

class AnswerMediaSection extends MediaSection
{
	constructor(
		{
			offerMediaObject,
			offerRtpParameters,
			answerRtpParameters,
			codecOptions,
			...params
		} = {}
	)
	{
		super(params);

		this._mediaObject.mid = String(offerMediaObject.mid);
		this._mediaObject.type = offerMediaObject.type;
		this._mediaObject.protocol = offerMediaObject.protocol;
		this._mediaObject.port = 7;
		this._mediaObject.connection = { ip: '127.0.0.1', version: 4 };
		this._mediaObject.direction = 'recvonly';
		this._mediaObject.rtp = [];
		this._mediaObject.rtcpFb = [];
		this._mediaObject.fmtp = [];

		for (const codec of answerRtpParameters.codecs)
		{
			const rtp =
			{
				payload : codec.payloadType,
				codec   : codec.name,
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
					opusMaxPlaybackRate
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

		// Simulcast (draft version 03).
		if (offerMediaObject.simulcast_03)
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
	}
}

class OfferMediaSection extends MediaSection
{
	constructor(
		{
			mid,
			kind,
			offerRtpParameters,
			streamId,
			trackId,
			...params
		} = {}
	)
	{
		super(params);

		this._mediaObject.mid = String(mid);
		this._mediaObject.type = kind;
		this._mediaObject.connection = { ip: '127.0.0.1', version: 4 };

		if (kind !== 'application')
		{
			this._mediaObject.protocol = 'UDP/TLS/RTP/SAVPF';
			this._mediaObject.port = 7;
			this._mediaObject.msid = `${streamId || '-'} ${trackId}`;
		}
		else
		{
			this._mediaObject.port = 9;
			this._mediaObject.protocol = 'DTLS/SCTP';
		}

		// Audio or video.
		if (kind !== 'application')
		{
			this._mediaObject.direction = 'sendonly';
			this._mediaObject.rtp = [];
			this._mediaObject.rtcpFb = [];
			this._mediaObject.fmtp = [];

			for (const codec of offerRtpParameters.codecs)
			{
				const rtp =
				{
					payload : codec.payloadType,
					codec   : codec.name,
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
				// Ignore MID RTP extension for receiving media.
				if (ext.uri === 'urn:ietf:params:rtp-hdrext:sdes:mid')
					continue;

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
			let rtxSsrc;

			if (encoding.rtx && encoding.rtx.ssrc)
				rtxSsrc = encoding.rtx.ssrc;

			this._mediaObject.ssrcs = [];
			this._mediaObject.ssrcGroups = [];
			this._mediaObject.ssrcs.push(
				{
					id        : ssrc,
					attribute : 'cname',
					value     : offerRtpParameters.rtcp.cname
				});

			if (rtxSsrc)
			{
				this._mediaObject.ssrcs.push(
					{
						id        : rtxSsrc,
						attribute : 'cname',
						value     : offerRtpParameters.rtcp.cname
					});

				// Associate original and retransmission SSRCs.
				this._mediaObject.ssrcGroups.push(
					{
						semantics : 'FID',
						ssrcs     : `${ssrc} ${rtxSsrc}`
					});
			}
		}
		// DataChannel.
		else
		{
			this._mediaObject.payloads = 5000;
			this._mediaObject.sctpmap =
			{
				app            : 'webrtc-datachannel',
				maxMessageSize : 256,
				sctpmapNumber  : 5000
			};
		}
	}
}

module.exports =
{
	AnswerMediaSection,
	OfferMediaSection
};
