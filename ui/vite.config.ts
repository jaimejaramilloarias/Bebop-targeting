import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  base: '/Bebop-targeting/',
  plugins: [react()],
  server: {
    port: 5173,
    host: '0.0.0.0'
  },
  build: {
    outDir: '../docs',
    emptyOutDir: true
  }
});
