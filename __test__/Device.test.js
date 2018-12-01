import Device from '../lib/Device';
import { UnsupportedError } from '../lib/errors';

test('creating a Device in Node without custom Handler throws UnsupportedError', () =>
{
	expect(() => new Device({ Handler: null }))
		.toThrow(UnsupportedError);
});
