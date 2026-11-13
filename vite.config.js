import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// cache-bust: 2026-03-13
export default defineConfig({
  plugins: [react()],
  // Relative assets let the packaged desktop build load from its own resources.
  base: process.env.APP2A_DESKTOP_BUILD === '1' ? './' : '/',
})
