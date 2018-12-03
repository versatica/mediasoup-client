import MediaStreamTrack from 'node-mediastreamtrack';
import Device from '../lib/Device';
import { UnsupportedError, InvalidStateError } from '../lib/errors';
import FakeHandler from './handlers/FakeHandler';
import {
	generateRoomRtpCapabilities,
	generateNativeRtpCapabilities,
	generateLocalDtlsParameters,
	generateTransportRemoteParameters,
	generateProducerRemoteParameters
} from './handlers/fakeParameters';

const roomRtpCapabilities = generateRoomRtpCapabilities();
const nativeRtpCapabilities = generateNativeRtpCapabilities();
const localDtlsParameters = generateLocalDtlsParameters();

FakeHandler.setNativeRtpCapabilities(nativeRtpCapabilities);
FakeHandler.setLocalDtlsParameters(localDtlsParameters);

test('creating a device in Node without custom Handler throws UnsupportedError', () =>
{
	expect(() => new Device({ Handler: null }))
		.toThrow(UnsupportedError);
});

describe('create a device in Node with a FakeHandler', () =>
{
	let device;
	let sendTransport;

	test('FakeHandler name mathes', () =>
	{
		expect(FakeHandler.name).toBe('FakeHandler');
	});

	test('FakeHandler native capabilities match', () =>
	{
		return expect(FakeHandler.getNativeRtpCapabilities())
			.resolves
			.toBe(nativeRtpCapabilities);
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

	test('device can send audio and video', () =>
	{
		expect(device.canSend('audio')).toBe(true);
		expect(device.canSend('video')).toBe(true);
	});

	test('device.canSend() throws TypeError if invalid kind', () =>
	{
		expect(() => device.canSend('chicken'))
			.toThrow(TypeError);
	});

	test('device.createTransport() for sending media succeeds', () =>
	{
		const transportRemoteParameters = generateTransportRemoteParameters();

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
		let localparametersEventNumTimesCalled = 0;
		let sendEventNumTimesCalled = 0;

		// eslint-disable-next-line no-unused-vars
		sendTransport.on('connect', (transportLocalParameters, callback, errback) =>
		{
			localparametersEventNumTimesCalled++;

			callback();
		});

		// eslint-disable-next-line no-unused-vars
		sendTransport.on('send', (producerLocalParameters, callback, errback) =>
		{
			sendEventNumTimesCalled++;

			switch (producerLocalParameters.kind)
			{
				case 'audio':
					audioProducerRemoteParameters = generateProducerRemoteParameters();
					callback(audioProducerRemoteParameters);
					break;

				case 'video':
					videoProducerRemoteParameters = generateProducerRemoteParameters();
					callback(videoProducerRemoteParameters);
					break;
			}
		});

		return Promise.resolve()
			.then(() => sendTransport.send({ track: audioTrack }))
			.then((producer) =>
			{
				expect(localparametersEventNumTimesCalled).toBe(1);
				expect(sendEventNumTimesCalled).toBe(1);
				expect(producer).toBeDefined();
				expect(producer.kind).toBe('audio');
				expect(producer.id).toBe(audioProducerRemoteParameters.id);
			})
			.then(() => sendTransport.send({ track: videoTrack }))
			.then((producer) =>
			{
				expect(localparametersEventNumTimesCalled).toBe(1);
				expect(sendEventNumTimesCalled).toBe(2);
				expect(producer).toBeDefined();
				expect(producer.kind).toBe('video');
				expect(producer.id).toBe(videoProducerRemoteParameters.id);
			});
	});
});
