/** @type {import('knip').KnipConfig} */
const config = {
	$schema: 'https://unpkg.com/knip@6/schema.json',
	project: ['src/**/*.ts'],
	ignoreDependencies: ['open-cli', 'supports-color'],
	typescript: {
		config: ['tsconfig.json'],
	},
	jest: {
		config: ['jest.config.mjs'],
		entry: ['src/test/**/*.ts'],
	},
};

export default config;
