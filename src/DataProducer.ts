import { Logger } from './Logger';
import { EnhancedEventEmitter } from './EnhancedEventEmitter';
import { InvalidStateError } from './errors';
import { SctpStreamParameters } from './SctpParameters';
import { AppData } from './types';

const logger = new Logger('DataProducer');

export type DataProducerOptions<DataProducerAppData extends AppData = AppData> =
	{
		ordered?: boolean;
		maxPacketLifeTime?: number;
		maxRetransmits?: number;
		label?: string;
		protocol?: string;
		appData?: DataProducerAppData;
	};

export type DataProducerObserver =
	EnhancedEventEmitter<DataProducerObserverEvents>;

export type DataProducerEvents = {
	transportclose: [];
	open: [];
	error: [Error];
	close: [];
	bufferedamountlow: [];
	// Private events.
	'@close': [];
};

export type DataProducerObserverEvents = {
	close: [];
};

export class DataProducer<
	DataProducerAppData extends AppData = AppData,
> extends EnhancedEventEmitter<DataProducerEvents> {
	// Id.
	private readonly _id: string;
	// The underlying RTCDataChannel instance.
	private readonly _dataChannel: RTCDataChannel;
	// Closed flag.
	private _closed = false;
	// SCTP stream parameters.
	private readonly _sctpStreamParameters: SctpStreamParameters;
	// App custom data.
	private _appData: DataProducerAppData;
	// Observer instance.
	protected readonly _observer: DataProducerObserver =
		new EnhancedEventEmitter<DataProducerObserverEvents>();

	constructor({
		id,
		dataChannel,
		sctpStreamParameters,
		appData,
	}: {
		id: string;
		dataChannel: RTCDataChannel;
		sctpStreamParameters: SctpStreamParameters;
		appData?: DataProducerAppData;
	}) {
		super();

		logger.debug('constructor()');

		this._id = id;
		this._dataChannel = dataChannel;
		this._sctpStreamParameters = sctpStreamParameters;
		this._appData = appData ?? ({} as DataProducerAppData);

		this.handleDataChannel();
	}

	/**
	 * DataProducer id.
	 */
	get id(): string {
		return this._id;
	}

	/**
	 * Whether the DataProducer is closed.
	 */
	get closed(): boolean {
		return this._closed;
	}

	/**
	 * SCTP stream parameters.
	 */
	get sctpStreamParameters(): SctpStreamParameters {
		return this._sctpStreamParameters;
	}

	/**
	 * DataChannel readyState.
	 */
	get readyState(): RTCDataChannelState {
		return this._dataChannel.readyState;
	}

	/**
	 * DataChannel label.
	 */
	get label(): string {
		return this._dataChannel.label;
	}

	/**
	 * DataChannel protocol.
	 */
	get protocol(): string {
		return this._dataChannel.protocol;
	}

	/**
	 * DataChannel bufferedAmount.
	 */
	get bufferedAmount(): number {
		return this._dataChannel.bufferedAmount;
	}

	/**
	 * DataChannel bufferedAmountLowThreshold.
	 */
	get bufferedAmountLowThreshold(): number {
		return this._dataChannel.bufferedAmountLowThreshold;
	}

	/**
	 * Set DataChannel bufferedAmountLowThreshold.
	 */
	set bufferedAmountLowThreshold(bufferedAmountLowThreshold: number) {
		this._dataChannel.bufferedAmountLowThreshold = bufferedAmountLowThreshold;
	}

	/**
	 * App custom data.
	 */
	get appData(): DataProducerAppData {
		return this._appData;
	}

	/**
	 * App custom data setter.
	 */
	set appData(appData: DataProducerAppData) {
		this._appData = appData;
	}

	get observer(): DataProducerObserver {
		return this._observer;
	}

	/**
	 * Closes the DataProducer.
	 */
	close(): void {
		if (this._closed) {
			return;
		}

		logger.debug('close()');

		this._closed = true;

		this._dataChannel.close();

		this.emit('@close');

		// Emit observer event.
		this._observer.safeEmit('close');
	}

	/**
	 * Transport was closed.
	 */
	transportClosed(): void {
		if (this._closed) {
			return;
		}

		logger.debug('transportClosed()');

		this._closed = true;

		this._dataChannel.close();

		this.safeEmit('transportclose');

		// Emit observer event.
		this._observer.safeEmit('close');
	}

	/**
	 * Send a message.
	 *
	 * @param {String|Blob|ArrayBuffer|ArrayBufferView} data.
	 */
	send(data: any): void {
		logger.debug('send()');

		if (this._closed) {
			throw new InvalidStateError('closed');
		}

		this._dataChannel.send(data);
	}

	private handleDataChannel(): void {
		this._dataChannel.addEventListener('open', () => {
			if (this._closed) {
				return;
			}

			logger.debug('DataChannel "open" event');

			this.safeEmit('open');
		});

		this._dataChannel.addEventListener('error', (event: any) => {
			if (this._closed) {
				return;
			}

			let { error } = event;

			if (!error) {
				error = new Error('unknown DataChannel error');
			}

			if (error.errorDetail === 'sctp-failure') {
				logger.error(
					'DataChannel SCTP error [sctpCauseCode:%s]: %s',
					error.sctpCauseCode,
					error.message
				);
			} else {
				logger.error('DataChannel "error" event: %o', error);
			}

			this.safeEmit('error', error);
		});

		this._dataChannel.addEventListener('close', () => {
			if (this._closed) {
				return;
			}

			logger.warn('DataChannel "close" event');

			this._closed = true;

			this.emit('@close');
			this.safeEmit('close');

			// Emit observer event.
			this._observer.safeEmit('close');
		});

		this._dataChannel.addEventListener('message', () => {
			if (this._closed) {
				return;
			}

			logger.warn(
				'DataChannel "message" event in a DataProducer, message discarded'
			);
		});

		this._dataChannel.addEventListener('bufferedamountlow', () => {
			if (this._closed) {
				return;
			}

			this.safeEmit('bufferedamountlow');
		});
	}
}
