const config = {
	verbose: true,
	testEnvironment: 'node',
	testRegex: 'src/test/.*.test.mts',
	// Make Jest consider .mts files as if they were ES modules.
	moduleFileExtensions: ['mts', 'mjs', 'js', 'ts'],
	transform: {
		'^.+\\.mts?$': [
			'babel-jest',
			{
				// We need special Babel settings for Jest plust we need it to be in
				// a CJS configuration file, otherwise old versions of Node will fail
				// to run Jest.
				configFile: './babel.config-jest.cjs',
			},
		],
	},
	coveragePathIgnorePatterns: ['src/Logger.mts', 'src/test'],
	cacheDirectory: '.cache/jest',
};

export default config;
