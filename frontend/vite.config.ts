import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { readFileSync } from 'fs';

// vercel.json is the single source of the security headers; `vite preview` serves the same ones,
// so the end-to-end tests run under the policy that production uses.
const vercel = JSON.parse(readFileSync(path.resolve(__dirname, 'vercel.json'), 'utf-8')) as {
  headers: { source: string; headers: { key: string; value: string }[] }[];
};
const securityHeaders = Object.fromEntries(
  vercel.headers.find((h) => h.source === '/(.*)')!.headers.map((h) => [h.key, h.value]),
);

export default defineConfig(({ mode }) => ({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    port: 3000,
    proxy: {
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
    },
  },
  preview: {
    headers: securityHeaders,
  },
  build: {
    outDir: 'dist',
    sourcemap: false,
    rollupOptions: {
      output: {
        manualChunks: {
          vendor: ['react', 'react-dom', 'react-router-dom'],
          state: ['zustand', '@tanstack/react-query'],
          ui: ['lucide-react'],
        },
      },
    },
  },
  esbuild: {
    // Remove console calls in production
    drop: mode === 'production' ? ['console', 'debugger'] : [],
  },
  test: {
    // jsdom e necessario porque a camada de token guarda em sessionStorage, e
    // em ambiente node o acesso lanca em vez de devolver vazio. Sem isso o
    // teste de logout falharia por motivo que nao tem a ver com a regra.
    environment: 'jsdom',
    globals: true,
    include: ['src/**/*.{test,spec}.{ts,tsx}'],
    exclude: ['e2e/**', 'node_modules/**'],
  },
}));
