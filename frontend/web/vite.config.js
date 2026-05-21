import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api/auth': {
        target: 'http://127.0.0.1:8001',
        changeOrigin: true,
        secure: false,
        rewrite: (path) => path.replace(/^\/api\/auth/, '/api'),
      },
      '/api/forms': {
        target: 'http://127.0.0.1:8002',
        changeOrigin: true,
        secure: false,
        rewrite: (path) => path.replace(/^\/api\/forms/, '/api'),
      },
      '/api/documents': {
        target: 'https://g3ko3niymhwubahdzugkholgiy0pnbcd.lambda-url.ap-southeast-2.on.aws',
        changeOrigin: true,
        secure: false,
        // Lambda expects full /api/documents/* paths — no rewrite needed
      },
    },
  },
})
