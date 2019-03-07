const sdpTransform = require('sdp-transform');
const Logger = require('../../Logger');
const { AnswerMediaSection, OfferMediaSection } = require('./MediaSection');

const logger = new Logger('RemoteSdp');

class RemoteSdp
{
	constructor(
		{
			iceParameters = undefined,
			iceCandidates = undefined,
			dtlsParameters = undefined,
			plainRtpParameters = undefined,
			planB = false
		})
	{
		// Remote ICE parameters.
		// @type {RTCIceParameters}
		this._iceParameters = iceParameters;

		// Remote ICE candidates.
		// @type {Array<RTCIceCandidate>}
		this._iceCandidates = iceCandidates;

		// Remote DTLS parameters.
		// @type {RTCDtlsParameters}
		this._dtlsParameters = dtlsParameters;

		// Parameters for plain RTP (no SRTP nor DTLS no BUNDLE). Fields:
		// @type {Object}
		//
		// Fields:
		// @param {String} ip
		// @param {Number} ipVersion - 4 or 6.
		// @param {Number} port
		this._plainRtpParameters = plainRtpParameters;

		// Whether this is Plan-B SDP.
		// @type {Boolean}
		this._planB = planB;

		// MediaSection instances indexed by MID.
		// @type {Map<String, MediaSection>}
		this._mediaSections = new Map();

		// SDP object.
		// @type {Object}
		this._sdpObject =
		{
			version : 0,
			origin  :
			{
				address        : '0.0.0.0',
				ipVer          : 4,
				netType        : 'IN',
				sessionId      : 10000,
				sessionVersion : 0,
				username       : 'mediasoup-client'
			},
			name   : '-',
			timing : { start: 0, stop: 0 },
			media  : []
		};

		// If ICE parameters are given, add ICE-Lite indicator.
		if (iceParameters && iceParameters.iceLite)
		{
			this._sdpObject.icelite = 'ice-lite';
		}

		// If DTLS parameters are given assume WebRTC and BUNDLE.
		if (dtlsParameters)
		{
			this._sdpObject.msidSemantic = { semantic: 'WMS', token: '*' };

			// NOTE: We take the latest fingerprint.
			const numFingerprints = this._dtlsParameters.fingerprints.length;

			this._sdpObject.fingerprint =
			{
				type : dtlsParameters.fingerprints[numFingerprints - 1].algorithm,
				hash : dtlsParameters.fingerprints[numFingerprints - 1].value
			};

			this._sdpObject.groups = [ { type: 'BUNDLE', mids: '' } ];
		}

		// If there are plain parameters override SDP origin.
		if (plainRtpParameters)
		{
			this._sdpObject.origin.address = plainRtpParameters.ip;
			this._sdpObject.origin.ipVer = plainRtpParameters.ipVersion;
		}
	}

	updateIceParameters(iceParameters)
	{
		logger.debug(
			'updateIceParameters() [iceParameters:%o]',
			iceParameters);

		this._iceParameters = iceParameters;
		this._sdpObject.icelite = iceParameters.iceLite ? 'ice-lite' : undefined;

		for (const mediaSection of this._mediaSections.values())
		{
			mediaSection.setIceParameters(iceParameters);
		}
	}

	updateDtlsRole(role)
	{
		logger.debug('updateDtlsRole() [role:%s]', role);

		this._dtlsParameters.role = role;

		for (const mediaSection of this._mediaSections.values())
		{
			mediaSection.setDtlsRole(role);
		}
	}

	send(
		{
			offerMediaObject,
			offerRtpParameters,
			answerRtpParameters,
			codecOptions
		}
	)
	{
		const mediaSection = new AnswerMediaSection(
			{
				iceParameters      : this._iceParameters,
				iceCandidates      : this._iceCandidates,
				dtlsParameters     : this._dtlsParameters,
				plainRtpParameters : this._plainRtpParameters,
				planB              : this._planB,
				offerMediaObject,
				offerRtpParameters,
				answerRtpParameters,
				codecOptions
			});

		// Unified-Plan or different media kind.
		if (!this._mediaSections.has(mediaSection.mid))
		{
			this._addMediaSection(mediaSection);
		}
		// Plan-B.
		else
		{
			this._replaceMediaSection(mediaSection);
		}
	}

	receive(
		{
			mid,
			kind,
			offerRtpParameters,
			streamId,
			trackId
		}
	)
	{
		// Unified-Plan or different media kind.
		if (!this._mediaSections.has(mid))
		{
			const mediaSection = new OfferMediaSection(
				{
					iceParameters      : this._iceParameters,
					iceCandidates      : this._iceCandidates,
					dtlsParameters     : this._dtlsParameters,
					plainRtpParameters : this._plainRtpParameters,
					planB              : this._planB,
					mid,
					kind,
					offerRtpParameters,
					streamId,
					trackId
				});

			this._addMediaSection(mediaSection);
		}
		// Plan-B.
		else
		{
			const mediaSection = this._mediaSections.get(mid);

			mediaSection.planBReceive({ offerRtpParameters, streamId, trackId });
			this._replaceMediaSection(mediaSection);
		}
	}

	disableMediaSection(mid)
	{
		const mediaSection = this._mediaSections.get(mid);

		mediaSection.disable();
	}

	planBStopReceiving({ mid, offerRtpParameters })
	{
		const mediaSection = this._mediaSections.get(mid);

		mediaSection.planBStopReceiving({ offerRtpParameters });
		this._replaceMediaSection(mediaSection);
	}

	getSdp()
	{
		// Increase SDP version.
		this._sdpObject.origin.sessionVersion++;

		return sdpTransform.write(this._sdpObject);
	}

	_addMediaSection(mediaSection)
	{
		// Store it in the map.
		this._mediaSections.set(mediaSection.mid, mediaSection);

		// Update SDP object.
		this._sdpObject.media.push(mediaSection.getObject());

		if (this._dtlsParameters)
		{
			this._sdpObject.groups[0].mids =
				`${this._sdpObject.groups[0].mids} ${mediaSection.mid}`.trim();
		}
	}

	_replaceMediaSection(mediaSection)
	{
		// Store it in the map.
		this._mediaSections.set(mediaSection.mid, mediaSection);

		// Update SDP object.
		this._sdpObject.media = this._sdpObject.media
			.map((m) =>
			{
				if (String(m.mid) === mediaSection.mid)
					return mediaSection.getObject();
				else
					return m;
			});
	}
}

module.exports = RemoteSdp;
