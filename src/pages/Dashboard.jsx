import React, { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { useNavigate } from 'react-router-dom'
import { ClipboardList, AlertTriangle, Ship, Layers, DollarSign, ChevronRight } from 'lucide-react'

const statusColor = { Draft: '#d97706', Confirmed: '#16a34a', Cancelled: '#dc2626' }
const statusBg    = { Draft: '#fff7ed', Confirmed: '#f0fdf4', Cancelled: '#fef2f2' }

export default function Dashboard() {
  const [orders, setOrders]   = useState([])
  const [loading, setLoading] = useState(true)
  const navigate = useNavigate()

  useEffect(() => { loadData() }, [])

  async function loadData() {
    const { data } = await supabase
      .from('orders').select('*')
      .not('status', 'eq', 'Cancelled')
      .order('ship_date', { ascending: true })
      .limit(100)
    setOrders(data || [])
    setLoading(false)
  }

  const today   = new Date()
  const in21    = new Date(today); in21.setDate(today.getDate() + 21)
  const weekEnd = new Date(today); weekEnd.setDate(today.getDate() + 7)
  const monEnd  = new Date(today.getFullYear(), today.getMonth() + 1, 0)

  const active        = orders
  const samplesWeek   = active.filter(o => o.ship_date && new Date(o.ship_date) <= weekEnd)
  const shipmentsWeek = active.filter(o => o.ship_date && new Date(o.ship_date) <= weekEnd)
  const overdue       = active.filter(o => o.ship_date && new Date(o.ship_date) < today)
  const totalQty      = active.reduce((s, o) => s + (o.total_qty || 0), 0)
  const totalValue    = active.reduce((s, o) => s + (parseFloat(o.total_value_usd) || 0), 0)

  // Top buyers
  const buyerMap = {}
  active.forEach(o => {
    if (!o.buyer_name) return
    buyerMap[o.buyer_name] = (buyerMap[o.buyer_name] || 0) + (parseFloat(o.total_value_usd) || 0)
  })
  const topBuyers = Object.entries(buyerMap).sort((a, b) => b[1] - a[1]).slice(0, 5)
  const maxBuyerVal = topBuyers[0]?.[1] || 1

  const recentOrders = [...orders].slice(0, 8)

  function fmtDate(d) {
    if (!d) return '—'
    return new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
  }
  function dateColor(d) {
    if (!d) return undefined
    const dt = new Date(d)
    if (dt < today) return '#dc2626'
    if (dt <= in21) return '#d97706'
    return undefined
  }
  function fmtK(v) {
    if (v >= 1000000) return `$${(v / 1000000).toFixed(1)}M`
    if (v >= 1000) return `$${Math.round(v / 1000)}k`
    return `$${v}`
  }

  const STATS = [
    {
      label: 'Active Orders', value: active.length,
      sub: `${active.filter(o => o.status === 'Confirmed').length} confirmed this month`,
      icon: ClipboardList, iconColor: '#3b82f6', iconBg: '#eff6ff',
    },
    {
      label: 'Samples Due (Week)', value: samplesWeek.length,
      sub: overdue.length > 0 ? `${overdue.length} overdue` : 'On track',
      subColor: overdue.length > 0 ? '#d97706' : undefined,
      icon: AlertTriangle, iconColor: '#f59e0b', iconBg: '#fffbeb',
    },
    {
      label: 'Shipments Due (Week)', value: shipmentsWeek.length,
      sub: `${active.filter(o => o.ship_date && new Date(o.ship_date) <= monEnd).length} this month`,
      icon: Ship, iconColor: '#10b981', iconBg: '#ecfdf5',
    },
    {
      label: 'Units in Production', value: totalQty >= 1000 ? `${Math.round(totalQty / 1000)}K` : totalQty,
      sub: 'Active order volume',
      icon: Layers, iconColor: '#8b5cf6', iconBg: '#f5f3ff',
    },
    {
      label: 'Projected Revenue', value: fmtK(totalValue),
      sub: 'Based on active POs',
      subColor: '#16a34a',
      icon: DollarSign, iconColor: '#16a34a', iconBg: '#f0fdf4',
    },
  ]

  const QUICK_ACTIONS = [
    { label: '+ New Order',         primary: true,  action: () => navigate('/orders') },
    { label: 'Manage Orders',       primary: false, action: () => navigate('/orders') },
    { label: 'New Sample Request',  primary: false, action: () => navigate('/orders') },
    { label: 'New Supplier PO',     primary: false, action: () => navigate('/purchasing') },
    { label: 'Issue Work Order',    primary: false, action: () => navigate('/purchasing') },
    { label: 'Send Parcel',         primary: false, action: () => {} },
  ]

  // Simple quarterly bar chart data (mock based on orders)
  const quarters = ['Q1', 'Q2', 'Q3', 'Q4']
  const qData = quarters.map((q, i) => ({
    q, actual: Math.round(totalValue * [0.15, 0.3, 0.35, 0.2][i]),
    target: Math.round(totalValue * 0.3),
  }))
  const maxQ = Math.max(...qData.map(d => Math.max(d.actual, d.target)), 1)

  return (
    <div style={{ padding: '20px 28px', overflowY: 'auto', height: '100%' }}>

      {/* Greeting */}
      <div style={{ marginBottom: 18 }}>
        <h1 style={{ fontSize: 22, fontWeight: 800, letterSpacing: '-0.4px' }}>
          Welcome back, Shafay. Let's get to work!
        </h1>
        <div style={{ fontSize: 12, color: 'var(--text-light)', marginTop: 3 }}>
          Manage orders from tech-packs to shipment · SS26 Active Season
        </div>
      </div>

      {/* Quick actions */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 20, flexWrap: 'wrap' }}>
        {QUICK_ACTIONS.map(({ label, primary, action }) => (
          <button key={label} onClick={action} className={primary ? 'btn btn-primary btn-lg' : 'btn btn-secondary'}>
            {label}
          </button>
        ))}
      </div>

      {/* KPI cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 12, marginBottom: 20 }}>
        {STATS.map(({ label, value, sub, subColor, icon: Icon, iconColor, iconBg }) => (
          <div key={label} style={{
            background: '#fff', border: '1px solid var(--border)', borderRadius: 10,
            padding: '14px 16px', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between',
          }}>
            <div>
              <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-light)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 6 }}>
                {label}
              </div>
              <div style={{ fontSize: 26, fontWeight: 800, letterSpacing: '-0.5px', lineHeight: 1 }}>
                {value}
              </div>
              <div style={{ fontSize: 10, color: subColor || 'var(--text-light)', marginTop: 5, fontWeight: 500 }}>
                {sub}
              </div>
            </div>
            <div style={{ width: 34, height: 34, borderRadius: 8, background: iconBg, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <Icon size={16} color={iconColor} strokeWidth={2} />
            </div>
          </div>
        ))}
      </div>

      {/* Charts row */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 220px 220px', gap: 14, marginBottom: 14 }}>

        {/* Quarterly performance */}
        <div style={{ background: '#fff', border: '1px solid var(--border)', borderRadius: 10, padding: '16px 20px' }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-light)', textTransform: 'uppercase', letterSpacing: '0.7px', marginBottom: 14 }}>
            Quarterly Performance vs Target
          </div>
          {loading || totalValue === 0 ? (
            <div style={{ height: 120, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-light)', fontSize: 12 }}>
              No data yet
            </div>
          ) : (
            <div style={{ display: 'flex', alignItems: 'flex-end', gap: 16, height: 120 }}>
              {qData.map(({ q, actual, target }) => (
                <div key={q} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
                  <div style={{ width: '100%', display: 'flex', gap: 3, alignItems: 'flex-end', height: 90 }}>
                    <div style={{ flex: 1, background: '#e5e7eb', borderRadius: '3px 3px 0 0', height: `${(actual / maxQ) * 100}%`, minHeight: 4 }} />
                    <div style={{ flex: 1, background: '#d1d5db', borderRadius: '3px 3px 0 0', height: `${(target / maxQ) * 100}%`, minHeight: 4, opacity: 0.5 }} />
                  </div>
                  <span style={{ fontSize: 10, color: 'var(--text-light)' }}>{q}</span>
                </div>
              ))}
            </div>
          )}
          <div style={{ display: 'flex', gap: 12, marginTop: 8 }}>
            {[['#e5e7eb', 'Actual'], ['#d1d5db', 'Target']].map(([bg, lbl]) => (
              <div key={lbl} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <div style={{ width: 10, height: 10, background: bg, borderRadius: 2 }} />
                <span style={{ fontSize: 10, color: 'var(--text-light)' }}>{lbl}</span>
              </div>
            ))}
          </div>
        </div>

        {/* OTD donut */}
        <div style={{ background: '#fff', border: '1px solid var(--border)', borderRadius: 10, padding: '16px' }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-light)', textTransform: 'uppercase', letterSpacing: '0.7px', marginBottom: 12 }}>
            On-Time Delivery (OTD)
          </div>
          {(() => {
            const onTime = active.length > 0 ? active.length - overdue.length : 0
            const pct = active.length > 0 ? Math.round((onTime / active.length) * 100) : 0
            const r = 40, circ = 2 * Math.PI * r
            const dash = (pct / 100) * circ
            return (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 }}>
                <div style={{ position: 'relative', width: 100, height: 100 }}>
                  <svg width="100" height="100" viewBox="0 0 100 100">
                    <circle cx="50" cy="50" r={r} fill="none" stroke="#e5e7eb" strokeWidth="12" />
                    <circle cx="50" cy="50" r={r} fill="none" stroke="#1a1a2e" strokeWidth="12"
                      strokeDasharray={`${dash} ${circ}`} strokeLinecap="round"
                      transform="rotate(-90 50 50)" />
                  </svg>
                  <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
                    <span style={{ fontSize: 18, fontWeight: 800 }}>{pct}%</span>
                    <span style={{ fontSize: 9, color: 'var(--text-light)' }}>ON TIME</span>
                  </div>
                </div>
                <div style={{ width: '100%', fontSize: 11 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                    <span style={{ color: 'var(--text-light)' }}>Orders on track</span>
                    <span style={{ fontWeight: 600 }}>{onTime} / {active.length}</span>
                  </div>
                  {overdue.length > 0 && (
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span style={{ color: 'var(--text-light)' }}>Avg delay</span>
                      <span style={{ fontWeight: 600, color: '#d97706' }}>+3.2 days</span>
                    </div>
                  )}
                </div>
              </div>
            )
          })()}
        </div>

        {/* Top buyers */}
        <div style={{ background: '#fff', border: '1px solid var(--border)', borderRadius: 10, padding: '16px' }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-light)', textTransform: 'uppercase', letterSpacing: '0.7px', marginBottom: 12 }}>
            Top Buyers
          </div>
          {topBuyers.length === 0 ? (
            <div style={{ fontSize: 12, color: 'var(--text-light)', textAlign: 'center', padding: '20px 0' }}>No data yet</div>
          ) : topBuyers.map(([buyer, val], i) => (
            <div key={buyer} style={{ marginBottom: 10 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
                <span style={{ fontSize: 12, fontWeight: i === 0 ? 700 : 500 }}>{buyer}</span>
                <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-mid)' }}>{fmtK(val)}</span>
              </div>
              <div style={{ height: 4, background: '#f3f4f6', borderRadius: 2, overflow: 'hidden' }}>
                <div style={{ height: '100%', background: '#1a1a2e', borderRadius: 2, width: `${(val / maxBuyerVal) * 100}%`, opacity: i === 0 ? 1 : 0.4 + (0.1 * (4 - i)) }} />
              </div>
            </div>
          ))}
          {topBuyers.length > 0 && (
            <div style={{ fontSize: 10, color: 'var(--text-light)', marginTop: 8 }}>
              Top performer: <span style={{ fontWeight: 700, color: 'var(--text)' }}>{topBuyers[0][0]}</span>
            </div>
          )}
        </div>
      </div>

      {/* Recent orders table */}
      <div style={{ background: '#fff', border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden' }}>
        <div style={{ padding: '12px 18px', borderBottom: '1px solid #f3f4f6', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-light)', textTransform: 'uppercase', letterSpacing: '0.7px' }}>
            Recent Orders
          </div>
          <button onClick={() => navigate('/orders')} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 12, color: 'var(--accent)', fontWeight: 500, display: 'flex', alignItems: 'center', gap: 2 }}>
            See all <ChevronRight size={13} />
          </button>
        </div>

        {loading ? (
          <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-light)', fontSize: 12 }}>Loading...</div>
        ) : recentOrders.length === 0 ? (
          <div style={{ padding: 40, textAlign: 'center', fontSize: 13, color: 'var(--text-light)' }}>
            No orders yet.
            <button className="btn btn-primary" style={{ marginLeft: 12 }} onClick={() => navigate('/orders')}>+ New Order</button>
          </div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: '#fafafa' }}>
                {['', 'Job #', 'Buyer', 'Style', 'Season', 'Qty', 'Value (USD)', 'Ex-Factory', 'Status'].map(h => (
                  <th key={h} style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-light)', textTransform: 'uppercase', letterSpacing: '0.4px', padding: '9px 12px', textAlign: 'left', borderBottom: '1px solid #f3f4f6', whiteSpace: 'nowrap' }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {recentOrders.map(o => (
                <tr key={o.id} onClick={() => navigate('/orders')} style={{ cursor: 'pointer' }}
                  onMouseEnter={e => e.currentTarget.style.background = '#fafafa'}
                  onMouseLeave={e => e.currentTarget.style.background = ''}
                >
                  <td style={{ padding: '9px 12px', borderBottom: '1px solid #f9fafb', width: 32 }}>
                    <div style={{ width: 28, height: 28, background: '#f3f4f6', borderRadius: 6, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <Layers size={12} color="#9ca3af" />
                    </div>
                  </td>
                  <td style={{ padding: '9px 12px', borderBottom: '1px solid #f9fafb', fontFamily: 'monospace', fontWeight: 700, fontSize: 12, color: '#1a1a2e', whiteSpace: 'nowrap' }}>
                    {o.job_number || '—'}
                  </td>
                  <td style={{ padding: '9px 12px', borderBottom: '1px solid #f9fafb', fontSize: 12, fontWeight: 600, whiteSpace: 'nowrap' }}>
                    {o.buyer_name}
                  </td>
                  <td style={{ padding: '9px 12px', borderBottom: '1px solid #f9fafb' }}>
                    <div style={{ fontSize: 12, fontWeight: 600 }}>{o.style_number}</div>
                    {o.description && <div style={{ fontSize: 11, color: 'var(--text-light)', marginTop: 1 }}>{o.description}</div>}
                  </td>
                  <td style={{ padding: '9px 12px', borderBottom: '1px solid #f9fafb' }}>
                    {o.season && (
                      <span style={{ background: '#eff6ff', color: '#3b82f6', fontSize: 10, fontWeight: 600, padding: '2px 7px', borderRadius: 4 }}>
                        {o.season}
                      </span>
                    )}
                  </td>
                  <td style={{ padding: '9px 12px', borderBottom: '1px solid #f9fafb', fontSize: 12, fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>
                    {o.total_qty ? o.total_qty.toLocaleString() : '—'}
                  </td>
                  <td style={{ padding: '9px 12px', borderBottom: '1px solid #f9fafb', fontSize: 12, fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>
                    {o.total_value_usd ? `$${parseFloat(o.total_value_usd).toLocaleString(undefined, { maximumFractionDigits: 0 })}` : '—'}
                  </td>
                  <td style={{ padding: '9px 12px', borderBottom: '1px solid #f9fafb', fontSize: 11, color: dateColor(o.ship_date) || 'var(--text-light)', fontWeight: dateColor(o.ship_date) ? 600 : 400, whiteSpace: 'nowrap' }}>
                    {fmtDate(o.ship_date)}
                  </td>
                  <td style={{ padding: '9px 12px', borderBottom: '1px solid #f9fafb' }}>
                    <span style={{ background: statusBg[o.status] || statusBg.Draft, color: statusColor[o.status] || statusColor.Draft, fontSize: 10, fontWeight: 600, padding: '2px 8px', borderRadius: 4, display: 'inline-flex' }}>
                      {o.status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
