/**
 * Code taken from https://github.com/building5/promise-timeout.
 * Credits to David M. Lee.
 */

import { TimeoutError } from './errors';

/**
 * Rejects a promise with a TimeoutError if it does not settle within the
 * specified timeout.
 * If timeout happens, a didTimeout=true member is set into the original
 * Promise.
 *
 * @param {Promise} promise - The Promise.
 * @param {number} ms - Number of milliseconds to wait on settling.
 * @ignore
 */
export function createPromiseWithTimeout(promise, ms)
{
	let timeout;

	const racePromise = Promise.race(
		[
			promise,
			new Promise((resolve, reject) =>
			{
				timeout = setTimeout(() =>
				{
					promise.didTimeout = true;
					reject(new TimeoutError('timeout'));
				}, ms);
			})
		])
		.then((data) =>
		{
			clearTimeout(timeout);
			return data;
		})
		.catch((error) =>
		{
			clearTimeout(timeout);
			throw error;
		});

	return racePromise;
}
