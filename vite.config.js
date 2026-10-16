import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// cache-bust: 2026-03-13
export default defineConfig({
  plugins: [react()],
})
