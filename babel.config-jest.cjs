/**
 * This is Babel configuration for transpilation of TypeScript files into
 * JavaScript CJS files when running Jest.
 *
 * In this case we don't want to replace the .mts extension of imports/exports
 * (otherwise Jest will fail to locate them).
 *
 * NOTE: This file is CJS rather than ESM because older version of Node.js
 * cannot load Babel ESM configuration files synchronously.
 */

module.exports = {
	presets: [
		[
			'@babel/preset-env',
			{
				// Convert ESM modules to CJS.
				modules: 'commonjs',
				targets: 'defaults',
			},
		],
		['@babel/preset-typescript', { allowDeclareFields: true }],
	],
};
