import React, { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import OrderWizard from '../components/wizard/OrderWizard'
import { Search, Copy, Trash2, Printer, Package } from 'lucide-react'

const statusStyle = {
  Draft: { background: '#fff7ed', color: '#d97706' },
  Confirmed: { background: '#f0fdf4', color: '#16a34a' },
  Cancelled: { background: '#fef2f2', color: '#dc2626' },
}

export default function Orders() {
  const [tab, setTab] = useState('orders')
  const [orders, setOrders] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [filterBuyer, setFilterBuyer] = useState('')
  const [filterStatus, setFilterStatus] = useState('')
  const [filterSeason, setFilterSeason] = useState('')
  const [selected, setSelected] = useState(new Set())
  const [wizardOpen, setWizardOpen] = useState(false)
  const [editOrder, setEditOrder] = useState(null)
  const [buyers, setBuyers] = useState([])

  useEffect(() => {
    loadOrders()
    supabase.from('buyers').select('id,name').order('name').then(({ data }) => setBuyers(data || []))
  }, [])

  async function loadOrders() {
    setLoading(true)
    const { data } = await supabase.from('orders').select('*').order('created_at', { ascending: false })
    setOrders(data || [])
    setLoading(false)
  }

  function openNew() { setEditOrder(null); setWizardOpen(true) }
  function openEdit(o) { setEditOrder(o); setWizardOpen(true) }
  function closeWizard() { setWizardOpen(false); setEditOrder(null); loadOrders() }

  async function deleteSelected() {
    if (!window.confirm(`Delete ${selected.size} order(s)?`)) return
    await supabase.from('orders').delete().in('id', [...selected])
    setSelected(new Set())
    loadOrders()
  }

  const today = new Date()
  const in21 = new Date(today); in21.setDate(today.getDate() + 21)
  const thisMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0)

  const allSeasons = [...new Set(orders.map(o => o.season).filter(Boolean))]

  const filtered = orders.filter(o => {
    const q = search.toLowerCase()
    const matchSearch = !q || o.style_number?.toLowerCase().includes(q) || o.buyer_name?.toLowerCase().includes(q) || o.po_number?.toLowerCase().includes(q) || o.job_number?.toLowerCase().includes(q) || o.description?.toLowerCase().includes(q)
    const matchBuyer = !filterBuyer || o.buyer_name === filterBuyer
    const matchStatus = !filterStatus || o.status === filterStatus
    const matchSeason = !filterSeason || o.season === filterSeason
    return matchSearch && matchBuyer && matchStatus && matchSeason
  })

  const active = orders.filter(o => o.status !== 'Cancelled')
  const dueThisMonth = active.filter(o => o.ship_date && new Date(o.ship_date) <= thisMonth)
  const dueThisWeek = active.filter(o => {
    const in7 = new Date(today); in7.setDate(today.getDate() + 7)
    return o.ship_date && new Date(o.ship_date) <= in7
  })

  const totalQty = filtered.reduce((s, o) => s + (o.total_qty || 0), 0)
  const totalValue = filtered.reduce((s, o) => s + (parseFloat(o.total_value_usd) || 0), 0)

  function fmtDate(d) {
    if (!d) return '—'
    return new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
  }

  function toggleSelect(id) {
    setSelected(prev => { const s = new Set(prev); s.has(id) ? s.delete(id) : s.add(id); return s })
  }

  function toggleAll() {
    if (selected.size === filtered.length) setSelected(new Set())
    else setSelected(new Set(filtered.map(o => o.id)))
  }

  function dateColor(d) {
    if (!d) return 'var(--text-light)'
    const dt = new Date(d)
    if (dt < today) return '#dc2626'
    if (dt <= in21) return '#d97706'
    return 'var(--text-light)'
  }

  const tabStyle = (t) => ({
    display: 'flex', alignItems: 'center', gap: 7,
    padding: '14px 4px', marginRight: 28,
    fontSize: 13, fontWeight: 500, cursor: 'pointer',
    color: tab === t ? '#1a1a2e' : '#9ca3af',
    borderBottom: `2px solid ${tab === t ? '#1a1a2e' : 'transparent'}`,
    background: 'none', border: 'none',
    borderBottom: `2px solid ${tab === t ? '#1a1a2e' : 'transparent'}`,
    transition: 'color 0.1s',
    fontFamily: 'var(--font)',
  })

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: '#fff' }}>

      {/* Tabs */}
      <div style={{ display: 'flex', padding: '0 24px', borderBottom: '1px solid var(--border)', flexShrink: 0, background: '#fff' }}>
        <button style={tabStyle('orders')} onClick={() => setTab('orders')}>
          <Package size={15} strokeWidth={1.8} /> Buyer POs
        </button>
        <button style={tabStyle('jobs')} onClick={() => setTab('jobs')}>
          Jobs
        </button>
      </div>

      {/* Page header */}
      <div style={{ padding: '14px 24px', borderBottom: '1px solid #f3f4f6', display: 'flex', alignItems: 'center', gap: 16, flexShrink: 0 }}>
        <div style={{ flexShrink: 0 }}>
          <div style={{ fontSize: 20, fontWeight: 800, letterSpacing: '-0.4px' }}>Orders</div>
          <div style={{ fontSize: 12, color: 'var(--text-light)', marginTop: 1 }}>Production status and delivery tracking</div>
        </div>

        {/* KPI pills */}
        <div style={{ display: 'flex', gap: 8, marginLeft: 4 }}>
          {[
            { label: 'Total Orders', value: active.length, sub: `${totalQty.toLocaleString()} qty`, color: '#6366f1' },
            { label: 'Due This Month', value: dueThisMonth.length, color: '#d97706' },
            { label: 'Due This Week', value: dueThisWeek.length, color: '#d97706' },
          ].map(kpi => (
            <div key={kpi.label} style={{ padding: '8px 14px', border: '1px solid var(--border)', borderRadius: 9, background: '#fff', minWidth: 110 }}>
              <div style={{ fontSize: 9, fontWeight: 600, color: 'var(--text-light)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 3 }}>
                {kpi.label}
              </div>
              <div style={{ fontSize: 18, fontWeight: 800, color: kpi.color, letterSpacing: '-0.5px', lineHeight: 1 }}>
                {kpi.value}
                {kpi.sub && <span style={{ fontSize: 11, color: 'var(--text-light)', fontWeight: 400, marginLeft: 4 }}>{kpi.sub}</span>}
              </div>
            </div>
          ))}
        </div>

        {/* Actions */}
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 8, alignItems: 'center' }}>
          <button className="btn btn-secondary" style={{ gap: 5 }}>
            <Printer size={13} /> Print
          </button>
          <button className="btn btn-primary" onClick={openNew}>
            + New Order
          </button>
        </div>
      </div>

      {/* Toolbar */}
      <div style={{ padding: '10px 24px', borderBottom: '1px solid #f3f4f6', display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0, background: '#fff' }}>
        {/* Search */}
        <div style={{ position: 'relative', width: 320 }}>
          <Search size={13} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: '#9ca3af' }} />
          <input
            value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Search job, style, buyer, PO..."
            style={{ width: '100%', paddingLeft: 30, paddingRight: 10, height: 32, border: '1px solid var(--border)', borderRadius: 8, fontSize: 12, fontFamily: 'var(--font)', outline: 'none', background: '#fafafa' }}
          />
        </div>

        <select value={filterBuyer} onChange={e => setFilterBuyer(e.target.value)} style={{ height: 32, border: '1px solid var(--border)', borderRadius: 8, fontSize: 12, padding: '0 28px 0 10px', background: '#fff', cursor: 'pointer', fontFamily: 'var(--font)', color: 'var(--text)' }}>
          <option value="">All Buyers</option>
          {buyers.map(b => <option key={b.id} value={b.name}>{b.name}</option>)}
        </select>

        <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)} style={{ height: 32, border: '1px solid var(--border)', borderRadius: 8, fontSize: 12, padding: '0 28px 0 10px', background: '#fff', cursor: 'pointer', fontFamily: 'var(--font)', color: 'var(--text)' }}>
          <option value="">Status: All</option>
          <option value="Draft">Draft</option>
          <option value="Confirmed">Confirmed</option>
          <option value="Cancelled">Cancelled</option>
        </select>

        {allSeasons.length > 0 && (
          <select value={filterSeason} onChange={e => setFilterSeason(e.target.value)} style={{ height: 32, border: '1px solid var(--border)', borderRadius: 8, fontSize: 12, padding: '0 28px 0 10px', background: '#fff', cursor: 'pointer', fontFamily: 'var(--font)', color: 'var(--text)' }}>
            <option value="">Season: All</option>
            {allSeasons.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        )}

        {selected.size > 0 && (
          <div style={{ marginLeft: 'auto', display: 'flex', gap: 6, alignItems: 'center' }}>
            <span style={{ fontSize: 12, color: '#3b82f6', fontWeight: 600 }}>{selected.size} selected</span>
            <button className="btn btn-sm btn-secondary"><Copy size={12} /> Duplicate</button>
            <button className="btn btn-sm btn-danger" onClick={deleteSelected}><Trash2 size={12} /> Delete</button>
          </div>
        )}
      </div>

      {/* Bulk action bar */}
      {selected.size > 0 && (
        <div style={{ padding: '8px 24px', background: '#eff6ff', borderBottom: '1px solid #dbeafe', display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
          <span style={{ fontSize: 12, color: '#3b82f6', fontWeight: 600 }}>{selected.size} orders selected</span>
          <button className="btn btn-sm" style={{ background: '#6366f1', color: '#fff' }}>Assign to Job</button>
          <button className="btn btn-sm btn-secondary">Change Status</button>
          <button className="btn btn-sm btn-danger" onClick={deleteSelected}>Delete</button>
        </div>
      )}

      {/* Table */}
      <div style={{ flex: 1, overflowY: 'auto', overflowX: 'auto' }}>
        {loading ? (
          <div style={{ padding: 60, textAlign: 'center', color: 'var(--text-light)' }}>Loading...</div>
        ) : filtered.length === 0 ? (
          <div style={{ padding: 60, textAlign: 'center' }}>
            <div style={{ fontSize: 40, marginBottom: 10, opacity: 0.3 }}>📦</div>
            <div style={{ fontSize: 13, color: 'var(--text-light)', marginBottom: 12 }}>
              {search || filterBuyer || filterStatus ? 'No orders match your filters.' : 'No orders yet. Create your first order.'}
            </div>
            <button className="btn btn-primary" onClick={openNew}>+ New Order</button>
          </div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 900 }}>
            <thead>
              <tr style={{ background: '#fafafa', position: 'sticky', top: 0, zIndex: 10 }}>
                <th style={{ width: 40, padding: '10px 0 10px 18px', borderBottom: '1px solid #f3f4f6' }}>
                  <input type="checkbox" checked={selected.size === filtered.length && filtered.length > 0} onChange={toggleAll} />
                </th>
                {['Job / Status', 'Buyer', 'PO # / Style', 'Description', 'Season', 'Qty', 'Ship Date', 'Merch.', ''].map(h => (
                  <th key={h} style={{ fontSize: 10, fontWeight: 600, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.5px', padding: '10px 14px', textAlign: 'left', borderBottom: '1px solid #f3f4f6', whiteSpace: 'nowrap' }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map(o => (
                <tr key={o.id}
                  style={{ background: selected.has(o.id) ? '#fafeff' : '', cursor: 'pointer' }}
                  onMouseEnter={e => { if (!selected.has(o.id)) e.currentTarget.style.background = '#fafafa' }}
                  onMouseLeave={e => { if (!selected.has(o.id)) e.currentTarget.style.background = '' }}
                >
                  <td style={{ padding: '10px 0 10px 18px', borderBottom: '1px solid #f9fafb' }}>
                    <input type="checkbox" checked={selected.has(o.id)} onChange={() => toggleSelect(o.id)} onClick={e => e.stopPropagation()} />
                  </td>
                  <td style={{ padding: '10px 14px', borderBottom: '1px solid #f9fafb' }} onClick={() => openEdit(o)}>
                    <div style={{ fontFamily: 'monospace', fontWeight: 700, color: '#6366f1', fontSize: 12 }}>
                      {o.job_number || '—'}
                    </div>
                    <span style={{ ...statusStyle[o.status] || statusStyle.Draft, fontSize: 10, fontWeight: 600, padding: '1px 7px', borderRadius: 4, display: 'inline-flex', marginTop: 3 }}>
                      {o.status}
                    </span>
                  </td>
                  <td style={{ padding: '10px 14px', borderBottom: '1px solid #f9fafb', fontSize: 12, fontWeight: 600 }} onClick={() => openEdit(o)}>
                    {o.buyer_name}
                  </td>
                  <td style={{ padding: '10px 14px', borderBottom: '1px solid #f9fafb' }} onClick={() => openEdit(o)}>
                    <div style={{ fontSize: 11, color: '#6b7280', fontFamily: 'monospace' }}>{o.po_number || '—'}</div>
                    <div style={{ fontSize: 12, fontWeight: 600, marginTop: 1 }}>{o.style_number}</div>
                  </td>
                  <td style={{ padding: '10px 14px', borderBottom: '1px solid #f9fafb', fontSize: 11, color: '#6b7280', maxWidth: 180 }} onClick={() => openEdit(o)}>
                    {o.description || '—'}
                  </td>
                  <td style={{ padding: '10px 14px', borderBottom: '1px solid #f9fafb' }} onClick={() => openEdit(o)}>
                    {o.season && (
                      <span style={{ background: '#eff6ff', color: '#3b82f6', fontSize: 10, fontWeight: 600, padding: '2px 8px', borderRadius: 5 }}>
                        {o.season}
                      </span>
                    )}
                  </td>
                  <td style={{ padding: '10px 14px', borderBottom: '1px solid #f9fafb', fontFamily: 'monospace', fontSize: 12, fontWeight: 600 }} onClick={() => openEdit(o)}>
                    {o.total_qty ? o.total_qty.toLocaleString() : '—'}
                  </td>
                  <td style={{ padding: '10px 14px', borderBottom: '1px solid #f9fafb', fontSize: 11, color: dateColor(o.ship_date), fontWeight: o.ship_date && new Date(o.ship_date) < today ? 600 : 400 }} onClick={() => openEdit(o)}>
                    {fmtDate(o.ship_date)}
                    {o.ship_date && new Date(o.ship_date) < today ? ' ⚠' : ''}
                  </td>
                  <td style={{ padding: '10px 14px', borderBottom: '1px solid #f9fafb', fontSize: 11, color: '#6b7280' }} onClick={() => openEdit(o)}>
                    {o.merchandiser_name || '—'}
                  </td>
                  <td style={{ padding: '10px 14px', borderBottom: '1px solid #f9fafb' }}>
                    <div style={{ display: 'flex', gap: 4, opacity: 0 }}
                      onMouseEnter={e => e.currentTarget.style.opacity = 1}
                      ref={el => el && el.parentElement.addEventListener('mouseenter', () => el.style.opacity = 1)}
                    >
                      <button className="btn btn-sm btn-secondary" onClick={e => { e.stopPropagation(); openEdit(o) }}>Edit</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Sticky footer */}
      <div style={{
        padding: '10px 24px', borderTop: '1px solid var(--border)',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        background: '#fff', flexShrink: 0,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-mid)', textTransform: 'uppercase', letterSpacing: '0.4px' }}>
            Displaying {filtered.length} order{filtered.length !== 1 ? 's' : ''}
          </span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
          {totalValue > 0 && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ fontSize: 11, fontWeight: 600, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.4px' }}>Total Value:</span>
              <span style={{ fontSize: 13, fontWeight: 800, color: '#16a34a', fontVariantNumeric: 'tabular-nums' }}>
                ${totalValue.toLocaleString(undefined, { maximumFractionDigits: 0 })}
              </span>
            </div>
          )}
          {totalQty > 0 && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ fontSize: 11, fontWeight: 600, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.4px' }}>Total Qty:</span>
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
