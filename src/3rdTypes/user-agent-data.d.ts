/**
 * @see https://developer.mozilla.org/en-US/docs/Web/API/Navigator/userAgentData
 *
 * @remarks TypeScript DOM library doesn't define this type yet.
 */
interface NavigatorUAData {
	brands: { brand: string; version: string }[];
	platform: Platform;
	mobile: boolean;
	getHighEntropyValues?(hints: string[]): Promise<Record<string, string>>;
}

type Platform =
	| 'Android'
	| 'Chrome OS'
	| 'Chromium OS'
	| 'iOS'
	| 'Linux'
	| 'macOS'
	| 'Windows'
	| 'Unknown';

/**
 * @remarks No need to extend from anywhere since by default TypeScript
 * automatically merges interfaces with the same name.
 */
interface Navigator {
	readonly userAgentData?: NavigatorUAData;
}
