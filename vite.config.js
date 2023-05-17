import { resolve } from 'path';
import { defineConfig } from 'vite';
import typescript from '@rollup/plugin-typescript';

export default defineConfig({
	build : {
		lib : {
			// Could also be a dictionary or array of multiple entry points
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