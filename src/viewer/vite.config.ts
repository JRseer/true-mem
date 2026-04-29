import { resolve } from 'path';
import preact from '@preact/preset-vite';
import { defineConfig } from 'vite';

export default defineConfig({
  root: resolve(__dirname),
  plugins: [preact()],
  server: {
    port: 5173,
    proxy: {
      '/api': 'http://127.0.0.1:3456',
    },
  },
  build: {
    outDir: resolve(__dirname, '../../dist/viewer'),
    emptyOutDir: true,
  },
});
