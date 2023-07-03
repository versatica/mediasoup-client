import dts from 'rollup-plugin-dts';
import esbuild from 'rollup-plugin-esbuild';

const external = (id) => !/^[./]/.test(id);

const createBundleConfig = (input, output) =>
[
	// Create a bundle.
	{
		input   : input,
		plugins : [ esbuild() ],
		output  : [
			{
				file      : `${output}.js`,
				format    : 'cjs',
				sourcemap : true
			},
			{
				file      : `${output}.mjs`,
				format    : 'es',
				sourcemap : true
			}
		],
		external : external
	},
	// Create a bundle for types.
	{
		input   : input,
		plugins : [ dts() ],
		output  : {
			file   : `${output}.d.ts`,
			format : 'es'
		},
		external : external
	}
];

export default [ ...createBundleConfig('src/index.ts', 'lib/index') ];
