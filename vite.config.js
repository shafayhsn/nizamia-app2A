import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { resolve } from 'node:path'

// cache-bust: 2026-03-13
export default defineConfig({
  plugins: [react()],
  build: { rollupOptions: { input: { main: resolve(__dirname, 'index.html'), offline: resolve(__dirname, 'offline-desktop.html') } } },
  // Relative assets let the packaged desktop build load from its own resources.
  base: process.env.APP2A_DESKTOP_BUILD === '1' ? './' : '/',
})
