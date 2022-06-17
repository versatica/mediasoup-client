"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.Transport = void 0;
const awaitqueue_1 = require("awaitqueue");
const Logger_1 = require("./Logger");
const EnhancedEventEmitter_1 = require("./EnhancedEventEmitter");
const errors_1 = require("./errors");
const utils = __importStar(require("./utils"));
const ortc = __importStar(require("./ortc"));
const Producer_1 = require("./Producer");
const Consumer_1 = require("./Consumer");
const DataProducer_1 = require("./DataProducer");
const DataConsumer_1 = require("./DataConsumer");
class ConsumerCreationTask {
    constructor(consumerOptions) {
        this.consumerOptions = consumerOptions;
        this.promise = new Promise((resolve, reject) => {
            this.resolve = resolve;
            this.reject = reject;
        });
    }
}
const logger = new Logger_1.Logger('Transport');
class Transport extends EnhancedEventEmitter_1.EnhancedEventEmitter {
    /**
     * @emits connect - (transportLocalParameters: any, callback: Function, errback: Function)
     * @emits connectionstatechange - (connectionState: ConnectionState)
     * @emits produce - (producerLocalParameters: any, callback: Function, errback: Function)
     * @emits producedata - (dataProducerLocalParameters: any, callback: Function, errback: Function)
     */
    constructor({ direction, id, iceParameters, iceCandidates, dtlsParameters, sctpParameters, iceServers, iceTransportPolicy, additionalSettings, proprietaryConstraints, appData, handlerFactory, extendedRtpCapabilities, canProduceByKind }) {
        super();
        // Closed flag.
        this._closed = false;
        // Transport connection state.
        this._connectionState = 'new';
        // Map of Producers indexed by id.
        this._producers = new Map();
        // Map of Consumers indexed by id.
        this._consumers = new Map();
        // Map of DataProducers indexed by id.
        this._dataProducers = new Map();
        // Map of DataConsumers indexed by id.
        this._dataConsumers = new Map();
        // Whether the Consumer for RTP probation has been created.
        this._probatorConsumerCreated = false;
        // AwaitQueue instance to make async tasks happen sequentially.
        this._awaitQueue = new awaitqueue_1.AwaitQueue({ ClosedErrorClass: errors_1.InvalidStateError });
        // Consumer creation tasks awaiting to be processed.
        this._pendingConsumerTasks = [];
        // Consumer creation in progress flag.
        this._consumerCreationInProgress = false;
        // Consumers pending to be paused.
        this._pendingPauseConsumers = new Map();
        // Consumer pause in progress flag.
        this._consumerPauseInProgress = false;
        // Consumers pending to be resumed.
        this._pendingResumeConsumers = new Map();
        // Consumer resume in progress flag.
        this._consumerResumeInProgress = false;
        // Observer instance.
        this._observer = new EnhancedEventEmitter_1.EnhancedEventEmitter();
        logger.debug('constructor() [id:%s, direction:%s]', id, direction);
        this._id = id;
        this._direction = direction;
        this._extendedRtpCapabilities = extendedRtpCapabilities;
        this._canProduceByKind = canProduceByKind;
        this._maxSctpMessageSize =
            sctpParameters ? sctpParameters.maxMessageSize : null;
        // Clone and sanitize additionalSettings.
        additionalSettings = utils.clone(additionalSettings, {});
        delete additionalSettings.iceServers;
        delete additionalSettings.iceTransportPolicy;
        delete additionalSettings.bundlePolicy;
        delete additionalSettings.rtcpMuxPolicy;
        delete additionalSettings.sdpSemantics;
        this._handler = handlerFactory();
        this._handler.run({
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
        this._appData = appData || {};
        this._handleHandler();
    }
    /**
     * Transport id.
     */
    get id() {
        return this._id;
    }
    /**
     * Whether the Transport is closed.
     */
    get closed() {
        return this._closed;
    }
    /**
     * Transport direction.
     */
    get direction() {
        return this._direction;
    }
    /**
     * RTC handler instance.
     */
    get handler() {
        return this._handler;
    }
    /**
     * Connection state.
     */
    get connectionState() {
        return this._connectionState;
    }
    /**
     * App custom data.
     */
    get appData() {
        return this._appData;
    }
    /**
     * Invalid setter.
     */
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    set appData(appData) {
        throw new Error('cannot override appData object');
    }
    /**
     * Observer.
     *
     * @emits close
     * @emits newproducer - (producer: Producer)
     * @emits newconsumer - (producer: Producer)
     * @emits newdataproducer - (dataProducer: DataProducer)
     * @emits newdataconsumer - (dataProducer: DataProducer)
     */
    get observer() {
        return this._observer;
    }
    /**
     * Close the Transport.
     */
    close() {
        if (this._closed)
            return;
        logger.debug('close()');
        this._closed = true;
        // Close the AwaitQueue.
        this._awaitQueue.close();
        // Close the handler.
        this._handler.close();
        // Close all Producers.
        for (const producer of this._producers.values()) {
            producer.transportClosed();
        }
        this._producers.clear();
        // Close all Consumers.
        for (const consumer of this._consumers.values()) {
            consumer.transportClosed();
        }
        this._consumers.clear();
        // Close all DataProducers.
        for (const dataProducer of this._dataProducers.values()) {
            dataProducer.transportClosed();
        }
        this._dataProducers.clear();
        // Close all DataConsumers.
        for (const dataConsumer of this._dataConsumers.values()) {
            dataConsumer.transportClosed();
        }
        this._dataConsumers.clear();
        // Emit observer event.
        this._observer.safeEmit('close');
    }
    /**
     * Get associated Transport (RTCPeerConnection) stats.
     *
     * @returns {RTCStatsReport}
     */
    async getStats() {
        if (this._closed)
            throw new errors_1.InvalidStateError('closed');
        return this._handler.getTransportStats();
    }
    /**
     * Restart ICE connection.
     */
    async restartIce({ iceParameters }) {
        logger.debug('restartIce()');
        if (this._closed)
            throw new errors_1.InvalidStateError('closed');
        else if (!iceParameters)
            throw new TypeError('missing iceParameters');
        // Enqueue command.
        return this._awaitQueue.push(async () => this._handler.restartIce(iceParameters), 'transport.restartIce()');
    }
    /**
     * Update ICE servers.
     */
    async updateIceServers({ iceServers } = {}) {
        logger.debug('updateIceServers()');
        if (this._closed)
            throw new errors_1.InvalidStateError('closed');
        else if (!Array.isArray(iceServers))
            throw new TypeError('missing iceServers');
        // Enqueue command.
        return this._awaitQueue.push(async () => this._handler.updateIceServers(iceServers), 'transport.updateIceServers()');
    }
    /**
     * Create a Producer.
     */
    async produce({ track, encodings, codecOptions, codec, stopTracks = true, disableTrackOnPause = true, zeroRtpOnPause = false, appData = {} } = {}) {
        logger.debug('produce() [track:%o]', track);
        if (!track)
            throw new TypeError('missing track');
        else if (this._direction !== 'send')
            throw new errors_1.UnsupportedError('not a sending Transport');
        else if (!this._canProduceByKind[track.kind])
            throw new errors_1.UnsupportedError(`cannot produce ${track.kind}`);
        else if (track.readyState === 'ended')
            throw new errors_1.InvalidStateError('track ended');
        else if (this.listenerCount('connect') === 0 && this._connectionState === 'new')
            throw new TypeError('no "connect" listener set into this transport');
        else if (this.listenerCount('produce') === 0)
            throw new TypeError('no "produce" listener set into this transport');
        else if (appData && typeof appData !== 'object')
            throw new TypeError('if given, appData must be an object');
        // Enqueue command.
        return this._awaitQueue.push(async () => {
            let normalizedEncodings;
            if (encodings && !Array.isArray(encodings)) {
                throw TypeError('encodings must be an array');
            }
            else if (encodings && encodings.length === 0) {
                normalizedEncodings = undefined;
            }
            else if (encodings) {
                normalizedEncodings = encodings
                    .map((encoding) => {
                    const normalizedEncoding = { active: true };
                    if (encoding.active === false)
                        normalizedEncoding.active = false;
                    if (typeof encoding.dtx === 'boolean')
                        normalizedEncoding.dtx = encoding.dtx;
                    if (typeof encoding.scalabilityMode === 'string')
                        normalizedEncoding.scalabilityMode = encoding.scalabilityMode;
                    if (typeof encoding.scaleResolutionDownBy === 'number')
                        normalizedEncoding.scaleResolutionDownBy = encoding.scaleResolutionDownBy;
                    if (typeof encoding.maxBitrate === 'number')
                        normalizedEncoding.maxBitrate = encoding.maxBitrate;
                    if (typeof encoding.maxFramerate === 'number')
                        normalizedEncoding.maxFramerate = encoding.maxFramerate;
                    if (typeof encoding.adaptivePtime === 'boolean')
                        normalizedEncoding.adaptivePtime = encoding.adaptivePtime;
                    if (typeof encoding.priority === 'string')
                        normalizedEncoding.priority = encoding.priority;
                    if (typeof encoding.networkPriority === 'string')
                        normalizedEncoding.networkPriority = encoding.networkPriority;
                    return normalizedEncoding;
                });
            }
            const { localId, rtpParameters, rtpSender } = await this._handler.send({
                track,
                encodings: normalizedEncodings,
                codecOptions,
                codec
            });
            try {
                // This will fill rtpParameters's missing fields with default values.
                ortc.validateRtpParameters(rtpParameters);
                const { id } = await this.safeEmitAsPromise('produce', {
                    kind: track.kind,
                    rtpParameters,
                    appData
                });
                const producer = new Producer_1.Producer({
                    id,
                    localId,
                    rtpSender,
                    track,
                    rtpParameters,
                    stopTracks,
                    disableTrackOnPause,
                    zeroRtpOnPause,
                    appData
                });
                this._producers.set(producer.id, producer);
                this._handleProducer(producer);
                // Emit observer event.
                this._observer.safeEmit('newproducer', producer);
                return producer;
            }
            catch (error) {
                this._handler.stopSending(localId)
                    .catch(() => { });
                throw error;
            }
        }, 'transport.produce()')
            // This catch is needed to stop the given track if the command above
            // failed due to closed Transport.
            .catch((error) => {
            if (stopTracks) {
                try {
                    track.stop();
                }
                catch (error2) { }
            }
            throw error;
        });
    }
    /**
     * Create a Consumer to consume a remote Producer.
     */
    async consume({ id, producerId, kind, rtpParameters, appData = {} }) {
        logger.debug('consume()');
        rtpParameters = utils.clone(rtpParameters, undefined);
        if (this._closed)
            throw new errors_1.InvalidStateError('closed');
        else if (this._direction !== 'recv')
            throw new errors_1.UnsupportedError('not a receiving Transport');
        else if (typeof id !== 'string')
            throw new TypeError('missing id');
        else if (typeof producerId !== 'string')
            throw new TypeError('missing producerId');
        else if (kind !== 'audio' && kind !== 'video')
            throw new TypeError(`invalid kind '${kind}'`);
        else if (this.listenerCount('connect') === 0 && this._connectionState === 'new')
            throw new TypeError('no "connect" listener set into this transport');
        else if (appData && typeof appData !== 'object')
            throw new TypeError('if given, appData must be an object');
        // Ensure the device can consume it.
        const canConsume = ortc.canReceive(rtpParameters, this._extendedRtpCapabilities);
        if (!canConsume)
            throw new errors_1.UnsupportedError('cannot consume this Producer');
        const consumerCreationTask = new ConsumerCreationTask({
            id,
            producerId,
            kind,
            rtpParameters,
            appData
        });
        // Store the Consumer creation task.
        this._pendingConsumerTasks.push(consumerCreationTask);
        // There is no Consumer creation in progress, create it now.
        if (this._consumerCreationInProgress === false) {
            this._createPendingConsumers();
        }
        return consumerCreationTask.promise;
    }
    /**
     * Create a DataProducer
     */
    async produceData({ ordered = true, maxPacketLifeTime, maxRetransmits, label = '', protocol = '', appData = {} } = {}) {
        logger.debug('produceData()');
        if (this._direction !== 'send')
            throw new errors_1.UnsupportedError('not a sending Transport');
        else if (!this._maxSctpMessageSize)
            throw new errors_1.UnsupportedError('SCTP not enabled by remote Transport');
        else if (this.listenerCount('connect') === 0 && this._connectionState === 'new')
            throw new TypeError('no "connect" listener set into this transport');
        else if (this.listenerCount('producedata') === 0)
            throw new TypeError('no "producedata" listener set into this transport');
        else if (appData && typeof appData !== 'object')
            throw new TypeError('if given, appData must be an object');
        if (maxPacketLifeTime || maxRetransmits)
            ordered = false;
        // Enqueue command.
        return this._awaitQueue.push(async () => {
            const { dataChannel, sctpStreamParameters } = await this._handler.sendDataChannel({
                ordered,
                maxPacketLifeTime,
                maxRetransmits,
                label,
                protocol
            });
            // This will fill sctpStreamParameters's missing fields with default values.
            ortc.validateSctpStreamParameters(sctpStreamParameters);
            const { id } = await this.safeEmitAsPromise('producedata', {
                sctpStreamParameters,
                label,
                protocol,
                appData
            });
            const dataProducer = new DataProducer_1.DataProducer({ id, dataChannel, sctpStreamParameters, appData });
            this._dataProducers.set(dataProducer.id, dataProducer);
            this._handleDataProducer(dataProducer);
            // Emit observer event.
            this._observer.safeEmit('newdataproducer', dataProducer);
            return dataProducer;
        }, 'transport.produceData()');
    }
    /**
     * Create a DataConsumer
     */
    async consumeData({ id, dataProducerId, sctpStreamParameters, label = '', protocol = '', appData = {} }) {
        logger.debug('consumeData()');
        sctpStreamParameters = utils.clone(sctpStreamParameters, undefined);
        if (this._closed)
            throw new errors_1.InvalidStateError('closed');
        else if (this._direction !== 'recv')
            throw new errors_1.UnsupportedError('not a receiving Transport');
        else if (!this._maxSctpMessageSize)
            throw new errors_1.UnsupportedError('SCTP not enabled by remote Transport');
        else if (typeof id !== 'string')
            throw new TypeError('missing id');
        else if (typeof dataProducerId !== 'string')
            throw new TypeError('missing dataProducerId');
        else if (this.listenerCount('connect') === 0 && this._connectionState === 'new')
            throw new TypeError('no "connect" listener set into this transport');
        else if (appData && typeof appData !== 'object')
            throw new TypeError('if given, appData must be an object');
        // This may throw.
        ortc.validateSctpStreamParameters(sctpStreamParameters);
        // Enqueue command.
        return this._awaitQueue.push(async () => {
            const { dataChannel } = await this._handler.receiveDataChannel({
                sctpStreamParameters,
                label,
                protocol
            });
            const dataConsumer = new DataConsumer_1.DataConsumer({
                id,
                dataProducerId,
                dataChannel,
                sctpStreamParameters,
                appData
            });
            this._dataConsumers.set(dataConsumer.id, dataConsumer);
            this._handleDataConsumer(dataConsumer);
            // Emit observer event.
            this._observer.safeEmit('newdataconsumer', dataConsumer);
            return dataConsumer;
        }, 'transport.consumeData()');
    }
    // This method is guaranteed to never throw.
    async _createPendingConsumers() {
        this._awaitQueue.push(async () => {
            this._consumerCreationInProgress = true;
            const pendingConsumerTasks = [...this._pendingConsumerTasks];
            // Clear pending Consumer tasks.
            this._pendingConsumerTasks = [];
            // Video Consumer in order to create the probator.
            let videoConsumerForProbator = undefined;
            // Fill options list.
            const optionsList = [];
            for (const task of pendingConsumerTasks) {
                const { id, kind, rtpParameters } = task.consumerOptions;
                optionsList.push({
                    trackId: id,
                    kind: kind,
                    rtpParameters
                });
            }
            try {
                const results = await this._handler.receive(optionsList);
                for (let idx = 0; idx < results.length; idx++) {
                    const task = pendingConsumerTasks[idx];
                    const result = results[idx];
                    const { id, producerId, kind, rtpParameters, appData } = task.consumerOptions;
                    const { localId, rtpReceiver, track } = result;
                    const consumer = new Consumer_1.Consumer({
                        id: id,
                        localId,
                        producerId: producerId,
                        rtpReceiver,
                        track,
                        rtpParameters,
                        appData
                    });
                    this._consumers.set(consumer.id, consumer);
                    this._handleConsumer(consumer);
                    // If this is the first video Consumer and the Consumer for RTP probation
                    // has not yet been created, it's time to create it.
                    if (!this._probatorConsumerCreated && !videoConsumerForProbator && kind === 'video') {
                        videoConsumerForProbator = consumer;
                    }
                    // Emit observer event.
                    this._observer.safeEmit('newconsumer', consumer);
                    task.resolve(consumer);
                }
            }
            catch (error) {
                for (const task of pendingConsumerTasks) {
                    task.reject(error);
                }
            }
            // If RTP probation must be handled, do it now.
            if (videoConsumerForProbator) {
                try {
                    const probatorRtpParameters = ortc.generateProbatorRtpParameters(videoConsumerForProbator.rtpParameters);
                    await this._handler.receive([{
                            trackId: 'probator',
                            kind: 'video',
                            rtpParameters: probatorRtpParameters
                        }]);
                    logger.debug('_createPendingConsumers() | Consumer for RTP probation created');
                    this._probatorConsumerCreated = true;
                }
                catch (error) {
                    logger.error('_createPendingConsumers() | failed to create Consumer for RTP probation:%o', error);
                }
            }
            this._consumerCreationInProgress = false;
        }, 'transport._createPendingConsumers()')
            .then(() => {
            // There are pending Consumer tasks, enqueue their creation.
            if (this._pendingConsumerTasks.length > 0) {
                this._createPendingConsumers();
            }
        })
            // NOTE: We only get here when the await queue is closed.
            .catch(() => { });
    }
    _pausePendingConsumers() {
        this._awaitQueue.push(async () => {
            this._consumerPauseInProgress = true;
            const pendingPauseConsumers = Array.from(this._pendingPauseConsumers.values());
            // Clear pending pause Consumer map.
            this._pendingPauseConsumers.clear();
            try {
                await this._handler.pauseReceiving(pendingPauseConsumers.map((consumer) => consumer.localId));
            }
            catch (error) {
                logger.error('_pausePendingConsumers() | failed to pause Consumers:', error);
            }
            this._consumerPauseInProgress = false;
        }, 'consumer @pause event')
            .then(() => {
            // There are pending Consumers to be paused, do it.
            if (this._pendingPauseConsumers.size > 0) {
                this._pausePendingConsumers();
            }
        })
            // NOTE: We only get here when the await queue is closed.
            .catch(() => { });
    }
    _resumePendingConsumers() {
        this._awaitQueue.push(async () => {
            this._consumerResumeInProgress = true;
            const pendingResumeConsumers = Array.from(this._pendingResumeConsumers.values());
            // Clear pending resume Consumer map.
            this._pendingResumeConsumers.clear();
            try {
                await this._handler.resumeReceiving(pendingResumeConsumers.map((consumer) => consumer.localId));
            }
            catch (error) {
                logger.error('_resumePendingConsumers() | failed to resume Consumers:', error);
            }
        }, 'consumer @resume event')
            .then(() => {
            this._consumerResumeInProgress = false;
            // There are pending Consumer to be resumed, do it.
            if (this._pendingResumeConsumers.size > 0) {
                this._resumePendingConsumers();
            }
        })
            // NOTE: We only get here when the await queue is closed.
            .catch(() => { });
    }
    _handleHandler() {
        const handler = this._handler;
        handler.on('@connect', ({ dtlsParameters }, callback, errback) => {
            if (this._closed) {
                errback(new errors_1.InvalidStateError('closed'));
                return;
            }
            this.safeEmit('connect', { dtlsParameters }, callback, errback);
        });
        handler.on('@connectionstatechange', (connectionState) => {
            if (connectionState === this._connectionState)
                return;
            logger.debug('connection state changed to %s', connectionState);
            this._connectionState = connectionState;
            if (!this._closed)
                this.safeEmit('connectionstatechange', connectionState);
        });
    }
    _handleProducer(producer) {
        producer.on('@close', () => {
            this._producers.delete(producer.id);
            if (this._closed)
                return;
            this._awaitQueue.push(async () => this._handler.stopSending(producer.localId), 'producer @close event')
                .catch((error) => logger.warn('producer.close() failed:%o', error));
        });
        producer.on('@replacetrack', (track, callback, errback) => {
            this._awaitQueue.push(async () => this._handler.replaceTrack(producer.localId, track), 'producer @replacetrack event')
                .then(callback)
                .catch(errback);
        });
        producer.on('@setmaxspatiallayer', (spatialLayer, callback, errback) => {
            this._awaitQueue.push(async () => (this._handler.setMaxSpatialLayer(producer.localId, spatialLayer)), 'producer @setmaxspatiallayer event')
                .then(callback)
                .catch(errback);
        });
        producer.on('@setrtpencodingparameters', (params, callback, errback) => {
            this._awaitQueue.push(async () => (this._handler.setRtpEncodingParameters(producer.localId, params)), 'producer @setrtpencodingparameters event')
                .then(callback)
                .catch(errback);
        });
        producer.on('@getstats', (callback, errback) => {
            if (this._closed)
                return errback(new errors_1.InvalidStateError('closed'));
            this._handler.getSenderStats(producer.localId)
                .then(callback)
                .catch(errback);
        });
    }
    _handleConsumer(consumer) {
        consumer.on('@close', () => {
            this._consumers.delete(consumer.id);
            this._pendingPauseConsumers.delete(consumer.id);
            this._pendingResumeConsumers.delete(consumer.id);
            if (this._closed)
                return;
            this._awaitQueue.push(async () => this._handler.stopReceiving(consumer.localId), 'consumer @close event')
                .catch(() => { });
        });
        consumer.on('@pause', () => {
            // If Consumer is pending to be resumed, remove from pending resume list.
            if (this._pendingResumeConsumers.has(consumer.id)) {
                this._pendingResumeConsumers.delete(consumer.id);
            }
            // Store the Consumer into the pending list.
            this._pendingPauseConsumers.set(consumer.id, consumer);
            // There is no Consumer pause in progress, do it now.
            if (this._consumerPauseInProgress === false) {
                this._pausePendingConsumers();
            }
        });
        consumer.on('@resume', () => {
            // If Consumer is pending to be paused, remove from pending pause list.
            if (this._pendingPauseConsumers.has(consumer.id)) {
                this._pendingPauseConsumers.delete(consumer.id);
            }
            // Store the Consumer into the pending list.
            this._pendingResumeConsumers.set(consumer.id, consumer);
            // There is no Consumer resume in progress, do it now.
            if (this._consumerResumeInProgress === false) {
                this._resumePendingConsumers();
            }
        });
        consumer.on('@getstats', (callback, errback) => {
            if (this._closed)
                return errback(new errors_1.InvalidStateError('closed'));
            this._handler.getReceiverStats(consumer.localId)
                .then(callback)
                .catch(errback);
        });
    }
    _handleDataProducer(dataProducer) {
        dataProducer.on('@close', () => {
            this._dataProducers.delete(dataProducer.id);
        });
    }
    _handleDataConsumer(dataConsumer) {
        dataConsumer.on('@close', () => {
            this._dataConsumers.delete(dataConsumer.id);
        });
    }
}
exports.Transport = Transport;
