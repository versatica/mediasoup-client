'use strict';

import randomNumberLib from 'random-number';

const randomNumberGenerator = randomNumberLib.generator(
	{
		min     : 10000000,
		max     : 99999999,
		integer : true
	});

export function randomNumber()
{
	return randomNumberGenerator();
}

export function clone(obj)
{
	return JSON.parse(JSON.stringify(obj));
}
