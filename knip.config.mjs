/** @type {import('knip').KnipConfig} */
const config = {
	$schema: 'https://unpkg.com/knip@6/schema.json',
	project: ['src/**/*.ts'],
	ignoreDependencies: [
		// Imported as `events`, which knip takes as the Node.js built-in module,
		// but bundlers for the browser resolve it to this npm package.
		'events',
		'open-cli',
		'supports-color',
	],
	typescript: {
		config: ['tsconfig.json'],
	},
	jest: {
		config: ['jest.config.mjs'],
		entry: ['src/test/**/*.ts'],
	},
};

export default config;
