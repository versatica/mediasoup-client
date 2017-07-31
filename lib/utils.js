'use strict';

const randomNumber = require('random-number');

const randomNumberGenerator = randomNumber.generator(
	{
		min     : 10000000,
		max     : 99999999,
		integer : true
	});

export function randomNumber()
{
	return randomNumberGenerator();
}
