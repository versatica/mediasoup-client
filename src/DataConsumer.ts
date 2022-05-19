import { Logger } from './Logger';
import { EnhancedEventEmitter } from './EnhancedEventEmitter';
import { SctpStreamParameters } from './SctpParameters';

export type DataConsumerOptions =
{
	id?: string;
	dataProducerId?: string;
	sctpStreamParameters: SctpStreamParameters;
	label?: string;
	protocol?: string;
	appData?: Record<string, unknown>;
}

const logger = new Logger('DataConsumer');

export class DataConsumer extends EnhancedEventEmitter
{
	// Id.
	private readonly _id: string;
	// Associated DataProducer Id.
	private readonly _dataProducerId: string;
	// The underlying RTCDataChannel instance.
	private readonly _dataChannel: RTCDataChannel;
	// Closed flag.
	private _closed = false;
	// SCTP stream parameters.
	private readonly _sctpStreamParameters: SctpStreamParameters;
	// App custom data.
	private readonly _appData: Record<string, unknown>;
	// Observer instance.
	protected readonly _observer = new EnhancedEventEmitter();

	/**
	 * @emits transportclose
	 * @emits open
	 * @emits error - (error: Error)
	 * @emits close
	 * @emits message - (message: any)
	 * @emits @close
	 */
	constructor(
		{
			id,
			dataProducerId,
			dataChannel,
			sctpStreamParameters,
			appData
		}:
		{
			id: string;
			dataProducerId: string;
			dataChannel: RTCDataChannel;
			sctpStreamParameters: SctpStreamParameters;
			appData?: Record<string, unknown>;
		}
	)
	{
		super();

		logger.debug('constructor()');

		this._id = id;
		this._dataProducerId = dataProducerId;
		this._dataChannel = dataChannel;
		this._sctpStreamParameters = sctpStreamParameters;
		this._appData = appData || {};

		this._handleDataChannel();
	}

	/**
	 * DataConsumer id.
	 */
	get id(): string
	{
		return this._id;
	}

	/**
	 * Associated DataProducer id.
	 */
	get dataProducerId(): string
	{
		return this._dataProducerId;
	}

	/**
	 * Whether the DataConsumer is closed.
	 */
	get closed(): boolean
	{
		return this._closed;
	}

	/**
	 * SCTP stream parameters.
	 */
	get sctpStreamParameters(): SctpStreamParameters
	{
		return this._sctpStreamParameters;
	}

	/**
	 * DataChannel readyState.
	 */
	get readyState(): RTCDataChannelState
	{
		return this._dataChannel.readyState;
	}

	/**
	 * DataChannel label.
	 */
	get label(): string
	{
		return this._dataChannel.label;
	}

	/**
	 * DataChannel protocol.
	 */
	get protocol(): string
	{
		return this._dataChannel.protocol;
	}

	/**
	 * DataChannel binaryType.
	 */
	get binaryType(): BinaryType
	{
		return this._dataChannel.binaryType;
	}

	/**
	 * Set DataChannel binaryType.
	 */
	set binaryType(binaryType: BinaryType)
	{
		this._dataChannel.binaryType = binaryType;
	}

	/**
	 * App custom data.
	 */
	get appData(): Record<string, unknown>
	{
		return this._appData;
	}

	/**
	 * Invalid setter.
	 */
	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	set appData(appData: Record<string, unknown>)
	{
		throw new Error('cannot override appData object');
	}

	/**
	 * Observer.
	 *
	 * @emits close
	 */
	get observer(): EnhancedEventEmitter
	{
		return this._observer;
	}

	/**
	 * Closes the DataConsumer.
	 */
	close(): void
	{
		if (this._closed)
			return;

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
	transportClosed(): void
	{
		if (this._closed)
			return;

		logger.debug('transportClosed()');

		this._closed = true;

		this._dataChannel.close();

		this.safeEmit('transportclose');

		// Emit observer event.
		this._observer.safeEmit('close');
	}

	private _handleDataChannel(): void
	{
		this._dataChannel.addEventListener('open', () =>
		{
			if (this._closed)
				return;

			logger.debug('DataChannel "open" event');

			this.safeEmit('open');
		});

		this._dataChannel.addEventListener('error', (event: any) =>
		{
			if (this._closed)
				return;

			let { error } = event;

			if (!error)
				error = new Error('unknown DataChannel error');

			if (error.errorDetail === 'sctp-failure')
			{
				logger.error(
					'DataChannel SCTP error [sctpCauseCode:%s]: %s',
					error.sctpCauseCode, error.message);
			}
			else
			{
				logger.error('DataChannel "error" event: %o', error);
			}

			this.safeEmit('error', error);
		});

		this._dataChannel.addEventListener('close', () =>
		{
			if (this._closed)
				return;

			logger.warn('DataChannel "close" event');

			this._closed = true;

			this.emit('@close');
			this.safeEmit('close');
		});

		this._dataChannel.addEventListener('message', (event: any) =>
		{
			if (this._closed)
				return;

			this.safeEmit('message', event.data);
		});
	}
}
