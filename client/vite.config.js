import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  optimizeDeps: {
    include: ['docx-preview', 'jszip']
  },
  server: {
    proxy: {
      '/api': {
        target: 'http://localhost:5000',
        changeOrigin: true,
        configure: (proxy, _options) => {
          proxy.on('error', (err, _req, _res) => {
            if (['ECONNRESET', 'EPIPE', 'ECONNREFUSED', 'ETIMEDOUT', 'ECONNABORTED'].includes(err?.code)) return;
            console.error('Vite api proxy error:', err.message);
          });
        }
      },
      '/uploads': {
        target: 'http://localhost:5000',
        changeOrigin: true,
        configure: (proxy, _options) => {
          proxy.on('error', (err, _req, _res) => {
            if (['ECONNRESET', 'EPIPE', 'ECONNREFUSED', 'ETIMEDOUT', 'ECONNABORTED'].includes(err?.code)) return;
          });
        }
      },
      '/socket.io': {
        target: 'http://localhost:5000',
        ws: true,
        changeOrigin: true,
        configure: (proxy, _options) => {
          proxy.on('error', (err, _req, _res) => {
            if (['ECONNRESET', 'EPIPE', 'ECONNREFUSED', 'ETIMEDOUT', 'ECONNABORTED'].includes(err?.code)) return;
          });
          proxy.on('proxyReqWs', (_proxyReq, req, socket, _options, _head) => {
            if (socket) {
              socket.on('error', (err) => {
                if (['ECONNRESET', 'EPIPE', 'ECONNREFUSED', 'ETIMEDOUT', 'ECONNABORTED'].includes(err?.code)) return;
              });
            }
            if (req && req.socket) {
              req.socket.on('error', (err) => {
                if (['ECONNRESET', 'EPIPE', 'ECONNREFUSED', 'ETIMEDOUT', 'ECONNABORTED'].includes(err?.code)) return;
              });
            }
          });
          proxy.on('open', (proxySocket) => {
            if (proxySocket) {
              proxySocket.on('error', (err) => {
                if (['ECONNRESET', 'EPIPE', 'ECONNREFUSED', 'ETIMEDOUT', 'ECONNABORTED'].includes(err?.code)) return;
              });
            }
          });
        }
      }
    }
  }
})