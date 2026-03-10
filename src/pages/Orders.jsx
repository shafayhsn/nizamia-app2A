import React, { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import OrderWizard from '../components/wizard/OrderWizard'
import { Search, Printer, Upload, Layers } from 'lucide-react'

const statusColor = { Draft: '#d97706', Confirmed: '#16a34a', Cancelled: '#dc2626' }
const statusBg    = { Draft: '#fff7ed', Confirmed: '#f0fdf4', Cancelled: '#fef2f2' }

export default function Orders() {
  const [tab, setTab]               = useState('orders')
  const [orders, setOrders]         = useState([])
  const [loading, setLoading]       = useState(true)
  const [search, setSearch]         = useState('')
  const [filterBuyer, setFilterBuyer]   = useState('')
  const [filterStatus, setFilterStatus] = useState('')
  const [filterSeason, setFilterSeason] = useState('')
  const [selected, setSelected]     = useState(new Set())
  const [wizardOpen, setWizardOpen] = useState(false)
  const [editOrder, setEditOrder]   = useState(null)
  const [buyers, setBuyers]         = useState([])

  useEffect(() => {
    loadOrders()
    supabase.from('buyers').select('id,name').order('name').then(({ data }) => setBuyers(data || []))
  }, [])

  async function loadOrders() {
    setLoading(true)
    const { data } = await supabase.from('orders').select('*').order('ship_date', { ascending: true, nullsLast: true })
    setOrders(data || [])
    setLoading(false)
  }

  function openNew()    { setEditOrder(null);  setWizardOpen(true) }
  function openEdit(o)  { setEditOrder(o);     setWizardOpen(true) }
  function closeWizard(){ setWizardOpen(false); setEditOrder(null); loadOrders() }

  async function deleteSelected() {
    if (!window.confirm(`Delete ${selected.size} order(s)?`)) return
    await supabase.from('orders').delete().in('id', [...selected])
    setSelected(new Set()); loadOrders()
  }

  const today   = new Date()
  const in21    = new Date(today); in21.setDate(today.getDate() + 21)
  const weekEnd = new Date(today); weekEnd.setDate(today.getDate() + 7)
  const monEnd  = new Date(today.getFullYear(), today.getMonth() + 1, 0)

  const allSeasons = [...new Set(orders.map(o => o.season).filter(Boolean))].sort()
  const active     = orders.filter(o => o.status !== 'Cancelled')

  const filtered = orders.filter(o => {
    const q = search.toLowerCase()
    const matchSearch  = !q || [o.style_number, o.buyer_name, o.po_number, o.job_number, o.description].some(f => f?.toLowerCase().includes(q))
    const matchBuyer   = !filterBuyer  || o.buyer_name === filterBuyer
    const matchStatus  = !filterStatus || o.status === filterStatus
    const matchSeason  = !filterSeason || o.season === filterSeason
    return matchSearch && matchBuyer && matchStatus && matchSeason
  })

  const dueThisMonth = active.filter(o => o.ship_date && new Date(o.ship_date) <= monEnd)
  const dueThisWeek  = active.filter(o => o.ship_date && new Date(o.ship_date) <= weekEnd)
  const totalQty     = filtered.reduce((s, o) => s + (o.total_qty || 0), 0)
  const totalValue   = filtered.reduce((s, o) => s + (parseFloat(o.total_value_usd) || 0), 0)

  function fmtDate(d) {
    if (!d) return '—'
    return new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
  }
  function dateColor(d) {
    if (!d) return 'var(--text-light)'
    const dt = new Date(d)
    if (dt < today) return '#dc2626'
    if (dt <= in21)  return '#d97706'
    return 'var(--text-light)'
  }

  function toggleSelect(id) {
    setSelected(prev => { const s = new Set(prev); s.has(id) ? s.delete(id) : s.add(id); return s })
  }
  function toggleAll() {
    setSelected(selected.size === filtered.length && filtered.length > 0 ? new Set() : new Set(filtered.map(o => o.id)))
  }

  const tabStyle = (t) => ({
    display: 'flex', alignItems: 'center', gap: 7,
    padding: '13px 4px', marginRight: 24,
    fontSize: 13, fontWeight: 500, cursor: 'pointer',
    color: tab === t ? '#1a1a2e' : '#9ca3af',
    borderBottom: `2px solid ${tab === t ? '#1a1a2e' : 'transparent'}`,
    background: 'none', border: 'none',
    borderBottomWidth: 2, borderBottomStyle: 'solid',
    borderBottomColor: tab === t ? '#1a1a2e' : 'transparent',
    transition: 'color 0.1s', fontFamily: 'var(--font)',
  })

  const selStyle = {
    height: 32, border: '1px solid var(--border)', borderRadius: 7, fontSize: 12,
    padding: '0 10px', background: '#fff', cursor: 'pointer', fontFamily: 'var(--font)', color: 'var(--text)',
    minWidth: 110,
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: '#fff' }}>

      {/* Tabs */}
      <div style={{ display: 'flex', padding: '0 24px', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
        <button style={tabStyle('orders')} onClick={() => setTab('orders')}>Buyer Purchase Orders</button>
        <button style={tabStyle('jobs')}   onClick={() => setTab('jobs')}>Jobs</button>
      </div>

      {/* Page header */}
      <div style={{ padding: '12px 24px', borderBottom: '1px solid #f3f4f6', display: 'flex', alignItems: 'center', gap: 14, flexShrink: 0 }}>
        <div style={{ flexShrink: 0 }}>
          <div style={{ fontSize: 20, fontWeight: 800, letterSpacing: '-0.4px' }}>Orders</div>
          <div style={{ fontSize: 11, color: 'var(--text-light)', marginTop: 1 }}>Production status and delivery tracking</div>
        </div>

        {/* KPI pills */}
        <div style={{ display: 'flex', gap: 8 }}>
          {[
            { label: 'Total Orders',    value: active.length,         bold: true  },
            { label: 'Due This Month',  value: dueThisMonth.length,   amber: dueThisMonth.length > 0 },
            { label: 'Due This Week',   value: dueThisWeek.length,    amber: dueThisWeek.length > 0  },
          ].map(kpi => (
            <div key={kpi.label} style={{ padding: '6px 12px', border: '1px solid var(--border)', borderRadius: 8, background: '#fff', minWidth: 100 }}>
              <div style={{ fontSize: 9, fontWeight: 600, color: 'var(--text-light)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 2 }}>
                {kpi.label}
              </div>
              <div style={{ fontSize: 18, fontWeight: 800, letterSpacing: '-0.5px', lineHeight: 1, color: kpi.amber ? '#d97706' : '#1a1a2e' }}>
                {kpi.value}
              </div>
            </div>
          ))}
        </div>

        <div style={{ marginLeft: 'auto', display: 'flex', gap: 8, alignItems: 'center' }}>
          <button className="btn btn-secondary"><Printer size={13} /> Print</button>
          <button className="btn btn-secondary"><Upload size={13} /> Export</button>
          <button className="btn btn-secondary" style={{ fontWeight: 600 }}>Job Management</button>
          <button className="btn btn-primary" onClick={openNew}>+ New Order</button>
        </div>
      </div>

      {/* Toolbar */}
      <div style={{ padding: '8px 24px', borderBottom: '1px solid #f3f4f6', display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
        <div style={{ position: 'relative', width: 300 }}>
          <Search size={13} style={{ position: 'absolute', left: 9, top: '50%', transform: 'translateY(-50%)', color: '#9ca3af' }} />
          <input value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Search job number, style, or buyer..."
            style={{ width: '100%', paddingLeft: 28, paddingRight: 10, height: 32, border: '1px solid var(--border)', borderRadius: 7, fontSize: 12, fontFamily: 'var(--font)', outline: 'none', background: '#fafafa' }}
          />
        </div>
        <select value={filterBuyer}  onChange={e => setFilterBuyer(e.target.value)}  style={selStyle}>
          <option value="">All Buyers</option>
          {buyers.map(b => <option key={b.id} value={b.name}>{b.name}</option>)}
        </select>
        <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)} style={selStyle}>
          <option value="">Status: All</option>
          <option value="Draft">Draft</option>
          <option value="Confirmed">Confirmed</option>
          <option value="Cancelled">Cancelled</option>
        </select>
        <select value={filterSeason} onChange={e => setFilterSeason(e.target.value)} style={selStyle}>
          <option value="">Season: All</option>
          {allSeasons.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
      </div>

      {/* Bulk action bar */}
      {selected.size > 0 && (
        <div style={{ padding: '7px 24px', background: '#eff6ff', borderBottom: '1px solid #dbeafe', display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
          <span style={{ fontSize: 12, color: '#2563eb', fontWeight: 600 }}>{selected.size} orders selected</span>
          <button className="btn btn-sm" style={{ background: '#1a1a2e', color: '#fff' }}>Assign to Job</button>
          <button className="btn btn-sm btn-secondary">Change Status</button>
          <button className="btn btn-sm btn-danger" onClick={deleteSelected}>Delete</button>
        </div>
      )}

      {/* Table */}
      <div style={{ flex: 1, overflowY: 'auto', overflowX: 'auto' }}>
        {loading ? (
          <div style={{ padding: 60, textAlign: 'center', color: 'var(--text-light)', fontSize: 12 }}>Loading...</div>
        ) : filtered.length === 0 ? (
          <div style={{ padding: 60, textAlign: 'center' }}>
            <div style={{ opacity: 0.2, marginBottom: 10 }}><Layers size={40} /></div>
            <div style={{ fontSize: 13, color: 'var(--text-light)', marginBottom: 12 }}>
              {search || filterBuyer || filterStatus ? 'No orders match your filters.' : 'No orders yet. Create your first order.'}
            </div>
            <button className="btn btn-primary" onClick={openNew}>+ New Order</button>
          </div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 980 }}>
            <thead>
              <tr style={{ background: '#fafafa', position: 'sticky', top: 0, zIndex: 10 }}>
                <th style={{ width: 40, padding: '9px 0 9px 18px', borderBottom: '1px solid #f3f4f6' }}>
                  <input type="checkbox" checked={selected.size === filtered.length && filtered.length > 0} onChange={toggleAll} />
                </th>
                {['', 'Job / Status', 'Buyer', 'PO # / ID', 'Ref / Style / Desc', 'Season', 'Qty', 'Value (USD)', 'Ship Date', 'Merch.'].map(h => (
                  <th key={h} style={{ fontSize: 10, fontWeight: 600, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.5px', padding: '9px 12px', textAlign: 'left', borderBottom: '1px solid #f3f4f6', whiteSpace: 'nowrap' }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map(o => {
                const isOverdue = o.ship_date && new Date(o.ship_date) < today
                return (
                  <tr key={o.id}
                    style={{ background: selected.has(o.id) ? '#f0f9ff' : '', cursor: 'pointer' }}
                    onMouseEnter={e => { if (!selected.has(o.id)) e.currentTarget.style.background = '#fafafa' }}
                    onMouseLeave={e => { if (!selected.has(o.id)) e.currentTarget.style.background = '' }}
                  >
                    <td style={{ padding: '9px 0 9px 18px', borderBottom: '1px solid #f9fafb' }}>
                      <input type="checkbox" checked={selected.has(o.id)} onChange={() => toggleSelect(o.id)} onClick={e => e.stopPropagation()} />
                    </td>
                    {/* Thumbnail */}
                    <td style={{ padding: '9px 8px', borderBottom: '1px solid #f9fafb' }} onClick={() => openEdit(o)}>
                      <div style={{ width: 32, height: 32, background: '#f3f4f6', borderRadius: 6, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <Layers size={13} color="#9ca3af" />
                      </div>
                    </td>
                    {/* Job / Status */}
                    <td style={{ padding: '9px 12px', borderBottom: '1px solid #f9fafb' }} onClick={() => openEdit(o)}>
                      <div style={{ fontFamily: 'monospace', fontWeight: 700, fontSize: 12, color: '#1a1a2e' }}>
                        {o.job_number || '— No Job —'}
                      </div>
                      <span style={{ background: statusBg[o.status] || statusBg.Draft, color: statusColor[o.status] || statusColor.Draft, fontSize: 10, fontWeight: 600, padding: '1px 7px', borderRadius: 4, display: 'inline-flex', marginTop: 3 }}>
                        {o.status}
                      </span>
                    </td>
                    <td style={{ padding: '9px 12px', borderBottom: '1px solid #f9fafb', fontSize: 12, fontWeight: 600, whiteSpace: 'nowrap' }} onClick={() => openEdit(o)}>
                      {o.buyer_name}
                    </td>
                    <td style={{ padding: '9px 12px', borderBottom: '1px solid #f9fafb' }} onClick={() => openEdit(o)}>
                      <div style={{ fontSize: 11, color: '#6b7280', fontFamily: 'monospace' }}>{o.po_number || '—'}</div>
                    </td>
                    <td style={{ padding: '9px 12px', borderBottom: '1px solid #f9fafb', maxWidth: 200 }} onClick={() => openEdit(o)}>
                      <div style={{ fontSize: 12, fontWeight: 600 }}>{o.style_number}</div>
                      {o.description && <div style={{ fontSize: 11, color: '#6b7280', marginTop: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{o.description}</div>}
                    </td>
                    <td style={{ padding: '9px 12px', borderBottom: '1px solid #f9fafb' }} onClick={() => openEdit(o)}>
                      {o.season && (
                        <span style={{ background: '#eff6ff', color: '#3b82f6', fontSize: 10, fontWeight: 600, padding: '2px 7px', borderRadius: 4 }}>
                          {o.season}
                        </span>
                      )}
                    </td>
                    <td style={{ padding: '9px 12px', borderBottom: '1px solid #f9fafb', fontFamily: 'monospace', fontSize: 12, fontWeight: 600 }} onClick={() => openEdit(o)}>
                      {o.total_qty ? o.total_qty.toLocaleString() : '—'}
                    </td>
                    <td style={{ padding: '9px 12px', borderBottom: '1px solid #f9fafb', fontSize: 12, fontWeight: 700, fontVariantNumeric: 'tabular-nums' }} onClick={() => openEdit(o)}>
                      {o.total_value_usd ? `$${parseFloat(o.total_value_usd).toLocaleString(undefined, { maximumFractionDigits: 0 })}` : '—'}
                    </td>
                    <td style={{ padding: '9px 12px', borderBottom: '1px solid #f9fafb', fontSize: 11, color: dateColor(o.ship_date), fontWeight: isOverdue ? 700 : 400, whiteSpace: 'nowrap' }} onClick={() => openEdit(o)}>
                      {fmtDate(o.ship_date)}
                      {isOverdue && <span style={{ marginLeft: 4 }}>▲</span>}
                    </td>
                    <td style={{ padding: '9px 12px', borderBottom: '1px solid #f9fafb', fontSize: 11, color: '#6b7280' }} onClick={() => openEdit(o)}>
                      {o.merchandiser_name ? o.merchandiser_name.split(' ').map((p, i) => i === 0 ? p[0] + '.' : p).join(' ') : '—'}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Sticky footer */}
      <div style={{ padding: '8px 24px', borderTop: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: '#fff', flexShrink: 0 }}>
        <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-light)', textTransform: 'uppercase', letterSpacing: '0.4px' }}>
          Displaying {filtered.length} active orders
        </span>
        <div style={{ display: 'flex', gap: 20, alignItems: 'center' }}>
          {totalValue > 0 && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ fontSize: 10, fontWeight: 600, color: '#9ca3af', textTransform: 'uppercase' }}>Total Value:</span>
              <span style={{ fontSize: 13, fontWeight: 800, color: '#16a34a', fontVariantNumeric: 'tabular-nums' }}>
                ${totalValue.toLocaleString(undefined, { maximumFractionDigits: 0 })}
              </span>
            </div>
          )}
          {totalQty > 0 && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ fontSize: 10, fontWeight: 600, color: '#9ca3af', textTransform: 'uppercase' }}>Total Qty:</span>
              <span style={{ fontSize: 13, fontWeight: 800, fontVariantNumeric: 'tabular-nums' }}>
                {totalQty.toLocaleString()}
              </span>
            </div>
          )}
        </div>
      </div>

      {wizardOpen && <OrderWizard order={editOrder} onClose={closeWizard} />}
    </div>
  )
}
