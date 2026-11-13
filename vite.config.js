import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
const root = dirname(fileURLToPath(import.meta.url))

// cache-bust: 2026-03-13
export default defineConfig({
  plugins: [react()],
  build: { rollupOptions: { input: { main: resolve(root, 'index.html'), offline: resolve(root, 'offline-desktop.html') } } },
  // Relative assets let the packaged desktop build load from its own resources.
  base: process.env.APP2A_DESKTOP_BUILD === '1' ? './' : '/',
})
