/**
 * This test runs in Node so no browser auto-detection is done. Instead, a
 * FakeHandler device is used.
 */

const MediaStreamTrack = require('node-mediastreamtrack');
const Device = require('../lib/Device');
const { UnsupportedError, InvalidStateError } = require('../lib/errors');
const FakeHandler = require('./FakeHandler');
const fakeParameters = require('./fakeParameters');

// Assume we get the room RTP capabilities.
const roomRtpCapabilities = fakeParameters.generateRoomRtpCapabilities();
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
		.toBeDefined();
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

test('device.load() without roomRtpCapabilities rejects with TypeError', () =>
{
	return expect(device.load())
		.rejects
		.toThrow(TypeError);
});

test('device.load() succeeds', () =>
{
	return expect(device.load({ roomRtpCapabilities }))
		.resolves
		.toBe(undefined);
});

test('device.load() rejects with InvalidStateError if already loaded', () =>
{
	return expect(device.load({ roomRtpCapabilities }))
		.rejects
		.toThrow(InvalidStateError);
});

test('device.canSend() succeeds with "audio"/"video" kind', () =>
{
	expect(device.canSend('audio')).toBe(true);
	expect(device.canSend('video')).toBe(true);
});

test('device.canSend() throws TypeError with invalid kind', () =>
{
	expect(() => device.canSend('chicken'))
		.toThrow(TypeError);
});

test('device.canReceive() succeeds with supported consumableRtpParameters', () =>
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

test('device.canReceive() fails with unsupported consumableRtpParameters', () =>
{
	const consumerRemoteParameters =
		fakeParameters.generateConsumerRemoteParameters({ codecMimeType: 'audio/ISAC' });

	expect(device.canReceive(consumerRemoteParameters.rtpParameters))
		.toBe(false);
});

test('device.createTransport() throws TypeError with invalid direction', () =>
{
	expect(() => device.createTransport({ direction: 'chicken' }))
		.toThrow(TypeError);
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
		.toBeDefined();

	expect(sendTransport.id).toBe(transportRemoteParameters.id);
	expect(sendTransport.closed).toBe(false);
	expect(sendTransport.direction).toBe('send');
	expect(sendTransport.connectionState).toBe('new');
	expect(sendTransport.appData).toBe('BAZ');
});

test('transport.send() succeeds', () =>
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

		expect(transportLocalParameters).toBeDefined();
		expect(transportLocalParameters.dtlsParameters).toBeDefined();

		// Emulate communication with the server and success response (no response
		// data needed).
		setTimeout(callback);
	});

	// eslint-disable-next-line no-unused-vars
	sendTransport.on('send', (producerLocalParameters, callback, errback) =>
	{
		sendEventNumTimesCalled++;

		expect(producerLocalParameters).toBeDefined();
		expect(producerLocalParameters.kind).toBeDefined();
		expect(producerLocalParameters.rtpParameters).toBeDefined();

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

	return Promise.resolve()
		.then(() => sendTransport.send({ track: audioTrack, appData: 'FOO' }))
		.then((producer) =>
		{
			audioProducer = producer;

			expect(connectEventNumTimesCalled).toBe(1);
			expect(sendEventNumTimesCalled).toBe(1);
			expect(audioProducer).toBeDefined();
			expect(audioProducer.closed).toBe(false);
			expect(audioProducer.kind).toBe('audio');
			expect(audioProducer.id).toBe(audioProducerRemoteParameters.id);
			expect(audioProducer.track).toBe(audioTrack);
			expect(audioProducer.appData).toBe('FOO');

			audioProducer.close();
			expect(audioProducer.closed).toBe(true);
		})
		.then(() => sendTransport.send({ track: videoTrack }))
		.then((producer) =>
		{
			videoProducer = producer;

			expect(connectEventNumTimesCalled).toBe(1);
			expect(sendEventNumTimesCalled).toBe(2);
			expect(videoProducer).toBeDefined();
			expect(videoProducer.closed).toBe(false);
			expect(videoProducer.kind).toBe('video');
			expect(videoProducer.id).toBe(videoProducerRemoteParameters.id);
			expect(videoProducer.track).toBe(videoTrack);
			expect(videoProducer.appData).toBe(undefined);

			expect(videoProducer.paused).toBe(false);
			videoProducer.pause();
			expect(videoProducer.paused).toBe(true);
			videoProducer.resume();
			expect(videoProducer.paused).toBe(false);
		})
		.then(() =>
		{
			const producerPreviousVideoTrack = videoProducer.track;
			const newVideoTrack = new MediaStreamTrack({ kind: 'video' });

			videoProducer.pause();

			return videoProducer.replaceTrack({ track: newVideoTrack })
				.then(() =>
				{
					expect(videoProducer.track).not.toBe(producerPreviousVideoTrack);
					expect(videoProducer.track).toBe(newVideoTrack);
					expect(videoProducer.paused).toBe(true);
				});
		});
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
		.toBeDefined();

	expect(recvTransport.id).toBe(transportRemoteParameters.id);
	expect(recvTransport.closed).toBe(false);
	expect(recvTransport.direction).toBe('recv');
	expect(recvTransport.connectionState).toBe('new');
});

test('transport.receive() succeeds', () =>
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

		expect(transportLocalParameters).toBeDefined();
		expect(transportLocalParameters.dtlsParameters).toBeDefined();

		// Emulate communication with the server and success response (no response
		// data needed).
		setTimeout(callback);
	});

	// eslint-disable-next-line no-unused-vars
	recvTransport.on('receive', (consumerLocalParameters, callback, errback) =>
	{
		receiveEventNumTimesCalled++;

		expect(consumerLocalParameters).toBeDefined();
		expect(consumerLocalParameters.producerId).toBeDefined();
		expect(consumerLocalParameters.rtpCapabilities).toBeDefined();

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
	return Promise.resolve()
		.then(() => (
			recvTransport.receive(
				{ producerId: audioConsumerRemoteParameters.producerId, appData: 'BAR' })
		))
		.then((consumer) =>
		{
			audioConsumer = consumer;

			expect(connectEventNumTimesCalled).toBe(1);
			expect(receiveEventNumTimesCalled).toBe(1);
			expect(audioConsumer).toBeDefined();
			expect(audioConsumer.closed).toBe(false);
			expect(audioConsumer.kind).toBe('audio');
			expect(audioConsumer.id).toBe(audioConsumerRemoteParameters.id);
			expect(audioConsumer.rtpParameters).toBeDefined();
			expect(audioConsumer.preferredProfile).toBe('default');
			expect(audioConsumer.appData).toBe('BAR');

			audioConsumer.close();
			expect(audioConsumer.closed).toBe(true);
		})
		.then(() => (
			recvTransport.receive(
				{
					producerId       : videoConsumerRemoteParameters.producerId,
					preferredProfile : 'high'
				})
		))
		.then((consumer) =>
		{
			videoConsumer = consumer;

			expect(connectEventNumTimesCalled).toBe(1);
			expect(receiveEventNumTimesCalled).toBe(2);
			expect(videoConsumer).toBeDefined();
			expect(videoConsumer.closed).toBe(false);
			expect(videoConsumer.kind).toBe('video');
			expect(videoConsumer.id).toBe(videoConsumerRemoteParameters.id);
			expect(videoConsumer.rtpParameters).toBeDefined();
			expect(videoConsumer.preferredProfile).toBe('high');
			expect(videoConsumer.appData).toBe(undefined);

			expect(videoConsumer.paused).toBe(false);
			videoConsumer.pause();
			expect(videoConsumer.paused).toBe(true);
			videoConsumer.resume();
			expect(videoConsumer.paused).toBe(false);

			videoConsumer.preferredProfile = 'high';
			// Must ignore invalid profile.
			videoConsumer.preferredProfile = 'chicken';
			expect(videoConsumer.preferredProfile).toBe('high');

			expect(videoConsumer.effectiveProfile).toBe(null);
			videoConsumer.effectiveProfile = 'medium';
			// Must ignore invalid profile.
			videoConsumer.effectiveProfile = 'chicken';
			expect(videoConsumer.effectiveProfile).toBe('medium');
		});
});

test('remotetely stopped track produces "trackended" in live producers/consumers', () =>
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
});

test('transport.close() produces "transportclose" in live producers/consumers', () =>
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
