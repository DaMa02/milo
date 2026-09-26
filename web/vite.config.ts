import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const proxy = { '/api': { target: 'http://127.0.0.1:8000', changeOrigin: true, rewrite: (path: string) => path.replace(/^\/api/, '') } };
const allowedHosts = ['.trycloudflare.com']; // the phone reaches the Mac through an HTTPS Cloudflare tunnel (mic and GPS need HTTPS)

export default defineConfig({
  plugins: [react()],
  server: { proxy, allowedHosts },
  preview: { proxy, allowedHosts },
});
