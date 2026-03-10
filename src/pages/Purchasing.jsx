import React, { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { Search, ShoppingCart } from 'lucide-react'

const today = new Date()

function fmtDate(d) {
  if (!d) return '—'
  return new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
}
function dateColor(d) {
  if (!d) return 'var(--text-light)'
  const dt = new Date(d)
  if (dt < today) return '#dc2626'
  const in14 = new Date(today); in14.setDate(today.getDate() + 14)
  if (dt <= in14) return '#d97706'
  return 'var(--text-light)'
}

const statusStyle = {
  'No PO':     { color: '#d97706', bg: '#fff7ed' },
  'PO Issued': { color: '#16a34a', bg: '#f0fdf4' },
  'Partial':   { color: '#2563eb', bg: '#eff6ff' },
  'Delivered': { color: '#6b7280', bg: '#f9fafb' },
}

const catStyle = {
  Fabric:    { color: '#2563eb', bg: '#eff6ff' },
  'S. Trim': { color: '#d97706', bg: '#fff7ed' },
  'P. Trim': { color: '#7c3aed', bg: '#f5f3ff' },
}

const TABS = [
  { id: 'demand',    label: 'Material Demand',       icon: '🛒' },
  { id: 'pos',       label: 'Issued Purchase Orders', icon: '📋' },
  { id: 'workorders',label: 'Work Orders',            icon: '🔧' },
  { id: 'deliveries',label: 'Expected Deliveries',    icon: '📦' },
]

export default function Purchasing() {
  const [tab, setTab]             = useState('demand')
  const [orders, setOrders]       = useState([])
  const [bomItems, setBomItems]   = useState([])
  const [sizeGroups, setSizeGroups] = useState([])
  const [loading, setLoading]     = useState(true)
  const [search, setSearch]       = useState('')
  const [filterJob, setFilterJob] = useState('')
  const [filterStatus, setFilterStatus] = useState('')
  const [filterCat, setFilterCat] = useState('')
  const [selected, setSelected]   = useState(new Set())

  useEffect(() => { loadData() }, [])

  async function loadData() {
    setLoading(true)
    const [ordRes, bomRes, sgRes] = await Promise.all([
      supabase.from('orders').select('id,job_number,buyer_name,style_number,description,total_qty').not('status', 'eq', 'Cancelled').order('job_number'),
      supabase.from('bom_items').select('*').order('created_at'),
      supabase.from('size_groups').select('id,order_id,group_name,unit_price,currency'),
    ])
    setOrders(ordRes.data || [])
    setBomItems(bomRes.data || [])
    setSizeGroups(sgRes.data || [])
    setLoading(false)
  }

  // Build demand rows: join bom_items with orders
  const demandRows = bomItems.map(item => {
    const order = orders.find(o => o.id === item.order_id)
    if (!order) return null
    const cat = item.table_type === 'fabric' ? 'Fabric' : item.table_type === 'stitching' ? 'S. Trim' : 'P. Trim'
    return {
      id: item.id,
      orderId: order.id,
      jobId: order.job_number || '—',
      buyer: order.buyer_name,
      style: order.style_number,
      desc: order.description,
      totalQty: order.total_qty,
      cat,
      name: item.item_name,
      spec: item.specification || '',
      unit: item.unit || 'pc',
      reqQty: item.final_qty || item.base_qty || 0,
      supplier: item.supplier_name || null,
      neededBy: item.needed_by || null,
      status: item.po_status || 'No PO',
      linkedPo: item.linked_po || null,
    }
  }).filter(Boolean)

  const filtered = demandRows.filter(r => {
    const q = search.toLowerCase()
    const matchSearch = !q || [r.jobId, r.name, r.supplier, r.buyer, r.style].some(f => f?.toLowerCase().includes(q))
    const matchJob    = !filterJob    || r.jobId === filterJob
    const matchStatus = !filterStatus || r.status === filterStatus
    const matchCat    = !filterCat    || r.cat === filterCat
    return matchSearch && matchJob && matchStatus && matchCat
  })

  // Group by order
  const grouped = {}
  filtered.forEach(r => {
    if (!grouped[r.orderId]) grouped[r.orderId] = { jobId: r.jobId, buyer: r.buyer, style: r.style, desc: r.desc, totalQty: r.totalQty, rows: [] }
    grouped[r.orderId].rows.push(r)
  })

  const noPo    = filtered.filter(r => r.status === 'No PO').length
  const poIssued = filtered.filter(r => r.status === 'PO Issued').length
  const totalPoValue = 0 // would sum from PO records

  const allJobs = [...new Set(demandRows.map(r => r.jobId).filter(j => j !== '—'))].sort()

  function toggleSelect(id) {
    setSelected(prev => { const s = new Set(prev); s.has(id) ? s.delete(id) : s.add(id); return s })
  }
  function toggleAll() {
    setSelected(selected.size === filtered.length ? new Set() : new Set(filtered.map(r => r.id)))
  }

  const tabStyle = (t) => ({
    padding: '0 16px', height: 44, background: 'none', border: 'none',
    cursor: 'pointer', fontSize: 13, fontWeight: tab === t ? 600 : 400,
    color: tab === t ? '#1a1a2e' : '#6b7280',
    borderBottom: `2px solid ${tab === t ? '#1a1a2e' : 'transparent'}`,
    marginBottom: -1, fontFamily: 'var(--font)', display: 'flex', alignItems: 'center', gap: 6,
  })

  const selStyle = {
    height: 32, border: '1px solid var(--border)', borderRadius: 7, fontSize: 12,
    padding: '0 10px', background: '#fff', cursor: 'pointer', fontFamily: 'var(--font)',
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: '#fff' }}>

      {/* Header */}
      <div style={{ padding: '16px 24px 0', flexShrink: 0 }}>
        <h1 style={{ fontSize: 20, fontWeight: 800, letterSpacing: '-0.4px' }}>Purchasing & Material Demand</h1>
        <div style={{ fontSize: 11, color: 'var(--text-light)', marginTop: 2, marginBottom: 12 }}>
          Manage material requests generated from confirmed order BOMs
        </div>

        {/* Tabs */}
        <div style={{ display: 'flex', borderBottom: '1px solid var(--border)' }}>
          {TABS.map(t => (
            <button key={t.id} style={tabStyle(t.id)} onClick={() => setTab(t.id)}>
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {tab === 'demand' && (
        <>
          {/* Toolbar */}
          <div style={{ padding: '10px 24px', borderBottom: '1px solid #f3f4f6', display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
            <div style={{ position: 'relative', width: 280 }}>
              <Search size={13} style={{ position: 'absolute', left: 9, top: '50%', transform: 'translateY(-50%)', color: '#9ca3af' }} />
              <input value={search} onChange={e => setSearch(e.target.value)}
                placeholder="Search job, supplier, or item..."
                style={{ width: '100%', paddingLeft: 28, paddingRight: 10, height: 32, border: '1px solid var(--border)', borderRadius: 7, fontSize: 12, fontFamily: 'var(--font)', outline: 'none', background: '#fafafa' }}
              />
            </div>
            <select value={filterJob}    onChange={e => setFilterJob(e.target.value)}    style={selStyle}>
              <option value="">All Jobs</option>
              {allJobs.map(j => <option key={j} value={j}>{j}</option>)}
            </select>
            <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)} style={selStyle}>
              <option value="">All Statuses</option>
              <option>No PO</option><option>PO Issued</option><option>Partial</option><option>Delivered</option>
            </select>
            <select value={filterCat}    onChange={e => setFilterCat(e.target.value)}    style={selStyle}>
              <option value="">All Categories</option>
              <option>Fabric</option><option>S. Trim</option><option>P. Trim</option>
            </select>
            <div style={{ marginLeft: 'auto' }}>
              <button className="btn btn-secondary" style={{ color: '#9ca3af' }} disabled>
                <ShoppingCart size={13} /> Generate Purchase Order
              </button>
            </div>
          </div>

          {/* Bulk bar */}
          {selected.size > 0 && (
            <div style={{ padding: '7px 24px', background: '#eff6ff', borderBottom: '1px solid #dbeafe', display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
              <span style={{ fontSize: 12, color: '#2563eb', fontWeight: 600 }}>{selected.size} items selected</span>
              <button className="btn btn-sm" style={{ background: '#1a1a2e', color: '#fff' }}>
                <ShoppingCart size={12} /> Generate PO
              </button>
              <button className="btn btn-sm btn-secondary" onClick={() => setSelected(new Set())}>Clear Selection</button>
            </div>
          )}

          {/* Table */}
          <div style={{ flex: 1, overflowY: 'auto', overflowX: 'auto' }}>
            {loading ? (
              <div style={{ padding: 60, textAlign: 'center', color: 'var(--text-light)', fontSize: 12 }}>Loading...</div>
            ) : filtered.length === 0 ? (
              <div style={{ padding: 60, textAlign: 'center', fontSize: 13, color: 'var(--text-light)' }}>
                No BOM items found. Add items via the order wizard (Step 3 — BOM).
              </div>
            ) : (
              <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 900 }}>
                <thead>
                  <tr style={{ background: '#fafafa', position: 'sticky', top: 0, zIndex: 10 }}>
                    <th style={{ width: 40, padding: '9px 0 9px 18px', borderBottom: '1px solid #f3f4f6' }}>
                      <input type="checkbox" checked={selected.size === filtered.length && filtered.length > 0} onChange={toggleAll} />
                    </th>
                    {['Job ID', 'Category', 'Material Name & Spec', 'Req. Qty', 'Supplier', 'Needed By', 'Status', 'Linked PO #'].map(h => (
                      <th key={h} style={{ fontSize: 10, fontWeight: 600, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.5px', padding: '9px 12px', textAlign: 'left', borderBottom: '1px solid #f3f4f6', whiteSpace: 'nowrap' }}>
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {Object.values(grouped).map(grp => (
                    <React.Fragment key={grp.jobId}>
                      {/* Group header row */}
                      <tr>
                        <td colSpan={9} style={{ padding: '8px 18px', background: '#f9fafb', borderBottom: '1px solid #f0f0ee', borderTop: '1px solid #f0f0ee' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <span style={{ fontSize: 11, fontWeight: 700, color: '#1a1a2e', fontFamily: 'monospace' }}>{grp.jobId}</span>
                            <span style={{ fontSize: 11, color: '#6b7280' }}>—</span>
                            <span style={{ fontSize: 11, fontWeight: 600, color: '#374151' }}>{grp.buyer?.toUpperCase()}</span>
                            <span style={{ fontSize: 11, color: '#6b7280' }}>·</span>
                            <span style={{ fontSize: 11, color: '#6b7280' }}>{grp.style} {grp.desc ? `+ ${grp.desc}` : ''}</span>
                            {grp.totalQty && (
                              <>
                                <span style={{ fontSize: 11, color: '#9ca3af' }}>·</span>
                                <span style={{ fontSize: 11, fontWeight: 600, color: '#6b7280' }}>{grp.totalQty.toLocaleString()} PCS</span>
                              </>
                            )}
                          </div>
                        </td>
                      </tr>
                      {grp.rows.map(r => {
                        const cs = catStyle[r.cat] || {}
                        const ss = statusStyle[r.status] || {}
                        return (
                          <tr key={r.id}
                            style={{ background: selected.has(r.id) ? '#f0f9ff' : '' }}
                            onMouseEnter={e => { if (!selected.has(r.id)) e.currentTarget.style.background = '#fafafa' }}
                            onMouseLeave={e => { if (!selected.has(r.id)) e.currentTarget.style.background = '' }}
                          >
                            <td style={{ padding: '9px 0 9px 18px', borderBottom: '1px solid #f9fafb' }}>
                              <input type="checkbox" checked={selected.has(r.id)} onChange={() => toggleSelect(r.id)} />
                            </td>
                            <td style={{ padding: '9px 12px', borderBottom: '1px solid #f9fafb', fontFamily: 'monospace', fontSize: 11, fontWeight: 600 }}>
                              {r.jobId}
                            </td>
                            <td style={{ padding: '9px 12px', borderBottom: '1px solid #f9fafb' }}>
                              <span style={{ background: cs.bg, color: cs.color, fontSize: 10, fontWeight: 600, padding: '2px 7px', borderRadius: 4 }}>
                                {r.cat}
                              </span>
                            </td>
                            <td style={{ padding: '9px 12px', borderBottom: '1px solid #f9fafb', maxWidth: 280 }}>
                              <div style={{ fontSize: 12, fontWeight: 600 }}>{r.name}</div>
                              {r.spec && <div style={{ fontSize: 11, color: '#6b7280', marginTop: 1 }}>{r.spec}</div>}
                            </td>
                            <td style={{ padding: '9px 12px', borderBottom: '1px solid #f9fafb', fontSize: 12, fontWeight: 700, fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>
                              {r.reqQty ? `${r.reqQty.toLocaleString()} ${r.unit}` : '—'}
                            </td>
                            <td style={{ padding: '9px 12px', borderBottom: '1px solid #f9fafb', fontSize: 12 }}>
                              {r.supplier ? (
                                <span style={{ fontWeight: 500 }}>{r.supplier}</span>
                              ) : (
                                <span style={{ color: '#9ca3af', fontStyle: 'italic' }}>Unassigned</span>
                              )}
                            </td>
                            <td style={{ padding: '9px 12px', borderBottom: '1px solid #f9fafb', fontSize: 11, color: dateColor(r.neededBy), fontWeight: r.neededBy && new Date(r.neededBy) < today ? 600 : 400, whiteSpace: 'nowrap' }}>
                              {fmtDate(r.neededBy)}
                              {r.neededBy && new Date(r.neededBy) < today && <span style={{ marginLeft: 4 }}>▲</span>}
                            </td>
                            <td style={{ padding: '9px 12px', borderBottom: '1px solid #f9fafb' }}>
                              <span style={{ background: ss.bg || '#f9fafb', color: ss.color || '#6b7280', fontSize: 10, fontWeight: 600, padding: '2px 7px', borderRadius: 4 }}>
                                {r.status}
                              </span>
                            </td>
                            <td style={{ padding: '9px 12px', borderBottom: '1px solid #f9fafb', fontFamily: 'monospace', fontSize: 11, color: '#2563eb', fontWeight: 600 }}>
                              {r.linkedPo || '—'}
                            </td>
                          </tr>
                        )
                      })}
                    </React.Fragment>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          {/* Footer */}
          <div style={{ padding: '8px 24px', borderTop: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: '#fff', flexShrink: 0 }}>
            <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-light)', textTransform: 'uppercase', letterSpacing: '0.4px' }}>
              Displaying {filtered.length} of {demandRows.length} items
            </span>
            <div style={{ display: 'flex', gap: 20, alignItems: 'center' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                <span style={{ fontSize: 10, fontWeight: 600, color: '#9ca3af', textTransform: 'uppercase' }}>No PO:</span>
                <span style={{ fontSize: 13, fontWeight: 800, color: '#d97706' }}>{noPo} items</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                <span style={{ fontSize: 10, fontWeight: 600, color: '#9ca3af', textTransform: 'uppercase' }}>PO Issued:</span>
                <span style={{ fontSize: 13, fontWeight: 800, color: '#16a34a' }}>{poIssued} items</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                <span style={{ fontSize: 10, fontWeight: 600, color: '#9ca3af', textTransform: 'uppercase' }}>Total PO Value:</span>
                <span style={{ fontSize: 13, fontWeight: 800 }}>PKR —</span>
              </div>
            </div>
          </div>
        </>
      )}

      {tab === 'pos' && (
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-light)', fontSize: 13 }}>
          Purchase Orders — coming in next build.
        </div>
      )}
      {tab === 'workorders' && (
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-light)', fontSize: 13 }}>
          Work Orders — coming in next build.
        </div>
      )}
      {tab === 'deliveries' && (
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-light)', fontSize: 13 }}>
          Expected Deliveries — coming in next build.
        </div>
      )}
    </div>
  )
}
