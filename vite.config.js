import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// This feature branch is tested against the QA database before promotion.
if (process.env.VERCEL_ENV === 'preview' && process.env.VERCEL_GIT_COMMIT_REF === 'feature/bulk-bom-usage-parity'
  && process.env.VITE_SUPABASE_URL !== 'https://qymzgiyoyevjastegkms.supabase.co') {
  throw new Error('The Bulk BOM parity preview requires the NZOS QA Supabase project.')
}
export default defineConfig({
  plugins: [react()],
})
