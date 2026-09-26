import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const proxy = { '/api': { target: 'http://127.0.0.1:8000', changeOrigin: true, rewrite: (path: string) => path.replace(/^\/api/, '') } };
const allowedHosts = ['.trycloudflare.com', '.ts.net']; // the phone reaches the Mac over HTTPS (mic and GPS need it): Cloudflare tunnel, or Tailscale serve as plan B

export default defineConfig({
  plugins: [react()],
  server: { proxy, allowedHosts },
  preview: { proxy, allowedHosts },
});
