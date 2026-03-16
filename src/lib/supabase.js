import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

const missingCredsError = new Error(
  'Missing Supabase credentials.\n\nPlease add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in your Replit Secrets (Tools → Secrets).\n\nFind these values in your Supabase project under: Project Settings → API.'
)

export const supabase = (supabaseUrl && supabaseAnonKey)
  ? createClient(supabaseUrl, supabaseAnonKey)
  : new Proxy({}, {
      get() {
        throw missingCredsError
      }
    })
