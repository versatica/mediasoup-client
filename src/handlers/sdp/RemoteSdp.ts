import * as sdpTransform from 'sdp-transform';
import { Logger } from '../../Logger';
import {
	MediaSection,
	AnswerMediaSection,
	OfferMediaSection
} from './MediaSection';
import {
	IceParameters,
	IceCandidate,
	DtlsParameters,
	DtlsRole,
	PlainRtpParameters
} from '../../Transport';
import { ProducerCodecOptions } from '../../Producer';
import { MediaKind, RtpParameters } from '../../RtpParameters';
import { SctpParameters } from '../../SctpParameters';

const logger = new Logger('RemoteSdp');

export class RemoteSdp
{
	// Remote ICE parameters.
	private _iceParameters?: IceParameters;
	// Remote ICE candidates.
	private readonly _iceCandidates?: IceCandidate[];
	// Remote DTLS parameters.
	private readonly _dtlsParameters?: DtlsParameters;
	// Remote SCTP parameters.
	private readonly _sctpParameters?: SctpParameters;
	// Parameters for plain RTP (no SRTP nor DTLS no BUNDLE).
	private readonly _plainRtpParameters?: PlainRtpParameters;
	// Whether this is Plan-B SDP.
	private readonly _planB: boolean;
	// MediaSection instances.
	private readonly _mediaSections: MediaSection[] = [];
	// MediaSection indices indexed by MID.
	private readonly _midToIndex: Map<string, number> = new Map();
	// First MID.
	private _firstMid?: string;
	// SDP object.
	private readonly _sdpObject: any;

	constructor(
		{
			iceParameters,
			iceCandidates,
			dtlsParameters,
			sctpParameters,
			plainRtpParameters,
			planB = false
		}:
		{
			iceParameters?: IceParameters;
			iceCandidates?: IceCandidate[];
			dtlsParameters?: DtlsParameters;
			sctpParameters?: SctpParameters;
			plainRtpParameters?: PlainRtpParameters;
			planB?: boolean;
		}
	)
	{
		this._iceParameters = iceParameters;
		this._iceCandidates = iceCandidates;
		this._dtlsParameters = dtlsParameters;
		this._sctpParameters = sctpParameters;
		this._plainRtpParameters = plainRtpParameters;
		this._planB = planB;
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

		// If DTLS parameters are given, assume WebRTC and BUNDLE.
		if (dtlsParameters)
		{
			this._sdpObject.msidSemantic = { semantic: 'WMS', token: '*' };

			// NOTE: We take the latest fingerprint.
			const numFingerprints = this._dtlsParameters!.fingerprints.length;

			this._sdpObject.fingerprint =
			{
				type : dtlsParameters.fingerprints[numFingerprints - 1].algorithm,
				hash : dtlsParameters.fingerprints[numFingerprints - 1].value
			};

			this._sdpObject.groups = [ { type: 'BUNDLE', mids: '' } ];
		}

		// If there are plain RPT parameters, override SDP origin.
		if (plainRtpParameters)
		{
			this._sdpObject.origin.address = plainRtpParameters.ip;
			this._sdpObject.origin.ipVer = plainRtpParameters.ipVersion;
		}
	}

	updateIceParameters(iceParameters: IceParameters): void
	{
		logger.debug(
			'updateIceParameters() [iceParameters:%o]',
			iceParameters);

		this._iceParameters = iceParameters;
		this._sdpObject.icelite = iceParameters.iceLite ? 'ice-lite' : undefined;

		for (const mediaSection of this._mediaSections)
		{
			mediaSection.setIceParameters(iceParameters);
		}
	}

	updateDtlsRole(role: DtlsRole): void
	{
		logger.debug('updateDtlsRole() [role:%s]', role);

		this._dtlsParameters!.role = role;

		for (const mediaSection of this._mediaSections)
		{
			mediaSection.setDtlsRole(role);
		}
	}

	getNextMediaSectionIdx(): { idx: number; reuseMid?: string }
	{
		// If a closed media section is found, return its index.
		for (let idx = 0; idx < this._mediaSections.length; ++idx)
		{
			const mediaSection = this._mediaSections[idx];

			if (mediaSection.closed)
				return { idx, reuseMid: mediaSection.mid };
		}

		// If no closed media section is found, return next one.
		return { idx: this._mediaSections.length };
	}

	send(
		{
			offerMediaObject,
			reuseMid,
			offerRtpParameters,
			answerRtpParameters,
			codecOptions,
			extmapAllowMixed = false
		}:
		{
			offerMediaObject: any;
			reuseMid?: string;
			offerRtpParameters: RtpParameters;
			answerRtpParameters: RtpParameters;
			codecOptions?: ProducerCodecOptions;
			extmapAllowMixed? : boolean;
		}
	): void
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
				codecOptions,
				extmapAllowMixed
			});

		// Unified-Plan with closed media section replacement.
		if (reuseMid)
		{
			this._replaceMediaSection(mediaSection, reuseMid);
		}
		// Unified-Plan or Plan-B with different media kind.
		else if (!this._midToIndex.has(mediaSection.mid))
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
		}:
		{
			mid: string;
			kind: MediaKind;
			offerRtpParameters: RtpParameters;
			streamId: string;
			trackId: string;
		}
	): void
	{
		const idx = this._midToIndex.get(mid);
		let mediaSection: OfferMediaSection | undefined;

		if (idx !== undefined)
			mediaSection = this._mediaSections[idx] as OfferMediaSection;

		// Unified-Plan or different media kind.
		if (!mediaSection)
		{
			mediaSection = new OfferMediaSection(
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
			mediaSection.planBReceive({ offerRtpParameters, streamId, trackId });

			this._replaceMediaSection(mediaSection);
		}
	}

	disableMediaSection(mid: string): void
	{
		const idx = this._midToIndex.get(mid);

		if (idx === undefined)
		{
			throw new Error(`no media section found with mid '${mid}'`);
		}

		const mediaSection = this._mediaSections[idx];

		mediaSection.disable();
	}

	closeMediaSection(mid: string): void
	{
		const idx = this._midToIndex.get(mid);

		if (idx === undefined)
		{
			throw new Error(`no media section found with mid '${mid}'`);
		}

		const mediaSection = this._mediaSections[idx];

		// NOTE: Closing the first m section is a pain since it invalidates the
		// bundled transport, so let's avoid it.
		if (mid === this._firstMid)
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

	planBStopReceiving(
		{
			mid,
			offerRtpParameters
		}:
		{
			mid: string;
			offerRtpParameters: RtpParameters;
		}
	): void
	{
		const idx = this._midToIndex.get(mid);

		if (idx === undefined)
		{
			throw new Error(`no media section found with mid '${mid}'`);
		}

		const mediaSection = this._mediaSections[idx] as OfferMediaSection;

		mediaSection.planBStopReceiving({ offerRtpParameters });
		this._replaceMediaSection(mediaSection);
	}

	sendSctpAssociation({ offerMediaObject }: { offerMediaObject: any }): void
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

	receiveSctpAssociation(
		{ oldDataChannelSpec = false }:
		{ oldDataChannelSpec?: boolean } = {}
	): void
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

	getSdp(): string
	{
		// Increase SDP version.
		this._sdpObject.origin.sessionVersion++;

		return sdpTransform.write(this._sdpObject);
	}

	_addMediaSection(newMediaSection: MediaSection): void
	{
		if (!this._firstMid)
			this._firstMid = newMediaSection.mid;

		// Add to the vector.
		this._mediaSections.push(newMediaSection);

		// Add to the map.
		this._midToIndex.set(newMediaSection.mid, this._mediaSections.length - 1);

		// Add to the SDP object.
		this._sdpObject.media.push(newMediaSection.getObject());

		// Regenerate BUNDLE mids.
		this._regenerateBundleMids();
	}

	_replaceMediaSection(newMediaSection: MediaSection, reuseMid?: string): void
	{
		// Store it in the map.
		if (typeof reuseMid === 'string')
		{
			const idx = this._midToIndex.get(reuseMid);

			if (idx === undefined)
			{
				throw new Error(`no media section found for reuseMid '${reuseMid}'`);
			}

			const oldMediaSection = this._mediaSections[idx];

			// Replace the index in the vector with the new media section.
			this._mediaSections[idx] = newMediaSection;

			// Update the map.
			this._midToIndex.delete(oldMediaSection.mid);
			this._midToIndex.set(newMediaSection.mid, idx);

			// Update the SDP object.
			this._sdpObject.media[idx] = newMediaSection.getObject();

			// Regenerate BUNDLE mids.
			this._regenerateBundleMids();
		}
		else
		{
			const idx = this._midToIndex.get(newMediaSection.mid);

			if (idx === undefined)
			{
				throw new Error(
					`no media section found with mid '${newMediaSection.mid}'`);
			}

			// Replace the index in the vector with the new media section.
			this._mediaSections[idx] = newMediaSection;

			// Update the SDP object.
			this._sdpObject.media[idx] = newMediaSection.getObject();
		}
	}

	_regenerateBundleMids(): void
	{
		if (!this._dtlsParameters)
			return;

		this._sdpObject.groups[0].mids = this._mediaSections
			.filter((mediaSection: MediaSection) => !mediaSection.closed)
			.map((mediaSection: MediaSection) => mediaSection.mid)
			.join(' ');
	}
}
