import { defineConfig } from 'vite';

export default defineConfig({
  server: {
    port: 5173,
    host: true,
    hmr: { clientPort: 443 },
    allowedHosts: true
  },
  build: {
    target: 'esnext'
  }
});
