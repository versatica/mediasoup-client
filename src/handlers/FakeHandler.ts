import { EnhancedEventEmitter } from '../EnhancedEventEmitter';
import { Logger } from '../Logger';
import { FakeMediaStreamTrack } from 'fake-mediastreamtrack';
import * as utils from '../utils';
import * as ortc from '../ortc';
import { InvalidStateError } from '../errors';
import {
	HandlerInterface,
	HandlerRunOptions,
	HandlerSendOptions,
	HandlerSendResult,
	HandlerReceiveOptions,
	HandlerReceiveResult,
	HandlerSendDataChannelOptions,
	HandlerSendDataChannelResult,
	HandlerReceiveDataChannelOptions,
	HandlerReceiveDataChannelResult,
} from './HandlerInterface';
import {
	IceParameters,
	DtlsParameters,
	DtlsRole,
	IceGatheringState,
	ConnectionState,
} from '../Transport';
import { RtpCapabilities, RtpParameters } from '../RtpParameters';
import { SctpCapabilities } from '../SctpParameters';

const logger = new Logger('FakeHandler');

class FakeDataChannel extends EnhancedEventEmitter {
	id?: number;
	ordered?: boolean;
	maxPacketLifeTime?: number;
	maxRetransmits?: number;
	label?: string;
	protocol?: string;

	constructor({
		id,
		ordered,
		maxPacketLifeTime,
		maxRetransmits,
		label,
		protocol,
	}: {
		id: number;
		ordered?: boolean;
		maxPacketLifeTime?: number;
		maxRetransmits?: number;
		label?: string;
		protocol?: string;
	}) {
		super();

		this.id = id;
		this.ordered = ordered;
		this.maxPacketLifeTime = maxPacketLifeTime;
		this.maxRetransmits = maxRetransmits;
		this.label = label;
		this.protocol = protocol;
	}

	close(): void {
		this.safeEmit('close');
		this.emit('@close');
	}

	send(data: any): void {
		this.safeEmit('message', data);
	}

	addEventListener(event: string, fn: () => void): void {
		this.on(event, fn);
	}
}

export type FakeParameters = {
	generateNativeRtpCapabilities: () => RtpCapabilities;
	generateNativeSctpCapabilities: () => SctpCapabilities;
	generateLocalDtlsParameters: () => DtlsParameters;
};

export class FakeHandler extends HandlerInterface {
	// Closed flag.
	private _closed = false;
	// Fake parameters source of RTP and SCTP parameters and capabilities.
	private fakeParameters: any;
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

	constructor(fakeParameters: any) {
		super();

		this.fakeParameters = fakeParameters;
	}

	get name(): string {
		return 'FakeHandler';
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
		proprietaryConstraints,
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
			this._rtpParametersByKind![track.kind]
		);
		const useRtx = rtpParameters.codecs.some((_codec: any) =>
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

	async setRtpEncodingParameters(localId: string, params: any): Promise<void> {
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

		const dataChannel = new FakeDataChannel({
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

		// @ts-ignore.
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

		const dataChannel = new FakeDataChannel({
			id: sctpStreamParameters.streamId!,
			ordered: sctpStreamParameters.ordered,
			maxPacketLifeTime: sctpStreamParameters.maxPacketLifeTime,
			maxRetransmits: sctpStreamParameters.maxRetransmits,
			label,
			protocol,
		});

		// @ts-ignore.
		return { dataChannel };
	}

	private async setupTransport({
		localDtlsRole,
		// eslint-disable-next-line @typescript-eslint/no-unused-vars
		localSdpObject,
	}: {
		localDtlsRole: DtlsRole;
		localSdpObject?: any;
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
