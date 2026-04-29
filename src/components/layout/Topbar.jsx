import React from 'react'
import { LogOut } from 'lucide-react'
import { useAuth } from '../../lib/authContext'

export default function Topbar() {
  const { logout } = useAuth()

  return (
    <header style={{
      height: 'var(--topbar-h)', background: '#fff',
      borderBottom: '1px solid var(--border)',
      display: 'flex', alignItems: 'center', justifyContent: 'flex-end',
      padding: '0 20px', flexShrink: 0,
    }}>
      <button onClick={logout} title="Logout" style={{
        height: 34, display: 'inline-flex', alignItems: 'center', gap: 7,
        border: '1px solid #e5e7eb', background: '#fff', color: '#111827',
        borderRadius: 9, padding: '0 12px', cursor: 'pointer', fontSize: 12,
        fontWeight: 800, boxShadow: '0 1px 2px rgba(15,23,42,0.04)',
      }}>
        <LogOut size={14} strokeWidth={2} />
        Logout
      </button>
    </header>
  )
}
