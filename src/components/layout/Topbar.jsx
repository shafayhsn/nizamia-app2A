import React from 'react'
import { LogOut, CalendarDays } from 'lucide-react'
import { useAuth } from '../../lib/authContext'

export default function Topbar({ title = 'Nizamia OMS', onOpenDeadlines }) {
  const { logout } = useAuth()

  return (
    <header style={{
      height: 'var(--topbar-h)', background: '#fff',
      borderBottom: '1px solid var(--border)',
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      padding: '0 20px', flexShrink: 0,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
        <div style={{ fontSize: 15, fontWeight: 800, color: '#111827', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{title}</div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        {onOpenDeadlines && (
          <button onClick={onOpenDeadlines} title="Deadlines" style={{
            height: 34, display: 'inline-flex', alignItems: 'center', gap: 7,
            border: '1px solid #e5e7eb', background: '#fff', color: '#111827',
            borderRadius: 9, padding: '0 12px', cursor: 'pointer', fontSize: 12,
            fontWeight: 800, boxShadow: '0 1px 2px rgba(15,23,42,0.04)',
          }}>
            <CalendarDays size={14} strokeWidth={2} />
            Deadlines
          </button>
        )}
        <button onClick={logout} title="Logout" style={{
          height: 34, display: 'inline-flex', alignItems: 'center', gap: 7,
          border: '1px solid #e5e7eb', background: '#fff', color: '#111827',
          borderRadius: 9, padding: '0 12px', cursor: 'pointer', fontSize: 12,
          fontWeight: 800, boxShadow: '0 1px 2px rgba(15,23,42,0.04)',
        }}>
          <LogOut size={14} strokeWidth={2} />
          Logout
        </button>
      </div>
    </header>
  )
}
