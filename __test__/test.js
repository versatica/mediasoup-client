/**
 * This test runs in Node so no browser auto-detection is done. Instead, a
 * FakeHandler device is used.
 */

import MediaStreamTrack from 'node-mediastreamtrack';
import Device from '../lib/Device';
import { UnsupportedError, InvalidStateError } from '../lib/errors';
import FakeHandler from './FakeHandler';
import * as fakeParameters from './fakeParameters';

test('creating a device in Node without custom Handler throws UnsupportedError', () =>
{
	expect(() => new Device({ Handler: null }))
		.toThrow(UnsupportedError);
});

describe('create a device in Node with a FakeHandler', () =>
{
	// Assume we get the room RTP capabilities.
	const roomRtpCapabilities = fakeParameters.generateRoomRtpCapabilities();
	let device;
	let sendTransport;
	let recvTransport;
	let audioProducer;
	let videoProducer;
	let opusConsumer;
	let vp8Consumer;

	test('FakeHandler name mathes', () =>
	{
		expect(FakeHandler.name).toBe('FakeHandler');
	});

	test('Device constructor succeeds', () =>
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

	test('device.load() without roomRtpCapabilities throws TypeError', () =>
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

	test('device.load() throws InvalidStateError if already loaded', () =>
	{
		return expect(device.load({ roomRtpCapabilities }))
			.rejects
			.toThrow(InvalidStateError);
	});

	test('device.canSend() succeeds for "audio" and "video"', () =>
	{
		expect(device.canSend('audio')).toBe(true);
		expect(device.canSend('video')).toBe(true);
	});

	test('device.canSend() throws TypeError if invalid kind', () =>
	{
		expect(() => device.canSend('chicken'))
			.toThrow(TypeError);
	});

	test('device.canReceive() succeeds for supported RTP parameters', () =>
	{
		const opusConsumerRemoteParameters =
			fakeParameters.generateConsumerRemoteParameters({ codecMimeType: 'audio/opus' });
		const vp8ConsumerRemoteParameters =
			fakeParameters.generateConsumerRemoteParameters({ codecMimeType: 'video/VP8' });

		expect(device.canReceive(opusConsumerRemoteParameters.rtpParameters))
			.toBe(true);
		expect(device.canReceive(vp8ConsumerRemoteParameters.rtpParameters))
			.toBe(true);
	});

	test('device.canReceive() fails for unsupported RTP parameters', () =>
	{
		const isacConsumerRemoteParameters =
			fakeParameters.generateConsumerRemoteParameters({ codecMimeType: 'audio/ISAC' });

		expect(device.canReceive(isacConsumerRemoteParameters.rtpParameters))
			.toBe(false);
	});

	test('device.createTransport() for sending media succeeds', () =>
	{
		// Assume we create a transport in the server and get its remote parameters.
		const transportRemoteParameters =
			fakeParameters.generateTransportRemoteParameters();

		expect(sendTransport = device.createTransport(
			{
				transportRemoteParameters,
				direction : 'send'
			}))
			.toBeDefined();

		expect(sendTransport.id).toBe(transportRemoteParameters.id);
		expect(sendTransport.closed).toBe(false);
		expect(sendTransport.direction).toBe('send');
		expect(sendTransport.connectionState).toBe('new');
	});

	test('sendTransport.send() succeeds', () =>
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
			.then(() => sendTransport.send({ track: audioTrack, appData: 'FOO AUDIO' }))
			.then((producer) =>
			{
				audioProducer = producer;

				expect(connectEventNumTimesCalled).toBe(1);
				expect(sendEventNumTimesCalled).toBe(1);
				expect(audioProducer).toBeDefined();
				expect(audioProducer.closed).toBe(false);
				expect(audioProducer.kind).toBe('audio');
				expect(audioProducer.id).toBe(audioProducerRemoteParameters.id);
				expect(audioProducer.track).not.toBe(audioTrack);
				expect(audioProducer.appData).toBe('FOO AUDIO');

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
				expect(videoProducer.track).not.toBe(videoTrack);
				expect(videoProducer.appData).toBe(undefined);

				expect(videoProducer.paused).toBe(false);
				videoProducer.pause();
				expect(videoProducer.paused).toBe(true);
				videoProducer.resume();
				expect(videoProducer.paused).toBe(false);
				videoProducer.pause();
			})
			.then(() =>
			{
				const producerPreviousVideoTrack = videoProducer.track;
				const newVideoTrack = new MediaStreamTrack({ kind: 'video' });

				return videoProducer.replaceTrack({ track: newVideoTrack })
					.then(() =>
					{
						expect(videoProducer.track).not.toBe(producerPreviousVideoTrack);
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

	test('recvTransport.receive() succeeds', () =>
	{
		const opusConsumerRemoteParameters =
			fakeParameters.generateConsumerRemoteParameters({ codecMimeType: 'audio/opus' });
		const vp8ConsumerRemoteParameters =
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
				case opusConsumerRemoteParameters.producerId:
					consumerRemoteParameters = opusConsumerRemoteParameters;
					break;

				case vp8ConsumerRemoteParameters.producerId:
					consumerRemoteParameters = vp8ConsumerRemoteParameters;
					break;

				default:
					throw new Error('unknown consumerLocalParameters.producerId');
			}

			// Emulate communication with the server and success response with consumer
			// remote parameters.
			setTimeout(() => callback(consumerRemoteParameters));
		});

		return Promise.resolve()
			.then(() => (
				recvTransport.receive(
					{ producerId: opusConsumerRemoteParameters.producerId, appData: 'FOO OPUS' })
			))
			.then((consumer) =>
			{
				opusConsumer = consumer;

				expect(connectEventNumTimesCalled).toBe(1);
				expect(receiveEventNumTimesCalled).toBe(1);
				expect(opusConsumer).toBeDefined();
				expect(opusConsumer.closed).toBe(false);
				expect(opusConsumer.kind).toBe('audio');
				expect(opusConsumer.id).toBe(opusConsumerRemoteParameters.id);
				expect(opusConsumer.rtpParameters).toBeDefined();
				expect(opusConsumer.appData).toBe('FOO OPUS');

				opusConsumer.close();
				expect(opusConsumer.closed).toBe(true);
			})
			.then(() => (
				recvTransport.receive(
					{ producerId: vp8ConsumerRemoteParameters.producerId })
			))
			.then((consumer) =>
			{
				vp8Consumer = consumer;

				expect(connectEventNumTimesCalled).toBe(1);
				expect(receiveEventNumTimesCalled).toBe(2);
				expect(vp8Consumer).toBeDefined();
				expect(vp8Consumer.closed).toBe(false);
				expect(vp8Consumer.kind).toBe('video');
				expect(vp8Consumer.id).toBe(vp8ConsumerRemoteParameters.id);
				expect(vp8Consumer.rtpParameters).toBeDefined();
				expect(vp8Consumer.appData).toBe(undefined);

				expect(vp8Consumer.paused).toBe(false);
				vp8Consumer.pause();
				expect(vp8Consumer.paused).toBe(true);
				vp8Consumer.resume();
				expect(vp8Consumer.paused).toBe(false);

				expect(vp8Consumer.preferredProfile).toBe('default');
				vp8Consumer.preferredProfile = 'high';
				// Must ignore invalid profile.
				vp8Consumer.preferredProfile = 'chicken';
				expect(vp8Consumer.preferredProfile).toBe('high');

				expect(vp8Consumer.effectiveProfile).toBe(null);
				vp8Consumer.effectiveProfile = 'medium';
				// Must ignore invalid profile.
				vp8Consumer.effectiveProfile = 'chicken';
				expect(vp8Consumer.effectiveProfile).toBe('medium');
			});
	});

	test('remotetely stopped track produces "trackended" in live producers/consumers', () =>
	{
		let audioProducerTrackendedEventCalled = false;
		let videoProducerTrackendedEventCalled = false;
		let opusConsumerTrackendedEventCalled = false;
		let vp8ConsumerTrackendedEventCalled = false;

		audioProducer.on('trackended', () => (
			audioProducerTrackendedEventCalled = true
		));

		videoProducer.on('trackended', () => (
			videoProducerTrackendedEventCalled = true
		));

		opusConsumer.on('trackended', () => (
			opusConsumerTrackendedEventCalled = true
		));

		vp8Consumer.on('trackended', () => (
			vp8ConsumerTrackendedEventCalled = true
		));

		audioProducer.track.remoteStop();
		// Audio producer was already closed.
		expect(audioProducerTrackendedEventCalled).toBe(false);

		videoProducer.track.remoteStop();
		expect(videoProducerTrackendedEventCalled).toBe(true);

		opusConsumer.track.remoteStop();
		// Opus consumer was already closed.
		expect(opusConsumerTrackendedEventCalled).toBe(false);

		vp8Consumer.track.remoteStop();
		expect(vp8ConsumerTrackendedEventCalled).toBe(true);
	});

	test('sendTransport.close() produces "transportclose" in live producers/consumers', () =>
	{
		let audioProducerTransportcloseEventCalled = false;
		let videoProducerTransportcloseEventCalled = false;
		let opusConsumerTransportcloseEventCalled = false;
		let vp8ConsumerTransportcloseEventCalled = false;

		audioProducer.on('transportclose', () => (
			audioProducerTransportcloseEventCalled = true
		));

		videoProducer.on('transportclose', () => (
			videoProducerTransportcloseEventCalled = true
		));

		opusConsumer.on('transportclose', () => (
			opusConsumerTransportcloseEventCalled = true
		));

		vp8Consumer.on('transportclose', () => (
			vp8ConsumerTransportcloseEventCalled = true
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

		// Opus consumer was already closed.
		expect(opusConsumer.closed).toBe(true);
		expect(vp8Consumer.closed).toBe(false);
		// Close recv transport.
		recvTransport.close();
		expect(vp8Consumer.closed).toBe(true);
		// Opus consumer was already closed.
		expect(opusConsumerTransportcloseEventCalled).toBe(false);
		expect(vp8ConsumerTransportcloseEventCalled).toBe(true);
	});
});
