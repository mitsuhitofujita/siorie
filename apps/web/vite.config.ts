/// <reference types="vitest/config" />
import { fileURLToPath, URL } from 'node:url'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  server: {
    // Same-origin from the browser's perspective, so the __Host-session
    // cookie and Origin-header CSRF check behave the same as the
    // single-origin Cloud Run deployment. Run the API with APP_ORIGIN set
    // to this dev server's own origin (see apps/api/.env.example).
    proxy: {
      '/api': 'http://localhost:8080',
    },
  },
  preview: {
    // `vite preview` inherits `server.proxy`, so /api still reaches the Go
    // API. Pinning the port to the dev server's own value keeps the origin
    // identical to `dev-web`, so APP_ORIGIN, the __Host-session cookie, and
    // the Origin-header CSRF check all behave the same way. strictPort makes
    // a clash with a still-running `dev-web` fail loudly instead of sliding
    // to 5174 (a different origin, where auth would silently 403).
    port: 5173,
    strictPort: true,
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
  },
})
