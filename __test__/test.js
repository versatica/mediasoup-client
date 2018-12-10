/**
 * This test runs in Node so no browser auto-detection is done. Instead, a
 * FakeHandler device is used.
 */

const { toBeType } = require('jest-tobetype');
const MediaStreamTrack = require('node-mediastreamtrack');
const Device = require('../lib/Device');
const { UnsupportedError, InvalidStateError } = require('../lib/errors');
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

test('create a device in Node without custom Handler throws UnsupportedError', () =>
{
	expect(() => new Device({ Handler: null }))
		.toThrow(UnsupportedError);
});

test('create a device in Node with a FakeHandler succeeds', () =>
{
	expect(device = new Device({ Handler: FakeHandler }))
		.toBeType('object');
});

test('device.canSend() throws InvalidStateError if not loaded', () =>
{
	expect(() => device.canSend('audio'))
		.toThrow(InvalidStateError);
});

test('device.canReceive() throws InvalidStateError if not loaded', () =>
{
	expect(() => device.canReceive({}))
		.toThrow(InvalidStateError);
});

test('device.rtpCapabilities() throws InvalidStateError if not loaded', () =>
{
	expect(() => device.rtpCapabilities)
		.toThrow(InvalidStateError);
});

test('device.load() without roomRtpCapabilities rejects with TypeError', async () =>
{
	await expect(device.load())
		.rejects
		.toThrow(TypeError);
});

test('device.load() with proper roomRtpCapabilities succeeds', async () =>
{
	// Assume we get the room RTP capabilities.
	const roomRtpCapabilities = fakeParameters.generateRoomRtpCapabilities();

	await expect(device.load({ roomRtpCapabilities }))
		.resolves
		.toBe(undefined);
});

test('device.load() rejects with InvalidStateError if already loaded', async () =>
{
	await expect(device.load())
		.rejects
		.toThrow(InvalidStateError);
});

test('device.canSend() with "audio"/"video" kind returns true', () =>
{
	expect(device.canSend('audio')).toBe(true);
	expect(device.canSend('video')).toBe(true);
});

test('device.canSend() with invalid kind throws TypeError', () =>
{
	expect(() => device.canSend('chicken'))
		.toThrow(TypeError);
});

test('device.canReceive() with supported consumableRtpParameters returns true', () =>
{
	const audioConsumerRemoteParameters =
		fakeParameters.generateConsumerRemoteParameters({ codecMimeType: 'audio/opus' });
	const videoConsumerRemoteParameters =
		fakeParameters.generateConsumerRemoteParameters({ codecMimeType: 'video/VP8' });

	expect(device.canReceive(audioConsumerRemoteParameters.rtpParameters))
		.toBe(true);
	expect(device.canReceive(videoConsumerRemoteParameters.rtpParameters))
		.toBe(true);
});

test('device.canReceive() with unsupported consumableRtpParameters returns false', () =>
{
	const consumerRemoteParameters =
		fakeParameters.generateConsumerRemoteParameters({ codecMimeType: 'audio/ISAC' });

	expect(device.canReceive(consumerRemoteParameters.rtpParameters))
		.toBe(false);
});

test('device.rtpCapabilities() succeeds', () =>
{
	expect(device.rtpCapabilities)
		.toBeType('object');
});

test('device.createTransport() for sending media succeeds', () =>
{
	// Assume we create a transport in the server and get its remote parameters.
	const transportRemoteParameters =
		fakeParameters.generateTransportRemoteParameters();

	expect(sendTransport = device.createTransport(
		{
			transportRemoteParameters,
			direction : 'send',
			appData   : 'BAZ'
		}))
		.toBeType('object');

	expect(sendTransport.id).toBe(transportRemoteParameters.id);
	expect(sendTransport.closed).toBe(false);
	expect(sendTransport.direction).toBe('send');
	expect(sendTransport.handler).toBeType('object');
	expect(sendTransport.connectionState).toBe('new');
	expect(sendTransport.appData).toBe('BAZ');
});

test('device.createTransport() for receiving media succeeds', () =>
{
	// Assume we create a transport in the server and get its remote parameters.
	const transportRemoteParameters =
		fakeParameters.generateTransportRemoteParameters();

	expect(recvTransport = device.createTransport(
		{
			transportRemoteParameters,
			direction : 'recv'
		}))
		.toBeType('object');

	expect(recvTransport.id).toBe(transportRemoteParameters.id);
	expect(recvTransport.closed).toBe(false);
	expect(recvTransport.direction).toBe('recv');
	expect(recvTransport.handler).toBeType('object');
	expect(recvTransport.connectionState).toBe('new');
});

test('device.createTransport() with invalid direction throws TypeError', () =>
{
	expect(() => device.createTransport({ direction: 'chicken' }))
		.toThrow(TypeError);
});

test('transport.send() succeeds', async () =>
{
	const audioTrack = new MediaStreamTrack({ kind: 'audio' });
	const videoTrack = new MediaStreamTrack({ kind: 'video' });
	let audioProducerRemoteParameters;
	let videoProducerRemoteParameters;
	let connectEventNumTimesCalled = 0;
	let sendEventNumTimesCalled = 0;

	// eslint-disable-next-line no-unused-vars
	sendTransport.on('connect', (transportLocalParameters, callback, errback) =>
	{
		connectEventNumTimesCalled++;

		expect(transportLocalParameters).toBeType('object');
		expect(transportLocalParameters.dtlsParameters).toBeType('object');

		// Emulate communication with the server and success response (no response
		// data needed).
		setTimeout(callback);
	});

	// eslint-disable-next-line no-unused-vars
	sendTransport.on('send', (producerLocalParameters, callback, errback) =>
	{
		sendEventNumTimesCalled++;

		expect(producerLocalParameters).toBeType('object');
		expect(producerLocalParameters.kind).toBeType('string');
		expect(producerLocalParameters.rtpParameters).toBeType('object');

		let producerRemoteParameters;

		switch (producerLocalParameters.kind)
		{
			case 'audio':
				audioProducerRemoteParameters =
					fakeParameters.generateProducerRemoteParameters();
				producerRemoteParameters = audioProducerRemoteParameters;
				break;

			case 'video':
				videoProducerRemoteParameters =
					fakeParameters.generateProducerRemoteParameters();
				producerRemoteParameters = videoProducerRemoteParameters;
				break;

			default:
				throw new Error('unknown producerLocalParameters.kind');
		}

		// Emulate communication with the server and success response with producer
		// remote parameters.
		setTimeout(() => callback(producerRemoteParameters));
	});

	audioProducer = await sendTransport.send({ track: audioTrack, appData: 'FOO' });

	expect(connectEventNumTimesCalled).toBe(1);
	expect(sendEventNumTimesCalled).toBe(1);
	expect(audioProducer).toBeType('object');
	expect(audioProducer.closed).toBe(false);
	expect(audioProducer.kind).toBe('audio');
	expect(audioProducer.id).toBe(audioProducerRemoteParameters.id);
	expect(audioProducer.track).toBe(audioTrack);
	expect(audioProducer.rtpParameters).toBeType('object');
	expect(audioProducer.appData).toBe('FOO');

	videoProducer = await sendTransport.send({ track: videoTrack, simulcast: true });

	expect(connectEventNumTimesCalled).toBe(1);
	expect(sendEventNumTimesCalled).toBe(2);
	expect(videoProducer).toBeType('object');
	expect(videoProducer.closed).toBe(false);
	expect(videoProducer.kind).toBe('video');
	expect(videoProducer.id).toBe(videoProducerRemoteParameters.id);
	expect(videoProducer.track).toBe(videoTrack);
	expect(videoProducer.rtpParameters).toBeType('object');
	expect(videoProducer.appData).toBe(undefined);

	expect(videoProducer.paused).toBe(false);
	videoProducer.pause();
	expect(videoProducer.paused).toBe(true);
	videoProducer.resume();
	expect(videoProducer.paused).toBe(false);

	const producerPreviousVideoTrack = videoProducer.track;
	const newVideoTrack = new MediaStreamTrack({ kind: 'video' });

	videoProducer.pause();

	await videoProducer.replaceTrack({ track: newVideoTrack });

	expect(videoProducer.track).not.toBe(producerPreviousVideoTrack);
	expect(videoProducer.track).toBe(newVideoTrack);
	expect(videoProducer.paused).toBe(true);

	sendTransport.removeAllListeners();
});

test('transport.send() without track rejects with TypeError', async () =>
{
	await expect(sendTransport.send())
		.rejects
		.toThrow(TypeError);
});

test('transport.send() in a receiving transport rejects with UnsupportedError', async () =>
{
	const track = new MediaStreamTrack({ kind: 'audio' });

	await expect(recvTransport.send({ track }))
		.rejects
		.toThrow(UnsupportedError);
});

test('transport.receive() succeeds', async () =>
{
	const audioConsumerRemoteParameters =
		fakeParameters.generateConsumerRemoteParameters({ codecMimeType: 'audio/opus' });
	const videoConsumerRemoteParameters =
		fakeParameters.generateConsumerRemoteParameters({ codecMimeType: 'video/VP8' });
	let connectEventNumTimesCalled = 0;
	let receiveEventNumTimesCalled = 0;

	// eslint-disable-next-line no-unused-vars
	recvTransport.on('connect', (transportLocalParameters, callback, errback) =>
	{
		connectEventNumTimesCalled++;

		expect(transportLocalParameters).toBeType('object');
		expect(transportLocalParameters.dtlsParameters).toBeType('object');

		// Emulate communication with the server and success response (no response
		// data needed).
		setTimeout(callback);
	});

	// eslint-disable-next-line no-unused-vars
	recvTransport.on('receive', (consumerLocalParameters, callback, errback) =>
	{
		receiveEventNumTimesCalled++;

		expect(consumerLocalParameters).toBeType('object');
		expect(consumerLocalParameters.producerId).toBeType('string');
		expect(consumerLocalParameters.rtpCapabilities).toBeType('object');

		let consumerRemoteParameters;

		switch (consumerLocalParameters.producerId)
		{
			case audioConsumerRemoteParameters.producerId:
				consumerRemoteParameters = audioConsumerRemoteParameters;
				expect(consumerLocalParameters.preferredProfile).toBe(undefined);
				break;

			case videoConsumerRemoteParameters.producerId:
				consumerRemoteParameters = videoConsumerRemoteParameters;
				expect(consumerLocalParameters.preferredProfile).toBe('high');
				break;

			default:
				throw new Error('unknown consumerLocalParameters.producerId');
		}

		// Emulate communication with the server and success response with consumer
		// remote parameters.
		setTimeout(() => callback(consumerRemoteParameters));
	});

	// Here we assume that the server created two producers and sent us notifications
	// about them.
	audioConsumer = await recvTransport.receive(
		{
			producerId : audioConsumerRemoteParameters.producerId,
			appData    : 'BAR'
		});

	expect(connectEventNumTimesCalled).toBe(1);
	expect(receiveEventNumTimesCalled).toBe(1);
	expect(audioConsumer).toBeType('object');
	expect(audioConsumer.closed).toBe(false);
	expect(audioConsumer.kind).toBe('audio');
	expect(audioConsumer.id).toBe(audioConsumerRemoteParameters.id);
	expect(audioConsumer.rtpParameters).toBeType('object');
	expect(audioConsumer.preferredProfile).toBe('default');
	expect(audioConsumer.appData).toBe('BAR');

	videoConsumer = await recvTransport.receive(
		{
			producerId       : videoConsumerRemoteParameters.producerId,
			preferredProfile : 'high'
		});

	expect(connectEventNumTimesCalled).toBe(1);
	expect(receiveEventNumTimesCalled).toBe(2);
	expect(videoConsumer).toBeType('object');
	expect(videoConsumer.closed).toBe(false);
	expect(videoConsumer.kind).toBe('video');
	expect(videoConsumer.id).toBe(videoConsumerRemoteParameters.id);
	expect(videoConsumer.rtpParameters).toBeType('object');
	expect(videoConsumer.preferredProfile).toBe('high');
	expect(videoConsumer.appData).toBe(undefined);

	expect(videoConsumer.paused).toBe(false);
	videoConsumer.pause();
	expect(videoConsumer.paused).toBe(true);
	videoConsumer.resume();
	expect(videoConsumer.paused).toBe(false);

	videoConsumer.preferredProfile = 'medium';
	// Must ignore invalid profile.
	videoConsumer.preferredProfile = 'chicken';
	expect(videoConsumer.preferredProfile).toBe('medium');

	expect(videoConsumer.effectiveProfile).toBe(null);
	videoConsumer.effectiveProfile = 'medium';
	// Must ignore invalid profile.
	videoConsumer.effectiveProfile = 'chicken';
	expect(videoConsumer.effectiveProfile).toBe('medium');

	recvTransport.removeAllListeners();
});

test('transport.receive() without producerId rejects with TypeError', async () =>
{
	await expect(recvTransport.receive())
		.rejects
		.toThrow(TypeError);
});

test('transport.receive() in a sending transport rejects with UnsupportedError', async () =>
{
	await expect(sendTransport.receive({ producerId: '1234' }))
		.rejects
		.toThrow(UnsupportedError);
});

test('transport.receive() with unsupported consumerRtpParameters rejects with UnsupportedError', async () =>
{
	const consumerRemoteParameters =
		fakeParameters.generateConsumerRemoteParameters({ codecMimeType: 'audio/ISAC' });
	const producerId = consumerRemoteParameters.producerId;

	// eslint-disable-next-line no-unused-vars
	recvTransport.on('receive', (consumerLocalParameters, callback, errback) =>
	{
		// Emulate communication with the server and success response with consumer
		// remote parameters.
		setTimeout(() => callback(consumerRemoteParameters));
	});

	await expect(recvTransport.receive({ producerId }))
		.rejects
		.toThrow(UnsupportedError);

	recvTransport.removeAllListeners();
});

test('transport.getStats() succeeds', async () =>
{
	await expect(sendTransport.getStats())
		.resolves
		.toBeType('map');
});

test('producer.getStats() succeeds', async () =>
{
	await expect(videoProducer.getStats())
		.resolves
		.toBeType('map');
});

test('consumer.getStats() succeeds', async () =>
{
	await expect(videoConsumer.getStats())
		.resolves
		.toBeType('map');
});

test('producer.close() succeed', async () =>
{
	audioProducer.close();
	expect(audioProducer.closed).toBe(true);
	expect(audioProducer.track.readyState).toBe('ended');

	const track = new MediaStreamTrack({ kind: 'audio' });

	await expect(audioProducer.replaceTrack({ track }))
		.rejects
		.toThrow(InvalidStateError);

	expect(track.readyState).toBe('ended');
});

test('consumer.close() succeed', () =>
{
	audioConsumer.close();
	expect(audioConsumer.closed).toBe(true);
	expect(audioConsumer.track.readyState).toBe('ended');
});

test('producer.getStats() rejects with InvalidStateError if closed', async () =>
{
	await expect(audioProducer.getStats())
		.rejects
		.toThrow(InvalidStateError);
});

test('consumer.getStats() rejects with InvalidStateError if closed', async () =>
{
	await expect(audioConsumer.getStats())
		.rejects
		.toThrow(InvalidStateError);
});

test('remotetely stopped track fires "trackended" in live producers/consumers', () =>
{
	let audioProducerTrackendedEventCalled = false;
	let videoProducerTrackendedEventCalled = false;
	let audiosConsumerTrackendedEventCalled = false;
	let videoConsumerTrackendedEventCalled = false;

	audioProducer.on('trackended', () => (
		audioProducerTrackendedEventCalled = true
	));

	videoProducer.on('trackended', () => (
		videoProducerTrackendedEventCalled = true
	));

	audioConsumer.on('trackended', () => (
		audiosConsumerTrackendedEventCalled = true
	));

	videoConsumer.on('trackended', () => (
		videoConsumerTrackendedEventCalled = true
	));

	audioProducer.track.remoteStop();
	// Audio producer was already closed.
	expect(audioProducerTrackendedEventCalled).toBe(false);

	videoProducer.track.remoteStop();
	expect(videoProducerTrackendedEventCalled).toBe(true);

	audioConsumer.track.remoteStop();
	// Audio consumer was already closed.
	expect(audiosConsumerTrackendedEventCalled).toBe(false);

	videoConsumer.track.remoteStop();
	expect(videoConsumerTrackendedEventCalled).toBe(true);

	audioProducer.removeAllListeners();
	videoProducer.removeAllListeners();
	audioConsumer.removeAllListeners();
	videoConsumer.removeAllListeners();
});

test('transport.close() fires "transportclose" in live producers/consumers', () =>
{
	let audioProducerTransportcloseEventCalled = false;
	let videoProducerTransportcloseEventCalled = false;
	let audioConsumerTransportcloseEventCalled = false;
	let videoConsumerTransportcloseEventCalled = false;

	audioProducer.on('transportclose', () => (
		audioProducerTransportcloseEventCalled = true
	));

	videoProducer.on('transportclose', () => (
		videoProducerTransportcloseEventCalled = true
	));

	audioConsumer.on('transportclose', () => (
		audioConsumerTransportcloseEventCalled = true
	));

	videoConsumer.on('transportclose', () => (
		videoConsumerTransportcloseEventCalled = true
	));

	// Audio producer was already closed.
	expect(audioProducer.closed).toBe(true);
	expect(videoProducer.closed).toBe(false);
	// Close send transport.
	sendTransport.close();
	expect(videoProducer.closed).toBe(true);
	// Audio producer was already closed.
	expect(audioProducerTransportcloseEventCalled).toBe(false);
	expect(videoProducerTransportcloseEventCalled).toBe(true);

	// Audio consumer was already closed.
	expect(audioConsumer.closed).toBe(true);
	expect(videoConsumer.closed).toBe(false);
	// Close recv transport.
	recvTransport.close();
	expect(videoConsumer.closed).toBe(true);
	// Audio consumer was already closed.
	expect(audioConsumerTransportcloseEventCalled).toBe(false);
	expect(videoConsumerTransportcloseEventCalled).toBe(true);
});

test('transport.send() rejects with InvalidStateError if closed', async () =>
{
	const track = new MediaStreamTrack({ kind: 'audio' });

	await expect(sendTransport.send({ track }))
		.rejects
		.toThrow(InvalidStateError);

	expect(track.readyState).toBe('ended');
});

test('transport.receive() rejects with InvalidStateError if closed', async () =>
{
	await expect(recvTransport.receive())
		.rejects
		.toThrow(InvalidStateError);
});

test('transport.getStats() rejects with InvalidStateError if closed', async () =>
{
	await expect(sendTransport.getStats())
		.rejects
		.toThrow(InvalidStateError);
});
