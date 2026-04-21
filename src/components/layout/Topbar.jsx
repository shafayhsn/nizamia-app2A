import React, { useState, useEffect } from 'react'
import { Bell, Cloud, CloudOff, RefreshCw, AlertCircle } from 'lucide-react'

function useSyncStatus() {
  const [status, setStatus] = useState('online') // online | offline | syncing | error
  useEffect(() => {
    const handleOnline  = () => setStatus('online')
    const handleOffline = () => setStatus('offline')
    window.addEventListener('online',  handleOnline)
    window.addEventListener('offline', handleOffline)
    if (!navigator.onLine) setStatus('offline')
    return () => {
      window.removeEventListener('online',  handleOnline)
      window.removeEventListener('offline', handleOffline)
    }
  }, [])
  return status
}

const CITIES = [
  { label: 'Karachi',  tz: 'Asia/Karachi' },
  { label: 'London',   tz: 'Europe/London' },
  { label: 'New York', tz: 'America/New_York' },
  { label: 'Dubai',    tz: 'Asia/Dubai' },
]

function useClock() {
  const [now, setNow] = useState(new Date())
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(t)
  }, [])
  return now
}

function getWeekNumber(d) {
  const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()))
  date.setUTCDate(date.getUTCDate() + 4 - (date.getUTCDay() || 7))
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1))
  return Math.ceil((((date - yearStart) / 86400000) + 1) / 7)
}

export default function Topbar() {
  const now = useClock()
  const week = getWeekNumber(now)
  const syncStatus = useSyncStatus()

  const syncConfig = {
    online:  { icon: Cloud,        color: '#16a34a', bg: '#f0fdf4', label: 'Online' },
    offline: { icon: CloudOff,     color: '#dc2626', bg: '#fef2f2', label: 'Offline' },
    syncing: { icon: RefreshCw,    color: '#d97706', bg: '#fff7ed', label: 'Syncing' },
    error:   { icon: AlertCircle,  color: '#dc2626', bg: '#fef2f2', label: 'Sync Error' },
  }[syncStatus] || { icon: Cloud, color: '#16a34a', bg: '#f0fdf4', label: 'Online' }

  const rates = [
    { sym: '$', rate: 278.50 },
    { sym: '€', rate: 302.10 },
    { sym: '£', rate: 355.00 },
  ]

  const dayStr = now.toLocaleDateString('en-US', { weekday: 'short', day: 'numeric', month: 'short' })
  const timeStr = now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true, timeZone: 'Asia/Karachi' })

  return (
    <header style={{
      height: 'var(--topbar-h)', background: '#fff',
      borderBottom: '1px solid var(--border)',
      display: 'flex', alignItems: 'center',
      padding: '0 20px', flexShrink: 0,
    }}>

      {/* City clocks */}
      <div style={{ display: 'flex', gap: 18, alignItems: 'center' }}>
        {CITIES.map(({ label, tz }) => {
          const time = now.toLocaleTimeString('en-US', {
            timeZone: tz, hour: '2-digit', minute: '2-digit', hour12: false,
          })
          return (
            <div key={label} style={{ display: 'flex', alignItems: 'baseline', gap: 5 }}>
              <span style={{ fontSize: 12, fontWeight: 600, color: '#1a1a2e' }}>{label}</span>
              <span style={{ fontSize: 12, fontVariantNumeric: 'tabular-nums', color: '#6b7280' }}>{time}</span>
            </div>
          )
        })}
      </div>

      <div style={{ width: 1, height: 20, background: 'var(--border)', margin: '0 16px' }} />

      {/* Exchange rates */}
      <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
        {rates.map(({ sym, rate }) => (
          <div key={sym} style={{ display: 'flex', alignItems: 'baseline', gap: 1 }}>
            <span style={{ fontSize: 11, color: '#9ca3af', fontWeight: 500 }}>{sym}</span>
            <span style={{ fontSize: 12, fontWeight: 600, color: '#374151', fontVariantNumeric: 'tabular-nums' }}>
              {rate.toFixed(2)}
            </span>
            <span style={{ fontSize: 9, color: '#9ca3af', marginLeft: 1 }}>↑</span>
          </div>
        ))}
      </div>

      <div style={{ flex: 1 }} />

      {/* Week + date + time */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <div style={{
          fontSize: 11, fontWeight: 700, background: '#1a1a2e',
          padding: '3px 9px', borderRadius: 5, color: '#fff', whiteSpace: 'nowrap',
        }}>
          W{week}
        </div>
        <span style={{ fontSize: 12, color: '#6b7280', whiteSpace: 'nowrap' }}>{dayStr}</span>
        <span style={{ fontSize: 13, fontWeight: 700, color: '#1a1a2e', fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>
          {timeStr}
        </span>
      </div>

      <div style={{ width: 1, height: 20, background: 'var(--border)', margin: '0 14px' }} />

      {/* Sync indicator */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '3px 8px', borderRadius: 6, background: syncConfig.bg, marginRight: 6 }} title={syncConfig.label}>
        <syncConfig.icon size={13} color={syncConfig.color} style={syncStatus === 'syncing' ? { animation: 'spin 1s linear infinite' } : {}} />
        <span style={{ fontSize: 10, fontWeight: 600, color: syncConfig.color }}>{syncConfig.label}</span>
      </div>

      <button style={{
        background: 'none', border: 'none', cursor: 'pointer',
        color: '#6b7280', padding: 4, position: 'relative', display: 'flex', borderRadius: 6,
      }}
        onMouseEnter={e => e.currentTarget.style.background = '#f3f4f6'}
        onMouseLeave={e => e.currentTarget.style.background = 'none'}
      >
        <Bell size={16} strokeWidth={1.8} />
        <span style={{
          position: 'absolute', top: 3, right: 3, width: 6, height: 6,
          background: '#dc2626', borderRadius: '50%', border: '1.5px solid #fff',
        }} />
      </button>
    </header>
  )
}
