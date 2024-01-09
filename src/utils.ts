/**
 * Clones the given value.
 */
export function clone<T>(value: T): T {
	if (value === undefined) {
		return undefined as unknown as T;
	} else if (Number.isNaN(value)) {
		return NaN as unknown as T;
	} else if (typeof structuredClone === 'function') {
		// Available in Node >= 18.
		return structuredClone(value);
	} else {
		return JSON.parse(JSON.stringify(value));
	}
}

/**
 * Generates a random positive integer.
 */
export function generateRandomNumber(): number {
	return Math.round(Math.random() * 10000000);
}
