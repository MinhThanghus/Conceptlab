import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Where /api is proxied in dev/preview. Override for isolated test stacks:
//   API_PROXY_TARGET=http://127.0.0.1:8101 npx vite --port 5201
const apiTarget = process.env.API_PROXY_TARGET || 'http://127.0.0.1:8000'

// Dev: Vite serves the React app on :5173 and proxies /api to FastAPI on :8000,
// so the browser sees one origin (cookies + CSRF stay simple).
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    strictPort: true,
    proxy: {
      '/api': { target: apiTarget, changeOrigin: false },
    },
  },
  preview: {
    port: 4173,
    proxy: {
      '/api': { target: apiTarget, changeOrigin: false },
    },
  },
  build: {
    target: 'es2022',
    sourcemap: false,
    chunkSizeWarningLimit: 900,
  },
  test: {
    environment: 'jsdom',
    include: ['src/**/*.test.{js,jsx}'],
    setupFiles: ['src/test/setup-i18n.js'],
  },
})
