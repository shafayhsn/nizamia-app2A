import React, { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { formatDate, formatCurrency, daysUntil, shipDateStatus } from '../lib/utils'
import { AlertTriangle, TrendingUp, Package, Ship, Clock } from 'lucide-react'

export default function Dashboard() {
  const [stats, setStats] = useState({ active: 0, units: 0, value: 0, shipping: 0 })
  const [orders, setOrders] = useState([])
  const [critical, setCritical] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadData()
  }, [])

  async function loadData() {
    const { data } = await supabase
      .from('orders')
      .select('*, buyers(name)')
      .not('status', 'eq', 'Cancelled')
      .order('ship_date', { ascending: true })

    if (data) {
      setOrders(data)
      const now = new Date()
      const thisMonth = data.filter(o => {
        if (!o.ship_date) return false
        const d = new Date(o.ship_date)
        return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear()
      })
      setCritical(data.filter(o => {
        const d = daysUntil(o.ship_date)
        return d !== null && d <= 21 && d >= 0
      }).slice(0, 3))
      setStats({
        active: data.filter(o => o.status !== 'Shipped').length,
        shipping: thisMonth.length,
      })
    }
    setLoading(false)
  }

  const statusColor = (s) => {
    if (s === 'overdue') return 'var(--red)'
    if (s === 'critical') return 'var(--red)'
    if (s === 'warning') return 'var(--amber)'
    return 'var(--green)'
  }

  return (
    <div className="page-content">
      {/* Stats row */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 12, marginBottom: 24 }}>
        {[
          { label: 'Active Orders', value: stats.active, icon: Package, sub: 'in progress' },
          { label: 'Shipping This Month', value: stats.shipping, icon: Ship, sub: 'ex-factory dates' },
          { label: 'Overdue', value: orders.filter(o => shipDateStatus(o.ship_date) === 'overdue').length, icon: AlertTriangle, sub: 'need attention', warn: true },
          { label: 'At Risk', value: orders.filter(o => shipDateStatus(o.ship_date) === 'warning').length, icon: Clock, sub: 'within 21 days' },
        ].map(({ label, value, icon: Icon, sub, warn }) => (
          <div key={label} className="card card-pad" style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
            <div style={{
              width: 36, height: 36, borderRadius: 8,
              background: warn && value > 0 ? '#fef2f2' : '#f7f7f5',
              display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
            }}>
              <Icon size={16} strokeWidth={1.8} color={warn && value > 0 ? 'var(--red)' : 'var(--text-mid)'} />
            </div>
            <div>
              <div style={{ fontSize: 22, fontWeight: 700, lineHeight: 1, color: warn && value > 0 ? 'var(--red)' : 'var(--text)' }}>{value}</div>
              <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text)', marginTop: 3 }}>{label}</div>
              <div style={{ fontSize: 10, color: 'var(--text-light)' }}>{sub}</div>
            </div>
          </div>
        ))}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 320px', gap: 16 }}>
        {/* Recent orders */}
        <div className="card">
          <div style={{ padding: '14px 16px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ fontSize: 13, fontWeight: 600 }}>Active Orders</div>
          </div>
          <div className="table-wrap">
            {loading ? (
              <div className="empty-state"><p>Loading...</p></div>
            ) : orders.length === 0 ? (
              <div className="empty-state"><Package size={32} /><p>No active orders</p></div>
            ) : (
              <table>
                <thead>
                  <tr>
                    <th>Job / Style</th>
                    <th>Buyer</th>
                    <th>Description</th>
                    <th>Status</th>
                    <th style={{ textAlign: 'right' }}>Ex-Factory</th>
                  </tr>
                </thead>
                <tbody>
                  {orders.slice(0, 12).map(o => {
                    const ds = shipDateStatus(o.ship_date)
                    return (
                      <tr key={o.id}>
                        <td>
                          <div style={{ fontWeight: 600, fontSize: 12 }}>{o.job_number || '—'}</div>
                          <div style={{ fontSize: 11, color: 'var(--text-light)', fontFamily: 'monospace' }}>{o.style_number || '—'}</div>
                        </td>
                        <td style={{ fontSize: 12 }}>{o.buyer_name || '—'}</td>
                        <td style={{ fontSize: 12, color: 'var(--text-mid)', maxWidth: 200 }}>{o.description || '—'}</td>
                        <td>
                          <span className={`badge badge-${o.status?.toLowerCase().replace(' ', '')}`}>{o.status}</span>
                        </td>
                        <td style={{ textAlign: 'right' }}>
                          <div style={{ fontSize: 12, fontWeight: 600, color: statusColor(ds) }}>
                            {formatDate(o.ship_date)}
                          </div>
                          {ds === 'overdue' && <div style={{ fontSize: 10, color: 'var(--red)' }}>Overdue</div>}
                          {ds === 'critical' && <div style={{ fontSize: 10, color: 'var(--red)' }}>{daysUntil(o.ship_date)}d left</div>}
                          {ds === 'warning' && <div style={{ fontSize: 10, color: 'var(--amber)' }}>{daysUntil(o.ship_date)}d left</div>}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            )}
          </div>
        </div>

        {/* Critical path */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div className="card">
            <div style={{ padding: '14px 16px', borderBottom: '1px solid var(--border)' }}>
              <div style={{ fontSize: 13, fontWeight: 600 }}>Critical Path</div>
              <div style={{ fontSize: 11, color: 'var(--text-light)', marginTop: 2 }}>3 most at-risk orders</div>
            </div>
            <div style={{ padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: 10 }}>
              {critical.length === 0 ? (
                <div style={{ fontSize: 12, color: 'var(--text-light)', textAlign: 'center', padding: '12px 0' }}>No at-risk orders</div>
              ) : critical.map(o => {
                const days = daysUntil(o.ship_date)
                return (
                  <div key={o.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', paddingBottom: 10, borderBottom: '1px solid var(--border)' }}>
                    <div>
                      <div style={{ fontSize: 12, fontWeight: 600 }}>{o.job_number} · {o.style_number}</div>
                      <div style={{ fontSize: 11, color: 'var(--text-mid)' }}>{o.buyer_name}</div>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ fontSize: 12, fontWeight: 700, color: days <= 7 ? 'var(--red)' : 'var(--amber)' }}>{days}d</div>
                      <div style={{ fontSize: 10, color: 'var(--text-light)' }}>{formatDate(o.ship_date)}</div>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>

          {/* 14-day ship banner */}
          {orders.some(o => { const d = daysUntil(o.ship_date); return d !== null && d <= 14 && d >= 0 }) && (
            <div style={{
              background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 8, padding: '12px 14px',
              display: 'flex', gap: 10, alignItems: 'flex-start',
            }}>
              <AlertTriangle size={14} color="var(--amber)" strokeWidth={2} style={{ marginTop: 1, flexShrink: 0 }} />
              <div>
                <div style={{ fontSize: 12, fontWeight: 600, color: '#92400e' }}>Shipments within 14 days</div>
                <div style={{ fontSize: 11, color: '#b45309', marginTop: 2 }}>
                  {orders.filter(o => { const d = daysUntil(o.ship_date); return d !== null && d <= 14 && d >= 0 }).length} order(s) shipping soon. Confirm all processes are complete.
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
