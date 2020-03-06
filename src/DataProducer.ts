import { Logger } from './Logger';
import { EnhancedEventEmitter } from './EnhancedEventEmitter';
import { InvalidStateError } from './errors';
import { SctpStreamParameters } from './SctpParameters';

export type DataProducerOptions =
{
	ordered?: boolean;
	maxPacketLifeTime?: number;
	maxRetransmits?: number;
	priority?: RTCPriorityType;
	label?: string;
	protocol?: string;
	appData?: any;
}

const logger = new Logger('DataProducer');

export class DataProducer extends EnhancedEventEmitter
{
	// Id.
	private readonly _id: string;
	// The underlying RTCDataChannel instance.
	private readonly _dataChannel: RTCDataChannel;
	// Closed flag.
	private _closed = false;
	// SCTP stream parameters.
	private readonly _sctpStreamParameters: SctpStreamParameters;
	// App custom data.
	private readonly _appData: any;

	/**
	 * @emits transportclose
	 * @emits open
	 * @emits error - (error: Error)
	 * @emits close
	 * @emits bufferedamountlow
	 * @emits @close
	 */
	constructor(
		{
			id,
			dataChannel,
			sctpStreamParameters,
			appData
		}:
		{
			id: string;
			dataChannel: RTCDataChannel;
			sctpStreamParameters: SctpStreamParameters;
			appData: any;
		}
	)
	{
		super();

		logger.debug('constructor()');

		this._id = id;
		this._dataChannel = dataChannel;
		this._sctpStreamParameters = sctpStreamParameters;
		this._appData = appData;

		this._handleDataChannel();
	}

	/**
	 * DataProducer id.
	 */
	get id(): string
	{
		return this._id;
	}

	/**
	 * Whether the DataProducer is closed.
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
	 * DataChannel bufferedAmount.
	 */
	get bufferedAmount(): number
	{
		return this._dataChannel.bufferedAmount;
	}

	/**
	 * DataChannel bufferedAmountLowThreshold.
	 */
	get bufferedAmountLowThreshold(): number
	{
		return this._dataChannel.bufferedAmountLowThreshold;
	}

	/**
	 * Set DataChannel bufferedAmountLowThreshold.
	 */
	set bufferedAmountLowThreshold(bufferedAmountLowThreshold: number)
	{
		this._dataChannel.bufferedAmountLowThreshold = bufferedAmountLowThreshold;
	}

	/**
	 * App custom data.
	 */
	get appData(): any
	{
		return this._appData;
	}

	/**
	 * Invalid setter.
	 */
	set appData(appData: any) // eslint-disable-line no-unused-vars
	{
		throw new Error('cannot override appData object');
	}

	/**
	 * Closes the DataProducer.
	 */
	close(): void
	{
		if (this._closed)
			return;

		logger.debug('close()');

		this._closed = true;

		this._dataChannel.close();

		this.emit('@close');
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
	}

	/**
	 * Send a message.
	 *
	 * @param {String|Blob|ArrayBuffer|ArrayBufferView} data.
	 */
	send(data: any): void
	{
		logger.debug('send()');

		if (this._closed)
			throw new InvalidStateError('closed');

		this._dataChannel.send(data);
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

		this._dataChannel.addEventListener('message', () =>
		{
			if (this._closed)
				return;

			logger.warn(
				'DataChannel "message" event in a DataProducer, message discarded');
		});

		this._dataChannel.addEventListener('bufferedamountlow', () =>
		{
			if (this._closed)
				return;

			this.safeEmit('bufferedamountlow');
		});
	}
}
