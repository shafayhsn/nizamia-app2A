import React, { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import OrderWizard from '../components/wizard/OrderWizard'
import PrintPopup from '../components/PrintReports'
import { Search, Printer, Layers, Plus, X, Check, AlertCircle } from 'lucide-react'
import { generateJobNumber } from '../lib/utils'

const statusColor = { Draft: '#d97706', Confirmed: '#16a34a', Cancelled: '#dc2626' }
const statusBg    = { Draft: '#fff7ed', Confirmed: '#f0fdf4', Cancelled: '#fef2f2' }

function fmtDate(d) {
  if (!d) return '—'
  return new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
}

// ── Assign Job Modal ──────────────────────────────────────────────────────────
function AssignJobModal({ selectedOrders, onClose, onDone }) {
  const [jobs, setJobs]             = useState([])
  const [chosen, setChosen]         = useState(null) // existing job id
  const [creating, setCreating]     = useState(false)
  const [saving, setSaving]         = useState(false)
  const [error, setError]           = useState(null)
  const [warning, setWarning]       = useState(null)

  useEffect(() => {
    supabase.from('jobs').select('id,job_number,buyer_id,season').order('created_at', { ascending: false })
      .then(({ data }) => setJobs(data || []))
  }, [])

  // Validate: all selected orders must share same buyer
  const buyers = [...new Set(selectedOrders.map(o => o.buyer_id))]
  const sameBuyer = buyers.length === 1

  // Soft check: ex-factory dates within ±15 days of each other
  const dates = selectedOrders.map(o => o.ship_date).filter(Boolean).map(d => new Date(d))
  let dateWarning = null
  if (dates.length > 1) {
    const min = Math.min(...dates), max = Math.max(...dates)
    const diffDays = (max - min) / (1000 * 60 * 60 * 24)
    if (diffDays > 15) dateWarning = `Ex-factory dates span ${Math.round(diffDays)} days (>15). Proceed?`
  }

  const handleAssign = async () => {
    if (!sameBuyer) { setError('All selected orders must have the same buyer.'); return }
    if (dateWarning && !warning) { setWarning(dateWarning); return }
    setSaving(true)
    try {
      let jobId = chosen
      let jobNumber
      if (creating || !jobId) {
        // Create new job
        jobNumber = await generateJobNumber()
        const { data: newJob, error: je } = await supabase.from('jobs').insert([{
          job_number: jobNumber,
          buyer_id:   selectedOrders[0].buyer_id,
          season:     selectedOrders[0].season,
        }]).select().single()
        if (je) throw new Error(je.message)
        jobId = newJob.id
        jobNumber = newJob.job_number
      } else {
        jobNumber = jobs.find(j => j.id === jobId)?.job_number
      }
      // Assign all selected orders to this job
      await supabase.from('orders')
        .update({ job_id: jobId, job_number: jobNumber })
        .in('id', selectedOrders.map(o => o.id))
      onDone()
    } catch (e) {
      setError(e.message)
    }
    setSaving(false)
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 300, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ background: '#fff', borderRadius: 10, padding: 24, width: 440, boxShadow: '0 16px 48px rgba(0,0,0,0.2)' }}>
        <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 4 }}>Assign to Job</div>
        <div style={{ fontSize: 12, color: '#6b7280', marginBottom: 16 }}>
          {selectedOrders.length} order{selectedOrders.length > 1 ? 's' : ''} selected — {selectedOrders.map(o => o.style_number).join(', ')}
        </div>

        {!sameBuyer && (
          <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 6, padding: '8px 12px', marginBottom: 12, fontSize: 12, color: '#dc2626', display: 'flex', alignItems: 'center', gap: 6 }}>
            <AlertCircle size={13} /> All orders must share the same buyer.
          </div>
        )}

        {warning && (
          <div style={{ background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 6, padding: '8px 12px', marginBottom: 12, fontSize: 12, color: '#92400e' }}>
            ⚠ {warning}
            <div style={{ marginTop: 6, display: 'flex', gap: 6 }}>
              <button className="btn btn-sm" style={{ background: '#d97706', color: '#fff' }} onClick={() => { setWarning(null); handleAssign() }}>Proceed anyway</button>
              <button className="btn btn-sm btn-secondary" onClick={() => setWarning(null)}>Cancel</button>
            </div>
          </div>
        )}

        {!warning && sameBuyer && (
          <>
            <div style={{ marginBottom: 12 }}>
              <label style={{ fontSize: 11, fontWeight: 600, color: '#6b7280', display: 'block', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.4px' }}>
                Assign to existing job
              </label>
              <div style={{ maxHeight: 160, overflowY: 'auto', border: '1px solid #e5e7eb', borderRadius: 6 }}>
                {jobs.length === 0 ? (
                  <div style={{ padding: '16px', textAlign: 'center', color: '#9ca3af', fontSize: 12 }}>No jobs yet</div>
                ) : jobs.map(j => (
                  <div key={j.id} onClick={() => { setChosen(j.id); setCreating(false) }}
                    style={{ padding: '8px 12px', cursor: 'pointer', borderBottom: '1px solid #f0f0ee', display: 'flex', alignItems: 'center', gap: 8, background: chosen === j.id ? '#eff6ff' : '#fff' }}>
                    <div style={{ width: 14, height: 14, borderRadius: '50%', border: `2px solid ${chosen === j.id ? '#2563eb' : '#d1d5db'}`, background: chosen === j.id ? '#2563eb' : 'transparent', flexShrink: 0 }} />
                    <span style={{ fontFamily: 'monospace', fontSize: 12, fontWeight: 700 }}>{j.job_number}</span>
                    {j.season && <span style={{ fontSize: 11, color: '#9ca3af' }}>{j.season}</span>}
                  </div>
                ))}
              </div>
            </div>

            <div>
              <div onClick={() => { setCreating(true); setChosen(null) }}
                style={{ padding: '8px 12px', cursor: 'pointer', border: '1px solid #e5e7eb', borderRadius: 6, display: 'flex', alignItems: 'center', gap: 8, background: creating ? '#f0fdf4' : '#fafafa' }}>
                <div style={{ width: 14, height: 14, borderRadius: '50%', border: `2px solid ${creating ? '#16a34a' : '#d1d5db'}`, background: creating ? '#16a34a' : 'transparent', flexShrink: 0 }} />
                <span style={{ fontSize: 12, fontWeight: 600, color: creating ? '#15803d' : '#374151' }}>Create new job (auto-numbered)</span>
              </div>
            </div>
          </>
        )}

        {error && <div style={{ fontSize: 12, color: '#dc2626', marginTop: 10 }}>{error}</div>}

        {!warning && (
          <div style={{ display: 'flex', gap: 8, marginTop: 20, justifyContent: 'flex-end' }}>
            <button className="btn btn-secondary" onClick={onClose}>Cancel</button>
            <button className="btn btn-primary" onClick={handleAssign} disabled={saving || !sameBuyer || (!chosen && !creating)}>
              {saving ? 'Assigning...' : 'Assign Job'}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

// ── Jobs Tab ──────────────────────────────────────────────────────────────────
function JobsTab({ onEditOrder }) {
  const [jobs, setJobs]     = useState([])
  const [orders, setOrders] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [expanded, setExpanded] = useState(new Set())

  useEffect(() => { loadAll() }, [])

  async function loadAll() {
    setLoading(true)
    const [{ data: js }, { data: ors }] = await Promise.all([
      supabase.from('jobs').select('*').order('created_at', { ascending: false }),
      supabase.from('orders').select('id,job_id,buyer_name,style_number,po_number,ship_date,status,total_qty,total_value_usd,season').order('ship_date'),
    ])
    setJobs(js || [])
    setOrders(ors || [])
    setLoading(false)
  }

  const unassigned = orders.filter(o => !o.job_id)
  const filtered = jobs.filter(j => !search || j.job_number.toLowerCase().includes(search.toLowerCase()))

  const toggleExpand = (id) => setExpanded(e => { const n = new Set(e); n.has(id) ? n.delete(id) : n.add(id); return n })

  const jobOrders = (jobId) => orders.filter(o => o.job_id === jobId)

  if (loading) return <div style={{ padding: 60, textAlign: 'center', color: '#9ca3af', fontSize: 12 }}>Loading...</div>

  return (
    <div style={{ flex: 1, overflowY: 'auto', padding: '16px 24px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
        <div style={{ position: 'relative', width: 240 }}>
          <Search size={13} style={{ position: 'absolute', left: 9, top: '50%', transform: 'translateY(-50%)', color: '#9ca3af' }} />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search jobs..."
            style={{ width: '100%', paddingLeft: 28, height: 32, border: '1px solid #e5e7eb', borderRadius: 7, fontSize: 12, outline: 'none', fontFamily: 'Inter,sans-serif' }} />
        </div>
        <span style={{ fontSize: 11, color: '#9ca3af' }}>{jobs.length} jobs · {unassigned.length} unassigned orders</span>
      </div>

      {filtered.length === 0 && unassigned.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 60, color: '#9ca3af', fontSize: 12 }}>No jobs yet. Select orders and use "Assign to Job".</div>
      ) : (
        <>
          {filtered.map(job => {
            const ords = jobOrders(job.id)
            const open = expanded.has(job.id)
            const totalQty = ords.reduce((s, o) => s + (o.total_qty || 0), 0)
            const totalVal = ords.reduce((s, o) => s + (parseFloat(o.total_value_usd) || 0), 0)
            const shipDates = ords.map(o => o.ship_date).filter(Boolean).sort()
            const earliest = shipDates[0]
            const overdue = earliest && new Date(earliest) < new Date()
            return (
              <div key={job.id} style={{ background: '#fff', border: '1px solid #e8e8e6', borderRadius: 8, marginBottom: 8, overflow: 'hidden' }}>
                <div onClick={() => toggleExpand(job.id)}
                  style={{ padding: '10px 16px', display: 'flex', alignItems: 'center', gap: 12, cursor: 'pointer', background: open ? '#fafafa' : '#fff' }}>
                  <span style={{ fontFamily: 'monospace', fontSize: 13, fontWeight: 800, color: '#0d0d0d', minWidth: 100 }}>{job.job_number}</span>
                  {job.season && <span style={{ fontSize: 10, fontWeight: 600, padding: '2px 7px', borderRadius: 4, background: '#eff6ff', color: '#3b82f6' }}>{job.season}</span>}
                  <span style={{ fontSize: 11, color: '#9ca3af' }}>{ords.length} order{ords.length !== 1 ? 's' : ''}</span>
                  {totalQty > 0 && <span style={{ fontSize: 11, fontWeight: 600, color: '#0d0d0d' }}>{totalQty.toLocaleString()} pcs</span>}
                  {totalVal > 0 && <span style={{ fontSize: 11, fontWeight: 700, color: '#16a34a' }}>${totalVal.toLocaleString(undefined, { maximumFractionDigits: 0 })}</span>}
                  {earliest && <span style={{ fontSize: 11, color: overdue ? '#dc2626' : '#6b7280', marginLeft: 'auto' }}>Ship: {fmtDate(earliest)}{overdue ? ' ▲' : ''}</span>}
                  <span style={{ fontSize: 11, color: '#9ca3af' }}>{open ? '▲' : '▼'}</span>
                </div>
                {open && ords.length > 0 && (
                  <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead>
                      <tr style={{ background: '#f9fafb' }}>
                        {['Style', 'Buyer', 'PO #', 'Season', 'Qty', 'Value', 'Ship Date', 'Status'].map(h => (
                          <th key={h} style={{ fontSize: 10, fontWeight: 600, color: '#9ca3af', padding: '6px 12px', textAlign: 'left', textTransform: 'uppercase', letterSpacing: '0.5px', borderTop: '1px solid #f0f0ee' }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {ords.map(o => (
                        <tr key={o.id} onClick={() => onEditOrder(o)} style={{ cursor: 'pointer' }}
                          onMouseEnter={e => e.currentTarget.style.background = '#fafafa'}
                          onMouseLeave={e => e.currentTarget.style.background = ''}>
                          <td style={{ padding: '7px 12px', borderTop: '1px solid #f0f0ee', fontSize: 12, fontWeight: 700 }}>{o.style_number}</td>
                          <td style={{ padding: '7px 12px', borderTop: '1px solid #f0f0ee', fontSize: 12 }}>{o.buyer_name}</td>
                          <td style={{ padding: '7px 12px', borderTop: '1px solid #f0f0ee', fontSize: 11, fontFamily: 'monospace', color: '#6b7280' }}>{o.po_number || '—'}</td>
                          <td style={{ padding: '7px 12px', borderTop: '1px solid #f0f0ee', fontSize: 11 }}>{o.season || '—'}</td>
                          <td style={{ padding: '7px 12px', borderTop: '1px solid #f0f0ee', fontSize: 11, fontFamily: 'monospace', fontWeight: 600 }}>{o.total_qty?.toLocaleString() || '—'}</td>
                          <td style={{ padding: '7px 12px', borderTop: '1px solid #f0f0ee', fontSize: 11, fontWeight: 700 }}>{o.total_value_usd ? `$${parseFloat(o.total_value_usd).toLocaleString(undefined, { maximumFractionDigits: 0 })}` : '—'}</td>
                          <td style={{ padding: '7px 12px', borderTop: '1px solid #f0f0ee', fontSize: 11, color: o.ship_date && new Date(o.ship_date) < new Date() ? '#dc2626' : '#6b7280' }}>{fmtDate(o.ship_date)}</td>
                          <td style={{ padding: '7px 12px', borderTop: '1px solid #f0f0ee' }}>
                            <span style={{ fontSize: 10, fontWeight: 600, padding: '2px 7px', borderRadius: 4, background: statusBg[o.status] || statusBg.Draft, color: statusColor[o.status] || statusColor.Draft }}>{o.status}</span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            )
          })}

          {unassigned.length > 0 && (
            <div style={{ background: '#fafaf8', border: '1px dashed #e5e7eb', borderRadius: 8, padding: 16, marginTop: 16 }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 10 }}>
                Unassigned ({unassigned.length})
              </div>
              {unassigned.map(o => (
                <div key={o.id} onClick={() => onEditOrder(o)} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '6px 0', borderBottom: '1px solid #f0f0ee', cursor: 'pointer' }}>
                  <span style={{ fontSize: 12, fontWeight: 700, minWidth: 100 }}>{o.style_number}</span>
                  <span style={{ fontSize: 12, color: '#6b7280' }}>{o.buyer_name}</span>
                  <span style={{ fontSize: 11, color: '#9ca3af', marginLeft: 'auto' }}>{fmtDate(o.ship_date)}</span>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  )
}

// ── Main Orders Page ──────────────────────────────────────────────────────────
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
  const [showAssignJob, setShowAssignJob] = useState(false)
  const [showPrint, setShowPrint] = useState(false)

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

  const today  = new Date()
  const in21   = new Date(today); in21.setDate(today.getDate() + 21)
  const weekEnd = new Date(today); weekEnd.setDate(today.getDate() + 7)
  const monEnd  = new Date(today.getFullYear(), today.getMonth() + 1, 0)

  const allSeasons = [...new Set(orders.map(o => o.season).filter(Boolean))].sort()
  const active     = orders.filter(o => o.status !== 'Cancelled')

  const filtered = orders.filter(o => {
    const q = search.toLowerCase()
    const matchSearch = !q || [o.style_number, o.buyer_name, o.po_number, o.job_number, o.description].some(f => f?.toLowerCase().includes(q))
    const matchBuyer  = !filterBuyer  || o.buyer_name === filterBuyer
    const matchStatus = !filterStatus || o.status === filterStatus
    const matchSeason = !filterSeason || o.season === filterSeason
    return matchSearch && matchBuyer && matchStatus && matchSeason
  })

  const dueThisMonth = active.filter(o => o.ship_date && new Date(o.ship_date) <= monEnd)
  const dueThisWeek  = active.filter(o => o.ship_date && new Date(o.ship_date) <= weekEnd)
  const totalQty     = filtered.reduce((s, o) => s + (o.total_qty || 0), 0)
  const totalValue   = filtered.reduce((s, o) => s + (parseFloat(o.total_value_usd) || 0), 0)

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

  const selectedOrderObjs = [...selected].map(id => orders.find(o => o.id === id)).filter(Boolean)

  const tabStyle = (t) => ({
    display: 'flex', alignItems: 'center', gap: 7, padding: '13px 4px', marginRight: 24,
    fontSize: 13, fontWeight: 500, cursor: 'pointer',
    color: tab === t ? '#0d0d0d' : '#9ca3af',
    borderBottom: `2px solid ${tab === t ? '#0d0d0d' : 'transparent'}`,
    background: 'none', border: 'none', borderBottomWidth: 2, borderBottomStyle: 'solid',
    borderBottomColor: tab === t ? '#0d0d0d' : 'transparent',
    transition: 'color 0.1s', fontFamily: 'var(--font)',
  })

  const selStyle = {
    height: 32, border: '1px solid var(--border)', borderRadius: 7, fontSize: 12,
    padding: '0 10px', background: '#fff', cursor: 'pointer', fontFamily: 'var(--font)', color: 'var(--text)', minWidth: 110,
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
        <div style={{ display: 'flex', gap: 8 }}>
          {[
            { label: 'Total Orders',   value: active.length },
            { label: 'Due This Month', value: dueThisMonth.length, amber: dueThisMonth.length > 0 },
            { label: 'Due This Week',  value: dueThisWeek.length,  amber: dueThisWeek.length > 0 },
          ].map(kpi => (
            <div key={kpi.label} style={{ padding: '6px 12px', border: '1px solid var(--border)', borderRadius: 8, background: '#fff', minWidth: 100 }}>
              <div style={{ fontSize: 9, fontWeight: 600, color: 'var(--text-light)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 2 }}>{kpi.label}</div>
              <div style={{ fontSize: 18, fontWeight: 800, letterSpacing: '-0.5px', lineHeight: 1, color: kpi.amber ? '#d97706' : '#0d0d0d' }}>{kpi.value}</div>
            </div>
          ))}
        </div>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
          <button className="btn btn-secondary" style={{ display: 'flex', alignItems: 'center', gap: 6 }}
            onClick={() => setShowPrint(true)}
            disabled={selected.size === 0}
            title={selected.size === 0 ? 'Select orders to print' : `Print ${selected.size} order${selected.size>1?'s':''}`}>
            <Printer size={13} /> Print{selected.size > 0 ? ` (${selected.size})` : ''}
          </button>
          <button className="btn btn-primary" onClick={openNew}>+ New Order</button>
        </div>
      </div>

      {tab === 'orders' && (
        <>
          {/* Toolbar */}
          <div style={{ padding: '8px 24px', borderBottom: '1px solid #f3f4f6', display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
            <div style={{ position: 'relative', width: 300 }}>
              <Search size={13} style={{ position: 'absolute', left: 9, top: '50%', transform: 'translateY(-50%)', color: '#9ca3af' }} />
              <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search job, style, buyer..."
                style={{ width: '100%', paddingLeft: 28, paddingRight: 10, height: 32, border: '1px solid var(--border)', borderRadius: 7, fontSize: 12, fontFamily: 'var(--font)', outline: 'none', background: '#fafafa' }} />
            </div>
            <select value={filterBuyer}  onChange={e => setFilterBuyer(e.target.value)}  style={selStyle}>
              <option value="">All Buyers</option>
              {buyers.map(b => <option key={b.id} value={b.name}>{b.name}</option>)}
            </select>
            <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)} style={selStyle}>
              <option value="">Status: All</option>
              <option>Draft</option><option>Confirmed</option><option>Cancelled</option>
            </select>
            <select value={filterSeason} onChange={e => setFilterSeason(e.target.value)} style={selStyle}>
              <option value="">Season: All</option>
              {allSeasons.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>

          {/* Bulk bar */}
          {selected.size > 0 && (
            <div style={{ padding: '7px 24px', background: '#eff6ff', borderBottom: '1px solid #dbeafe', display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
              <span style={{ fontSize: 12, color: '#2563eb', fontWeight: 600 }}>{selected.size} selected</span>
              <button className="btn btn-sm" style={{ background: '#0d0d0d', color: '#fff' }} onClick={() => setShowAssignJob(true)}>Assign to Job</button>
              <button className="btn btn-sm btn-danger" onClick={deleteSelected}>Delete</button>
              <button className="btn btn-sm btn-secondary" onClick={() => setSelected(new Set())}><X size={11} /> Clear</button>
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
                  {search || filterBuyer || filterStatus ? 'No orders match your filters.' : 'No orders yet.'}
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
                    {['', 'Job / Status', 'Buyer', 'PO #', 'Style / Desc', 'Season', 'Qty', 'Value (USD)', 'Ship Date', 'Merch.'].map(h => (
                      <th key={h} style={{ fontSize: 10, fontWeight: 600, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.5px', padding: '9px 12px', textAlign: 'left', borderBottom: '1px solid #f3f4f6', whiteSpace: 'nowrap' }}>{h}</th>
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
                        <td style={{ padding: '9px 8px', borderBottom: '1px solid #f9fafb' }} onClick={() => openEdit(o)}>
                          {o.style_image_base64 ? (
                            <img src={o.style_image_base64} alt="" style={{ width: 32, height: 32, objectFit: 'cover', borderRadius: 5, border: '1px solid #e5e7eb', display: 'block' }} />
                          ) : (
                            <div style={{ width: 32, height: 32, background: '#f3f4f6', borderRadius: 5, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                              <Layers size={13} color="#9ca3af" />
                            </div>
                          )}
                        </td>
                        <td style={{ padding: '9px 12px', borderBottom: '1px solid #f9fafb' }} onClick={() => openEdit(o)}>
                          <div style={{ fontFamily: 'monospace', fontWeight: 700, fontSize: 12, color: '#0d0d0d' }}>{o.job_number || '—'}</div>
                          <span style={{ background: statusBg[o.status] || statusBg.Draft, color: statusColor[o.status] || statusColor.Draft, fontSize: 10, fontWeight: 600, padding: '1px 7px', borderRadius: 4, display: 'inline-flex', marginTop: 3 }}>{o.status}</span>
                        </td>
                        <td style={{ padding: '9px 12px', borderBottom: '1px solid #f9fafb', fontSize: 12, fontWeight: 600, whiteSpace: 'nowrap' }} onClick={() => openEdit(o)}>{o.buyer_name}</td>
                        <td style={{ padding: '9px 12px', borderBottom: '1px solid #f9fafb', fontSize: 11, color: '#6b7280', fontFamily: 'monospace' }} onClick={() => openEdit(o)}>{o.po_number || '—'}</td>
                        <td style={{ padding: '9px 12px', borderBottom: '1px solid #f9fafb', maxWidth: 200 }} onClick={() => openEdit(o)}>
                          <div style={{ fontSize: 12, fontWeight: 600 }}>{o.style_number}</div>
                          {o.description && <div style={{ fontSize: 11, color: '#6b7280', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{o.description}</div>}
                        </td>
                        <td style={{ padding: '9px 12px', borderBottom: '1px solid #f9fafb' }} onClick={() => openEdit(o)}>
                          {o.season && <span style={{ background: '#eff6ff', color: '#3b82f6', fontSize: 10, fontWeight: 600, padding: '2px 7px', borderRadius: 4 }}>{o.season}</span>}
                        </td>
                        <td style={{ padding: '9px 12px', borderBottom: '1px solid #f9fafb', fontFamily: 'monospace', fontSize: 12, fontWeight: 600 }} onClick={() => openEdit(o)}>{o.total_qty?.toLocaleString() || '—'}</td>
                        <td style={{ padding: '9px 12px', borderBottom: '1px solid #f9fafb', fontSize: 12, fontWeight: 700 }} onClick={() => openEdit(o)}>{o.total_value_usd ? `$${parseFloat(o.total_value_usd).toLocaleString(undefined, { maximumFractionDigits: 0 })}` : '—'}</td>
                        <td style={{ padding: '9px 12px', borderBottom: '1px solid #f9fafb', fontSize: 11, color: dateColor(o.ship_date), fontWeight: isOverdue ? 700 : 400, whiteSpace: 'nowrap' }} onClick={() => openEdit(o)}>
                          {fmtDate(o.ship_date)}{isOverdue ? ' ▲' : ''}
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

          {/* Footer */}
          <div style={{ padding: '8px 24px', borderTop: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: '#fff', flexShrink: 0 }}>
            <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-light)', textTransform: 'uppercase', letterSpacing: '0.4px' }}>
              {filtered.length} orders
            </span>
            <div style={{ display: 'flex', gap: 20, alignItems: 'center' }}>
              {totalValue > 0 && <span style={{ fontSize: 12, color: '#6b7280' }}>Value: <strong style={{ color: '#16a34a' }}>${totalValue.toLocaleString(undefined, { maximumFractionDigits: 0 })}</strong></span>}
              {totalQty > 0   && <span style={{ fontSize: 12, color: '#6b7280' }}>Qty: <strong>{totalQty.toLocaleString()}</strong></span>}
            </div>
          </div>
        </>
      )}

      {tab === 'jobs' && <JobsTab onEditOrder={openEdit} />}

      {wizardOpen     && <OrderWizard order={editOrder} onClose={closeWizard} />}
      {showAssignJob  && (
        <AssignJobModal
          selectedOrders={selectedOrderObjs}
          onClose={() => setShowAssignJob(false)}
          onDone={() => { setShowAssignJob(false); setSelected(new Set()); loadOrders() }}
        />
      )}
      {showPrint && (
        <PrintPopup
          selectedOrders={selectedOrderObjs}
          onClose={() => setShowPrint(false)}
        />
      )}
    </div>
  )
}
