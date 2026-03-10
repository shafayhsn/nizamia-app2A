import React, { useState, useEffect } from 'react'
import { Bell, Search } from 'lucide-react'

const CITIES = [
  { label: 'KHI', tz: 'Asia/Karachi' },
  { label: 'DXB', tz: 'Asia/Dubai' },
  { label: 'LDN', tz: 'Europe/London' },
  { label: 'NYC', tz: 'America/New_York' },
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

export default function Topbar({ pageTitle }) {
  const now = useClock()
  const week = getWeekNumber(now)

  // Static exchange rates (would be fetched from API in production)
  const rates = { USD: 278.5, EUR: 301.2, GBP: 352.8 }

  return (
    <header style={{
      height: 'var(--topbar-h)', background: '#fff',
      borderBottom: '1px solid var(--border)',
      display: 'flex', alignItems: 'center',
      padding: '0 20px', gap: 16, flexShrink: 0,
    }}>
      {/* Page title */}
      <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)', minWidth: 100 }}>
        {pageTitle}
      </div>

      <div style={{ flex: 1 }} />

      {/* Week badge */}
      <div style={{
        fontSize: 10, fontWeight: 700, letterSpacing: '0.5px',
        background: '#f0f0ee', padding: '3px 8px', borderRadius: 4,
        color: 'var(--text-mid)', whiteSpace: 'nowrap',
      }}>
        WK {week}
      </div>

      {/* City clocks */}
      <div style={{ display: 'flex', gap: 14, alignItems: 'center' }}>
        {CITIES.map(({ label, tz }) => {
          const time = now.toLocaleTimeString('en-US', {
            timeZone: tz, hour: '2-digit', minute: '2-digit', hour12: false
          })
          return (
            <div key={label} style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 9, fontWeight: 600, color: 'var(--text-light)', letterSpacing: '0.5px' }}>{label}</div>
              <div style={{ fontSize: 11, fontWeight: 600, fontVariantNumeric: 'tabular-nums', color: 'var(--text-mid)' }}>{time}</div>
            </div>
          )
        })}
      </div>

      {/* Divider */}
      <div style={{ width: 1, height: 22, background: 'var(--border)' }} />

      {/* Exchange rates */}
      <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
        {Object.entries(rates).map(([cur, rate]) => (
          <div key={cur} style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 9, fontWeight: 600, color: 'var(--text-light)', letterSpacing: '0.5px' }}>{cur}</div>
            <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-mid)', fontVariantNumeric: 'tabular-nums' }}>{rate.toFixed(1)}</div>
          </div>
        ))}
      </div>

      {/* Divider */}
      <div style={{ width: 1, height: 22, background: 'var(--border)' }} />

      {/* Notifications */}
      <button style={{
        background: 'none', border: 'none', cursor: 'pointer',
        color: 'var(--text-mid)', padding: 4, position: 'relative',
        display: 'flex',
      }}>
        <Bell size={16} strokeWidth={1.8} />
        <span style={{
          position: 'absolute', top: 2, right: 2,
          width: 6, height: 6, background: 'var(--red)',
          borderRadius: '50%', border: '1px solid #fff',
        }} />
      </button>
    </header>
  )
}
