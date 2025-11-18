import * as sdpTransform from 'sdp-transform';
import type * as SdpTransform from 'sdp-transform';
import { Logger } from '../../Logger';
import {
	MediaSection,
	AnswerMediaSection,
	OfferMediaSection,
} from './MediaSection';
import type {
	IceParameters,
	IceCandidate,
	DtlsParameters,
	DtlsRole,
	PlainRtpParameters,
} from '../../Transport';
import type { ProducerCodecOptions } from '../../Producer';
import type { MediaKind, RtpParameters } from '../../RtpParameters';
import type { SctpParameters } from '../../SctpParameters';

const DD_CODECS = ['av1', 'h264'];

const logger = new Logger('RemoteSdp');

export class RemoteSdp {
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
	// MediaSection instances with same order as in the SDP.
	private readonly _mediaSections: MediaSection[] = [];
	// MediaSection indices indexed by MID.
	private readonly _midToIndex: Map<string, number> = new Map();
	// First MID.
	private _firstMid?: string;
	// SDP object.
	private readonly _sdpObject: SdpTransform.SessionDescription;

	constructor({
		iceParameters,
		iceCandidates,
		dtlsParameters,
		sctpParameters,
		plainRtpParameters,
	}: {
		iceParameters?: IceParameters;
		iceCandidates?: IceCandidate[];
		dtlsParameters?: DtlsParameters;
		sctpParameters?: SctpParameters;
		plainRtpParameters?: PlainRtpParameters;
	}) {
		this._iceParameters = iceParameters;
		this._iceCandidates = iceCandidates;
		this._dtlsParameters = dtlsParameters;
		this._sctpParameters = sctpParameters;
		this._plainRtpParameters = plainRtpParameters;
		this._sdpObject = {
			version: 0,
			origin: {
				address: '0.0.0.0',
				ipVer: 4,
				netType: 'IN',
				sessionId: '10000',
				sessionVersion: 0,
				username: 'mediasoup-client',
			},
			name: '-',
			timing: { start: 0, stop: 0 },
			media: [],
		};

		// Indicate support of RFC 8445 (ICE bis / ice2).
		this._sdpObject.iceOptions = 'ice2';

		// If ICE parameters are given, add ICE-Lite indicator.
		if (iceParameters?.iceLite) {
			this._sdpObject.icelite = 'ice-lite';
		}

		// If DTLS parameters are given, assume WebRTC and BUNDLE.
		if (dtlsParameters) {
			// NOTE: This is not standard anymore (it was removed in RFC 8830),
			// however some WebRTC clients still rely on it.
			this._sdpObject.msidSemantic = { semantic: 'WMS', token: '*' };

			// NOTE: We take the latest fingerprint.
			const numFingerprints = this._dtlsParameters!.fingerprints.length;

			this._sdpObject.fingerprint = {
				type: dtlsParameters.fingerprints[numFingerprints - 1]!.algorithm,
				hash: dtlsParameters.fingerprints[numFingerprints - 1]!.value,
			};

			this._sdpObject.groups = [{ type: 'BUNDLE', mids: '' }];
		}

		// If there are plain RPT parameters, override SDP origin.
		if (plainRtpParameters) {
			this._sdpObject.origin.address = plainRtpParameters.ip;
			this._sdpObject.origin.ipVer = plainRtpParameters.ipVersion;
		}
	}

	updateIceParameters(iceParameters: IceParameters): void {
		logger.debug('updateIceParameters() [iceParameters:%o]', iceParameters);

		this._iceParameters = iceParameters;
		this._sdpObject.icelite = iceParameters.iceLite ? 'ice-lite' : undefined;

		for (const mediaSection of this._mediaSections) {
			mediaSection.setIceParameters(iceParameters);
		}
	}

	updateDtlsRole(role: DtlsRole): void {
		logger.debug('updateDtlsRole() [role:%s]', role);

		this._dtlsParameters!.role = role;

		for (const mediaSection of this._mediaSections) {
			mediaSection.setDtlsRole(role);
		}
	}

	/**
	 * Set session level a=extmap-allow-mixed attibute.
	 */
	setSessionExtmapAllowMixed(): void {
		logger.debug('setSessionExtmapAllowMixed()');

		this._sdpObject.extmapAllowMixed = 'extmap-allow-mixed';
	}

	getNextMediaSectionIdx(): { idx: number; reuseMid?: string } {
		// If a closed media section is found, return its index.
		for (let idx = 0; idx < this._mediaSections.length; ++idx) {
			const mediaSection = this._mediaSections[idx]!;

			if (mediaSection.closed) {
				return { idx, reuseMid: mediaSection.mid };
			}
		}

		// If no closed media section is found, return next one.
		return { idx: this._mediaSections.length };
	}

	send({
		offerMediaObject,
		reuseMid,
		offerRtpParameters,
		answerRtpParameters,
		codecOptions,
	}: {
		offerMediaObject: SdpTransform.MediaDescription;
		reuseMid?: string;
		offerRtpParameters: RtpParameters;
		answerRtpParameters: RtpParameters;
		codecOptions?: ProducerCodecOptions;
	}): void {
		const mediaSection = new AnswerMediaSection({
			iceParameters: this._iceParameters,
			iceCandidates: this._iceCandidates,
			dtlsParameters: this._dtlsParameters,
			plainRtpParameters: this._plainRtpParameters,
			offerMediaObject,
			offerRtpParameters,
			answerRtpParameters,
			codecOptions,
		});

		const mediaObject = mediaSection.getObject();

		// Remove Dependency Descriptor extension unless there is support for
		// the codec in mediasoup.
		const ddCodec = mediaObject.rtp.find(rtp =>
			DD_CODECS.includes(rtp.codec.toLowerCase())
		);

		if (!ddCodec) {
			mediaObject.ext = mediaObject.ext?.filter(
				extmap =>
					extmap.uri !==
					'https://aomediacodec.github.io/av1-rtp-spec/#dependency-descriptor-rtp-header-extension'
			);
		}

		// Unified-Plan with closed media section replacement.
		if (reuseMid) {
			this.replaceMediaSection(mediaSection, reuseMid);
		}
		// Unified-Plan or Plan-B with different media kind.
		else if (!this._midToIndex.has(mediaSection.mid)) {
			this.addMediaSection(mediaSection);
		}
		// Plan-B with same media kind.
		else {
			this.replaceMediaSection(mediaSection);
		}
	}

	receive({
		mid,
		kind,
		offerRtpParameters,
		streamId,
		trackId,
	}: {
		mid: string;
		kind: MediaKind;
		offerRtpParameters: RtpParameters;
		streamId: string;
		trackId: string;
	}): void {
		// Allow both 1 byte and 2 bytes length header extensions since
		// mediasoup can send both at any time.
		this.setSessionExtmapAllowMixed();

		const mediaSection = new OfferMediaSection({
			iceParameters: this._iceParameters,
			iceCandidates: this._iceCandidates,
			dtlsParameters: this._dtlsParameters,
			plainRtpParameters: this._plainRtpParameters,
			mid,
			kind,
			offerRtpParameters,
			streamId,
			trackId,
		});

		// Let's try to recycle a closed media section (if any).
		// NOTE: Yes, we can recycle a closed m=audio section with a new m=video.
		const oldMediaSection = this._mediaSections.find(m => m.closed);

		if (oldMediaSection) {
			this.replaceMediaSection(mediaSection, oldMediaSection.mid);
		} else {
			this.addMediaSection(mediaSection);
		}
	}

	pauseMediaSection(mid: string): void {
		const mediaSection = this.findMediaSection(mid);

		mediaSection.pause();
	}

	resumeSendingMediaSection(mid: string): void {
		const mediaSection = this.findMediaSection(mid);

		mediaSection.resume();
	}

	resumeReceivingMediaSection(mid: string): void {
		const mediaSection = this.findMediaSection(mid);

		mediaSection.resume();
	}

	disableMediaSection(mid: string): void {
		const mediaSection = this.findMediaSection(mid);

		mediaSection.disable();
	}

	/**
	 * Closes media section. Returns true if the given MID corresponds to a m
	 * section that has been indeed closed. False otherwise.
	 *
	 * NOTE: Closing the first m section is a pain since it invalidates the bundled
	 * transport, so instead closing it we just disable it.
	 */
	closeMediaSection(mid: string): boolean {
		const mediaSection = this.findMediaSection(mid);

		// NOTE: Closing the first m section is a pain since it invalidates the
		// bundled transport, so let's avoid it.
		if (mid === this._firstMid) {
			logger.debug(
				'closeMediaSection() | cannot close first media section, disabling it instead [mid:%s]',
				mid
			);

			this.disableMediaSection(mid);

			return false;
		}

		mediaSection.close();

		// Regenerate BUNDLE mids.
		this.regenerateBundleMids();

		return true;
	}

	muxMediaSectionSimulcast(
		mid: string,
		encodings: RTCRtpEncodingParameters[]
	): void {
		const mediaSection = this.findMediaSection(mid) as AnswerMediaSection;

		mediaSection.muxSimulcastStreams(encodings);

		this.replaceMediaSection(mediaSection);
	}

	sendSctpAssociation({
		offerMediaObject,
	}: {
		offerMediaObject: SdpTransform.MediaDescription;
	}): void {
		const mediaSection = new AnswerMediaSection({
			iceParameters: this._iceParameters,
			iceCandidates: this._iceCandidates,
			dtlsParameters: this._dtlsParameters,
			sctpParameters: this._sctpParameters,
			plainRtpParameters: this._plainRtpParameters,
			offerMediaObject,
		});

		this.addMediaSection(mediaSection);
	}

	receiveSctpAssociation(): void {
		const mediaSection = new OfferMediaSection({
			iceParameters: this._iceParameters,
			iceCandidates: this._iceCandidates,
			dtlsParameters: this._dtlsParameters,
			sctpParameters: this._sctpParameters,
			plainRtpParameters: this._plainRtpParameters,
			mid: 'datachannel',
			kind: 'application',
		});

		this.addMediaSection(mediaSection);
	}

	getSdp(): string {
		// Increase SDP version.
		this._sdpObject.origin.sessionVersion++;

		return sdpTransform.write(this._sdpObject);
	}

	private addMediaSection(newMediaSection: MediaSection): void {
		if (!this._firstMid) {
			this._firstMid = newMediaSection.mid;
		}

		// Add to the vector.
		this._mediaSections.push(newMediaSection);

		// Add to the map.
		this._midToIndex.set(newMediaSection.mid, this._mediaSections.length - 1);

		// Add to the SDP object.
		this._sdpObject.media.push(newMediaSection.getObject());

		// Regenerate BUNDLE mids.
		this.regenerateBundleMids();
	}

	private replaceMediaSection(
		newMediaSection: MediaSection,
		reuseMid?: string
	): void {
		// Store it in the map.
		if (typeof reuseMid === 'string') {
			const idx = this._midToIndex.get(reuseMid);

			if (idx === undefined) {
				throw new Error(`no media section found for reuseMid '${reuseMid}'`);
			}

			const oldMediaSection = this._mediaSections[idx]!;

			// Replace the index in the vector with the new media section.
			this._mediaSections[idx] = newMediaSection;

			// Update the map.
			this._midToIndex.delete(oldMediaSection.mid);
			this._midToIndex.set(newMediaSection.mid, idx);

			// Update the SDP object.
			this._sdpObject.media[idx] = newMediaSection.getObject();

			// Regenerate BUNDLE mids.
			this.regenerateBundleMids();
		} else {
			const idx = this._midToIndex.get(newMediaSection.mid);

			if (idx === undefined) {
				throw new Error(
					`no media section found with mid '${newMediaSection.mid}'`
				);
			}

			// Replace the index in the vector with the new media section.
			this._mediaSections[idx] = newMediaSection;

			// Update the SDP object.
			this._sdpObject.media[idx] = newMediaSection.getObject();
		}
	}

	private findMediaSection(mid: string): MediaSection {
		const idx = this._midToIndex.get(mid);

		if (idx === undefined) {
			throw new Error(`no media section found with mid '${mid}'`);
		}

		return this._mediaSections[idx]!;
	}

	private regenerateBundleMids(): void {
		if (!this._dtlsParameters) {
			return;
		}

		this._sdpObject.groups![0]!.mids = this._mediaSections
			.filter((mediaSection: MediaSection) => !mediaSection.closed)
			.map((mediaSection: MediaSection) => mediaSection.mid)
			.join(' ');
	}
}
