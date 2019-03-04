const sdpTransform = require('sdp-transform');
const Logger = require('../../Logger');
const { AnswerMediaSection, OfferMediaSection } = require('./MediaSection');

const logger = new Logger('RemoteUnifiedPlanSdp');

class RemoteUnifiedPlanSdp
{
	constructor(
		{
			iceParameters,
			iceCandidates,
			dtlsParameters
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

		// NOTE: We take the latest fingerprint.
		const numFingerprints = this._dtlsParameters.fingerprints.length;

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
			name         : '-',
			timing       : { start: 0, stop: 0 },
			icelite      : iceParameters.iceLite ? 'ice-lite' : undefined,
			msidSemantic :
			{
				semantic : 'WMS',
				token    : '*'
			},
			fingerprint :
			{
				type : dtlsParameters.fingerprints[numFingerprints - 1].algorithm,
				hash : dtlsParameters.fingerprints[numFingerprints - 1].value
			},
			media : []
		};

		// MediaSection instances indexed by MID.
		// @type {Map<String, MediaSection>}
		this._mediaSections = new Map();
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
				iceParameters  : this._iceParameters,
				iceCandidates  : this._iceCandidates,
				dtlsParameters : this._dtlsParameters,
				offerMediaObject,
				offerRtpParameters,
				answerRtpParameters,
				codecOptions
			});

		this._mediaSections.set(mediaSection.mid, mediaSection);
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
		const mediaSection = new OfferMediaSection(
			{
				iceParameters  : this._iceParameters,
				iceCandidates  : this._iceCandidates,
				dtlsParameters : this._dtlsParameters,
				mid,
				kind,
				offerRtpParameters,
				streamId,
				trackId
			});

		this._mediaSections.set(mediaSection.mid, mediaSection);
	}

	disableMediaSection(mid)
	{
		const mediaSection = this._mediaSections.get(mid);

		mediaSection.setInactive();
	}

	getSdp()
	{
		logger.debug('getSdp()');

		// Increase SDP version.
		this._sdpObject.origin.sessionVersion++;

		const bundleMids = [];

		this._sdpObject.media = [];

		for (const mediaSection of this._mediaSections.values())
		{
			bundleMids.push(mediaSection.mid);
			this._sdpObject.media.push(mediaSection.mediaObject);
		}

		if (bundleMids.length > 0)
		{
			this._sdpObject.groups =
			[
				{
					type : 'BUNDLE',
					mids : bundleMids.join(' ')
				}
			];
		}

		return sdpTransform.write(this._sdpObject);
	}
}

module.exports = RemoteUnifiedPlanSdp;
