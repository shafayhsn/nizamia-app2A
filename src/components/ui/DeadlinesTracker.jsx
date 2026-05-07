import React, { useEffect, useMemo, useState } from 'react'
import { ChevronLeft, ChevronRight, X, CalendarDays, AlertTriangle, Clock } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { dateKey, dueWithin24h, loadDeadlineEvents, overdueEvents } from '../../lib/deadlineEvents'

const CAT = {
  'Orders': '#2563eb',
  'Purchasing PO': '#d97706',
  'Work Orders': '#7c3aed',
  'Booking & Shipping': '#0891b2',
  'Sampling': '#db2777',
  'Queues / Production': '#16a34a',
}

function monthLabel(d) {
  return d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
}
function sameMonth(a, b) { return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() }
function addMonths(d, n) { return new Date(d.getFullYear(), d.getMonth() + n, 1) }
function fmt(d) { return new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) }

export function useDeadlineEvents() {
  const [events, setEvents] = useState([])
  const [loading, setLoading] = useState(false)
  const refresh = async () => {
    setLoading(true)
    try { setEvents(await loadDeadlineEvents()) }
    finally { setLoading(false) }
  }
  useEffect(() => { refresh() }, [])
  return { events, loading, refresh }
}

function EventRow({ event, onOpen }) {
  const color = CAT[event.category] || '#6b7280'
  const danger = event.status === 'overdue'
  return (
    <button onClick={() => onOpen(event)} style={{
      width: '100%', textAlign: 'left', border: '1px solid #e5e7eb', background: danger ? '#fef2f2' : '#fff',
      borderRadius: 8, padding: '8px 10px', display: 'grid', gridTemplateColumns: '8px 1fr auto', gap: 8,
      cursor: 'pointer', alignItems: 'start', marginBottom: 6,
    }}>
      <span style={{ width: 8, height: 8, borderRadius: '50%', background: danger ? '#dc2626' : color, marginTop: 5 }} />
      <span>
        <div style={{ fontSize: 12, fontWeight: 800, color: '#111827' }}>{event.title}</div>
        <div style={{ fontSize: 11, color: '#4b5563', marginTop: 2 }}>{event.label || event.category}</div>
        <div style={{ fontSize: 10, color, marginTop: 3, fontWeight: 700 }}>{event.category}</div>
      </span>
      <span style={{ fontSize: 10, color: danger ? '#dc2626' : '#6b7280', fontWeight: 800, whiteSpace: 'nowrap' }}>{fmt(event.rawDate)}</span>
    </button>
  )
}

export default function DeadlinesTracker({ open, onClose }) {
  const navigate = useNavigate()
  const { events, loading, refresh } = useDeadlineEvents()
  const [view, setView] = useState(() => new Date())
  const [selected, setSelected] = useState(() => dateKey(new Date()))

  const byDate = useMemo(() => {
    const map = new Map()
    events.forEach(e => {
      if (!map.has(e.date)) map.set(e.date, [])
      map.get(e.date).push(e)
    })
    return map
  }, [events])

  const cells = useMemo(() => {
    const start = new Date(view.getFullYear(), view.getMonth(), 1)
    const startDow = start.getDay()
    const gridStart = new Date(start)
    gridStart.setDate(start.getDate() - startDow)
    return Array.from({ length: 42 }, (_, i) => {
      const d = new Date(gridStart)
      d.setDate(gridStart.getDate() + i)
      return d
    })
  }, [view])

  const selectedEvents = byDate.get(selected) || []
  const todayKey = dateKey(new Date())

  const openEvent = (e) => {
    if (e.route) navigate(e.route)
    onClose?.()
  }

  if (!open) return null
  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 700, background: 'rgba(0,0,0,.28)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ width: 920, maxWidth: 'calc(100vw - 32px)', height: 650, maxHeight: 'calc(100vh - 32px)', background: '#fff', borderRadius: 18, boxShadow: '0 24px 60px rgba(0,0,0,.24)', display: 'grid', gridTemplateColumns: '1fr 310px', overflow: 'hidden' }}>
        <div style={{ padding: 18, borderRight: '1px solid #e5e7eb', display: 'flex', flexDirection: 'column', minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
            <CalendarDays size={22} />
            <div style={{ fontSize: 20, fontWeight: 900 }}>{monthLabel(view)}</div>
            <div style={{ flex: 1 }} />
            <button className="btn btn-secondary" onClick={() => { const n = new Date(); setView(n); setSelected(dateKey(n)) }}>Today</button>
            <button className="btn btn-secondary" onClick={() => setView(addMonths(view, -1))}><ChevronLeft size={16}/></button>
            <button className="btn btn-secondary" onClick={() => setView(addMonths(view, 1))}><ChevronRight size={16}/></button>
            <button className="btn btn-secondary" onClick={refresh}>{loading ? 'Loading…' : 'Refresh'}</button>
            <button onClick={onClose} style={{ border: 'none', background: 'transparent', cursor: 'pointer', padding: 6 }}><X size={18}/></button>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 6, marginBottom: 6 }}>
            {['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].map(d => <div key={d} style={{ fontSize: 11, fontWeight: 800, color: '#9ca3af', textAlign: 'center' }}>{d}</div>)}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 6, flex: 1, minHeight: 0 }}>
            {cells.map(d => {
              const k = dateKey(d)
              const dayEvents = byDate.get(k) || []
              const isSel = selected === k
              const isToday = todayKey === k
              const hasOverdue = dayEvents.some(e => e.status === 'overdue')
              return (
                <button key={k} onClick={() => setSelected(k)} style={{
                  border: isSel ? '2px solid #111827' : '1px solid #e5e7eb', background: isToday ? '#eff6ff' : '#fff', borderRadius: 10, padding: 8,
                  opacity: sameMonth(d, view) ? 1 : .38, cursor: 'pointer', textAlign: 'left', minHeight: 70, position: 'relative', overflow: 'hidden'
                }}>
                  <div style={{ fontSize: 12, fontWeight: 900, color: hasOverdue ? '#dc2626' : '#111827' }}>{d.getDate()}</div>
                  <div style={{ display: 'flex', gap: 3, flexWrap: 'wrap', marginTop: 8 }}>
                    {dayEvents.slice(0, 5).map(e => <span key={e.id} style={{ width: 7, height: 7, borderRadius: '50%', background: e.status === 'overdue' ? '#dc2626' : (CAT[e.category] || '#6b7280') }} />)}
                    {dayEvents.length > 5 && <span style={{ fontSize: 9, color: '#6b7280', fontWeight: 700 }}>+{dayEvents.length-5}</span>}
                  </div>
                </button>
              )
            })}
          </div>
        </div>
        <div style={{ padding: 16, display: 'flex', flexDirection: 'column', background: '#fafafa' }}>
          <div style={{ fontSize: 15, fontWeight: 900, marginBottom: 4 }}>Events</div>
          <div style={{ fontSize: 12, color: '#6b7280', marginBottom: 12 }}>{fmt(selected)}</div>
          <div style={{ flex: 1, overflowY: 'auto' }}>
            {selectedEvents.length ? selectedEvents.map(e => <EventRow key={e.id} event={e} onOpen={openEvent} />) : <div style={{ color: '#9ca3af', fontSize: 12, padding: '20px 4px' }}>No tracked events for this date.</div>}
          </div>
          <div style={{ borderTop: '1px solid #e5e7eb', paddingTop: 10, marginTop: 10, fontSize: 11, color: '#6b7280' }}>
            <b>Legend:</b> Orders, PO, WO, Shipping, Sampling, Queues. Overdue dates are shown in red.
          </div>
        </div>
      </div>
    </div>
  )
}

export function NotificationCenter({ open, onClose, onEventViewed }) {
  const navigate = useNavigate()
  const { events, loading, refresh } = useDeadlineEvents()
  const due = dueWithin24h(events)
  const late = overdueEvents(events)
  const rows = [...late, ...due.filter(e => e.status !== 'overdue')]
  const openEvent = (e) => { onEventViewed?.(e); if (e.route) navigate(e.route); onClose?.() }
  if (!open) return null
  return (
    <div style={{ position: 'absolute', top: 38, right: 0, width: 360, background: '#fff', border: '1px solid #e5e7eb', borderRadius: 12, boxShadow: '0 18px 45px rgba(0,0,0,.18)', zIndex: 800, padding: 12 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
        <BellTitle count={rows.length} />
        <div style={{ flex: 1 }} />
        <button className="btn btn-secondary" onClick={refresh} style={{ padding: '4px 8px', fontSize: 11 }}>{loading ? '…' : 'Refresh'}</button>
        <button onClick={onClose} style={{ border: 0, background: 'transparent', cursor: 'pointer' }}><X size={16}/></button>
      </div>
      <div style={{ maxHeight: 390, overflowY: 'auto' }}>
        {rows.length ? rows.map(e => <EventRow key={e.id} event={e} onOpen={openEvent} />) : <div style={{ padding: 20, textAlign: 'center', color: '#9ca3af', fontSize: 12 }}>No overdue or next-24-hour deadlines.</div>}
      </div>
    </div>
  )
}

function BellTitle({ count }) {
  return <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}><Clock size={16}/><span style={{ fontSize: 14, fontWeight: 900 }}>Notifications</span>{count > 0 && <span style={{ background: '#dc2626', color: '#fff', borderRadius: 999, padding: '2px 7px', fontSize: 10, fontWeight: 900 }}>{count}</span>}</div>
}
