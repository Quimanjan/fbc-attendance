import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
  // The dev page sends /api and /auth to the server on PORT from .env (3000 if not set).
  const env = loadEnv(mode, process.cwd(), '');
  const server = `http://localhost:${env.PORT || 3000}`;
  return {
    root: 'client',
    plugins: [react()],
    build: { outDir: '../dist/client', emptyOutDir: true, chunkSizeWarningLimit: 2000 },
    server: { port: 5173, proxy: { '/api': server, '/auth': server } },
  };
});
