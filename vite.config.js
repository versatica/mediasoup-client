import { resolve } from 'path';
import { defineConfig } from 'vite';
import typescript from '@rollup/plugin-typescript';

export default defineConfig({
	build : {
		lib : {
			entry    : resolve(__dirname, 'src/index.ts'),
			name     : 'mediasoup-client',
			fileName : 'index',
			formats  : [ 'cjs', 'es' ]
		},
		rollupOptions : {
			plugins : [ typescript() ],
			output  : {
				dir : 'lib'
			}
		}
	}
});
