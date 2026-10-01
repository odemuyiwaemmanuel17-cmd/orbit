import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// OrbitalPulse dev server proxies telemetry calls to the FastAPI backend so
// the frontend can use plain relative /api URLs in every environment.
export default defineConfig({
  plugins: [react()],
  server: {
    host: '0.0.0.0', // bind IPv4 so http://127.0.0.1:5173 and http://localhost both work on Windows
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:8000',
        changeOrigin: true,
      },
    },
  },
  preview: {
    host: '0.0.0.0',
    port: 4173,
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:8000',
        changeOrigin: true,
      },
    },
  },
  build: {
    chunkSizeWarningLimit: 1200,
  },
})
