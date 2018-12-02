import Device from '../lib/Device';
import { UnsupportedError } from '../lib/errors';
import Fake from './handlers/Fake';
const fakeParameters = require('./handlers/fakeParameters');
const { nativeRtpCapabilities } = fakeParameters;

Fake.setNativeRtpCapabilities(nativeRtpCapabilities);

test('creating a Device in Node without custom Handler throws UnsupportedError', () =>
{
	expect(() => new Device({ Handler: null }))
		.toThrow(UnsupportedError);
});

describe('create a Device in Node with a fake Handler', () =>
{
	let device;

	test('Handler name is "Fake"', () =>
	{
		expect(Fake.name).toBe('Fake');
	});

	test('constructor is successful', () =>
	{
		expect(device = new Device({ Handler: Fake })).toBeTruthy();
	});

	test('Handler native capabilities match', () =>
	{
		return expect(Fake.getNativeRtpCapabilities())
			.resolves
			.toBe(nativeRtpCapabilities);
	});
});
