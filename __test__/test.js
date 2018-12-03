import MediaStreamTrack from 'node-mediastreamtrack';
import Device from '../lib/Device';
import { UnsupportedError, InvalidStateError } from '../lib/errors';
import FakeHandler from './handlers/FakeHandler';
import {
	generateRoomRtpCapabilities,
	generateLocalNativeRtpCapabilities,
	generateRemoteTransportData,
	generateLocalDtlsParameters
} from './handlers/fakeParameters';

const roomRtpCapabilities = generateRoomRtpCapabilities();
const localNativeRtpCapabilities = generateLocalNativeRtpCapabilities();
const localDtlsParameters = generateLocalDtlsParameters();

FakeHandler.setLocalNativeRtpCapabilities(localNativeRtpCapabilities);
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
			.toBe(localNativeRtpCapabilities);
	});

	test('Device constructor succeeds', () =>
	{
		expect(device = new Device({ Handler: FakeHandler })).toBeTruthy();
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
		const remoteTransportData = generateRemoteTransportData();

		expect(sendTransport = device.createTransport(
			{
				remoteTransportData,
				direction : 'send'
			}))
			.toBeDefined();

		expect(sendTransport.id).toBe(remoteTransportData.id);
		expect(sendTransport.closed).toBe(false);
		expect(sendTransport.direction).toBe('send');
		expect(sendTransport.connectionState).toBe('new');
	});

	test('sendTransport.send() succeeds', () =>
	{
		const track = new MediaStreamTrack({ kind: 'audio' });

		// eslint-disable-next-line no-unused-vars
		sendTransport.once('localparameters', (parameters, callback, errback) =>
		{
			callback();
		});

		// eslint-disable-next-line no-unused-vars
		sendTransport.once('send', (parameters, callback, errback) =>
		{
			callback({ id: '1234-5678' });
		});

		return expect(sendTransport.send({ track }))
			.resolves
			.toBeDefined();
	});
});
