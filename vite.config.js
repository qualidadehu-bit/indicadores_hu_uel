import path from 'path';
import { fileURLToPath } from 'url';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** Porta do Vite (plataforma React). Worker Wrangler roda em 8788 — ver package.json `cf:dev`. */
const DEV_VITE_PORT = 8787;
const DEV_WORKER_PORT = 8788;

export default defineConfig({
  logLevel: 'error',
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    host: '127.0.0.1',
    port: DEV_VITE_PORT,
    strictPort: true,
    proxy: {
      '/api': {
        target: `http://127.0.0.1:${DEV_WORKER_PORT}`,
        changeOrigin: true,
      },
      '/health': {
        target: `http://127.0.0.1:${DEV_WORKER_PORT}`,
        changeOrigin: true,
      },
    },
  },
});
