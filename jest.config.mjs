/** @type {import('jest').Config} */
const config = {
	verbose: true,
	testEnvironment: 'node',
	testRegex: 'src/test/*.test.ts',
	transform: {
		// NOTE: Since tsconfig.json has `isolatedModules: true`, ts-jest
		// transpiles each file on its own without type checking it, so a TS error
		// shows up here as a runtime error (if at all). We don't care since we
		// have TS tasks for that.
		'^.+\\.ts?$': ['ts-jest'],
	},
	coveragePathIgnorePatterns: [
		'src/Logger.ts',
		'src/enhancedEvents.ts',
		'src/test',
	],
	cacheDirectory: '.cache/jest',
};

export default config;
