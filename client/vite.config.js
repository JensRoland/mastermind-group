import { defineConfig } from 'vite';
import solidPlugin from 'vite-plugin-solid';

const API_PORT = process.env.VITE_API_PORT || '8240';

export default defineConfig({
  plugins: [solidPlugin()],
  appType: 'spa',
  envDir: '..',
  server: {
    port: parseInt(process.env.VITE_PORT || '8242'),
    proxy: {
      '/api': `http://localhost:${API_PORT}`,
      '/ws': {
        target: `ws://localhost:${API_PORT}`,
        ws: true,
      },
      '/avatars': `http://localhost:${API_PORT}`,
    },
  },
});
