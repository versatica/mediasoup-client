/**
 * This is Babel configuration for transpilation of TypeScript files into
 * JavaScript CJS files (.cjs).
 */

export default {
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
	plugins: [
		// We need to replace the .mts extension of imports/exports with .cjs,
		// otherwise Babel will remove the extension of the import and the parent
		// application will fail to resolve its location.
		[
			'module-resolver',
			{
				extensions: ['.cjs'],
				resolvePath(sourcePath /* , currentFile, opts */) {
					return sourcePath.endsWith('.mts')
						? sourcePath.replace(/\.mts$/, '.cjs')
						: sourcePath;
				},
			},
		],
	],
};
