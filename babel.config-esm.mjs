/**
 * This is Babel configuration for transpilation of TypeScript files into
 * JavaScript ESM files (.mjs).
 */

export default {
	presets: [
		[
			'@babel/preset-env',
			{
				// Do not convert ESM modules to anything else (keep ESM).
				modules: false,
				targets: 'defaults',
			},
		],
		['@babel/preset-typescript', { allowDeclareFields: true }],
	],
	plugins: [
		// We need to replace the .mts extension of imports/exports with .mjs,
		// otherwise Babel will remove the extension of the import and the parent
		// application will fail to resolve its location.
		[
			'module-resolver',
			{
				extensions: ['.mjs'],
				resolvePath(sourcePath /* , currentFile, opts */) {
					return sourcePath.endsWith('.mts')
						? sourcePath.replace(/\.mts$/, '.mjs')
						: sourcePath;
				},
			},
		],
	],
};
