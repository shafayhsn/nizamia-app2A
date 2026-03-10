import React, { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { useNavigate } from 'react-router-dom'

const statusStyle = {
  Draft: { background: '#fff7ed', color: '#d97706' },
  Confirmed: { background: '#f0fdf4', color: '#16a34a' },
  Cancelled: { background: '#fef2f2', color: '#dc2626' },
}

export default function Dashboard() {
  const [orders, setOrders] = useState([])
  const [loading, setLoading] = useState(true)
  const navigate = useNavigate()

  useEffect(() => {
    loadData()
  }, [])

  async function loadData() {
    const { data } = await supabase
      .from('orders')
      .select('*')
      .not('status', 'eq', 'Cancelled')
      .order('created_at', { ascending: false })
      .limit(50)
    setOrders(data || [])
    setLoading(false)
  }

  const today = new Date()
  const in21 = new Date(today); in21.setDate(today.getDate() + 21)
  const thisMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0)

  const activeOrders = orders.filter(o => o.status !== 'Cancelled')
  const shippingThisMonth = activeOrders.filter(o => o.ship_date && new Date(o.ship_date) <= thisMonth)
  const overdue = activeOrders.filter(o => o.ship_date && new Date(o.ship_date) < today)
  const atRisk = activeOrders.filter(o => o.ship_date && new Date(o.ship_date) <= in21 && new Date(o.ship_date) >= today)
  const recentOrders = orders.slice(0, 8)

  const totalQty = activeOrders.reduce((s, o) => s + (o.total_qty || 0), 0)

  function fmtDate(d) {
    if (!d) return '—'
    const dt = new Date(d)
    return dt.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
  }

  function dateColor(d) {
    if (!d) return undefined
    const dt = new Date(d)
    if (dt < today) return '#dc2626'
    if (dt <= in21) return '#d97706'
    return undefined
  }

  return (
    <div style={{ padding: '20px 28px', overflowY: 'auto', height: '100%' }}>

      {/* Title row */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 800, letterSpacing: '-0.4px' }}>Dashboard</h1>
          <div style={{ fontSize: 12, color: 'var(--text-light)', marginTop: 2 }}>
            Production overview · SS26 Active Season
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn btn-secondary" onClick={() => navigate('/purchasing')}>Material Demand</button>
          <button className="btn btn-primary" onClick={() => navigate('/orders')}>+ New Order</button>
        </div>
      </div>

      {/* KPI Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 20 }}>
        {[
          {
            label: 'Active Orders', value: activeOrders.length,
            sub: `${totalQty.toLocaleString()} units`, icon: '📋', bg: '#eff6ff',
          },
          {
            label: 'Shipping This Month', value: shippingThisMonth.length,
            sub: 'ex-factory dates', icon: '🚢', bg: '#f0fdf4',
          },
          {
            label: 'Overdue', value: overdue.length,
            sub: 'need attention', icon: '⚠️', bg: '#fff7ed',
            valueColor: overdue.length > 0 ? '#dc2626' : undefined,
          },
          {
            label: 'At Risk', value: atRisk.length,
            sub: 'within 21 days', icon: '🕐', bg: '#faf5ff',
            valueColor: atRisk.length > 0 ? '#d97706' : undefined,
          },
        ].map(card => (
          <div key={card.label} style={{
            background: '#fff', border: '1px solid var(--border)', borderRadius: 10,
            padding: '16px 18px', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between',
          }}>
            <div>
              <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-light)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 8 }}>
                {card.label}
              </div>
              <div style={{ fontSize: 28, fontWeight: 800, letterSpacing: '-1px', color: card.valueColor || 'var(--text)', lineHeight: 1 }}>
                {card.value}
              </div>
              <div style={{ fontSize: 10, color: 'var(--text-light)', marginTop: 5, fontWeight: 500 }}>
                {card.sub}
              </div>
            </div>
            <div style={{ width: 38, height: 38, borderRadius: 9, background: card.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18 }}>
              {card.icon}
            </div>
          </div>
        ))}
      </div>

      {/* Main content: Orders table + Critical Path */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 260px', gap: 14 }}>

        {/* Active Orders */}
        <div style={{ background: '#fff', border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden' }}>
          <div style={{
            padding: '14px 18px', borderBottom: '1px solid #f3f4f6',
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-light)', textTransform: 'uppercase', letterSpacing: '0.7px' }}>
              Active Orders
            </div>
            <button onClick={() => navigate('/orders')} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 12, color: '#6366f1', fontWeight: 500 }}>
              See all →
            </button>
          </div>

          {loading ? (
            <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-light)', fontSize: 12 }}>Loading...</div>
          ) : recentOrders.length === 0 ? (
            <div style={{ padding: 48, textAlign: 'center' }}>
              <div style={{ fontSize: 32, marginBottom: 8 }}>📦</div>
              <div style={{ fontSize: 13, color: 'var(--text-light)' }}>No active orders</div>
              <button className="btn btn-primary" style={{ marginTop: 12 }} onClick={() => navigate('/orders')}>
                + New Order
              </button>
            </div>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ background: '#fafafa' }}>
                  {['Job #', 'Buyer', 'Style', 'Season', 'Ship Date', 'Status'].map(h => (
                    <th key={h} style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-light)', textTransform: 'uppercase', letterSpacing: '0.4px', padding: '10px 14px', textAlign: 'left', borderBottom: '1px solid #f3f4f6' }}>
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
                    <td style={{ padding: '10px 14px', borderBottom: '1px solid #f9fafb', fontFamily: 'monospace', fontWeight: 700, color: '#6366f1', fontSize: 12 }}>
                      {o.job_number || '—'}
                    </td>
                    <td style={{ padding: '10px 14px', borderBottom: '1px solid #f9fafb', fontSize: 12, fontWeight: 600 }}>
                      {o.buyer_name}
                    </td>
                    <td style={{ padding: '10px 14px', borderBottom: '1px solid #f9fafb' }}>
                      <div style={{ fontSize: 12, fontWeight: 600 }}>{o.style_number}</div>
                      <div style={{ fontSize: 11, color: 'var(--text-light)', marginTop: 1 }}>{o.description}</div>
                    </td>
                    <td style={{ padding: '10px 14px', borderBottom: '1px solid #f9fafb' }}>
                      {o.season && (
                        <span style={{ background: '#eff6ff', color: '#3b82f6', fontSize: 10, fontWeight: 600, padding: '2px 8px', borderRadius: 5 }}>
                          {o.season}
                        </span>
                      )}
                    </td>
                    <td style={{ padding: '10px 14px', borderBottom: '1px solid #f9fafb', fontSize: 11, color: dateColor(o.ship_date), fontWeight: dateColor(o.ship_date) ? 600 : 400 }}>
                      {fmtDate(o.ship_date)}
                      {o.ship_date && new Date(o.ship_date) < today ? ' ⚠' : ''}
                    </td>
                    <td style={{ padding: '10px 14px', borderBottom: '1px solid #f9fafb' }}>
                      <span style={{ ...statusStyle[o.status], fontSize: 10, fontWeight: 600, padding: '2px 8px', borderRadius: 5, display: 'inline-flex' }}>
                        {o.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Critical Path */}
        <div>
          <div style={{ background: '#fff', border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden' }}>
            <div style={{ padding: '14px 16px', borderBottom: '1px solid #f3f4f6' }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-light)', textTransform: 'uppercase', letterSpacing: '0.7px' }}>
                Critical Path
              </div>
              <div style={{ fontSize: 11, color: 'var(--text-light)', marginTop: 2 }}>3 most at-risk orders</div>
            </div>
            <div style={{ padding: 16 }}>
              {overdue.slice(0, 3).concat(atRisk.slice(0, 3 - Math.min(overdue.length, 3))).slice(0, 3).length === 0 ? (
                <div style={{ textAlign: 'center', padding: '24px 0', fontSize: 12, color: 'var(--text-light)' }}>
                  No at-risk orders
                </div>
              ) : (
                overdue.slice(0, 3).concat(atRisk).slice(0, 3).map(o => (
                  <div key={o.id} style={{ marginBottom: 12, paddingBottom: 12, borderBottom: '1px solid #f5f5f5' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                      <div style={{ fontFamily: 'monospace', fontWeight: 700, fontSize: 11, color: '#6366f1' }}>
                        {o.job_number || o.style_number}
                      </div>
                      <span style={{ fontSize: 10, fontWeight: 600, color: '#dc2626', background: '#fef2f2', padding: '1px 6px', borderRadius: 4 }}>
                        {new Date(o.ship_date) < today ? 'OVERDUE' : 'AT RISK'}
                      </span>
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--text-mid)', marginTop: 2 }}>{o.buyer_name} · {o.description || o.style_number}</div>
                    <div style={{ fontSize: 10, color: '#dc2626', marginTop: 3, fontWeight: 500 }}>{fmtDate(o.ship_date)}</div>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* 14-day shipment banner */}
          {shippingThisMonth.length > 0 && (
            <div style={{
              marginTop: 12, background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 10,
              padding: '12px 14px',
            }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: '#3b82f6', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 4 }}>
                🚢 Shipping This Month
              </div>
              <div style={{ fontSize: 22, fontWeight: 800, color: '#1d4ed8', letterSpacing: '-0.5px' }}>
                {shippingThisMonth.length}
              </div>
              <div style={{ fontSize: 11, color: '#3b82f6', marginTop: 2 }}>orders ex-factory due</div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
