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
			sctpParameters = undefined,
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

		// Remote SCTP parameters.
		// @type {RTCSctpParameters}
		this._sctpParameters = sctpParameters;

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

		// First MID.
		// @type {String}
		this._firstMid = null;

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

	getNextMediaSectionIdx()
	{
		let idx = -1;

		// If a closed media section is found, return its index.
		for (const mediaSection of this._mediaSections.values())
		{
			idx++;

			if (mediaSection.closed)
				return { idx, reuseMid: mediaSection.mid };
		}

		// If no closed media section is found, return next one.
		return { idx: this._mediaSections.size, reuseMid: null };
	}

	send(
		{
			offerMediaObject,
			reuseMid,
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

		// Unified-Plan with closed media section replacement.
		if (reuseMid)
		{
			this._replaceMediaSection(mediaSection, reuseMid);
		}
		// Unified-Plan or Plan-B with different media kind.
		else if (!this._mediaSections.has(mediaSection.mid))
		{
			this._addMediaSection(mediaSection);
		}
		// Plan-B with same media kind.
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

	closeMediaSection(mid)
	{
		const mediaSection = this._mediaSections.get(mid);

		// NOTE: Closing the first m section is a pain since it invalidates the
		// bundled transport, so let's avoid it.
		if (String(mid) === this._firstMid)
		{
			logger.debug(
				'closeMediaSection() | cannot close first media section, disabling it instead [mid:%s]',
				mid);

			this.disableMediaSection(mid);

			return;
		}

		mediaSection.close();

		// Regenerate BUNDLE mids.
		this._regenerateBundleMids();
	}

	planBStopReceiving({ mid, offerRtpParameters })
	{
		const mediaSection = this._mediaSections.get(mid);

		mediaSection.planBStopReceiving({ offerRtpParameters });
		this._replaceMediaSection(mediaSection);
	}

	sendSctpAssociation({ offerMediaObject })
	{
		const mediaSection = new AnswerMediaSection(
			{
				iceParameters      : this._iceParameters,
				iceCandidates      : this._iceCandidates,
				dtlsParameters     : this._dtlsParameters,
				sctpParameters     : this._sctpParameters,
				plainRtpParameters : this._plainRtpParameters,
				offerMediaObject
			});

		this._addMediaSection(mediaSection);
	}

	receiveSctpAssociation({ oldDataChannelSpec = false } = {})
	{
		const mediaSection = new OfferMediaSection(
			{
				iceParameters      : this._iceParameters,
				iceCandidates      : this._iceCandidates,
				dtlsParameters     : this._dtlsParameters,
				sctpParameters     : this._sctpParameters,
				plainRtpParameters : this._plainRtpParameters,
				mid                : 'datachannel',
				kind               : 'application',
				oldDataChannelSpec
			});

		this._addMediaSection(mediaSection);
	}

	getSdp()
	{
		// Increase SDP version.
		this._sdpObject.origin.sessionVersion++;

		return sdpTransform.write(this._sdpObject);
	}

	_addMediaSection(newMediaSection)
	{
		if (!this._firstMid)
			this._firstMid = newMediaSection.mid;

		// Store it in the map.
		this._mediaSections.set(newMediaSection.mid, newMediaSection);

		// Update SDP object.
		this._sdpObject.media.push(newMediaSection.getObject());

		// Regenerate BUNDLE mids.
		this._regenerateBundleMids();
	}

	_replaceMediaSection(newMediaSection, reuseMid)
	{
		// Store it in the map.
		if (reuseMid)
		{
			const newMediaSections = new Map();

			for (const mediaSection of this._mediaSections.values())
			{
				if (mediaSection.mid === reuseMid)
					newMediaSections.set(newMediaSection.mid, newMediaSection);
				else
					newMediaSections.set(mediaSection.mid, mediaSection);
			}

			// Regenerate media sections.
			this._mediaSections = newMediaSections;

			// Regenerate BUNDLE mids.
			this._regenerateBundleMids();
		}
		else
		{
			this._mediaSections.set(newMediaSection.mid, newMediaSection);
		}

		// Update SDP object.
		this._sdpObject.media = Array.from(this._mediaSections.values())
			.map((mediaSection) => mediaSection.getObject());
	}

	_regenerateBundleMids()
	{
		if (!this._dtlsParameters)
			return;

		this._sdpObject.groups[0].mids = Array.from(this._mediaSections.values())
			.filter((mediaSection) => !mediaSection.closed)
			.map((mediaSection) => mediaSection.mid)
			.join(' ');
	}
}

module.exports = RemoteSdp;
