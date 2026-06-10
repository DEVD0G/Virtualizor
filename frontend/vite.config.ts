import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react()],
  build: {
    // noVNC uses top-level await; require ES2022+ target
    target: 'es2022',
  },
  server: {
    proxy: {
      '/api': 'http://localhost:3000',
      '/events': { target: 'http://localhost:3000', ws: true },
      '/api/v1/vms': { target: 'http://localhost:3000', ws: true },
    },
  },
});
