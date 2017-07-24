/**
 * Code taken from https://github.com/building5/promise-timeout.
 * Credits to David M. Lee.
 */

import { TimeoutError } from './errors';

/**
 * Rejects a promise with a TimeoutError if it does not settle within the
 * specified timeout.
 *
 * @param {Promise} promise - The promise.
 * @param {number} ms - Number of milliseconds to wait on settling.
 */
export function createPromiseWithTimeout(promise, ms)
{
	let timeout;

	return Promise.race(
		[
			promise,
			new Promise((resolve, reject) =>
			{
				timeout = setTimeout(() =>
				{
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
}
