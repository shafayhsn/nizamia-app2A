import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './App'
import './index.css'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY
const missingCreds = !supabaseUrl || !supabaseAnonKey

function SetupScreen() {
  return (
    <div style={{
      minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontFamily: 'system-ui, sans-serif', background: '#f8fafc', padding: 24
    }}>
      <div style={{ maxWidth: 480, width: '100%' }}>
        <div style={{ fontSize: 24, fontWeight: 700, color: '#0f172a', marginBottom: 8 }}>
          Configuration Required
        </div>
        <p style={{ color: '#475569', marginBottom: 24, lineHeight: 1.6 }}>
          This app needs your Supabase credentials to run. Please add the following secrets in
          <strong> Tools → Secrets</strong> in the Replit sidebar, then restart the app.
        </p>
        <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 10, overflow: 'hidden' }}>
          {[
            { key: 'VITE_SUPABASE_URL', set: !!supabaseUrl, hint: 'Your project URL — e.g. https://xxxx.supabase.co' },
            { key: 'VITE_SUPABASE_ANON_KEY', set: !!supabaseAnonKey, hint: 'Your project anon/public key' },
          ].map(({ key, set, hint }, i) => (
            <div key={key} style={{
              padding: '14px 18px',
              borderTop: i > 0 ? '1px solid #e2e8f0' : 'none',
              display: 'flex', alignItems: 'flex-start', gap: 12
            }}>
              <span style={{ fontSize: 18, marginTop: 1 }}>{set ? '✅' : '❌'}</span>
              <div>
                <code style={{ fontWeight: 600, color: '#0f172a', fontSize: 13 }}>{key}</code>
                <div style={{ color: '#64748b', fontSize: 12, marginTop: 2 }}>{hint}</div>
              </div>
            </div>
          ))}
        </div>
        <p style={{ color: '#94a3b8', fontSize: 12, marginTop: 16 }}>
          Find these values in your Supabase project under <strong>Project Settings → API</strong>.
          After adding them, click the Restart button in the workflow panel.
        </p>
      </div>
    </div>
  )
}

ReactDOM.createRoot(document.getElementById('root')).render(
  missingCreds
    ? <SetupScreen />
    : <BrowserRouter><App /></BrowserRouter>
)
