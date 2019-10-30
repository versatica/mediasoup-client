import AwaitQueue from 'awaitqueue';
import Logger from './Logger';
import EnhancedEventEmitter from './EnhancedEventEmitter';
import { UnsupportedError, InvalidStateError } from './errors';
import * as utils from './utils';
import * as ortc from './ortc';
import { Producer, ProducerOptions } from './Producer';
import { Consumer, ConsumerOptions } from './Consumer';
import { DataProducer, DataProducerOptions } from './DataProducer';
import { DataConsumer, DataConsumerOptions } from './DataConsumer';

export interface CanProduceByKind
{
	audio: boolean;
	video: boolean;
	[key: string]: boolean;
}

export interface TransportOptions
{
	id: string;
	iceParameters: IceParameters;
	iceCandidates: IceCandidate[];
	dtlsParameters: DtlsParameters;
	sctpParameters?: TransportSctpParameters;
	iceServers?: RTCIceServer[];
	iceTransportPolicy?: RTCIceTransportPolicy;
	additionalSettings?: any;
	proprietaryConstraints?: any;
	appData?: object;
}

export interface IceParameters
{
	/**
	 * ICE username fragment.
	 * */
	usernameFragment?: string;

	/**
	 * ICE password.
	 */
	password?: string;

	/**
	 * ICE Lite.
	 */
	iceLite: boolean;
}

export interface IceCandidate
{
	/**
	 * Unique identifier that allows ICE to correlate candidates that appear on
	 * multiple transports.
	 */
	foundation: string;

	/**
	 * The assigned priority of the candidate.
	 */
	priority: number;

	/**
	 * The IP address of the candidate.
	 */
	ip: string;

	/**
	 * The protocol of the candidate ('udp' / 'tcp').
	 */
	protocol: 'udp' | 'tcp';

	/**
	 * The port for the candidate.
	 */
	port: number;

	/**
	 * The type of candidate (always 'host').
	 */
	type: 'host';

	/**
	 * The type of TCP candidate (always 'passive').
	 */
	tcpType: 'passive';
}

export interface DtlsParameters
{
	/**
	 * DTLS role. Default 'auto'.
	 */
	role?: DtlsRole;

	/**
	 * DTLS fingerprints.
	 */
	fingerprints: DtlsFingerprints[];
}

/**
 * Map of DTLS algorithms (as defined in the 'Hash function Textual Names'
 * registry initially specified in RFC 4572 Section 8) and their corresponding
 * certificate fingerprint values (in lowercase hex string as expressed
 * utilizing the syntax of 'fingerprint' in RFC 4572 Section 5).
 */
export interface DtlsFingerprints
{
	'sha-1'?: string;
	'sha-224'?: string;
	'sha-256'?: string;
	'sha-384'?: string;
	'sha-512'?: string;
}

export interface TransportSctpParameters
{
	/**
	 * Must always equal 5000.
	 */
	port: number;

	/**
	 * Initially requested number of outgoing SCTP streams.
	 */
	OS: number;

	/**
	 * Maximum number of incoming SCTP streams.
	 */
	MIS: number;

	/**
	 * Maximum allowed size for SCTP messages.
	 */
	maxMessageSize: number;
}

export type DtlsRole = 'auto' | 'client' | 'server';

type ConnectionState = 'new' | 'connecting' | 'connected' | 'failed' | 'closed';

interface InternalTransportOptions extends TransportOptions
{
	direction: 'send' | 'recv';
	Handler: any;
	extendedRtpCapabilities: any;
	canProduceByKind: CanProduceByKind;
}

const logger = new Logger('Transport');

export class Transport extends EnhancedEventEmitter
{
	// Id.
	// @type {String}
	private _id: string;

	// Closed flag.
	// @type {Boolean}
	private _closed: boolean;

	// Direction.
	// @type {String}
	private _direction: 'send' | 'recv';

	// Extended RTP capabilities.
	// @type {Object}
	private _extendedRtpCapabilities: any;

	// Whether we can produce audio/video based on computed extended RTP
	// capabilities.
	// @type {Object}
	private _canProduceByKind: CanProduceByKind;

	// SCTP max message size if enabled, null otherwise.
	// @type {Number|Null}
	private _maxSctpMessageSize?: number | null;

	// RTC handler instance.
	// @type {Handler}
	private _handler: any;

	// Transport connection state. Values can be:
	// @type {String}
	private _connectionState: ConnectionState;

	// App custom data.
	// @type {Object}
	private _appData: object;

	// Map of Producers indexed by id.
	// @type {Map<String, Producer>}
	private _producers: Map<string, Producer>;

	// Map of Consumers indexed by id.
	// @type {Map<String, Consumer>}
	private _consumers: Map<string, Consumer>;

	// Map of DataProducers indexed by id.
	// @type {Map<String, DataProducer>}
	private _dataProducers: Map<string, DataProducer>;

	// Map of DataConsumers indexed by id.
	// @type {Map<String, DataConsumer>}
	private _dataConsumers: Map<string, DataConsumer>;

	// Whether the Consumer for RTP probation has been created.
	// @type {Boolean}
	private _probatorConsumerCreated: boolean;

	// AwaitQueue instance to make async tasks happen sequentially.
	// @type {AwaitQueue}
	private _awaitQueue: AwaitQueue;

	/**
	 * @private
	 *
	 * @emits {transportLocalParameters: Object, callback: Function, errback: Function} connect
	 * @emits {connectionState: String} connectionstatechange
	 * @emits {producerLocalParameters: Object, callback: Function, errback: Function} produce
	 * @emits {dataProducerLocalParameters: Object, callback: Function, errback: Function} producedata
	 */
	constructor(
		{
			direction,
			id,
			iceParameters,
			iceCandidates,
			dtlsParameters,
			sctpParameters,
			iceServers,
			iceTransportPolicy,
			additionalSettings,
			proprietaryConstraints,
			appData,
			Handler,
			extendedRtpCapabilities,
			canProduceByKind
		}: InternalTransportOptions
	)
	{
		super(logger);

		logger.debug('constructor() [id:%s, direction:%s]', id, direction);

		this._id = id;

		this._closed = false;

		this._direction = direction;

		this._extendedRtpCapabilities = extendedRtpCapabilities;

		this._canProduceByKind = canProduceByKind;

		this._maxSctpMessageSize =
			sctpParameters ? sctpParameters.maxMessageSize : null;

		// Clone and sanitize additionalSettings.
		additionalSettings = utils.clone(additionalSettings);

		delete additionalSettings.iceServers;
		delete additionalSettings.iceTransportPolicy;
		delete additionalSettings.bundlePolicy;
		delete additionalSettings.rtcpMuxPolicy;
		delete additionalSettings.sdpSemantics;

		this._handler = new Handler(
			{
				direction,
				iceParameters,
				iceCandidates,
				dtlsParameters,
				sctpParameters,
				iceServers,
				iceTransportPolicy,
				additionalSettings,
				proprietaryConstraints,
				extendedRtpCapabilities
			});

		this._connectionState = 'new';

		this._appData = appData;

		this._producers = new Map();

		this._consumers = new Map();

		this._dataProducers = new Map();

		this._dataConsumers = new Map();

		this._probatorConsumerCreated = false;

		this._awaitQueue = new AwaitQueue({ ClosedErrorClass: InvalidStateError });

		this._handleHandler();
	}

	/**
	 * Transport id.
	 *
	 * @returns {String}
	 */
	get id(): string
	{
		return this._id;
	}

	/**
	 * Whether the Transport is closed.
	 *
	 * @returns {Boolean}
	 */
	get closed(): boolean
	{
		return this._closed;
	}

	/**
	 * Transport direction.
	 *
	 * @returns {String}
	 */
	get direction(): 'send' | 'recv'
	{
		return this._direction;
	}

	/**
	 * RTC handler instance.
	 *
	 * @returns {Handler}
	 */
	get handler(): any
	{
		return this._handler;
	}

	/**
	 * Connection state.
	 *
	 * @returns {ConnectionState}
	 */
	get connectionState(): ConnectionState
	{
		return this._connectionState;
	}

	/**
	 * App custom data.
	 *
	 * @returns {Object}
	 */
	get appData(): object
	{
		return this._appData;
	}

	/**
	 * Invalid setter.
	 */
	set appData(appData: object) // eslint-disable-line no-unused-vars
	{
		throw new Error('cannot override appData object');
	}

	/**
	 * Close the Transport.
	 */
	close(): void
	{
		if (this._closed)
			return;

		logger.debug('close()');

		this._closed = true;

		// Close the AwaitQueue.
		this._awaitQueue.close();

		// Close the handler.
		this._handler.close();

		// Close all Producers.
		for (const producer of this._producers.values())
		{
			producer.transportClosed();
		}
		this._producers.clear();

		// Close all Consumers.
		for (const consumer of this._consumers.values())
		{
			consumer.transportClosed();
		}
		this._consumers.clear();

		// Close all DataProducers.
		for (const dataProducer of this._dataProducers.values())
		{
			dataProducer.transportClosed();
		}
		this._dataProducers.clear();

		// Close all DataConsumers.
		for (const dataConsumer of this._dataConsumers.values())
		{
			dataConsumer.transportClosed();
		}
		this._dataConsumers.clear();
	}

	/**
	 * Get associated Transport (RTCPeerConnection) stats.
	 *
	 * @async
	 * @returns {RTCStatsReport}
	 * @throws {InvalidStateError} if Transport closed.
	 */
	async getStats(): Promise<any>
	{
		if (this._closed)
			throw new InvalidStateError('closed');

		return this._handler.getTransportStats();
	}

	/**
	 * Restart ICE connection.
	 *
	 * @param {RTCIceParameters} iceParameters - New Server-side Transport ICE parameters.
	 *
	 * @async
	 * @throws {InvalidStateError} if Transport closed.
	 * @throws {TypeError} if wrong arguments.
	 */
	async restartIce(
		{ iceParameters }:
		{ iceParameters: IceParameters }
	): Promise<void>
	{
		logger.debug('restartIce()');

		if (this._closed)
			throw new InvalidStateError('closed');
		else if (!iceParameters)
			throw new TypeError('missing iceParameters');

		// Enqueue command.
		return this._awaitQueue.push(
			async () => this._handler.restartIce({ iceParameters }));
	}

	/**
	 * Update ICE servers.
	 *
	 * @param {Array<RTCIceServer>} [iceServers] - Array of ICE servers.
	 *
	 * @async
	 * @throws {InvalidStateError} if Transport closed.
	 * @throws {TypeError} if wrong arguments.
	 */
	async updateIceServers(
		{ iceServers }:
		{ iceServers: RTCIceServer[] }
	): Promise<void>
	{
		logger.debug('updateIceServers()');

		if (this._closed)
			throw new InvalidStateError('closed');
		else if (!Array.isArray(iceServers))
			throw new TypeError('missing iceServers');

		// Enqueue command.
		return this._awaitQueue.push(
			async () => this._handler.updateIceServers({ iceServers }));
	}

	/**
	 * Create a Producer.
	 *
	 * @param {MediaStreamTrack} track - Track to sent.
	 * @param {Array<RTCRtpCodingParameters>} [encodings] - Encodings.
	 * @param {Object} [codecOptions] - Codec options.
	 * @param {Object} [appData={}] - Custom app data.
	 *
	 * @async
	 * @returns {Producer}
	 * @throws {InvalidStateError} if Transport closed or track ended.
	 * @throws {TypeError} if wrong arguments.
	 * @throws {UnsupportedError} if Transport direction is incompatible or
	 *   cannot produce the given media kind.
	 */
	async produce(
		{
			track,
			encodings,
			codecOptions,
			appData = {}
		}: ProducerOptions
	): Promise<Producer>
	{
		logger.debug('produce() [track:%o]', track);

		if (!track)
			throw new TypeError('missing track');
		else if (this._direction !== 'send')
			throw new UnsupportedError('not a sending Transport');
		else if (!this._canProduceByKind[track.kind])
			throw new UnsupportedError(`cannot produce ${track.kind}`);
		else if (track.readyState === 'ended')
			throw new InvalidStateError('track ended');
		else if (appData && typeof appData !== 'object')
			throw new TypeError('if given, appData must be an object');

		// Enqueue command.
		return this._awaitQueue.push(
			async () =>
			{
				let normalizedEncodings;

				if (encodings && !Array.isArray(encodings))
				{
					throw TypeError('encodings must be an array');
				}
				else if (encodings && encodings.length === 0)
				{
					normalizedEncodings = undefined;
				}
				else if (encodings)
				{
					normalizedEncodings = encodings
						.map((encoding: any) =>
						{
							const normalizedEncoding: any = { active: true };

							if (encoding.active === false)
								normalizedEncoding.active = false;
							if (typeof encoding.maxBitrate === 'number')
								normalizedEncoding.maxBitrate = encoding.maxBitrate;
							if (typeof encoding.maxFramerate === 'number')
								normalizedEncoding.maxFramerate = encoding.maxFramerate;
							if (typeof encoding.scaleResolutionDownBy === 'number')
								normalizedEncoding.scaleResolutionDownBy = encoding.scaleResolutionDownBy;
							if (typeof encoding.dtx === 'boolean')
								normalizedEncoding.dtx = encoding.dtx;
							if (typeof encoding.scalabilityMode === 'string')
								normalizedEncoding.scalabilityMode = encoding.scalabilityMode;

							return normalizedEncoding;
						});
				}

				const { localId, rtpParameters } = await this._handler.send(
					{
						track,
						encodings : normalizedEncodings,
						codecOptions
					});

				try
				{
					const { id } = await this.safeEmitAsPromise(
						'produce',
						{
							kind : track.kind,
							rtpParameters,
							appData
						});

					const producer =
						new Producer({ id, localId, track, rtpParameters, appData });

					this._producers.set(producer.id, producer);
					this._handleProducer(producer);

					return producer;
				}
				catch (error)
				{
					this._handler.stopSending({ localId })
						.catch(() => {});

					throw error;
				}
			})
			// This catch is needed to stop the given track if the command above
			// failed due to closed Transport.
			.catch((error: Error) =>
			{
				try { track.stop(); }
				catch (error2) {}

				throw error;
			});
	}

	/**
	 * Create a Consumer to consume a remote Producer.
	 *
	 * @param {String} id - Server-side Consumer id.
	 * @param {String} producerId - Server-side Producer id.
	 * @param {String} kind - 'audio' or 'video'.
	 * @param {RTCRtpParameters} rtpParameters - Server-side Consumer RTP parameters.
	 * @param {Object} [appData={}] - Custom app data.
	 *
	 * @async
	 * @returns {Consumer}
	 * @throws {InvalidStateError} if Transport closed.
	 * @throws {TypeError} if wrong arguments.
	 * @throws {UnsupportedError} if Transport direction is incompatible.
	 */
	async consume(
		{
			id,
			producerId,
			kind,
			rtpParameters,
			appData = {}
		}: ConsumerOptions
	): Promise<Consumer>
	{
		logger.debug('consume()');

		if (this._closed)
			throw new InvalidStateError('closed');
		else if (this._direction !== 'recv')
			throw new UnsupportedError('not a receiving Transport');
		else if (typeof id !== 'string')
			throw new TypeError('missing id');
		else if (typeof producerId !== 'string')
			throw new TypeError('missing producerId');
		else if (kind !== 'audio' && kind !== 'video')
			throw new TypeError(`invalid kind '${kind}'`);
		else if (typeof rtpParameters !== 'object')
			throw new TypeError('missing rtpParameters');
		else if (appData && typeof appData !== 'object')
			throw new TypeError('if given, appData must be an object');

		// Enqueue command.
		return this._awaitQueue.push(
			async () =>
			{
				// Ensure the device can consume it.
				const canConsume = ortc.canReceive(
					rtpParameters, this._extendedRtpCapabilities);

				if (!canConsume)
					throw new UnsupportedError('cannot consume this Producer');

				const { localId, track } =
					await this._handler.receive({ id, kind, rtpParameters });

				const consumer =
					new Consumer({ id, localId, producerId, track, rtpParameters, appData });

				this._consumers.set(consumer.id, consumer);
				this._handleConsumer(consumer);

				// If this is the first video Consumer and the Consumer for RTP probation
				// has not yet been created, create it now.
				if (!this._probatorConsumerCreated && kind === 'video')
				{
					try
					{
						const probatorRtpParameters =
							ortc.generateProbatorRtpParameters(consumer.rtpParameters);

						await this._handler.receive(
							{
								id            : 'probator',
								kind          : 'video',
								rtpParameters : probatorRtpParameters
							});

						logger.debug('consume() | Consumer for RTP probation created');

						this._probatorConsumerCreated = true;
					}
					catch (error)
					{
						logger.warn(
							'consume() | failed to create Consumer for RTP probation:%o',
							error);
					}
				}

				return consumer;
			});
	}

	/**
	 * Create a DataProducer
	 *
	 * @param {Boolean} [ordered=true]
	 * @param {Number} [maxPacketLifeTime]
	 * @param {Number} [maxRetransmits]
	 * @param {String} [priority='low'] // 'very-low' / 'low' / 'medium' / 'high'
	 * @param {String} [label='']
	 * @param {String} [protocol='']
	 * @param {Object} [appData={}] - Custom app data.
	 *
	 * @async
	 * @returns {DataProducer}
	 * @throws {InvalidStateError} if Transport closed.
	 * @throws {TypeError} if wrong arguments.
	 * @throws {UnsupportedError} if Transport direction is incompatible or remote
	 *   transport does not enable SCTP.
	 */
	async produceData(
		{
			ordered = true,
			maxPacketLifeTime,
			maxRetransmits,
			priority = 'low',
			label = '',
			protocol = '',
			appData = {}
		}: DataProducerOptions
	): Promise<DataProducer>
	{
		logger.debug('produceData()');

		if (this._direction !== 'send')
			throw new UnsupportedError('not a sending Transport');
		else if (!this._maxSctpMessageSize)
			throw new UnsupportedError('SCTP not enabled by remote Transport');
		else if (![ 'very-low', 'low', 'medium', 'high' ].includes(priority))
			throw new TypeError('wrong priority');
		else if (appData && typeof appData !== 'object')
			throw new TypeError('if given, appData must be an object');

		if (maxPacketLifeTime || maxRetransmits)
			ordered = false;

		// Enqueue command.
		return this._awaitQueue.push(
			async () =>
			{
				const {
					dataChannel,
					sctpStreamParameters
				} = await this._handler.sendDataChannel(
					{
						ordered,
						maxPacketLifeTime,
						maxRetransmits,
						priority,
						label,
						protocol
					});

				const { id } = await this.safeEmitAsPromise(
					'producedata',
					{
						sctpStreamParameters,
						label,
						protocol,
						appData
					});

				const dataProducer =
					new DataProducer({ id, dataChannel, sctpStreamParameters, appData });

				this._dataProducers.set(dataProducer.id, dataProducer);
				this._handleDataProducer(dataProducer);

				return dataProducer;
			});
	}

	/**
	 * Create a DataConsumer
	 *
	 * @param {String} id - Server-side DataConsumer id.
	 * @param {String} dataProducerId - Server-side DataProducer id.
	 * @param {RTCSctpStreamParameters} sctpStreamParameters - Server-side DataConsumer
	 *   SCTP parameters.
	 * @param {String} [label='']
	 * @param {String} [protocol='']
	 * @param {Object} [appData={}] - Custom app data.
	 *
	 * @async
	 * @returns {DataConsumer}
	 * @throws {InvalidStateError} if Transport closed.
	 * @throws {TypeError} if wrong arguments.
	 * @throws {UnsupportedError} if Transport direction is incompatible or remote
	 *   transport does not enable SCTP.
	 */
	async consumeData(
		{
			id,
			dataProducerId,
			sctpStreamParameters,
			label = '',
			protocol = '',
			appData = {}
		}: DataConsumerOptions
	): Promise<DataConsumer>
	{
		logger.debug('consumeData()');

		if (this._closed)
			throw new InvalidStateError('closed');
		else if (this._direction !== 'recv')
			throw new UnsupportedError('not a receiving Transport');
		else if (!this._maxSctpMessageSize)
			throw new UnsupportedError('SCTP not enabled by remote Transport');
		else if (typeof id !== 'string')
			throw new TypeError('missing id');
		else if (typeof dataProducerId !== 'string')
			throw new TypeError('missing dataProducerId');
		else if (typeof sctpStreamParameters !== 'object')
			throw new TypeError('missing sctpStreamParameters');
		else if (appData && typeof appData !== 'object')
			throw new TypeError('if given, appData must be an object');

		// Enqueue command.
		return this._awaitQueue.push(
			async () =>
			{
				const {
					dataChannel
				} = await this._handler.receiveDataChannel(
					{
						sctpStreamParameters,
						label,
						protocol
					});

				const dataConsumer = new DataConsumer(
					{
						id,
						dataProducerId,
						dataChannel,
						sctpStreamParameters,
						appData
					});

				this._dataConsumers.set(dataConsumer.id, dataConsumer);
				this._handleDataConsumer(dataConsumer);

				return dataConsumer;
			});
	}

	_handleHandler(): void
	{
		const handler = this._handler;

		handler.on('@connect', (
			{ dtlsParameters }: { dtlsParameters: DtlsParameters },
			callback: Function,
			errback: Function
		) =>
		{
			if (this._closed)
			{
				errback(new InvalidStateError('closed'));

				return;
			}

			this.safeEmit('connect', { dtlsParameters }, callback, errback);
		});

		handler.on('@connectionstatechange', (connectionState: ConnectionState) =>
		{
			if (connectionState === this._connectionState)
				return;

			logger.debug('connection state changed to %s', connectionState);

			this._connectionState = connectionState;

			if (!this._closed)
				this.safeEmit('connectionstatechange', connectionState);
		});
	}

	_handleProducer(producer: Producer): void
	{
		producer.on('@close', () =>
		{
			this._producers.delete(producer.id);

			if (this._closed)
				return;

			this._awaitQueue.push(
				async () => this._handler.stopSending({ localId: producer.localId }))
				.catch((error: Error) => logger.warn('producer.close() failed:%o', error));
		});

		producer.on('@replacetrack', (track, callback, errback) =>
		{
			this._awaitQueue.push(
				async () => this._handler.replaceTrack({ localId: producer.localId, track }))
				.then(callback)
				.catch(errback);
		});

		producer.on('@setmaxspatiallayer', (spatialLayer, callback, errback) =>
		{
			this._awaitQueue.push(
				async () => (
					this._handler.setMaxSpatialLayer({ localId: producer.localId, spatialLayer })
				))
				.then(callback)
				.catch(errback);
		});

		producer.on('@getstats', (callback, errback) =>
		{
			if (this._closed)
				return errback(new InvalidStateError('closed'));

			this._handler.getSenderStats({ localId: producer.localId })
				.then(callback)
				.catch(errback);
		});
	}

	_handleConsumer(consumer: Consumer): void
	{
		consumer.on('@close', () =>
		{
			this._consumers.delete(consumer.id);

			if (this._closed)
				return;

			this._awaitQueue.push(
				async () => this._handler.stopReceiving({ localId: consumer.localId }))
				.catch(() => {});
		});

		consumer.on('@getstats', (callback, errback) =>
		{
			if (this._closed)
				return errback(new InvalidStateError('closed'));

			this._handler.getReceiverStats({ localId: consumer.localId })
				.then(callback)
				.catch(errback);
		});
	}

	_handleDataProducer(dataProducer: DataProducer): void
	{
		dataProducer.on('@close', () =>
		{
			this._dataProducers.delete(dataProducer.id);
		});
	}

	_handleDataConsumer(dataConsumer: DataConsumer): void
	{
		dataConsumer.on('@close', () =>
		{
			this._dataConsumers.delete(dataConsumer.id);
		});
	}
}
