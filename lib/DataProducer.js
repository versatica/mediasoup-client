const Logger = require('./Logger');
const EnhancedEventEmitter = require('./EnhancedEventEmitter');
const { InvalidStateError } = require('./errors');

const logger = new Logger('DataProducer');

class DataProducer extends EnhancedEventEmitter
{
	/**
	 * @private
	 *
	 * @emits transportclose
	 * @emits open
	 * @emits {Object} error
	 * @emits close
	 * @emits bufferedamountlow
	 * @emits @close
	 */
	constructor({ id, dataChannel, sctpStreamParameters, appData })
	{
		super(logger);

		// Id.
		// @type {String}
		this._id = id;

		// The underlying RTCDataChannel instance.
		// @type {RTCDataChannel}
		this._dataChannel = dataChannel;

		// Closed flag.
		// @type {Boolean}
		this._closed = false;

		// SCTP stream parameters.
		// @type {RTCSctpStreamParameters}
		this._sctpStreamParameters = sctpStreamParameters;

		// App custom data.
		// @type {Object}
		this._appData = appData;

		this._handleDataChannel();
	}

	/**
	 * DataProducer id.
	 *
	 * @returns {String}
	 */
	get id()
	{
		return this._id;
	}

	/**
	 * Whether the DataProducer is closed.
	 *
	 * @returns {Boolean}
	 */
	get closed()
	{
		return this._closed;
	}

	/**
	 * SCTP stream parameters.
	 *
	 * @returns {RTCSctpStreamParameters}
	 */
	get sctpStreamParameters()
	{
		return this._sctpStreamParameters;
	}

	/**
	 * DataChannel readyState.
	 *
	 * @returns {String}
	 */
	get readyState()
	{
		return this._dataChannel.readyState;
	}

	/**
	 * DataChannel label.
	 *
	 * @returns {String}
	 */
	get label()
	{
		return this._dataChannel.label;
	}

	/**
	 * DataChannel protocol.
	 *
	 * @returns {String}
	 */
	get protocol()
	{
		return this._dataChannel.protocol;
	}

	/**
	 * DataChannel bufferedAmount.
	 *
	 * @returns {String}
	 */
	get bufferedAmount()
	{
		return this._dataChannel.bufferedAmount;
	}

	/**
	 * DataChannel bufferedAmountLowThreshold.
	 *
	 * @returns {String}
	 */
	get bufferedAmountLowThreshold()
	{
		return this._dataChannel.bufferedAmountLowThreshold;
	}

	/**
	 * Set DataChannel bufferedAmountLowThreshold.
	 *
	 * @param {Number} bufferedAmountLowThreshold
	 */
	set bufferedAmountLowThreshold(bufferedAmountLowThreshold)
	{
		this._dataChannel.bufferedAmountLowThreshold = bufferedAmountLowThreshold;
	}

	/**
	 * App custom data.
	 *
	 * @returns {Object}
	 */
	get appData()
	{
		return this._appData;
	}

	/**
	 * Invalid setter.
	 */
	set appData(appData) // eslint-disable-line no-unused-vars
	{
		throw new Error('cannot override appData object');
	}

	/**
	 * Closes the DataProducer.
	 */
	close()
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
	 *
	 * @private
	 */
	transportClosed()
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
	 *
	 * @throws {InvalidStateError} if DataProducer closed.
	 * @throws {TypeError} if wrong arguments.
	 */
	send(data)
	{
		logger.debug('send()');

		if (this._closed)
			throw new InvalidStateError('closed');

		this._dataChannel.send(data);
	}

	/**
	 * @private
	 */
	_handleDataChannel()
	{
		this._dataChannel.addEventListener('open', () =>
		{
			if (this._closed)
				return;

			logger.debug('DataChannel "open" event');

			this.safeEmit('open');
		});

		this._dataChannel.addEventListener('error', (event) =>
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

module.exports = DataProducer;
