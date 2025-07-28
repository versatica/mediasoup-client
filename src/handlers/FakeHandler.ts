import { FakeMediaStreamTrack } from 'fake-mediastreamtrack';
import type * as SdpTransform from 'sdp-transform';
import { Logger } from '../Logger';
import * as utils from '../utils';
import * as ortc from '../ortc';
import { InvalidStateError } from '../errors';
import type {
	IceParameters,
	DtlsParameters,
	DtlsRole,
	IceGatheringState,
	ConnectionState,
} from '../Transport';
import type { RtpCapabilities, RtpParameters } from '../RtpParameters';
import type { SctpCapabilities } from '../SctpParameters';
import {
	HandlerInterface,
	type HandlerRunOptions,
	type HandlerSendOptions,
	type HandlerSendResult,
	type HandlerReceiveOptions,
	type HandlerReceiveResult,
	type HandlerSendDataChannelOptions,
	type HandlerSendDataChannelResult,
	type HandlerReceiveDataChannelOptions,
	type HandlerReceiveDataChannelResult,
} from './HandlerInterface';

const logger = new Logger('FakeHandler');

const NAME = 'FakeHandler';

type FakeRTCDataChannelOptions = {
	id: number;
	ordered?: boolean;
	maxPacketLifeTime?: number | null;
	maxRetransmits?: number | null;
	label?: string;
	protocol?: string;
};

/* eslint-disable @typescript-eslint/no-explicit-any */
class FakeRTCDataChannel extends EventTarget implements RTCDataChannel {
	// Members for RTCDataChannel standard public getters/setters.
	private readonly _id: number;
	private readonly _negotiated = true; // mediasoup just uses negotiated DataChannels.
	private readonly _ordered: boolean;
	private readonly _maxPacketLifeTime: number | null;
	private readonly _maxRetransmits: number | null;
	private readonly _label: string;
	private readonly _protocol: string;
	private _readyState: RTCDataChannelState = 'connecting';
	private _bufferedAmount = 0;
	private _bufferedAmountLowThreshold = 0;
	private _binaryType: BinaryType = 'arraybuffer';
	// Events.
	private _onopen: ((this: FakeRTCDataChannel, ev: Event) => any) | null = null;
	private _onclosing: ((this: FakeRTCDataChannel, ev: Event) => any) | null =
		null;
	private _onclose: ((this: FakeRTCDataChannel, ev: Event) => any) | null =
		null;
	private _onmessage: ((this: FakeRTCDataChannel, ev: Event) => any) | null =
		null;
	private _onbufferedamountlow:
		| ((this: FakeRTCDataChannel, ev: Event) => any)
		| null = null;
	private _onerror: ((this: FakeRTCDataChannel, ev: Event) => any) | null =
		null;

	constructor({
		id,
		ordered = true,
		maxPacketLifeTime = null,
		maxRetransmits = null,
		label = '',
		protocol = '',
	}: FakeRTCDataChannelOptions) {
		super();

		logger.debug(
			`constructor() [id:${id}, ordered:${ordered}, maxPacketLifeTime:${maxPacketLifeTime}, maxRetransmits:${maxRetransmits}, label:${label}, protocol:${protocol}`
		);

		this._id = id;
		this._ordered = ordered;
		this._maxPacketLifeTime = maxPacketLifeTime;
		this._maxRetransmits = maxRetransmits;
		this._label = label;
		this._protocol = protocol;
	}

	get id(): number {
		return this._id;
	}

	get negotiated(): boolean {
		return this._negotiated;
	}

	get ordered(): boolean {
		return this._ordered;
	}

	get maxPacketLifeTime(): number | null {
		return this._maxPacketLifeTime;
	}

	get maxRetransmits(): number | null {
		return this._maxRetransmits;
	}

	get label(): string {
		return this._label;
	}

	get protocol(): string {
		return this._protocol;
	}

	get readyState(): RTCDataChannelState {
		return this._readyState;
	}

	get bufferedAmount(): number {
		return this._bufferedAmount;
	}

	get bufferedAmountLowThreshold(): number {
		return this._bufferedAmountLowThreshold;
	}

	set bufferedAmountLowThreshold(value: number) {
		this._bufferedAmountLowThreshold = value;
	}

	get binaryType(): BinaryType {
		return this._binaryType;
	}

	set binaryType(binaryType: BinaryType) {
		this._binaryType = binaryType;
	}

	get onopen(): ((this: RTCDataChannel, ev: Event) => any) | null {
		return this._onopen as ((this: RTCDataChannel, ev: Event) => any) | null;
	}

	set onopen(handler: ((this: FakeRTCDataChannel, ev: Event) => any) | null) {
		if (this._onopen) {
			this.removeEventListener('open', this._onopen);
		}

		this._onopen = handler;

		if (handler) {
			this.addEventListener('open', handler);
		}
	}

	get onclosing(): ((this: RTCDataChannel, ev: Event) => any) | null {
		return this._onclosing as ((this: RTCDataChannel, ev: Event) => any) | null;
	}

	set onclosing(
		handler: ((this: FakeRTCDataChannel, ev: Event) => any) | null
	) {
		if (this._onclosing) {
			this.removeEventListener('closing', this._onclosing);
		}

		this._onclosing = handler;

		if (handler) {
			this.addEventListener('closing', handler);
		}
	}

	get onclose(): ((this: RTCDataChannel, ev: Event) => any) | null {
		return this._onclose as ((this: RTCDataChannel, ev: Event) => any) | null;
	}

	set onclose(handler: ((this: FakeRTCDataChannel, ev: Event) => any) | null) {
		if (this._onclose) {
			this.removeEventListener('close', this._onclose);
		}

		this._onclose = handler;

		if (handler) {
			this.addEventListener('close', handler);
		}
	}

	get onmessage(): ((this: RTCDataChannel, ev: Event) => any) | null {
		return this._onmessage as ((this: RTCDataChannel, ev: Event) => any) | null;
	}

	set onmessage(
		handler: ((this: FakeRTCDataChannel, ev: Event) => any) | null
	) {
		if (this._onmessage) {
			this.removeEventListener('message', this._onmessage);
		}

		this._onmessage = handler;

		if (handler) {
			this.addEventListener('message', handler);
		}
	}

	get onbufferedamountlow(): ((this: RTCDataChannel, ev: Event) => any) | null {
		return this._onbufferedamountlow as
			| ((this: RTCDataChannel, ev: Event) => any)
			| null;
	}

	set onbufferedamountlow(
		handler: ((this: FakeRTCDataChannel, ev: Event) => any) | null
	) {
		if (this._onbufferedamountlow) {
			this.removeEventListener('bufferedamountlow', this._onbufferedamountlow);
		}

		this._onbufferedamountlow = handler;

		if (handler) {
			this.addEventListener('bufferedamountlow', handler);
		}
	}

	get onerror(): ((this: RTCDataChannel, ev: Event) => any) | null {
		return this._onerror as ((this: RTCDataChannel, ev: Event) => any) | null;
	}

	set onerror(handler: ((this: FakeRTCDataChannel, ev: Event) => any) | null) {
		if (this._onerror) {
			this.removeEventListener('error', this._onerror);
		}

		this._onerror = handler;

		if (handler) {
			this.addEventListener('error', handler);
		}
	}

	override addEventListener<K extends keyof RTCDataChannelEventMap>(
		type: K,
		listener: (this: FakeRTCDataChannel, ev: RTCDataChannelEventMap[K]) => any,
		options?: boolean | AddEventListenerOptions
	): void {
		super.addEventListener(type, listener as EventListener, options);
	}

	override removeEventListener<K extends keyof RTCDataChannelEventMap>(
		type: K,
		listener: (this: FakeRTCDataChannel, ev: RTCDataChannelEventMap[K]) => any,
		options?: boolean | EventListenerOptions
	): void {
		super.removeEventListener(type, listener as EventListener, options);
	}

	close(): void {
		if (['closing', 'closed'].includes(this._readyState)) {
			return;
		}

		this._readyState = 'closed';
	}

	/**
	 * We extend the definition of send() to allow Node Buffer. However
	 * ArrayBufferView and Blob do not exist in Node.
	 */
	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	send(data: string | Blob | ArrayBuffer | ArrayBufferView): void {
		if (this._readyState !== 'open') {
			throw new InvalidStateError('not open');
		}
	}
}
/* eslint-enable @typescript-eslint/no-explicit-any */

export type FakeParameters = {
	generateNativeRtpCapabilities: () => RtpCapabilities;
	generateNativeSctpCapabilities: () => SctpCapabilities;
	generateLocalDtlsParameters: () => DtlsParameters;
};

export class FakeHandler extends HandlerInterface {
	// Closed flag.
	private _closed = false;
	// Fake parameters source of RTP and SCTP parameters and capabilities.
	private fakeParameters: FakeParameters;
	// Generic sending RTP parameters for audio and video.
	private _rtpParametersByKind?: { [key: string]: RtpParameters };
	// Local RTCP CNAME.
	private _cname = `CNAME-${utils.generateRandomNumber()}`;
	// Got transport local and remote parameters.
	private _transportReady = false;
	// Next localId.
	private _nextLocalId = 1;
	// Sending and receiving tracks indexed by localId.
	private _tracks: Map<number, MediaStreamTrack | null> = new Map();
	// DataChannel id value counter. It must be incremented for each new DataChannel.
	private _nextSctpStreamId = 0;

	/**
	 * Creates a factory function.
	 */
	static createFactory(fakeParameters: FakeParameters) {
		return (): FakeHandler => new FakeHandler(fakeParameters);
	}

	constructor(fakeParameters: FakeParameters) {
		super();

		this.fakeParameters = fakeParameters;
	}

	get name(): string {
		return NAME;
	}

	close(): void {
		logger.debug('close()');

		if (this._closed) {
			return;
		}

		this._closed = true;
	}

	// NOTE: Custom method for simulation purposes.
	setIceGatheringState(iceGatheringState: IceGatheringState): void {
		this.emit('@icegatheringstatechange', iceGatheringState);
	}

	// NOTE: Custom method for simulation purposes.
	setConnectionState(connectionState: ConnectionState): void {
		this.emit('@connectionstatechange', connectionState);
	}

	async getNativeRtpCapabilities(): Promise<RtpCapabilities> {
		logger.debug('getNativeRtpCapabilities()');

		return this.fakeParameters.generateNativeRtpCapabilities();
	}

	async getNativeSctpCapabilities(): Promise<SctpCapabilities> {
		logger.debug('getNativeSctpCapabilities()');

		return this.fakeParameters.generateNativeSctpCapabilities();
	}

	run({
		/* eslint-disable @typescript-eslint/no-unused-vars */
		direction,
		iceParameters,
		iceCandidates,
		dtlsParameters,
		sctpParameters,
		iceServers,
		iceTransportPolicy,
		extendedRtpCapabilities,
		/* eslint-enable @typescript-eslint/no-unused-vars */
	}: HandlerRunOptions): void {
		this.assertNotClosed();

		logger.debug('run()');

		// Generic sending RTP parameters for audio and video.
		// @type {Object}
		this._rtpParametersByKind = {
			audio: ortc.getSendingRtpParameters('audio', extendedRtpCapabilities),
			video: ortc.getSendingRtpParameters('video', extendedRtpCapabilities),
		};
	}

	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	async updateIceServers(iceServers: RTCIceServer[]): Promise<void> {
		this.assertNotClosed();

		logger.debug('updateIceServers()');
	}

	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	async restartIce(iceParameters: IceParameters): Promise<void> {
		this.assertNotClosed();

		logger.debug('restartIce()');
	}

	async getTransportStats(): Promise<RTCStatsReport> {
		this.assertNotClosed();

		return new Map(); // NOTE: Whatever.
	}

	async send(
		// eslint-disable-next-line @typescript-eslint/no-unused-vars
		{ track, encodings, codecOptions, codec }: HandlerSendOptions
	): Promise<HandlerSendResult> {
		this.assertNotClosed();

		logger.debug('send() [kind:%s, track.id:%s]', track.kind, track.id);

		if (!this._transportReady) {
			await this.setupTransport({ localDtlsRole: 'server' });
		}

		const rtpParameters = utils.clone<RtpParameters>(
			this._rtpParametersByKind![track.kind]!
		);
		const useRtx = rtpParameters.codecs.some(_codec =>
			/.+\/rtx$/i.test(_codec.mimeType)
		);

		rtpParameters.mid = `mid-${utils.generateRandomNumber()}`;

		if (!encodings) {
			encodings = [{}];
		}

		for (const encoding of encodings) {
			encoding.ssrc = utils.generateRandomNumber();

			if (useRtx) {
				encoding.rtx = { ssrc: utils.generateRandomNumber() };
			}
		}

		rtpParameters.encodings = encodings;

		// Fill RTCRtpParameters.rtcp.
		rtpParameters.rtcp = {
			cname: this._cname,
			reducedSize: true,
			mux: true,
		};

		const localId = this._nextLocalId++;

		this._tracks.set(localId, track);

		return { localId: String(localId), rtpParameters };
	}

	async stopSending(localId: string): Promise<void> {
		logger.debug('stopSending() [localId:%s]', localId);

		if (this._closed) {
			return;
		}

		if (!this._tracks.has(Number(localId))) {
			throw new Error('local track not found');
		}

		this._tracks.delete(Number(localId));
	}

	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	async pauseSending(localId: string): Promise<void> {
		this.assertNotClosed();

		// Unimplemented.
	}

	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	async resumeSending(localId: string): Promise<void> {
		this.assertNotClosed();

		// Unimplemented.
	}

	async replaceTrack(
		localId: string,
		track: MediaStreamTrack | null
	): Promise<void> {
		this.assertNotClosed();

		if (track) {
			logger.debug(
				'replaceTrack() [localId:%s, track.id:%s]',
				localId,
				track.id
			);
		} else {
			logger.debug('replaceTrack() [localId:%s, no track]', localId);
		}

		this._tracks.delete(Number(localId));
		this._tracks.set(Number(localId), track);
	}

	async setMaxSpatialLayer(
		localId: string,
		spatialLayer: number
	): Promise<void> {
		this.assertNotClosed();

		logger.debug(
			'setMaxSpatialLayer() [localId:%s, spatialLayer:%s]',
			localId,
			spatialLayer
		);
	}

	async setRtpEncodingParameters(
		localId: string,
		params: Partial<RTCRtpEncodingParameters>
	): Promise<void> {
		this.assertNotClosed();

		logger.debug(
			'setRtpEncodingParameters() [localId:%s, params:%o]',
			localId,
			params
		);
	}

	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	async getSenderStats(localId: string): Promise<RTCStatsReport> {
		this.assertNotClosed();

		return new Map(); // NOTE: Whatever.
	}

	async sendDataChannel({
		ordered,
		maxPacketLifeTime,
		maxRetransmits,
		label,
		protocol,
	}: HandlerSendDataChannelOptions): Promise<HandlerSendDataChannelResult> {
		this.assertNotClosed();

		if (!this._transportReady) {
			await this.setupTransport({ localDtlsRole: 'server' });
		}

		logger.debug('sendDataChannel()');

		const dataChannel = new FakeRTCDataChannel({
			id: this._nextSctpStreamId++,
			ordered,
			maxPacketLifeTime,
			maxRetransmits,
			label,
			protocol,
		});

		const sctpStreamParameters = {
			streamId: this._nextSctpStreamId,
			ordered: ordered,
			maxPacketLifeTime: maxPacketLifeTime,
			maxRetransmits: maxRetransmits,
		};

		return { dataChannel, sctpStreamParameters };
	}

	async receive(
		optionsList: HandlerReceiveOptions[]
	): Promise<HandlerReceiveResult[]> {
		this.assertNotClosed();

		const results: HandlerReceiveResult[] = [];

		for (const options of optionsList) {
			const { trackId, kind } = options;

			if (!this._transportReady) {
				await this.setupTransport({ localDtlsRole: 'client' });
			}

			logger.debug('receive() [trackId:%s, kind:%s]', trackId, kind);

			const localId = this._nextLocalId++;
			const track = new FakeMediaStreamTrack({ kind });

			this._tracks.set(localId, track);

			results.push({ localId: String(localId), track });
		}

		return results;
	}

	async stopReceiving(localIds: string[]): Promise<void> {
		if (this._closed) {
			return;
		}

		for (const localId of localIds) {
			logger.debug('stopReceiving() [localId:%s]', localId);

			this._tracks.delete(Number(localId));
		}
	}

	async pauseReceiving(
		// eslint-disable-next-line @typescript-eslint/no-unused-vars
		localIds: string[]
	): Promise<void> {
		this.assertNotClosed();

		// Unimplemented.
	}

	async resumeReceiving(
		// eslint-disable-next-line @typescript-eslint/no-unused-vars
		localIds: string[]
	): Promise<void> {
		this.assertNotClosed();

		// Unimplemented.
	}

	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	async getReceiverStats(localId: string): Promise<RTCStatsReport> {
		this.assertNotClosed();

		return new Map(); //
	}

	async receiveDataChannel({
		sctpStreamParameters,
		label,
		protocol,
	}: HandlerReceiveDataChannelOptions): Promise<HandlerReceiveDataChannelResult> {
		this.assertNotClosed();

		if (!this._transportReady) {
			await this.setupTransport({ localDtlsRole: 'client' });
		}

		logger.debug('receiveDataChannel()');

		const dataChannel = new FakeRTCDataChannel({
			id: sctpStreamParameters.streamId!,
			ordered: sctpStreamParameters.ordered,
			maxPacketLifeTime: sctpStreamParameters.maxPacketLifeTime,
			maxRetransmits: sctpStreamParameters.maxRetransmits,
			label,
			protocol,
		});

		return { dataChannel };
	}

	private async setupTransport({
		localDtlsRole,
		// eslint-disable-next-line @typescript-eslint/no-unused-vars
		localSdpObject,
	}: {
		localDtlsRole: DtlsRole;
		localSdpObject?: SdpTransform.SessionDescription;
	}): Promise<void> {
		const dtlsParameters = utils.clone<DtlsParameters>(
			this.fakeParameters.generateLocalDtlsParameters()
		);

		// Set our DTLS role.
		if (localDtlsRole) {
			dtlsParameters.role = localDtlsRole;
		}

		// Assume we are connecting now.
		this.emit('@connectionstatechange', 'connecting');

		// Need to tell the remote transport about our parameters.
		await new Promise<void>((resolve, reject) =>
			this.emit('@connect', { dtlsParameters }, resolve, reject)
		);

		this._transportReady = true;
	}

	private assertNotClosed(): void {
		if (this._closed) {
			throw new InvalidStateError('method called in a closed handler');
		}
	}
}
