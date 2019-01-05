/**
 * This test runs in Node so no browser auto-detection is done. Instead, a
 * FakeHandler device is used.
 */

const { toBeType } = require('jest-tobetype');
const MediaStreamTrack = require('node-mediastreamtrack');
const pkg = require('../package.json');
const mediasoupClient = require('../');
const mediasoupInternals = require('../lib/internals.js');
const { version, Device } = mediasoupClient;
const {
	UnsupportedError,
	InvalidStateError,
	DuplicatedError
} = mediasoupInternals.errors;
const FakeHandler = require('./FakeHandler');
const fakeParameters = require('./fakeParameters');

expect.extend({ toBeType });

let device;
let sendTransport;
let recvTransport;
let audioProducer;
let videoProducer;
let audioConsumer;
let videoConsumer;

test('mediasoup-client exposes a version property', () =>
{
	expect(version).toBeType('string');
	expect(version).toBe(pkg.version);
}, 500);

test('create a Device in Node without custom Handler throws UnsupportedError', () =>
{
	expect(() => new Device())
		.toThrow(UnsupportedError);
}, 500);

test('create a Device in Node with a FakeHandler succeeds', () =>
{
	expect(device = new Device({ Handler: FakeHandler }))
		.toBeType('object');

	expect(device.handlerName).toBe('FakeHandler');
	expect(device.loaded).toBe(false);
}, 500);

test('device.rtpCapabilities getter throws InvalidStateError if not loaded', () =>
{
	expect(() => device.rtpCapabilities)
		.toThrow(InvalidStateError);
}, 500);

test('device.canProduce() throws InvalidStateError if not loaded', () =>
{
	expect(() => device.canProduce('audio'))
		.toThrow(InvalidStateError);
}, 500);

test('device.createSendTransport() throws InvalidStateError if not loaded', () =>
{
	const transportRemoteParameters =
		fakeParameters.generateTransportRemoteParameters();

	expect(() => device.createSendTransport({ transportRemoteParameters }))
		.toThrow(InvalidStateError);
}, 500);

test('device.load() without routerRtpCapabilities rejects with TypeError', async () =>
{
	await expect(device.load())
		.rejects
		.toThrow(TypeError);

	expect(device.loaded).toBe(false);
}, 500);

test('device.load() succeeds', async () =>
{
	// Assume we get the router RTP capabilities.
	const routerRtpCapabilities = fakeParameters.generateRouterRtpCapabilities();

	await expect(device.load({ routerRtpCapabilities }))
		.resolves
		.toBe(undefined);

	expect(device.loaded).toBe(true);
}, 500);

test('device.load() rejects with InvalidStateError if already loaded', async () =>
{
	await expect(device.load())
		.rejects
		.toThrow(InvalidStateError);

	expect(device.loaded).toBe(true);
}, 500);

test('device.rtpCapabilities getter succeeds', () =>
{
	expect(device.rtpCapabilities).toBeType('object');
}, 500);

test('device.canProduce() with "audio"/"video" kind returns true', () =>
{
	expect(device.canProduce('audio')).toBe(true);
	expect(device.canProduce('video')).toBe(true);
}, 500);

test('device.canProduce() with invalid kind throws TypeError', () =>
{
	expect(() => device.canProduce('chicken'))
		.toThrow(TypeError);
}, 500);

test('device.createSendTransport() for sending media succeeds', () =>
{
	// Assume we create a transport in the server and get its remote parameters.
	const transportRemoteParameters =
		fakeParameters.generateTransportRemoteParameters();

	expect(sendTransport = device.createSendTransport(
		{
			transportRemoteParameters,
			appData : { baz: 'BAZ' }
		}))
		.toBeType('object');

	expect(sendTransport.id).toBe(transportRemoteParameters.id);
	expect(sendTransport.closed).toBe(false);
	expect(sendTransport.direction).toBe('send');
	expect(sendTransport.handler).toBeType('object');
	expect(sendTransport.connectionState).toBe('new');
	expect(sendTransport.appData).toEqual({ baz: 'BAZ' }, 500);
}, 500);

test('device.createRecvTransport() for receiving media succeeds', () =>
{
	// Assume we create a transport in the server and get its remote parameters.
	const transportRemoteParameters =
		fakeParameters.generateTransportRemoteParameters();

	expect(recvTransport = device.createRecvTransport({ transportRemoteParameters }))
		.toBeType('object');

	expect(recvTransport.id).toBe(transportRemoteParameters.id);
	expect(recvTransport.closed).toBe(false);
	expect(recvTransport.direction).toBe('recv');
	expect(recvTransport.handler).toBeType('object');
	expect(recvTransport.connectionState).toBe('new');
	expect(recvTransport.appData).toEqual({});
}, 500);

test('device.createSendTransport() without transportRemoteParameters throws TypeError', () =>
{
	expect(() => device.createSendTransport())
		.toThrow(TypeError);
}, 500);

test('device.createRecvTransport() with a non object appData throws TypeError', () =>
{
	const transportRemoteParameters =
		fakeParameters.generateTransportRemoteParameters();

	expect(
		() => device.createRecvTransport(
			{
				transportRemoteParameters,
				appData : 1234
			}))
		.toThrow(TypeError);
}, 500);

test('transport.produce() succeeds', async () =>
{
	const audioTrack = new MediaStreamTrack({ kind: 'audio' });
	const videoTrack = new MediaStreamTrack({ kind: 'video' });
	let audioProducerRemoteParameters;
	let videoProducerRemoteParameters;
	let connectEventNumTimesCalled = 0;
	let produceEventNumTimesCalled = 0;

	// eslint-disable-next-line no-unused-vars
	sendTransport.on('connect', (transportLocalParameters, callback, errback) =>
	{
		connectEventNumTimesCalled++;

		expect(transportLocalParameters).toBeType('object');
		expect(transportLocalParameters.id).toBe(sendTransport.id);
		expect(transportLocalParameters.dtlsParameters).toBeType('object');

		// Emulate communication with the server and success response (no response
		// data needed).
		setTimeout(callback);
	});

	// eslint-disable-next-line no-unused-vars
	sendTransport.on('produce', (producerLocalParameters, callback, errback) =>
	{
		produceEventNumTimesCalled++;

		expect(producerLocalParameters).toBeType('object');
		expect(producerLocalParameters.kind).toBeType('string');
		expect(producerLocalParameters.rtpParameters).toBeType('object');

		let producerRemoteParameters;

		switch (producerLocalParameters.kind)
		{
			case 'audio':
			{
				expect(producerLocalParameters.appData).toEqual({ foo: 'FOO' });

				audioProducerRemoteParameters =
					fakeParameters.generateProducerRemoteParameters();
				producerRemoteParameters = audioProducerRemoteParameters;

				break;
			}

			case 'video':
			{
				expect(producerLocalParameters.appData).toEqual({});

				videoProducerRemoteParameters =
					fakeParameters.generateProducerRemoteParameters();
				producerRemoteParameters = videoProducerRemoteParameters;
				break;
			}

			default:
			{
				throw new Error('unknown producerLocalParameters.kind');
			}
		}

		// Emulate communication with the server and success response with Producer
		// remote parameters.
		setTimeout(() => callback(producerRemoteParameters));
	});

	let codecs;
	let headerExtensions;
	let encodings;
	let rtcp;

	// Pause the audio track before creating its Producer.
	audioTrack.enabled = false;

	audioProducer = await sendTransport.produce(
		{ track: audioTrack, appData: { foo: 'FOO' } });

	expect(connectEventNumTimesCalled).toBe(1);
	expect(produceEventNumTimesCalled).toBe(1);
	expect(audioProducer).toBeType('object');
	expect(audioProducer.id).toBe(audioProducerRemoteParameters.id);
	expect(audioProducer.closed).toBe(false);
	expect(audioProducer.kind).toBe('audio');
	expect(audioProducer.track).toBe(audioTrack);
	expect(audioProducer.rtpParameters).toBeType('object');
	expect(audioProducer.rtpParameters.mid).toBeType('string');
	expect(audioProducer.rtpParameters.codecs.length).toBe(1);

	codecs = audioProducer.rtpParameters.codecs;
	expect(codecs[0]).toEqual(
		{
			name         : 'opus',
			mimeType     : 'audio/opus',
			clockRate    : 48000,
			payloadType  : 111,
			channels     : 2,
			rtcpFeedback : [],
			parameters   :
			{
				minptime     : 10,
				useinbandfec : 1
			}
		});

	headerExtensions = audioProducer.rtpParameters.headerExtensions;
	expect(headerExtensions).toEqual(
		[
			{
				uri : 'urn:ietf:params:rtp-hdrext:ssrc-audio-level',
				id  : 1
			},
			{
				uri : 'urn:ietf:params:rtp-hdrext:sdes:mid',
				id  : 9
			}
		]);

	encodings = audioProducer.rtpParameters.encodings;
	expect(encodings).toBeType('array');
	expect(encodings.length).toBe(1);
	expect(encodings[0]).toBeType('object');
	expect(Object.keys(encodings[0])).toEqual([ 'ssrc' ]);
	expect(encodings[0].ssrc).toBeType('number');

	rtcp = audioProducer.rtpParameters.rtcp;
	expect(rtcp).toBeType('object');
	expect(rtcp.cname).toBeType('string');

	expect(audioProducer.paused).toBe(true);
	expect(audioProducer.maxSpatialLayer).toBe(null);
	expect(audioProducer.appData).toEqual({ foo: 'FOO' });

	// Reset the audio paused state.
	audioProducer.resume();

	videoProducer = await sendTransport.produce(
		{ track: videoTrack, simulcast: true, maxSpatialLayer: 'medium' });

	expect(connectEventNumTimesCalled).toBe(1);
	expect(produceEventNumTimesCalled).toBe(2);
	expect(videoProducer).toBeType('object');
	expect(videoProducer.id).toBe(videoProducerRemoteParameters.id);
	expect(videoProducer.closed).toBe(false);
	expect(videoProducer.kind).toBe('video');
	expect(videoProducer.track).toBe(videoTrack);
	expect(videoProducer.rtpParameters).toBeType('object');
	expect(videoProducer.rtpParameters.mid).toBeType('string');
	expect(videoProducer.rtpParameters.codecs.length).toBe(2);

	codecs = videoProducer.rtpParameters.codecs;
	expect(codecs[0]).toEqual(
		{
			name         : 'VP8',
			mimeType     : 'video/VP8',
			clockRate    : 90000,
			payloadType  : 96,
			rtcpFeedback :
			[
				{ type: 'goog-remb' },
				{ type: 'ccm', parameter: 'fir' },
				{ type: 'nack' },
				{ type: 'nack', parameter: 'pli' }
			],
			parameters :
			{
				baz : '1234abcd'
			}
		});
	expect(codecs[1]).toEqual(
		{
			name         : 'rtx',
			mimeType     : 'video/rtx',
			clockRate    : 90000,
			payloadType  : 97,
			rtcpFeedback : [],
			parameters   :
			{
				apt : 96
			}
		});

	headerExtensions = videoProducer.rtpParameters.headerExtensions;
	expect(headerExtensions).toEqual(
		[
			{
				uri : 'urn:ietf:params:rtp-hdrext:toffset',
				id  : 2
			},
			{
				uri : 'http://www.webrtc.org/experiments/rtp-hdrext/abs-send-time',
				id  : 3
			},
			{
				uri : 'urn:3gpp:video-orientation',
				id  : 4
			},
			{
				uri : 'urn:ietf:params:rtp-hdrext:sdes:mid',
				id  : 9
			}
		]);

	encodings = videoProducer.rtpParameters.encodings;
	expect(encodings).toBeType('array');
	expect(encodings.length).toBe(1);
	expect(encodings[0]).toBeType('object');
	expect(Object.keys(encodings[0])).toEqual([ 'ssrc', 'rtx' ]);
	expect(encodings[0].ssrc).toBeType('number');
	expect(encodings[0].rtx).toBeType('object');
	expect(Object.keys(encodings[0].rtx)).toEqual([ 'ssrc' ]);
	expect(encodings[0].rtx.ssrc).toBeType('number');

	rtcp = videoProducer.rtpParameters.rtcp;
	expect(rtcp).toBeType('object');
	expect(rtcp.cname).toBeType('string');

	expect(videoProducer.paused).toBe(false);
	expect(videoProducer.maxSpatialLayer).toBe('medium');
	expect(videoProducer.appData).toEqual({});

	sendTransport.removeAllListeners();
}, 500);

test('transport.produce() without track rejects with TypeError', async () =>
{
	await expect(sendTransport.produce())
		.rejects
		.toThrow(TypeError);
}, 500);

test('transport.produce() in a receiving Transport rejects with UnsupportedError', async () =>
{
	const track = new MediaStreamTrack({ kind: 'audio' });

	await expect(recvTransport.produce({ track }))
		.rejects
		.toThrow(UnsupportedError);
}, 500);

test('transport.produce() with an already handled track rejects with DuplicatedError', async () =>
{
	const { track } = audioProducer;

	await expect(sendTransport.produce({ track }))
		.rejects
		.toThrow(DuplicatedError);
}, 500);

test('transport.produce() with an ended track rejects with InvalidStateError', async () =>
{
	const track = new MediaStreamTrack({ kind: 'audio' });

	track.stop();

	await expect(sendTransport.produce({ track }))
		.rejects
		.toThrow(InvalidStateError);
}, 500);

test('transport.produce() with invalid maxSpatialLayer rejects with TypeError', async () =>
{
	const track = new MediaStreamTrack({ kind: 'video' });

	await expect(sendTransport.produce({ track, maxSpatialLayer: 'chicken' }))
		.rejects
		.toThrow(TypeError);
}, 500);

test('transport.produce() with audio track and maxSpatialLayer rejects with TypeError', async () =>
{
	const track = new MediaStreamTrack({ kind: 'audio' });

	await expect(sendTransport.produce({ track, maxSpatialLayer: 'medium' }))
		.rejects
		.toThrow(TypeError);
}, 500);

test('transport.produce() with a non object appData rejects with TypeError', async () =>
{
	const track = new MediaStreamTrack({ kind: 'audio' });

	await expect(sendTransport.produce({ track, appData: true }))
		.rejects
		.toThrow(TypeError);
}, 500);

test('transport.consume() succeeds', async () =>
{
	const audioConsumerRemoteParameters =
		fakeParameters.generateConsumerRemoteParameters({ codecMimeType: 'audio/opus' });
	const videoConsumerRemoteParameters =
		fakeParameters.generateConsumerRemoteParameters({ codecMimeType: 'video/VP8' });
	let connectEventNumTimesCalled = 0;
	let startConsumerEventNumTimesCalled = 0;

	// eslint-disable-next-line no-unused-vars
	recvTransport.on('connect', (transportLocalParameters, callback, errback) =>
	{
		connectEventNumTimesCalled++;

		expect(transportLocalParameters).toBeType('object');
		expect(transportLocalParameters.id).toBe(recvTransport.id);
		expect(transportLocalParameters.dtlsParameters).toBeType('object');

		// Emulate communication with the server and success response (no response
		// data needed).
		setTimeout(callback);
	});

	// eslint-disable-next-line no-unused-vars
	recvTransport.on('startConsumer', (consumerId) =>
	{
		startConsumerEventNumTimesCalled++;
	});

	audioConsumer = await recvTransport.consume(
		{
			consumerRemoteParameters : audioConsumerRemoteParameters,
			appData                  : { bar: 'BAR' }
		});

	expect(connectEventNumTimesCalled).toBe(1);
	expect(startConsumerEventNumTimesCalled).toBe(1);
	expect(audioConsumer).toBeType('object');
	expect(audioConsumer.id).toBe(audioConsumerRemoteParameters.id);
	expect(audioConsumer.producerId).toBe(audioConsumerRemoteParameters.producerId);
	expect(audioConsumer.closed).toBe(false);
	expect(audioConsumer.kind).toBe('audio');
	expect(audioConsumer.track).toBeType('object');
	expect(audioConsumer.rtpParameters).toBeType('object');
	expect(audioConsumer.paused).toBe(false);
	expect(audioConsumer.appData).toEqual({ bar: 'BAR' });

	videoConsumer = await recvTransport.consume(
		{
			consumerRemoteParameters : videoConsumerRemoteParameters
		});

	expect(connectEventNumTimesCalled).toBe(1);
	expect(startConsumerEventNumTimesCalled).toBe(2);
	expect(videoConsumer).toBeType('object');
	expect(videoConsumer.id).toBe(videoConsumerRemoteParameters.id);
	expect(videoConsumer.producerId).toBe(videoConsumerRemoteParameters.producerId);
	expect(videoConsumer.closed).toBe(false);
	expect(videoConsumer.kind).toBe('video');
	expect(videoConsumer.track).toBeType('object');
	expect(videoConsumer.rtpParameters).toBeType('object');
	expect(videoConsumer.paused).toBe(false);
	expect(videoConsumer.appData).toEqual({});

	recvTransport.removeAllListeners();
}, 500);

test('transport.consume() without consumerRemoteParameters rejects with TypeError', async () =>
{
	await expect(recvTransport.consume())
		.rejects
		.toThrow(TypeError);
}, 500);

test('transport.consume() in a sending Transport rejects with UnsupportedError', async () =>
{
	const consumerRemoteParameters =
		fakeParameters.generateConsumerRemoteParameters({ codecMimeType: 'audio/opus' });

	await expect(sendTransport.consume({ consumerRemoteParameters }))
		.rejects
		.toThrow(UnsupportedError);
}, 500);

test('transport.consume() with unsupported consumerRtpParameters rejects with UnsupportedError', async () =>
{
	const consumerRemoteParameters =
		fakeParameters.generateConsumerRemoteParameters({ codecMimeType: 'audio/ISAC' });

	await expect(recvTransport.consume({ consumerRemoteParameters }))
		.rejects
		.toThrow(UnsupportedError);
}, 500);

test('transport.consume() with duplicated consumerRtpParameters.id rejects with DuplicatedError', async () =>
{
	const { id } = audioConsumer;
	const consumerRemoteParameters =
		fakeParameters.generateConsumerRemoteParameters({ id, codecMimeType: 'audio/opus' });

	await expect(recvTransport.consume({ consumerRemoteParameters }))
		.rejects
		.toThrow(DuplicatedError);
}, 500);

test('transport.consume() with a non object appData rejects with TypeError', async () =>
{
	const consumerRemoteParameters =
		fakeParameters.generateConsumerRemoteParameters({ codecMimeType: 'audio/opus' });

	await expect(recvTransport.consume({ consumerRemoteParameters, appData: true }))
		.rejects
		.toThrow(TypeError);
}, 500);

test('transport.getStats() succeeds', async () =>
{
	await expect(sendTransport.getStats())
		.resolves
		.toBeType('map');
}, 500);

test('transport.restartIce() succeeds', async () =>
{
	await expect(sendTransport.restartIce({ remoteIceParameters: {} }))
		.resolves
		.toBe(undefined);
}, 500);

test('transport.restartIce() without remoteIceParameters rejects with TypeError', async () =>
{
	await expect(sendTransport.restartIce())
		.rejects
		.toThrow(TypeError);
}, 500);

test('transport.updateIceServers() succeeds', async () =>
{
	await expect(sendTransport.updateIceServers({ iceServers: [] }))
		.resolves
		.toBe(undefined);
}, 500);

test('transport.updateIceServers() without iceServers rejects with TypeError', async () =>
{
	await expect(sendTransport.updateIceServers())
		.rejects
		.toThrow(TypeError);
}, 500);

test('transport.appData cannot be overridden', () =>
{
	expect(() => (sendTransport.appData = { lalala: 'LALALA' }))
		.toThrow(Error);

	expect(sendTransport.appData).toEqual({ baz: 'BAZ' });
}, 500);

test('transport.appData can be modified', () =>
{
	sendTransport.appData.lololo = 'LOLOLO';
	recvTransport.appData.nanana = 'NANANA';

	expect(sendTransport.appData).toEqual({ baz: 'BAZ', lololo: 'LOLOLO' });
	expect(recvTransport.appData).toEqual({ nanana: 'NANANA' });
}, 500);

test('connection state change fires "connectionstatechange" in live Transport', () =>
{
	let connectionStateChangeEventNumTimesCalled = 0;

	sendTransport.on('connectionstatechange', (connectionState) =>
	{
		connectionStateChangeEventNumTimesCalled++;

		expect(connectionState).toBe('completed');
	});

	sendTransport.handler.setConnectionState('completed');

	expect(connectionStateChangeEventNumTimesCalled).toBe(1);
	expect(sendTransport.connectionState).toBe('completed');

	sendTransport.removeAllListeners();
}, 500);

test('producer.pause() succeeds', () =>
{
	videoProducer.pause();
	expect(videoProducer.paused).toBe(true);
}, 500);

test('producer.resume() succeeds', () =>
{
	videoProducer.resume();
	expect(videoProducer.paused).toBe(false);
}, 500);

test('producer.replaceTrack() succeeds', async () =>
{
	// Have the audio Producer paused.
	audioProducer.pause();

	const audioProducerPreviousTrack = audioProducer.track;
	const newAudioTrack = new MediaStreamTrack({ kind: 'audio' });

	await expect(audioProducer.replaceTrack({ track: newAudioTrack }))
		.resolves
		.toBe(undefined);

	expect(audioProducerPreviousTrack.readyState).toBe('ended');
	expect(audioProducer.track).not.toBe(audioProducerPreviousTrack);
	expect(audioProducer.track).toBe(newAudioTrack);
	// Producer was already paused.
	expect(audioProducer.paused).toBe(true);

	// Reset the audio paused state.
	audioProducer.resume();

	const videoProducerPreviousTrack = videoProducer.track;
	const newVideoTrack = new MediaStreamTrack({ kind: 'video' });

	await expect(videoProducer.replaceTrack({ track: newVideoTrack }))
		.resolves
		.toBe(undefined);

	expect(videoProducer.track).not.toBe(videoProducerPreviousTrack);
	expect(videoProducer.track).toBe(newVideoTrack);
	expect(videoProducer.paused).toBe(false);
}, 500);

test('producer.replaceTrack() without track rejects with TypeError', async () =>
{
	await expect(videoProducer.replaceTrack())
		.rejects
		.toThrow(TypeError);

	expect(videoProducer.track.readyState).toBe('live');
}, 500);

test('producer.replaceTrack() with an ended track rejects with InvalidStateError', async () =>
{
	const track = new MediaStreamTrack({ kind: 'audio' });

	track.stop();

	await expect(videoProducer.replaceTrack({ track }))
		.rejects
		.toThrow(InvalidStateError);

	expect(track.readyState).toBe('ended');
	expect(videoProducer.track.readyState).toBe('live');
}, 500);

test('producer.replaceTrack() with an already handled track rejects with DuplicatedError', async () =>
{
	const { track } = videoProducer;

	await expect(videoProducer.replaceTrack({ track }))
		.rejects
		.toThrow(DuplicatedError);

	expect(videoProducer.track).toBe(track);
	expect(videoProducer.track.readyState).toBe('live');
}, 500);

test('producer.setMaxSpatialLayer() succeeds', async () =>
{
	await expect(videoProducer.setMaxSpatialLayer('low'))
		.resolves
		.toBe(undefined);

	expect(videoProducer.maxSpatialLayer).toBe('low');
}, 500);

test('producer.setMaxSpatialLayer() in an audio Producer rejects with UnsupportedError', async () =>
{
	await expect(audioProducer.setMaxSpatialLayer('low'))
		.rejects
		.toThrow(UnsupportedError);

	expect(audioProducer.maxSpatialLayer).toBe(null);
}, 500);

test('producer.setMaxSpatialLayer() with invalid spatialLayer rejects with TypeError', async () =>
{
	await expect(videoProducer.setMaxSpatialLayer('chicken'))
		.rejects
		.toThrow(TypeError);
}, 500);

test('producer.setMaxSpatialLayer() without spatialLayer rejects with TypeError', async () =>
{
	await expect(videoProducer.setMaxSpatialLayer())
		.rejects
		.toThrow(TypeError);
}, 500);

test('producer.getStats() succeeds', async () =>
{
	await expect(videoProducer.getStats())
		.resolves
		.toBeType('map');
}, 500);

test('producer.appData cannot be overridden', () =>
{
	expect(() => (videoProducer.appData = { lalala: 'LALALA' }))
		.toThrow(Error);

	expect(videoProducer.appData).toEqual({});
}, 500);

test('consumer.resume() succeeds', () =>
{
	videoConsumer.resume();
	expect(videoConsumer.paused).toBe(false);
}, 500);

test('consumer.pause() succeeds', () =>
{
	videoConsumer.pause();
	expect(videoConsumer.paused).toBe(true);
}, 500);

test('consumer.getStats() succeeds', async () =>
{
	await expect(videoConsumer.getStats())
		.resolves
		.toBeType('map');
}, 500);

test('cnosumer.appData cannot be overridden', () =>
{
	expect(() => (audioConsumer.appData = { lalala: 'LALALA' }))
		.toThrow(Error);

	expect(audioConsumer.appData).toEqual({ bar: 'BAR' });
}, 500);

test('producer.close() succeed', () =>
{
	audioProducer.close();
	expect(audioProducer.closed).toBe(true);
	expect(audioProducer.track.readyState).toBe('ended');
}, 500);

test('producer.replaceTrack() rejects with InvalidStateError if closed', async () =>
{
	const track = new MediaStreamTrack({ kind: 'audio' });

	await expect(audioProducer.replaceTrack({ track }))
		.rejects
		.toThrow(InvalidStateError);

	expect(track.readyState).toBe('ended');
}, 500);

test('producer.getStats() rejects with InvalidStateError if closed', async () =>
{
	await expect(audioProducer.getStats())
		.rejects
		.toThrow(InvalidStateError);
}, 500);

test('consumer.close() succeed', () =>
{
	audioConsumer.close();
	expect(audioConsumer.closed).toBe(true);
	expect(audioConsumer.track.readyState).toBe('ended');
}, 500);

test('consumer.getStats() rejects with InvalidStateError if closed', async () =>
{
	await expect(audioConsumer.getStats())
		.rejects
		.toThrow(InvalidStateError);
}, 500);

test('remotetely stopped track fires "trackended" in live Producers/Consumers', () =>
{
	let audioProducerTrackendedEventCalled = false;
	let videoProducerTrackendedEventCalled = false;
	let audiosConsumerTrackendedEventCalled = false;
	let videoConsumerTrackendedEventCalled = false;

	audioProducer.on('trackended', () =>
	{
		audioProducerTrackendedEventCalled = true;
	});

	videoProducer.on('trackended', () =>
	{
		videoProducerTrackendedEventCalled = true;
	});

	audioConsumer.on('trackended', () =>
	{
		audiosConsumerTrackendedEventCalled = true;
	});

	videoConsumer.on('trackended', () =>
	{
		videoConsumerTrackendedEventCalled = true;
	});

	audioProducer.track.remoteStop();
	// Audio Producer was already closed.
	expect(audioProducerTrackendedEventCalled).toBe(false);

	videoProducer.track.remoteStop();
	expect(videoProducerTrackendedEventCalled).toBe(true);

	audioConsumer.track.remoteStop();
	// Audio Consumer was already closed.
	expect(audiosConsumerTrackendedEventCalled).toBe(false);

	videoConsumer.track.remoteStop();
	expect(videoConsumerTrackendedEventCalled).toBe(true);

	audioProducer.removeAllListeners();
	videoProducer.removeAllListeners();
	audioConsumer.removeAllListeners();
	videoConsumer.removeAllListeners();
}, 500);

test('transport.close() fires "transportclose" in live Producers/Consumers', () =>
{
	let audioProducerTransportcloseEventCalled = false;
	let videoProducerTransportcloseEventCalled = false;
	let audioConsumerTransportcloseEventCalled = false;
	let videoConsumerTransportcloseEventCalled = false;

	audioProducer.on('transportclose', () =>
	{
		audioProducerTransportcloseEventCalled = true;
	});

	videoProducer.on('transportclose', () =>
	{
		videoProducerTransportcloseEventCalled = true;
	});

	audioConsumer.on('transportclose', () =>
	{
		audioConsumerTransportcloseEventCalled = true;
	});

	videoConsumer.on('transportclose', () =>
	{
		videoConsumerTransportcloseEventCalled = true;
	});

	// Audio Producer was already closed.
	expect(audioProducer.closed).toBe(true);
	expect(videoProducer.closed).toBe(false);

	sendTransport.close();
	expect(sendTransport.closed).toBe(true);
	expect(videoProducer.closed).toBe(true);
	// Audio Producer was already closed.
	expect(audioProducerTransportcloseEventCalled).toBe(false);
	expect(videoProducerTransportcloseEventCalled).toBe(true);

	// Audio Consumer was already closed.
	expect(audioConsumer.closed).toBe(true);
	expect(videoConsumer.closed).toBe(false);

	recvTransport.close();
	expect(recvTransport.closed).toBe(true);
	expect(videoConsumer.closed).toBe(true);
	// Audio Consumer was already closed.
	expect(audioConsumerTransportcloseEventCalled).toBe(false);
	expect(videoConsumerTransportcloseEventCalled).toBe(true);

	audioProducer.removeAllListeners();
	videoProducer.removeAllListeners();
	audioConsumer.removeAllListeners();
	videoConsumer.removeAllListeners();
}, 500);

test('transport.produce() rejects with InvalidStateError if closed', async () =>
{
	const track = new MediaStreamTrack({ kind: 'audio' });

	await expect(sendTransport.produce({ track }))
		.rejects
		.toThrow(InvalidStateError);

	expect(track.readyState).toBe('ended');
}, 500);

test('transport.consume() rejects with InvalidStateError if closed', async () =>
{
	await expect(recvTransport.consume())
		.rejects
		.toThrow(InvalidStateError);
}, 500);

test('transport.getStats() rejects with InvalidStateError if closed', async () =>
{
	await expect(sendTransport.getStats())
		.rejects
		.toThrow(InvalidStateError);
}, 500);

test('transport.restartIce() rejects with InvalidStateError if closed', async () =>
{
	await expect(sendTransport.restartIce({ remoteIceParameters: {} }))
		.rejects
		.toThrow(InvalidStateError);
}, 500);

test('transport.updateIceServers() rejects with InvalidStateError if closed', async () =>
{
	await expect(sendTransport.updateIceServers({ iceServers: [] }))
		.rejects
		.toThrow(InvalidStateError);
}, 500);

test('connection state change does not fire "connectionstatechange" in closed Transport', () =>
{
	let connectionStateChangeEventNumTimesCalled = 0;

	// eslint-disable-next-line no-unused-vars
	sendTransport.on('connectionstatechange', (connectionState) =>
	{
		connectionStateChangeEventNumTimesCalled++;
	});

	sendTransport.handler.setConnectionState('disconnected');
	expect(connectionStateChangeEventNumTimesCalled).toBe(0);
	expect(sendTransport.connectionState).toBe('disconnected');

	sendTransport.removeAllListeners();
}, 500);
