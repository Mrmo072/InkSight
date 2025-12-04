import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@drawnix/drawnix': resolve(__dirname, './src/drawnix/drawnix/src'),
      '@plait-board/react-board': resolve(__dirname, './src/drawnix/react-board/src'),
      '@plait-board/react-text': resolve(__dirname, './src/drawnix/react-text/src'),
    }
  },
  build: {
    target: 'es2022'
  },
  esbuild: {
    target: 'es2022'
  },
  optimizeDeps: {
    esbuildOptions: {
      target: 'es2022'
    }
  },
  css: {
    preprocessorOptions: {
      scss: {
        includePaths: [resolve(__dirname, 'node_modules')]
      }
    }
  }
});
