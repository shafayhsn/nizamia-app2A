import React from 'react'

export default function Settings() {
  return (
    <div style={{ padding: '28px', overflowY: 'auto', height: '100%' }}>
      <h1 style={{ fontSize: 20, fontWeight: 800, marginBottom: 4 }}>Settings</h1>
      <div style={{ fontSize: 12, color: 'var(--text-light)', marginBottom: 24 }}>App preferences and configuration</div>
      <div style={{ background: '#fff', border: '1px solid var(--border)', borderRadius: 10, padding: '20px', maxWidth: 500, fontSize: 13, color: 'var(--text-light)' }}>
        Settings panel — coming in next build.
      </div>
    </div>
  )
}
