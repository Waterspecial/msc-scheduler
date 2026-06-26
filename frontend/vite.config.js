import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/agencies': 'http://localhost:3001',
      '/auth':     'http://localhost:3001',
      '/workers':  'http://localhost:3001',
      '/shifts':   'http://localhost:3001',
      '/schedule': 'http://localhost:3001',
    }
  }
});
