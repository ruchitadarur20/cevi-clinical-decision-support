/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';

/**
 * `--mode demo` builds the browser-only portfolio demo (see .env.demo): separate output dir and a separate
 * static-asset folder, so the normal full-stack build never contains demo data or images.
 */
export default defineConfig(({ mode }) => ({
  plugins: [react()],
  publicDir: mode === 'demo' ? 'demo-public' : 'public',
  resolve: { alias: { '@': path.resolve(__dirname, 'src') } },
  server: {
    port: 5173,
    proxy: { '/api': { target: 'http://127.0.0.1:4000', changeOrigin: true } },
  },
  build: {
    outDir: mode === 'demo' ? 'dist-demo' : 'dist',
    chunkSizeWarningLimit: 900,
    rollupOptions: {
      output: { manualChunks: { react: ['react', 'react-dom', 'react-router-dom'], charts: ['recharts'] } },
    },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
    css: false,
  },
}));
