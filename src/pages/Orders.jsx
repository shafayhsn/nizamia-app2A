import React, { useState, useEffect, useRef } from 'react'
import { supabase } from '../lib/supabase'
import OrderWizard from '../components/wizard/OrderWizard'
import PrintPopup, { printHTML } from '../components/PrintReports'
import { Search, Printer, Layers, Plus, X, Check, AlertCircle, Copy, Upload, Download } from 'lucide-react'
import { generateJobNumber } from '../lib/utils'
import { useAppDialogs } from '../components/ui/AppDialogs'
import { getPageTabNoticeMap, markTabSeen, markTabUpdated } from '../lib/tabNotices'

const LOGO_SRC = ''

const statusColor = { Draft: '#F59E0B', Active: '#10B981', Booked: '#3B82F6', Shipped: '#8B5CF6', Cancelled: '#9CA3AF', Confirmed: '#10B981' }
const statusBg    = { Draft: '#FFF7ED', Active: '#ECFDF5', Booked: '#EFF6FF', Shipped: '#F5F3FF', Cancelled: '#F3F4F6', Confirmed: '#ECFDF5' }

function fmtDate(d) {
  if (!d) return '—'
  return new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
}

function queueRef(q) {
  return q?.q_number || q?.id || q?.label || null
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
    supabase.from('jobs').select('id,job_number,buyer_id').order('created_at', { ascending: false })
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
      supabase.from('jobs').select('id,job_number,buyer_id,buyer_name,created_at').order('created_at', { ascending: false }),
      supabase.from('orders').select('id,job_id,job_number,buyer_name,style_number,po_number,ship_date,status,total_qty,total_value_usd,factory_ref,brand_name,merchandiser_name,description').order('ship_date'),
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
                        {['Style', 'Buyer', 'Brand', 'PO #', 'Factory Ref', 'Qty', 'Value', 'Ship Date', 'Status'].map(h => (
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
                          <td style={{ padding: '7px 12px', borderTop: '1px solid #f0f0ee', fontSize: 10, color: '#7c3aed', fontWeight: 600 }}>{o.brand_name || '—'}</td>
                          <td style={{ padding: '7px 12px', borderTop: '1px solid #f0f0ee', fontSize: 11, fontFamily: 'monospace', color: '#6b7280' }}>{o.factory_ref || '—'}</td>
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

// ── Change Status Modal ──────────────────────────────────────────────────────
const STATUS_OPTIONS = [
  { value: 'Draft',     color: '#F59E0B', bg: '#FFF7ED' },
  { value: 'Active',    color: '#10B981', bg: '#ECFDF5' },
  { value: 'Booked',    color: '#3B82F6', bg: '#EFF6FF' },
  { value: 'Shipped',   color: '#8B5CF6', bg: '#F5F3FF' },
  { value: 'Cancelled', color: '#9CA3AF', bg: '#F3F4F6' },
]


function ChangeStatusModal({ selectedOrders, onClose, onDone }) {
  const [status, setStatus] = useState(() => {
    if (selectedOrders.length === 1) return selectedOrders[0]?.status || ''
    const vals = [...new Set(selectedOrders.map(o => o.status).filter(Boolean))]
    return vals.length === 1 ? vals[0] : ''
  })
  const [saving, setSaving] = useState(false)
  const [errorMsg, setErrorMsg] = useState('')

  const handleApply = async () => {
    if (!status || !selectedOrders.length) return
    setSaving(true)
    setErrorMsg('')
    const ids = selectedOrders.map(o => o.id).filter(Boolean)
    const updated = []
    for (const id of ids) {
      const { data, error } = await supabase
        .from('orders')
        .update({ status })
        .eq('id', id)
        .select('id,status')
        .single()
      if (error) {
        setSaving(false)
        setErrorMsg(error.message || 'Could not update order status.')
        return
      }
      updated.push(data)
    }
    setSaving(false)
    onDone(status, ids, updated)
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 300, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ background: '#fff', borderRadius: 10, padding: 24, width: 360, boxShadow: '0 16px 48px rgba(0,0,0,0.2)' }}>
        <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 4 }}>Change Status</div>
        <div style={{ fontSize: 12, color: '#6b7280', marginBottom: 16 }}>{selectedOrders.length} order{selectedOrders.length > 1 ? 's' : ''} selected</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 20 }}>
          {STATUS_OPTIONS.map(opt => (
            <div key={opt.value} onClick={() => setStatus(opt.value)}
              style={{ padding: '9px 14px', borderRadius: 7, border: `1px solid ${status === opt.value ? opt.color : '#e5e7eb'}`, background: status === opt.value ? opt.bg : '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 10, justifyContent:'space-between' }}>
              <div style={{ display:'flex', alignItems:'center', gap:10 }}>
                <div style={{ width: 10, height: 10, borderRadius: '50%', background: opt.color }} />
                <span style={{ fontSize: 13, fontWeight: 600, color: status === opt.value ? opt.color : '#374151' }}>{opt.value}</span>
              </div>
              {status === opt.value && <Check size={14} color={opt.color} />}
            </div>
          ))}
        </div>
        {errorMsg && <div style={{ fontSize: 12, color: '#dc2626', marginBottom: 12 }}>{errorMsg}</div>}
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button className="btn btn-secondary" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" onClick={handleApply} disabled={saving || !status}>{saving ? 'Updating...' : 'Apply'}</button>
        </div>
      </div>
    </div>
  )
}

// ── Queues Tab ────────────────────────────────────────────────────────────────
function QueuesTab({ onEditOrder }) {
  const [queues, setQueues] = useState([])
  const [orders, setOrders] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [filterRule, setFilterRule] = useState('')
  const [selectedIds, setSelectedIds] = useState(new Set())
  const [poItems, setPoItems] = useState([])
  const [poHeaders, setPoHeaders] = useState([])
  const [shipmentLines, setShipmentLines] = useState([])
  const [showPrintModal, setShowPrintModal] = useState(false)
  const [showExportMenu, setShowExportMenu] = useState(false)

  useEffect(() => { loadAll() }, [])

  async function loadAll() {
    setLoading(true)
    const [{ data: qs }, { data: ors }, { data: pos }, { data: poi }, { data: sl }] = await Promise.all([
      supabase.from('order_queues').select('*').order('created_at', { ascending: true }),
      supabase.from('orders').select('id,style_number,buyer_name,job_number,brand_name,queue_split_rule,description,store_name,ship_date,po_number,total_qty,excess_cutting_pct').order('ship_date'),
      supabase.from('purchase_orders').select('id,order_id,status'),
      supabase.from('purchase_order_items').select('po_id,specification'),
      supabase.from('shipment_lines').select('queue_id,shipped_qty'),
    ])
    setQueues(qs || [])
    setOrders(ors || [])
    setPoHeaders(pos || [])
    setPoItems(poi || [])
    setShipmentLines(sl || [])
    setLoading(false)
  }

  const orderMap = Object.fromEntries((orders || []).map(o => [o.id, o]))
  const shippedByQ = {}
  ;(shipmentLines || []).forEach(l => { shippedByQ[l.queue_id] = (shippedByQ[l.queue_id] || 0) + (parseFloat(l.shipped_qty) || 0) })

  const baseFiltered = queues.filter(q => {
    const o = orderMap[q.order_id] || {}
    const matchSearch = !search || [q.q_number, q.label, o.style_number, o.buyer_name, o.job_number].some(f => String(f || '').toLowerCase().includes(search.toLowerCase()))
    const matchRule = !filterRule || q.split_rule === filterRule
    return matchSearch && matchRule
  })

  const filtered = [...baseFiltered].map(q => ({ ...q, shipped_qty: shippedByQ[q.id] || 0, balance_qty: Math.max(0, (parseFloat(q.qty) || 0) - (shippedByQ[q.id] || 0)) })).sort((a, b) => {
    const aActive = !!String(a.q_number || '').trim()
    const bActive = !!String(b.q_number || '').trim()
    if (aActive !== bActive) return aActive ? -1 : 1
    const an = parseInt(String(a.q_number || '').replace(/\D/g, '')) || 999999
    const bn = parseInt(String(b.q_number || '').replace(/\D/g, '')) || 999999
    if (an !== bn) return an - bn
    return String(a.label || '').localeCompare(String(b.label || ''))
  })

  const ruleColor = {
    'By Colour':            { bg: '#eff6ff', color: '#2563eb' },
    'By Size Group':        { bg: '#f5f3ff', color: '#7c3aed' },
    'Colour × Size Group':  { bg: '#ecfeff', color: '#0891b2' },
    'By Ratio':             { bg: '#fef3c7', color: '#b45309' },
    'Custom':               { bg: '#fafaf8', color: '#6b7280' },
  }

  const statusColor = { Queued: '#9ca3af', Pending: '#d97706', 'In Progress': '#2563eb', 'Partially Shipped': '#0891b2', Completed: '#16a34a' }
  const statusBg    = { Queued: '#f3f4f6', Pending: '#fff7ed', 'In Progress': '#eff6ff', 'Partially Shipped': '#ecfeff', Completed: '#f0fdf4' }
  const allRules = [...new Set(queues.map(q => q.split_rule))].filter(Boolean)

  const orderQueueMap = {}
  ;(queues || []).forEach(q => {
    if (!orderQueueMap[q.order_id]) orderQueueMap[q.order_id] = []
    orderQueueMap[q.order_id].push(q)
  })

  const lockedOrders = {}
  ;(poHeaders || []).forEach(po => {
    const ordQueues = orderQueueMap[po.order_id] || []
    if (!ordQueues.length) return
    const qNos = ordQueues.map(q => q.q_number).filter(Boolean)
    if (!qNos.length) return
    const itemsForPo = (poItems || []).filter(i => i.po_id === po.id)
    const used = itemsForPo.some(i => qNos.some(qn => String(i.specification || '').includes(`[${qn}]`)))
    if (used) lockedOrders[po.order_id] = true
  })

  const selectedQueues = [...selectedIds].map(id => filtered.find(x => x.id === id) || queues.find(x => x.id === id)).filter(Boolean)
  const selectedQueuedOnly = selectedQueues.filter(q => !String(q.q_number || '').trim())
  const selectedOrderIds = [...new Set(selectedQueues.map(q => q.order_id).filter(Boolean))]
  const anySelectedLocked = selectedOrderIds.some(id => lockedOrders[id])

  function toggleSelect(id) {
    setSelectedIds(prev => {
      const s = new Set(prev)
      if (s.has(id)) s.delete(id)
      else s.add(id)
      return s
    })
  }

  function toggleAllVisible() {
    const visibleIds = filtered.map(q => q.id)
    const allSelected = visibleIds.length > 0 && visibleIds.every(id => selectedIds.has(id))
    if (allSelected) setSelectedIds(new Set())
    else setSelectedIds(new Set(visibleIds))
  }

  async function handleActivateQueues() {
    if (!selectedQueuedOnly.length) return
    const { data: existing } = await supabase.from('order_queues').select('q_number').not('q_number', 'is', null)
    let maxQ = Math.max(0, ...((existing || []).map(r => parseInt(String(r.q_number || '').replace(/\D/g, ''))).filter(n => Number.isFinite(n))))
    const targets = [...selectedQueuedOnly].sort((a,b) => String(a.label || '').localeCompare(String(b.label || '')))
    for (const q of targets) {
      maxQ += 1
      const nextQ = `Q${maxQ}`
      const { error } = await supabase.from('order_queues').update({ q_number: nextQ, status: q.status === 'Queued' ? 'Pending' : q.status }).eq('id', q.id)
      if (error) { window.alert(error.message || 'Could not activate queues.'); return }
    }
    await loadAll()
  }

  async function handleRollbackOrderQueues() {
    if (!selectedOrderIds.length) return
    const label = selectedOrderIds.length === 1 ? 'this order' : `${selectedOrderIds.length} orders`
    const proceed = window.confirm(`Reset queue configuration for ${label}? This will remove all generated Qs for the selected order(s).`)
    if (!proceed) return
    if (anySelectedLocked) {
      const pw = window.prompt('Some selected orders have Qs already used in a Purchase Order. Admin password required to reset queues:')
      if (pw !== 'admin') {
        window.alert('Incorrect admin password. Queue reset cancelled.')
        return
      }
    }
    for (const orderId of selectedOrderIds) {
      const { error: delErr } = await supabase.from('order_queues').delete().eq('order_id', orderId)
      if (delErr) { window.alert(delErr.message || 'Queue reset failed.'); return }
      await supabase.from('orders').update({ queue_split_rule: 'None' }).eq('id', orderId)
    }
    setSelectedIds(new Set())
    await loadAll()
  }

  const esc = (v) => String(v ?? '—').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

  async function fetchQDocData(q) {
    const safeQuery = async (queryPromise, fallback) => {
      try {
        const { data, error } = await queryPromise
        if (error) return fallback
        return data ?? fallback
      } catch (e) {
        return fallback
      }
    }

    const ord = orderMap[q.order_id] || {}
    const [bom, washing, embellishments, finishing, packs, sgs, fitBlocks, pos, poi, libs, suppliers] = await Promise.all([
      safeQuery(supabase.from('bom_items').select('*').eq('order_id', q.order_id).order('sort_order'), []),
      safeQuery(supabase.from('washing').select('*').eq('order_id', q.order_id), []),
      safeQuery(supabase.from('embellishments').select('*').eq('order_id', q.order_id), []),
      safeQuery(supabase.from('finishing').select('*').eq('order_id', q.order_id).maybeSingle(), null),
      safeQuery(supabase.from('finishing_packs').select('*').eq('order_id', q.order_id).order('sort_order'), []),
      safeQuery(supabase.from('size_groups').select('id,group_name,sizes,base_size').eq('order_id', q.order_id).order('sort_order'), []),
      safeQuery(supabase.from('fitting_blocks').select('block_name,sort_order').eq('order_id', q.order_id).order('sort_order'), []),
      safeQuery(supabase.from('purchase_orders').select('id,po_number,status,created_at').eq('order_id', q.order_id).order('created_at', { ascending: false }), []),
      safeQuery(supabase.from('purchase_order_items').select('po_id,description,specification,source_type,source_id,sort_order').order('sort_order'), []),
      safeQuery(supabase.from('library_items').select('*'), []),
      safeQuery(supabase.from('suppliers').select('id,name'), []),
    ])

    const sgIds = (sgs || []).map(x => x.id)
    let colors = [], bd = []
    if (sgIds.length) {
      const [c, b] = await Promise.all([
        safeQuery(supabase.from('size_group_colors').select('id,size_group_id,color_name,sort_order').in('size_group_id', sgIds), []),
        safeQuery(supabase.from('size_group_breakdown').select('size_group_id,color_id,size,qty').in('size_group_id', sgIds), []),
      ])
      colors = c || []
      bd = b || []
    }

    const sgMap = Object.fromEntries((sgs || []).map(g => [g.id, g]))
    const groupName = q.size_group_id ? (sgMap[q.size_group_id]?.group_name || null) : null
    const fitName = (fitBlocks && fitBlocks[0]?.block_name) || '—'
    const qSgs = q.size_group_id ? (sgs || []).filter(g => g.id === q.size_group_id) : (sgs || [])

    const sizeMap = {}
    qSgs.forEach(g => {
      const relColors = colors.filter(c => c.size_group_id === g.id).filter(c => !q.color_name || c.color_name === q.color_name)
      relColors.forEach(c => {
        ;(g.sizes || []).forEach(sz => {
          const row = bd.find(b => b.size_group_id === g.id && b.color_id === c.id && b.size === sz)
          const qty = parseFloat(row?.qty) || 0
          if (qty > 0) sizeMap[sz] = (sizeMap[sz] || 0) + qty
        })
      })
    })

    const sizeOrder = qSgs.length ? (qSgs[0].sizes || Object.keys(sizeMap)) : Object.keys(sizeMap)
    const ratioVals = sizeOrder.map(sz => parseFloat(sizeMap[sz]) || 0)
    const positive = ratioVals.filter(v => v > 0)
    const gcd = (a, b) => b ? gcd(b, a % b) : a
    const ratioBase = positive.length ? positive.map(v => Math.round(v)).reduce((a, b) => gcd(a, b)) : 0
    const ratioMap = {}
    sizeOrder.forEach(sz => {
      const val = parseFloat(sizeMap[sz]) || 0
      ratioMap[sz] = ratioBase && val ? Math.round(val / ratioBase) : 0
    })

    const wastageFactor = (x) => 1 + ((parseFloat(x) || 0) / 100)
    const totalQty = parseFloat(ord.total_qty) || 0
    const queueQty = parseFloat(q.qty) || 0
    const ratio = totalQty > 0 ? queueQty / totalQty : 0
    
    const normalizeUD = (ud) => {
      if (!ud) return {}
      if (typeof ud === 'string') {
        try { return JSON.parse(ud) } catch (e) { return {} }
      }
      return ud
    }

    const numVal = (v) => {
      if (v == null) return 0
      if (typeof v === 'number') return Number.isFinite(v) ? v : 0
      if (typeof v === 'string') return parseFloat(v) || 0
      if (typeof v === 'object') {
        return parseFloat(
          v.consumption ?? v.consump ?? v.qty ?? v.value ?? v.base_qty ?? v.required ?? 0
        ) || 0
      }
      return 0
    }

    const norm = (v) => String(v ?? '').trim().toLowerCase()

    const selectedSizes = Object.keys(sizeMap || {}).filter(sz => (parseFloat(sizeMap[sz]) || 0) > 0)

    function getSelectedConsumption(item) {
      const rule = item.usage_rule || 'Generic'
      const ud = normalizeUD(item.usage_data)
      const base = parseFloat(item.base_qty) || 0

      if (rule === 'Generic') return { mode:'single', value: base }

      if (rule === 'By Color' || rule === 'By Colour') {
        if (Array.isArray(ud)) {
          const hit = ud.find(x => norm(x.color || x.color_name || x.name || x.key) === norm(q.color_name))
          const val = numVal(hit)
          return { mode:'single', value: val || base }
        }
        const direct = ud[q.color_name]
        const val = numVal(direct)
        return { mode:'single', value: val || base }
      }

      if (rule === 'By Size Group') {
        if (Array.isArray(ud)) {
          const hit = ud.find(x => norm(x.group || x.group_name || x.size_group || x.name || x.key) === norm(groupName))
          const val = numVal(hit)
          return { mode:'single', value: val || base }
        }
        const direct = ud[groupName]
        const val = numVal(direct)
        return { mode:'single', value: val || base }
      }

      if (rule === 'By Individual Sizes') {
        const perSize = {}
        if (Array.isArray(ud)) {
          ud.forEach(x => {
            const key = x.size || x.size_name || x.label || x.key
            if (key != null) perSize[String(key)] = numVal(x)
          })
        } else {
          Object.entries(ud || {}).forEach(([k,v]) => {
            if (!String(k).startsWith('_')) perSize[String(k)] = numVal(v)
          })
        }
        return { mode:'perSize', values: perSize }
      }

      if (rule === 'By Batch') {
        const rows = Array.isArray(ud?.batches) ? ud.batches : (Array.isArray(ud) ? ud : [])
        return { mode:'batches', rows }
      }

      if (rule === 'Configure Own') {
        const rows = Array.isArray(ud?.rows) ? ud.rows : (Array.isArray(ud?.items) ? ud.items : (Array.isArray(ud) ? ud : []))
        if (rows.length) return { mode:'rows', rows }
      }

      return { mode:'single', value: base }
    }

    function calcBomQty(item) {
      const wf = wastageFactor(item.wastage)
      const base = parseFloat(item.base_qty) || 0
      const selected = getSelectedConsumption(item)

      if (selected.mode === 'single') {
        return (selected.value || base) * queueQty * wf
      }

      if (selected.mode === 'perSize') {
        const total = selectedSizes.reduce((sum, sz) => {
          const perPiece = parseFloat(selected.values?.[sz]) || 0
          const qty = parseFloat(sizeMap?.[sz]) || 0
          return sum + (perPiece * qty * wf)
        }, 0)
        return total
      }

      if (selected.mode === 'batches' || selected.mode === 'rows') {
        const rows = selected.rows || []
        const total = rows.reduce((sum, row) => {
          const rowCons = numVal(row)
          const rowColor = row.color || row.color_name || row.colour || null
          if (rowColor && norm(rowColor) !== norm(q.color_name)) return sum

          const rowSizesRaw = row.sizes || row.size_group || row.size || row.size_name || row.selectedSizes || []
          const rowSizes = Array.isArray(rowSizesRaw) ? rowSizesRaw.map(String) : String(rowSizesRaw || '').split(',').map(s => s.trim()).filter(Boolean)
          const matchedSizes = rowSizes.length ? rowSizes.filter(sz => selectedSizes.includes(String(sz))) : selectedSizes

          const matchedQty = matchedSizes.reduce((s, sz) => s + (parseFloat(sizeMap?.[sz]) || 0), 0)
          return sum + (rowCons * matchedQty * wf)
        }, 0)
        return total || (base * queueQty * wf)
      }

      return base * queueQty * wf || (parseFloat(item.final_qty) || 0) * ratio
    }

    function getDisplayConsumption(item) {
      const base = parseFloat(item.base_qty) || 0
      const selected = getSelectedConsumption(item)

      if (selected.mode === 'single') return selected.value || base

      if (selected.mode === 'perSize') {
        const vals = selectedSizes.map(sz => parseFloat(selected.values?.[sz]) || 0).filter(v => v > 0)
        const uniq = [...new Set(vals.map(v => Number(v.toFixed(4))))]
        if (uniq.length === 1) return uniq[0]
        return vals.length ? uniq[0] : base
      }

      if (selected.mode === 'batches' || selected.mode === 'rows') {
        const rows = selected.rows || []
        const vals = rows.flatMap(row => {
          const rowColor = row.color || row.color_name || row.colour || null
          if (rowColor && norm(rowColor) !== norm(q.color_name)) return []
          const rowSizesRaw = row.sizes || row.size_group || row.size || row.size_name || row.selectedSizes || []
          const rowSizes = Array.isArray(rowSizesRaw) ? rowSizesRaw.map(String) : String(rowSizesRaw || '').split(',').map(s => s.trim()).filter(Boolean)
          const matched = rowSizes.length ? rowSizes.some(sz => selectedSizes.includes(String(sz))) : selectedSizes.length > 0
          return matched ? [numVal(row)] : []
        }).filter(v => v > 0)
        const uniq = [...new Set(vals.map(v => Number(v.toFixed(4))))]
        if (uniq.length === 1) return uniq[0]
        return vals.length ? uniq[0] : base
      }

      return base
    }


    const libMap = Object.fromEntries((libs || []).map(x => [x.id, x]))
    const fabricItems = (bom || []).filter(x => x.category === 'Fabric').map(x => {
      const lib = x.library_item_id ? libMap[x.library_item_id] : null
      const consump = getDisplayConsumption(x)
      return {
        ...x,
        q_qty: calcBomQty(x),
        shade: lib?.colour || lib?.color || x.specification || x.detail || '—',
        lib_colour: lib?.colour || lib?.color || '—',
        content: lib?.composition || x.detail || '—',
        weight: lib?.weight || lib?.gsm || '—',
        width: lib?.width_inches ? `${lib.width_inches}”` : (lib?.width ? `${lib.width}”` : '—'),
        consump: consump || 0,
      }
    })

    const poItemsBySource = {}
    ;(poi || []).forEach(item => {
      const k = `${item.source_type || ''}::${item.source_id || ''}`
      if (!poItemsBySource[k]) poItemsBySource[k] = []
      poItemsBySource[k].push(item)
    })

    const trimItems = (bom || []).filter(x => x.category !== 'Fabric').map(x => {
      let linkedItem = null
      const sourceLinked = (poi || []).find(it => String(it.source_type || '').toLowerCase() === 'queue' && String(it.source_id || '') === String(q.id))
      if (sourceLinked) linkedItem = sourceLinked
      if (!linkedItem) {
        const itemName = String(x.name || '').toLowerCase()
        linkedItem = (poi || []).find(it => String(it.description || '').toLowerCase().includes(itemName) && (String(it.specification || '').includes(q.q_number || '') || String(it.specification || '').includes(q.label || '')))
      }
      if (!linkedItem) {
        const itemName = String(x.name || '').toLowerCase()
        linkedItem = (poi || []).find(it => String(it.description || '').toLowerCase().includes(itemName))
      }
      const po = linkedItem ? (pos || []).find(p => p.id === linkedItem.po_id) : null
      const consump = getDisplayConsumption(x)
      return {
        ...x,
        q_qty: calcBomQty(x),
        shade: x.specification || x.detail || '—',
        consump: consump || 0,
        po_number: po?.po_number || '—',
        po_status: po?.status || '—',
      }
    })

    const stitchItems = trimItems.filter(x => String(x.category || '').toLowerCase().includes('stitch'))
    const packingItems = trimItems.filter(x => !String(x.category || '').toLowerCase().includes('stitch'))
    const washName = ((washing || []).find(w => !q.color_name || w.color_name === q.color_name)?.wash_type) || q.color_name || '—'
    const cuttingPct = Number.isFinite(parseFloat(ord.excess_cutting_pct)) ? parseFloat(ord.excess_cutting_pct) : 0
    const cuttingQty = sizeOrder.reduce((s, sz) => s + Math.round((parseFloat(sizeMap[sz]) || 0) * (1 + cuttingPct / 100)), 0)
    const embellishmentText = (embellishments || []).map(x => `${x.technique || 'Embellishment'} @${x.placement || '—'}`)
    const firstPack = (packs || [])[0] || {}
    const blisterEach = firstPack.pieces_per_inner_pack || firstPack.inner_pieces || '—'
    const cartonEach = firstPack.pcs_per_carton || '—'
    const blisterTotal = blisterEach && blisterEach !== '—' ? Math.ceil(queueQty / parseFloat(blisterEach || 1)) : '—'
    const cartonTotal = cartonEach && cartonEach !== '—' ? Math.ceil(queueQty / parseFloat(cartonEach || 1)) : '—'

    return {
      ord, q, groupName, fitName, washName, sizeMap, sizeOrder, ratioMap,
      fabricItems, trimItems, stitchItems, packingItems,
      embItems: embellishments, embellishmentText,
      packs: packs,
      cuttingQty, cuttingPct,
      blisterEach, blisterTotal, cartonEach, cartonTotal,
    }
  }

  function rowsHTML(rows, columns) {
    const head = columns.map(c => `<th style="${c.align==='right'?'text-align:right;':''}">${esc(c.label)}</th>`).join('')
    const body = rows.length ? rows.map(r => `<tr>${columns.map(c => `<td style="${c.align==='right'?'text-align:right;':''}">${esc(typeof c.render === 'function' ? c.render(r) : r[c.key])}</td>`).join('')}</tr>`).join('') : `<tr><td colspan="${columns.length}" class="muted">No data</td></tr>`
    return `<table><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table>`
  }

  function coverHTML(d) {
    const sizeCols = Object.keys(d.sizeMap || {})
    const sizeHead = sizeCols.map(sz => `<th class="center">${esc(sz)}</th>`).join('')
    const sizeVals = sizeCols.map(sz => `<td class="center">${esc(d.sizeMap[sz] || 0)}</td>`).join('')
    const stitch = d.trimItems.filter(x => String(x.category || '').toLowerCase().includes('stitch'))
    const finish = d.trimItems.filter(x => !String(x.category || '').toLowerCase().includes('stitch'))
    const fabric = d.fabricItems
    const packSummary = d.finishingPacks.map(p => `${p.pack_name || 'Pack'}: ${Math.ceil((parseFloat(d.q.qty)||0) / (parseFloat(p.pcs_per_carton)||1))} ctn`).join('<br/>') || '—'
    return `
    <div class="page">
      <div style="font-family:Arial,sans-serif;font-size:11px;color:#111">
        <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:8px">
          <div style="display:flex;align-items:center;gap:8px"><div style="font-weight:700">INTERNAL ORDER PLANNING</div></div>
          <div style="font-size:42px;font-weight:800;line-height:1">${esc(d.q.q_number || 'Queued')}</div>
        </div>
        <table style="margin-bottom:10px"><tbody>
          <tr><th>Customer</th><td>${esc(d.ord.buyer_name)}</td><th>Style Number</th><td>${esc(d.ord.style_number)}</td><th>PO#</th><td>${esc(d.ord.po_number)}</td><th>Job Number</th><td>${esc(d.ord.job_number)}</td></tr>
          <tr><th>Product Description</th><td>${esc(d.ord.description)}</td><th>Color / Wash</th><td>${esc(d.q.color_name || d.q.label)}</td><th>Store</th><td>${esc(d.ord.store_name)}</td><th>Ship Date</th><td>${esc(fmtDate(d.ord.ship_date))}</td></tr>
        </tbody></table>
        <div style="display:grid;grid-template-columns:1.2fr 1fr;gap:0;border:1px solid #333;border-bottom:none">
          <div>
            <div style="background:#4b5563;color:#fff;font-weight:700;padding:4px 8px">STITCHING ACCESSORIES (BEFORE WASH)</div>
            ${rowsHTML(stitch.slice(0,10), [{label:'Item', key:'name'},{label:'Shade/Code', render:r=>r.specification||'—'},{label:'Quality', render:r=>r.detail||'—'},{label:'Cons/PC', render:r=>parseFloat(r.base_qty)||0},{label:'Req Qty', render:r=>Math.ceil(r.q_qty||0), align:'right'}])}
          </div>
          <div>
            <div style="background:#4b5563;color:#fff;font-weight:700;padding:4px 8px">FABRICATION</div>
            ${rowsHTML(fabric.slice(0,8), [{label:'Code', render:r=>r.name},{label:'Cons', render:r=>parseFloat(r.base_qty)||0},{label:'Required', render:r=>Math.ceil(r.q_qty||0), align:'right'}])}
            <div style="background:#4b5563;color:#fff;font-weight:700;padding:4px 8px;margin-top:4px">ORDER / SHIP QUANTITY</div>
            <table><thead><tr><th>Inseam</th>${sizeHead}<th class="center">Total</th></tr></thead><tbody><tr><td>Pack</td>${sizeVals}<td class="center">${esc(d.q.qty)}</td></tr></tbody></table>
          </div>
        </div>
        <div style="display:grid;grid-template-columns:1.2fr 1fr;gap:0;border:1px solid #333;border-top:none">
          <div>
            <div style="background:#4b5563;color:#fff;font-weight:700;padding:4px 8px">FINISHING & PACKING ACCESSORIES (AFTER WASH)</div>
            ${rowsHTML(finish.slice(0,16), [{label:'Item', key:'name'},{label:'Shade/Code', render:r=>r.specification||'—'},{label:'Quality', render:r=>r.detail||'—'},{label:'Cons', render:r=>parseFloat(r.base_qty)||0},{label:'Req Qty', render:r=>Math.ceil(r.q_qty||0), align:'right'}])}
          </div>
          <div>
            <div style="background:#4b5563;color:#fff;font-weight:700;padding:4px 8px">CUTTING QTY</div>
            <table><thead><tr><th>Allowance</th><th class="right">Cut Qty</th></tr></thead><tbody><tr><td>${esc(d.cuttingPct)}%</td><td class="right">${esc(Math.ceil(d.cuttingQty))}</td></tr></tbody></table>
            <div style="background:#4b5563;color:#fff;font-weight:700;padding:4px 8px;margin-top:4px">TOTAL CARTONS AND BLISTERS REQUIRED</div>
            <div class="notes-box" style="min-height:180px">${packSummary}</div>
          </div>
        </div>
      </div>
    </div>`
  }


  function buildIOSHTML(d) {
    const qRef     = d.q.q_number || 'Queued'
    const sizeCols = (d.sizeOrder || []).filter(sz => (d.sizeMap[sz] || 0) > 0)

    // ── style shortcuts ──────────────────────────────────────────────────────
    const th  = 'border:1px solid #000;padding:2px 4px;font-size:9px;font-weight:700;text-align:center;vertical-align:middle;white-space:nowrap;'
    const td  = 'border:1px solid #000;padding:2px 4px;font-size:9px;vertical-align:middle;'
    const tdC = td + 'text-align:center;'
    const tdR = td + 'text-align:right;'
    const blk = 'background:#000;color:#fff;'

    // ── UOM short forms ──────────────────────────────────────────────────────
    const shortUom = (u) => {
      if (!u) return 'pcs'
      const s = String(u).toLowerCase()
      if (s.includes('yard') || s === 'yds') return 'yds'
      if (s.includes('meter') || s === 'm') return 'm'
      if (s.includes('roll')) return 'roll'
      if (s.includes('kg')) return 'kg'
      return u
    }

    // ── Fabric rows ──────────────────────────────────────────────────────────
    const fabricRows = (d.fabricItems || []).map(r => {
      const uom  = shortUom(r.unit)
      const cons = parseFloat(r.consump)
      const req  = r.q_qty ? Math.ceil(r.q_qty) : 0
      return `<tr>
        <td style="${td}">${esc(r.name || '—')}</td>
        <td style="${td}">${esc(r.shade || '—')}</td>
        <td style="${td}">${esc(r.content || '—')}</td>
        <td style="${tdC}">${esc(r.weight || '—')}</td>
        <td style="${tdC}">${esc(r.width || '—')}</td>
        <td style="${tdC}">${cons > 0 ? cons.toFixed(2) + ' ' + uom : '—'}</td>
        <td style="${tdR}">${req > 0 ? req.toLocaleString() + ' ' + uom : '—'}</td>
      </tr>`
    }).join('') || `<tr><td style="${tdC}" colspan="7">No fabric items</td></tr>`

    // ── Trim rows ────────────────────────────────────────────────────────────
    const trimRow = (r) => {
      const type = String(r.category || '').toLowerCase().includes('stitch') ? 'Stitching' : 'Packing'
      const uom  = shortUom(r.unit)
      const cons = parseFloat(r.consump) || 0
      const req  = r.q_qty ? Math.ceil(r.q_qty) : 0
      return `<tr>
        <td style="${td}">${esc(type)}</td>
        <td style="${td}">${esc(r.name || '—')}</td>
        <td style="${td}">${esc(r.shade || '—')}</td>
        <td style="${tdC}">${cons > 0 ? cons.toFixed(2) + ' ' + uom : '—'}</td>
        <td style="${tdR}">${req > 0 ? req.toLocaleString() + ' ' + uom : '—'}</td>
        <td style="${tdC}">${esc(r.po_number || '—')}</td>
        <td style="${tdC}">${esc(r.po_status || '—')}</td>
      </tr>`
    }
    const stitchRows  = (d.stitchItems  || []).map(trimRow).join('') || `<tr><td style="${tdC}" colspan="7">—</td></tr>`
    const packingRows = (d.packingItems || []).map(trimRow).join('')

    // grey divider row between stitching and packing
    const dividerRow = packingRows
      ? `<tr><td colspan="7" style="background:#d1d5db;height:2px;padding:0;border:1px solid #9ca3af;font-size:0;">&nbsp;</td></tr>`
      : ''

    // ── Embellishment ────────────────────────────────────────────────────────
    const embText = (d.embItems || []).length > 0
      ? (d.embItems).map(e => {
          const parts = [e.description, e.technique, e.placement ? '@' + e.placement : null].filter(Boolean)
          return esc(parts.join(' · '))
        }).join('<br/>')
      : '—'

    // ── Packing ──────────────────────────────────────────────────────────────
    const blisterEach  = d.blisterEach  !== '—' ? d.blisterEach  : '—'
    const blisterTotal = d.blisterTotal !== '—' ? d.blisterTotal : '—'
    const cartonEach   = d.cartonEach   !== '—' ? d.cartonEach   : '—'
    const cartonTotal  = d.cartonTotal  !== '—' ? d.cartonTotal  : '—'

    const nowStr = new Date().toLocaleString('en-GB', {
      day: '2-digit', month: '2-digit', year: '2-digit',
      hour: 'numeric', minute: '2-digit', hour12: true,
    }).replace(',', ' -')

    return `
      <div style="width:210mm;height:297mm;padding:5mm 7mm 4mm 7mm;font-family:Arial,sans-serif;color:#000;background:#fff;box-sizing:border-box;overflow:hidden;display:flex;flex-direction:column;gap:1mm;">

        <!-- Top meta line -->
        <div style="display:flex;justify-content:space-between;font-size:8px;color:#333;">
          <div>Document Ref#IOS-${esc(qRef)}</div>
          <div>Date Created: ${esc(nowStr)}</div>
          <div>Username: admin</div>
        </div>

        <!-- Header bar: brand left | IOS circle centred | Q-ref right -->
        <div style="display:grid;grid-template-columns:1fr auto 1fr;align-items:center;border-bottom:2px solid #000;padding-bottom:2mm;">
          <div>
            <div style="font-size:19px;font-weight:900;line-height:1.1;">NIZAMIA APPARELS</div>
            <div style="font-size:8px;font-weight:600;letter-spacing:1.5px;text-transform:uppercase;">Internal Order Sheet</div>
          </div>
          <div style="display:flex;justify-content:center;">
            <div style="border:2.5px solid #000;border-radius:50%;width:14mm;height:14mm;display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:800;">IOS</div>
          </div>
          <div style="text-align:right;font-size:28px;font-weight:900;line-height:1;">${esc(qRef)}</div>
        </div>

        <!-- Order meta: all labels in 1 row, all values in 1 row -->
        <table style="width:100%;border-collapse:collapse;table-layout:fixed;">
          <tr>
            <td style="border:none;padding:0 2px 0.5mm 0;font-size:8.5px;font-weight:700;width:18%">Brand</td>
            <td style="border:none;padding:0 2px 0.5mm 0;font-size:8.5px;font-weight:700;width:16%">Style Ne</td>
            <td style="border:none;padding:0 2px 0.5mm 0;font-size:8.5px;font-weight:700;width:22%">Fit Name</td>
            <td style="border:none;padding:0 2px 0.5mm 0;font-size:8.5px;font-weight:700;width:16%">PO#</td>
            <td style="border:none;padding:0 2px 0.5mm 0;font-size:8.5px;font-weight:700;width:14%">Store</td>
            <td style="border:none;padding:0 2px 0.5mm 0;font-size:8.5px;font-weight:700;width:14%">Ship Date</td>
          </tr>
          <tr>
            <td style="border:none;padding:0 2px 1mm 0;font-size:10px;font-weight:700;">${esc(d.ord.brand_name || '—')}</td>
            <td style="border:none;padding:0 2px 1mm 0;font-size:10px;">${esc(d.ord.style_number || '—')}</td>
            <td style="border:none;padding:0 2px 1mm 0;font-size:10px;">${esc(d.fitName || '—')}</td>
            <td style="border:none;padding:0 2px 1mm 0;font-size:10px;">${esc(d.ord.po_number || '—')}</td>
            <td style="border:none;padding:0 2px 1mm 0;font-size:10px;">${esc(d.ord.store_name || '—')}</td>
            <td style="border:none;padding:0 2px 1mm 0;font-size:10px;">${esc(fmtDate(d.ord.ship_date))}</td>
          </tr>
        </table>

        <!-- Order Breakdown -->
        <div style="font-size:10px;font-weight:700;margin-bottom:0.3mm;">Order BreakDown</div>
        <table style="width:100%;border-collapse:collapse;table-layout:auto;margin-bottom:1mm;">
          <thead>
            <tr>
              <th style="${th}${blk}width:20mm;">Size Group</th>
              <th style="${th}${blk}width:22mm;">Wash / Colour</th>
              <th style="${th}${blk}width:28mm;text-align:left;padding-left:4px;"></th>
              ${sizeCols.map(sz => `<th style="${th}${blk}">${esc(sz)}</th>`).join('')}
              <th style="${th}${blk}">Total</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td style="${tdC}" rowspan="4">${esc(d.groupName || '—')}</td>
              <td style="${tdC}" rowspan="4">${esc(d.washName || '—')}</td>
              <td style="${td};font-weight:700;">Order Quantity</td>
              ${sizeCols.map(sz => `<td style="${tdC}">${esc(d.sizeMap[sz] || 0)}</td>`).join('')}
              <td style="${tdC};font-weight:700;">${esc(d.q.qty || 0)}</td>
            </tr>
            <tr>
              <td style="${td};font-weight:700;">Ratio</td>
              ${sizeCols.map(sz => `<td style="${tdC}">${esc(d.ratioMap[sz] || 0)}</td>`).join('')}
              <td style="${tdC}">${Object.values(d.ratioMap || {}).reduce((s, v) => s + (parseFloat(v) || 0), 0)}</td>
            </tr>
            <tr>
              <td style="${td};font-weight:700;">Cutting Qty +${esc(d.cuttingPct || 0)}%</td>
              ${sizeCols.map(sz => `<td style="${tdC}">${Math.round((parseFloat(d.sizeMap[sz]) || 0) * (1 + (parseFloat(d.cuttingPct) || 0) / 100))}</td>`).join('')}
              <td style="${tdC};font-weight:700;">${Math.ceil(d.cuttingQty || 0)}</td>
            </tr>
            <tr>
              <td style="${td};color:#666;">Zipper Usage/Size</td>
              ${sizeCols.map(() => `<td style="${tdC}"></td>`).join('')}
              <td style="${tdC}"></td>
            </tr>
          </tbody>
        </table>

        <!-- Materials: Fabric -->
        <div style="font-size:10px;font-weight:700;margin-bottom:0.3mm;">Materials &amp; Trims Requirements</div>
        <table style="width:100%;border-collapse:collapse;table-layout:fixed;margin-bottom:0.8mm;">
          <thead>
            <tr>${['Item', 'Shade', 'Content', 'Weight', 'Width', 'Consump', 'Required'].map(h => `<th style="${th}${blk}">${h}</th>`).join('')}</tr>
          </thead>
          <tbody>${fabricRows}</tbody>
        </table>

        <!-- Trims: Stitching + grey divider + Packing -->
        <table style="width:100%;border-collapse:collapse;table-layout:fixed;margin-bottom:1mm;">
          <thead>
            <tr>${['Type', 'Item', 'Shade', 'Consump', 'Req', 'PO#', 'Status'].map(h => `<th style="${th}${blk}">${h}</th>`).join('')}</tr>
          </thead>
          <tbody>
            ${stitchRows}
            ${dividerRow}
            ${packingRows}
          </tbody>
        </table>

        <!-- Footer 4-box row -->
        <table style="width:100%;border-collapse:collapse;margin-top:auto;">
          <colgroup>
            <col style="width:38%"/>
            <col style="width:18%"/>
            <col style="width:14%"/>
            <col style="width:10%"/>
            <col style="width:10%"/>
            <col style="width:10%"/>
          </colgroup>
          <thead>
            <tr>
              <th style="${th}${blk}">Embellishment &amp; Decoration</th>
              <th style="${th}${blk}">Packing Instructions</th>
              <th style="${th}${blk}" colspan="3" style="text-align:center">Packing</th>
              <th style="${th}${blk}">Merchandiser</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td style="${td};vertical-align:top;font-size:8.5px;height:16mm;" rowspan="3">${embText}</td>
              <td style="${td};vertical-align:top;height:16mm;" rowspan="3">
                <div style="display:flex;align-items:center;gap:3px;margin-bottom:4px;">
                  <div style="width:9px;height:9px;border:1px solid #000;flex-shrink:0;"></div>
                  <span style="font-size:8.5px;">Solid Pack</span>
                </div>
                <div style="display:flex;align-items:center;gap:3px;">
                  <div style="width:9px;height:9px;border:1px solid #000;flex-shrink:0;"></div>
                  <span style="font-size:8.5px;">Ratio Pack</span>
                </div>
              </td>
              <th style="${th}">Type</th>
              <th style="${th}">Each</th>
              <th style="${th}">Total</th>
              <td style="${td};vertical-align:top;height:16mm;" rowspan="3">&nbsp;</td>
            </tr>
            <tr>
              <td style="${td};font-size:8.5px;">Blisters</td>
              <td style="${tdC};font-size:8.5px;">${esc(String(blisterEach))}</td>
              <td style="${tdC};font-size:8.5px;">${esc(String(blisterTotal))}</td>
            </tr>
            <tr>
              <td style="${td};font-size:8.5px;">Cartons</td>
              <td style="${tdC};font-size:8.5px;">${esc(String(cartonEach))}</td>
              <td style="${tdC};font-size:8.5px;">${esc(String(cartonTotal))}</td>
            </tr>
          </tbody>
        </table>

      </div>`
  }

  function sectionDocHTML(title, d, rows, columns, note='') {
    return `
      <div class="page">
        <div class="doc-header"><div class="doc-header-left"><div class="brand"><div class="brand-name">Nizamia Apparels</div><div class="brand-sub">Internal Production Program</div></div></div><div class="doc-header-right"><div class="doc-type">Q Program</div><div class="doc-title">${esc(title)}</div><div class="doc-sub">${esc(d.q.q_number || 'Queued')} · ${esc(d.q.label)}</div></div></div>
        <div class="info-grid" style="grid-template-columns:repeat(4,1fr)">
          ${[['Style', d.ord.style_number], ['Buyer', d.ord.buyer_name], ['Job', d.ord.job_number], ['Qty', `${d.q.qty || 0} pcs`], ['Color/Wash', d.q.color_name || '—'], ['Size Group', d.groupName || '—'], ['Store', d.ord.store_name || '—'], ['Ship Date', fmtDate(d.ord.ship_date)]].map(([k,v]) => `<div class="info-cell"><div class="info-label">${esc(k)}</div><div class="info-value">${esc(v)}</div></div>`).join('')}
        </div>
        ${note ? `<div class="notes-box"><div class="notes-label">Notes</div>${esc(note)}</div>` : ''}
        ${rowsHTML(rows, columns)}
      </div>`
  }

  async function buildProgramHTML(kind, q) {
    const d = await fetchQDocData(q)
    if (kind === 'Internal Order Sheet (IOS)') return buildIOSHTML(d)
    if (kind === 'Print Production File') {
      return [
        coverHTML(d),
        sectionDocHTML('Fabric Demand', d, d.fabricItems, [{label:'Item', key:'name'},{label:'Specification', render:r=>r.specification||r.detail||'—'},{label:'Unit', key:'unit'},{label:'Required', render:r=>Math.ceil(r.q_qty||0), align:'right'}]),
        sectionDocHTML('Cutting Plan', d, Object.keys(d.sizeMap).map(sz => ({ size: sz, qty: d.sizeMap[sz] })), [{label:'Size', key:'size'},{label:'Qty', key:'qty', align:'right'}], `Cutting qty with allowance (${d.cuttingPct}%): ${Math.ceil(d.cuttingQty)} pcs`),
        sectionDocHTML('Trims Demand', d, d.trimItems, [{label:'Item', key:'name'},{label:'Category', key:'category'},{label:'Specification', render:r=>r.specification||r.detail||'—'},{label:'Unit', key:'unit'},{label:'Required', render:r=>Math.ceil(r.q_qty||0), align:'right'}]),
        sectionDocHTML('Washing', d, d.washItems, [{label:'Wash Type', key:'wash_type'},{label:'Wash Ref', key:'wash_ref'},{label:'Color', key:'color_name'},{label:'Unit', key:'unit'},{label:'Qty', render:r=>Math.ceil(r.q_qty||0), align:'right'}]),
        sectionDocHTML('Embellishment', d, d.embItems, [{label:'Description', render:r=>r.description||'Embellishment'},{label:'Technique', key:'technique'},{label:'Placement', key:'placement'},{label:'Vendor', render:r=>r.vendor_id||'—'},{label:'Qty', render:r=>Math.ceil(r.q_qty||0), align:'right'}]),
        sectionDocHTML('Finishing', d, d.finishingPacks.map(p => ({...p, cartons: Math.ceil((parseFloat(d.q.qty)||0) / (parseFloat(p.pcs_per_carton)||1)), inner: Math.ceil((parseFloat(d.q.qty)||0) / (parseFloat(p.pieces_per_inner_pack)||parseFloat(p.inner_pieces)||1 || 1)) })), [{label:'Pack', render:r=>r.pack_name||'Pack'},{label:'Basis', render:r=>r.pack_basis||'—'},{label:'Inner Pack', render:r=>r.inner_pack_type||'—'},{label:'Pcs/Inner', render:r=>r.pieces_per_inner_pack || r.inner_pieces || '—', align:'right'},{label:'Pcs/Carton', key:'pcs_per_carton', align:'right'},{label:'Cartons', key:'cartons', align:'right'}]),
      ].join('')
    }
    const map = {
      'Fabric Demand': () => sectionDocHTML('Fabric Demand', d, d.fabricItems, [{label:'Item', key:'name'},{label:'Specification', render:r=>r.specification||r.detail||'—'},{label:'Unit', key:'unit'},{label:'Required', render:r=>Math.ceil(r.q_qty||0), align:'right'}]),
      'Cutting Plan': () => sectionDocHTML('Cutting Plan', d, Object.keys(d.sizeMap).map(sz => ({ size: sz, qty: d.sizeMap[sz] })), [{label:'Size', key:'size'},{label:'Qty', key:'qty', align:'right'}], `Cutting qty with allowance (${d.cuttingPct}%): ${Math.ceil(d.cuttingQty)} pcs`),
      'Trims Demand': () => sectionDocHTML('Trims Demand', d, d.trimItems, [{label:'Item', key:'name'},{label:'Category', key:'category'},{label:'Specification', render:r=>r.specification||r.detail||'—'},{label:'Unit', key:'unit'},{label:'Required', render:r=>Math.ceil(r.q_qty||0), align:'right'}]),
      'Washing': () => sectionDocHTML('Washing', d, d.washItems, [{label:'Wash Type', key:'wash_type'},{label:'Wash Ref', key:'wash_ref'},{label:'Color', key:'color_name'},{label:'Unit', key:'unit'},{label:'Qty', render:r=>Math.ceil(r.q_qty||0), align:'right'}]),
      'Embellishment': () => sectionDocHTML('Embellishment', d, d.embItems, [{label:'Description', render:r=>r.description||'Embellishment'},{label:'Technique', key:'technique'},{label:'Placement', key:'placement'},{label:'Vendor', render:r=>r.vendor_id||'—'},{label:'Qty', render:r=>Math.ceil(r.q_qty||0), align:'right'}]),
      'Finishing': () => sectionDocHTML('Finishing', d, d.finishingPacks.map(p => ({...p, cartons: Math.ceil((parseFloat(d.q.qty)||0) / (parseFloat(p.pcs_per_carton)||1)), inner: Math.ceil((parseFloat(d.q.qty)||0) / (parseFloat(p.pieces_per_inner_pack)||parseFloat(p.inner_pieces)||1 || 1)) })), [{label:'Pack', render:r=>r.pack_name||'Pack'},{label:'Basis', render:r=>r.pack_basis||'—'},{label:'Inner Pack', render:r=>r.inner_pack_type||'—'},{label:'Pcs/Inner', render:r=>r.pieces_per_inner_pack || r.inner_pieces || '—', align:'right'},{label:'Pcs/Carton', key:'pcs_per_carton', align:'right'},{label:'Cartons', key:'cartons', align:'right'}]),
    }
    return map[kind] ? map[kind]() : ''
  }

  async function printSelectedPrograms(kind) {
    if (!selectedQueues.length) return
    try {
      const parts = []
      for (const q of selectedQueues) parts.push(await buildProgramHTML(kind, q))
      printHTML(parts.join(''))
    } catch (err) {
      console.error('Queue print failed', err)
      alert('Could not prepare print.')
    }
  }

  function exportQueuesCSV() {
    if (!selectedQueues.length) return
    const cols = ['Q #','Label','Split Rule','Style','Buyer','Job','Qty','Status']
    const rows = selectedQueues.map(q => {
      const o = orderMap[q.order_id] || {}
      return [q.q_number || 'Queued', q.label || '', q.split_rule || '', o.style_number || '', o.buyer_name || '', o.job_number || '', q.qty || '', q.status || '']
    })
    const csv = [cols, ...rows].map(r => r.map(v => `"${String(v).replace(/"/g,'""')}"`).join(',')).join('\n')
    const a = document.createElement('a')
    a.href = 'data:text/csv;charset=utf-8,' + encodeURIComponent(csv)
    a.download = `queues-${new Date().toISOString().slice(0,10)}.csv`
    a.click()
  }

  function exportQueuesPDF() {
    if (!selectedQueues.length) return
    const rows = selectedQueues.map(q => {
      const o = orderMap[q.order_id] || {}
      return `<tr><td>${esc(q.q_number || 'Queued')}</td><td>${esc(q.label)}</td><td>${esc(q.split_rule)}</td><td>${esc(o.style_number)}</td><td>${esc(o.buyer_name)}</td><td style="text-align:right">${esc(q.qty)}</td><td>${esc(q.status)}</td></tr>`
    }).join('')
    const html = `<div style="font-family:Arial,sans-serif;padding:24px"><h2>Queue List</h2><table style="width:100%;border-collapse:collapse"><thead><tr><th style="border:1px solid #ddd;padding:8px;background:#f5f5f5;text-align:left">Q #</th><th style="border:1px solid #ddd;padding:8px;background:#f5f5f5;text-align:left">Label</th><th style="border:1px solid #ddd;padding:8px;background:#f5f5f5;text-align:left">Split Rule</th><th style="border:1px solid #ddd;padding:8px;background:#f5f5f5;text-align:left">Style</th><th style="border:1px solid #ddd;padding:8px;background:#f5f5f5;text-align:left">Buyer</th><th style="border:1px solid #ddd;padding:8px;background:#f5f5f5;text-align:left">Qty</th><th style="border:1px solid #ddd;padding:8px;background:#f5f5f5;text-align:left">Status</th></tr></thead><tbody>${rows}</tbody></table></div>`
    printHTML(html)
  }

  if (loading) return <div style={{ padding: 60, textAlign: 'center', color: '#9ca3af', fontSize: 12 }}>Loading queues...</div>

  return (
    <div style={{ flex: 1, overflowY: 'auto', padding: '16px 24px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
        <div style={{ position: 'relative', width: 300 }}>
          <Search size={13} style={{ position: 'absolute', left: 9, top: '50%', transform: 'translateY(-50%)', color: '#9ca3af' }} />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search Q#, label, style, buyer..."
            style={{ width: '100%', paddingLeft: 28, height: 32, border: '1px solid #e5e7eb', borderRadius: 7, fontSize: 12, outline: 'none', fontFamily: 'var(--font)' }} />
        </div>
        <select value={filterRule} onChange={e => setFilterRule(e.target.value)}
          style={{ height: 32, border: '1px solid #e5e7eb', borderRadius: 7, fontSize: 12, padding: '0 10px', fontFamily: 'var(--font)', background: '#fff', cursor: 'pointer' }}>
          <option value="">All Split Rules</option>
          {allRules.map(r => <option key={r}>{r}</option>)}
        </select>
        <div style={{ marginLeft:'auto', display:'flex', gap:8, alignItems:'center' }}>
          <button className="btn btn-sm" style={{ background: selectedQueuedOnly.length === 0 ? "#e5e7eb" : "#16a34a", color: selectedQueuedOnly.length === 0 ? "#9ca3af" : "#fff" }} disabled={selectedQueuedOnly.length === 0} onClick={handleActivateQueues}>Activate Q</button>
          <button className="btn btn-sm" style={{ background: selectedOrderIds.length === 0 ? "#f3f4f6" : "#fee2e2", color: selectedOrderIds.length === 0 ? "#9ca3af" : "#dc2626" }} disabled={selectedOrderIds.length === 0} onClick={handleRollbackOrderQueues}>Reset Queue</button>
          <button className="btn btn-secondary btn-sm" disabled={selectedQueues.length === 0} onClick={() => setShowPrintModal(true)}>Print</button>
          <div style={{ position:'relative' }}>
            <button className="btn btn-secondary btn-sm" disabled={selectedQueues.length === 0} onClick={() => setShowExportMenu(v => !v)}>Export</button>
            {showExportMenu && selectedQueues.length > 0 && (
              <div style={{ position:'absolute', right:0, top:'calc(100% + 6px)', background:'#fff', border:'1px solid #e5e7eb', borderRadius:8, boxShadow:'0 10px 24px rgba(0,0,0,0.12)', padding:6, zIndex:20, minWidth:150 }}>
                <button className="btn btn-ghost btn-sm" style={{ width:'100%', justifyContent:'flex-start' }} onClick={() => { setShowExportMenu(false); exportQueuesCSV() }}>Export Excel/CSV</button>
                <button className="btn btn-ghost btn-sm" style={{ width:'100%', justifyContent:'flex-start' }} onClick={() => { setShowExportMenu(false); exportQueuesPDF() }}>Export PDF</button>
              </div>
            )}
          </div>
          <span style={{ fontSize: 11, color: '#9ca3af' }}>{filtered.length} queues</span>
        </div>
      </div>

      {filtered.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 60, color: '#9ca3af', fontSize: 12 }}>
          No queues yet. Open an order → PO Matrix → select a Queue Split rule → Generate Qs.
        </div>
      ) : (
        <div className="card">
          <table>
            <thead>
              <tr>
                <th style={{ width:36 }}><input type="checkbox" checked={filtered.length>0 && filtered.every(q => selectedIds.has(q.id))} onChange={toggleAllVisible} /></th>
                <th>Q #</th>
                <th>Label</th>
                <th>Split Rule</th>
                <th>Style</th>
                <th>Buyer</th>
                <th>Job</th>
                <th style={{ textAlign: 'right' }}>Qty</th>
                <th style={{ textAlign: 'right' }}>Shipped</th>
                <th style={{ textAlign: 'right' }}>Balance</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(q => {
                const o = orderMap[q.order_id] || {}
                const rc = ruleColor[q.split_rule] || { bg: '#f5f5f3', color: '#6b7280' }
                const isSelected = selectedIds.has(q.id)
                return (
                  <tr key={q.id} style={{ background: isSelected ? '#f0f9ff' : '' }}>
                    <td><input type="checkbox" checked={isSelected} onChange={() => toggleSelect(q.id)} /></td>
                    <td>
                      <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 800, fontSize: 13, color: '#0d0d0d', background: '#f3f4f6', padding: '2px 8px', borderRadius: 5 }}>
                        {q.q_number || 'Queued'}
                      </span>
                    </td>
                    <td style={{ fontWeight: 600 }}>{q.label || '—'}</td>
                    <td><span style={{ fontSize: 10, fontWeight: 600, padding: '2px 7px', borderRadius: 4, background: rc.bg, color: rc.color }}>{q.split_rule}</span></td>
                    <td style={{ fontWeight: 600 }}>{o.style_number || '—'}{o.brand_name && <div style={{ fontSize: 10, color: '#7c3aed', fontWeight: 600 }}>{o.brand_name}</div>}</td>
                    <td style={{ fontSize: 12 }}>{o.buyer_name || '—'}</td>
                    <td style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: '#6b7280' }}>{o.job_number || '—'}</td>
                    <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)', fontWeight: 700 }}>{q.qty?.toLocaleString() || '—'}</td>
                    <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)', color:'#2563eb' }}>{(q.shipped_qty || 0).toLocaleString()}</td>
                    <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)', fontWeight: 700 }}>{(q.balance_qty || 0).toLocaleString()}</td>
                    <td><span style={{ fontSize: 10, fontWeight: 600, padding: '2px 7px', borderRadius: 4, background: statusBg[(q.balance_qty <= 0 && q.shipped_qty > 0) ? 'Completed' : (q.shipped_qty > 0 ? 'Partially Shipped' : q.status)] || '#fafaf8', color: statusColor[(q.balance_qty <= 0 && q.shipped_qty > 0) ? 'Completed' : (q.shipped_qty > 0 ? 'Partially Shipped' : q.status)] || '#6b7280' }}>{(q.balance_qty <= 0 && q.shipped_qty > 0) ? 'Completed' : (q.shipped_qty > 0 ? 'Partially Shipped' : q.status)}</span></td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {showPrintModal && (
        <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.4)', zIndex:300, display:'flex', alignItems:'center', justifyContent:'center' }}>
          <div style={{ background:'#fff', borderRadius:10, padding:24, width:360, boxShadow:'0 16px 48px rgba(0,0,0,0.2)' }}>
            <div style={{ fontSize:14, fontWeight:700, marginBottom:12 }}>Print Queue Reports</div>
            <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
              {['Internal Order Sheet (IOS)', 'Fabric Demand', 'Cutting Plan', 'Trims Demand', 'Washing', 'Embellishment', 'Finishing', 'Print Production File'].map(prog => (
                <button key={prog} className="btn btn-secondary btn-sm" style={{ justifyContent:'flex-start' }} onClick={async () => { setShowPrintModal(false); await printSelectedPrograms(prog) }}>{prog}</button>
              ))}
            </div>
            <div style={{ display:'flex', justifyContent:'flex-end', marginTop:16 }}><button className="btn btn-secondary" onClick={() => setShowPrintModal(false)}>Close</button></div>
          </div>
        </div>
      )}
    </div>
  )
}
// ── Main Orders Page ──────────────────────────────────────────────────────────
export default function Orders() {
  const { alert, confirm, prompt, Dialogs } = useAppDialogs()
  const [tab, setTab]               = useState('orders')
  const [orders, setOrders]         = useState([])
  const [loading, setLoading]       = useState(true)
  const [search, setSearch]         = useState('')
  const [filterBuyer, setFilterBuyer]   = useState('')
  const [filterStatus, setFilterStatus] = useState('')
  const [selected, setSelected]     = useState(new Set())
  const [wizardOpen, setWizardOpen] = useState(false)
  const [editOrder, setEditOrder]   = useState(null)
  const [buyers, setBuyers]         = useState([])
  const [showAssignJob, setShowAssignJob] = useState(false)
  const [showChangeStatus, setShowChangeStatus] = useState(false)
  const [showPrint, setShowPrint] = useState(false)
  const [sort, setSort] = useState({ col: 'ship_date', dir: 'asc' })
  const [tabNotices, setTabNotices] = useState({ orders:false, jobs:false, queues:false })

  useEffect(() => {
    loadOrders()
    supabase.from('buyers').select('id,name').order('name').then(({ data }) => setBuyers(data || []))
    setTabNotices(getPageTabNoticeMap('ordersPage', ['orders','jobs','queues']))
  }, [])

  useEffect(() => {
    markTabSeen('ordersPage', tab)
    setTabNotices(getPageTabNoticeMap('ordersPage', ['orders','jobs','queues']))
  }, [tab])

  async function loadOrders() {
    setLoading(true)
    const [{ data }, { data: shipmentRows }] = await Promise.all([
      supabase.from('orders').select('id,job_id,job_number,buyer_name,buyer_id,style_number,po_number,ship_date,planned_date,status,total_qty,total_value_usd,factory_ref,brand_name,store_name,merchandiser_name,description,created_at').order('ship_date', { ascending: true, nullsLast: true }),
      supabase.from('shipment_lines').select('order_id,shipped_qty'),
    ])
    const shippedByOrder = {}
    ;(shipmentRows || []).forEach(r => { shippedByOrder[r.order_id] = (shippedByOrder[r.order_id] || 0) + (parseFloat(r.shipped_qty) || 0) })
    const mapped = (data || []).map(o => ({
      ...o,
      shipped_qty: shippedByOrder[o.id] || 0,
      balance_qty: Math.max(0, (parseFloat(o.total_qty) || 0) - (shippedByOrder[o.id] || 0)),
    }))
    setOrders(mapped)
    setLoading(false)
  }

  function openNew()    { setEditOrder(null);  setWizardOpen(true) }

  async function duplicateOrder(o, e) {
    e.stopPropagation()
    if (!await confirm(`Duplicate order ${o.style_number}? Quantities will not be copied.`, { title:'Duplicate Order', confirmText:'Duplicate' })) return
    // Copy order header (no qty, no po_number, no job)
    const { data: newOrder, error } = await supabase.from('orders').insert([{
      buyer_id: o.buyer_id, buyer_name: o.buyer_name,
      style_number: o.style_number + ' (Copy)',
      brand_name: o.brand_name || null, store_name: o.store_name || null,
      description: o.description || null, factory_ref: o.factory_ref || null,
      ship_mode: o.ship_mode || null, incoterms: o.incoterms || null,
      currency: o.currency || 'USD', status: 'Draft',
      merchandiser_name: o.merchandiser_name || null, agent_name: o.agent_name || null,
    }]).select().single()
    if (error) { await alert('Duplicate failed: ' + error.message, { title:'Duplicate Failed' }); return }
    // Copy size groups (without breakdown quantities)
    const { data: sgs } = await supabase.from('size_groups').select('*').eq('order_id', o.id).order('sort_order')
    for (const sg of (sgs || [])) {
      const { data: newSg } = await supabase.from('size_groups').insert([{
        order_id: newOrder.id, group_name: sg.group_name,
        unit_price: sg.unit_price, currency: sg.currency,
        sizes: sg.sizes, base_size: sg.base_size, sort_order: sg.sort_order,
      }]).select().single()
      if (!newSg) continue
      // Copy colours (no breakdown quantities)
      const { data: colors } = await supabase.from('size_group_colors').select('id,color_name,sort_order').eq('size_group_id', sg.id).order('sort_order')
      for (const c of (colors || [])) {
        await supabase.from('size_group_colors').insert([{
          size_group_id: newSg.id, color_name: c.color_name, sort_order: c.sort_order,
        }])
      }
    }
    // Copy BOM items
    const { data: bom } = await supabase.from('bom_items').select('*').eq('order_id', o.id).order('sort_order')
    for (const b of (bom || [])) {
      const { library_item_id, name, category, detail, specification, unit, supplier_id, usage_rule, usage_data, base_qty, wastage, notes, sort_order, use_cutting_qty } = b
      await supabase.from('bom_items').insert([{ order_id: newOrder.id, library_item_id, name, category, detail, specification, unit, supplier_id, usage_rule, usage_data, base_qty, wastage, notes, sort_order, use_cutting_qty }])
    }
    markTabUpdated('ordersPage', 'orders')
    setTabNotices(getPageTabNoticeMap('ordersPage', ['orders','jobs','queues']))
    loadOrders()
    await alert(`Order duplicated as "${newOrder.style_number}". Open it to fill in quantities.`, { title:'Order Duplicated' })
  }

  const IMPORT_TEMPLATE_HEADERS = ['Style Number*','Buyer Name*','Brand Name','Store Name','PO Number','Factory Ref','Description','Currency','Ship Mode','Incoterms','Port of Loading','Port of Discharge','Ex-Factory Date (YYYY-MM-DD)','In-Store Date (YYYY-MM-DD)','Merchandiser','Agent','Notes']
  const IMPORT_TEMPLATE_EXAMPLE = ['STY-0001','True Religion','True Religion','ASOS','TR-1234','NZ-001','Slim Fit Denim Jeans','USD','Sea','FOB','Karachi','Rotterdam','2026-08-15','2026-09-01','John','Jane','Rush order']

  function downloadImportTemplate() {
    const rows = [IMPORT_TEMPLATE_HEADERS, IMPORT_TEMPLATE_EXAMPLE]
    const csv = rows.map(r => r.map(v => `"${v}"`).join(',')).join('\n')
    const a = document.createElement('a')
    a.href = 'data:text/csv;charset=utf-8,' + encodeURIComponent(csv)
    a.download = 'order-import-template.csv'; a.click()
  }

  async function handleImportFile(e) {
    const file = e.target.files?.[0]; if (!file) return
    const text = await file.text()
    const lines = text.split('\n').filter(l => l.trim())
    if (lines.length < 2) { await alert('File must have at least one data row.', { title:'Import Failed' }); return }
    const headers = lines[0].split(',').map(h => h.replace(/"/g,'').trim())
    const idx = (name) => headers.findIndex(h => h.toLowerCase().includes(name.toLowerCase()))
    const rows = lines.slice(1).map(line => {
      const cells = line.match(/(".*?"|[^,]+|(?<=,)(?=,)|^(?=,)|(?<=,)$)/g) || line.split(',')
      const get = (name) => (cells[idx(name)] || '').replace(/"/g,'').trim()
      return {
        style_number: get('Style'), buyer_name: get('Buyer'),
        brand_name: get('Brand') || null, store_name: get('Store') || null,
        po_number: get('PO') || null, factory_ref: get('Factory') || null,
        description: get('Description') || null, currency: get('Currency') || 'USD',
        ship_mode: get('Ship Mode') || null, incoterms: get('Incoterms') || null,
        port_of_loading: get('Port of Loading') || null, port_of_discharge: get('Port of Discharge') || null,
        ship_date: get('Ex-Factory') || null, in_store_date: get('In-Store') || null,
        merchandiser_name: get('Merchandiser') || null, agent_name: get('Agent') || null,
        notes: get('Notes') || null, status: 'Draft',
      }
    }).filter(r => r.style_number && r.buyer_name)
    if (rows.length === 0) { await alert('No valid rows found. Make sure Style Number and Buyer Name are filled.', { title:'Import Failed' }); return }
    // Resolve buyer IDs
    const { data: buyerList } = await supabase.from('buyers').select('id,name')
    const buyerMap = Object.fromEntries((buyerList || []).map(b => [b.name.toLowerCase(), b.id]))
    const toInsert = rows.map(r => ({ ...r, buyer_id: buyerMap[r.buyer_name.toLowerCase()] || null }))
    const { error } = await supabase.from('orders').insert(toInsert)
    if (error) { await alert('Import failed: ' + error.message, { title:'Import Failed' }); return }
    await alert(`Successfully imported ${toInsert.length} order${toInsert.length > 1 ? 's' : ''}.`, { title:'Import Complete' })
    loadOrders()
    e.target.value = ''
  }
  function openEdit(o)  { setEditOrder(o);     setWizardOpen(true) }
  function closeWizard(){ markTabUpdated('ordersPage', 'orders'); setTabNotices(getPageTabNoticeMap('ordersPage', ['orders','jobs','queues'])); setWizardOpen(false); setEditOrder(null); loadOrders() }

  async function deleteSelected() {
    const ids = [...selected]
    if (!ids.length) return
    if (!await confirm(`Delete ${ids.length} order(s)?`, { title:'Delete Orders', confirmText:'Delete', tone:'danger' })) return

    const { data: sgRows } = await supabase.from('size_groups').select('id').in('order_id', ids)
    const sgIds = (sgRows || []).map(g => g.id)
    if (sgIds.length) {
      const { data: colorRows } = await supabase.from('size_group_colors').select('id').in('size_group_id', sgIds)
      const colorIds = (colorRows || []).map(c => c.id)
      if (colorIds.length) await supabase.from('size_group_breakdown').delete().in('color_id', colorIds)
      await supabase.from('size_group_colors').delete().in('size_group_id', sgIds)
      await supabase.from('size_groups').delete().in('id', sgIds)
    }

    const { data: queueRows } = await supabase.from('order_queues').select('id').in('order_id', ids)
    const queueIds = (queueRows || []).map(q => q.id)
    if (queueIds.length) await supabase.from('purchase_order_items').delete().in('source_id', queueIds).eq('source_type', 'queue')
    if (queueIds.length) await supabase.from('order_queues').delete().in('id', queueIds)

    const { data: finishingRows } = await supabase.from('finishing').select('id').in('order_id', ids)
    const finishingIds = (finishingRows || []).map(f => f.id)
    if (finishingIds.length) await supabase.from('finishing_packs').delete().in('finishing_id', finishingIds)

    const { data: sampleRows } = await supabase.from('samples').select('id').in('order_id', ids)
    const sampleIds = (sampleRows || []).map(s => s.id)
    if (sampleIds.length) {
      await supabase.from('sample_comments').delete().in('sample_id', sampleIds)
      await supabase.from('sample_logs').delete().in('sample_id', sampleIds)
      await supabase.from('samples').delete().in('id', sampleIds)
    }

    await supabase.from('bom_items').delete().in('order_id', ids)
    await supabase.from('fitting').delete().in('order_id', ids)
    await supabase.from('washing').delete().in('order_id', ids)
    await supabase.from('embellishments').delete().in('order_id', ids)
    await supabase.from('finishing').delete().in('order_id', ids)
    await supabase.from('order_processes').delete().in('order_id', ids)

    const { data: woRows } = await supabase.from('work_orders').select('id').in('order_id', ids)
    const woIds = (woRows || []).map(w => w.id)
    if (woIds.length) {
      await supabase.from('work_order_items').delete().in('wo_id', woIds)
      await supabase.from('work_order_changelog').delete().in('wo_id', woIds)
      await supabase.from('work_orders').delete().in('id', woIds)
    }

    await supabase.from('purchase_orders').delete().in('order_id', ids)

    const { error } = await supabase.from('orders').delete().in('id', ids)
    if (error) { await alert(error.message || 'Could not delete selected orders.', { title:'Delete Failed' }); return }
    markTabUpdated('ordersPage', 'orders')
    setTabNotices(getPageTabNoticeMap('ordersPage', ['orders','jobs','queues']))
    setSelected(new Set())
    loadOrders()
  }

  const today  = new Date()
  const in21   = new Date(today); in21.setDate(today.getDate() + 21)
  const weekEnd = new Date(today); weekEnd.setDate(today.getDate() + 7)
  const monEnd  = new Date(today.getFullYear(), today.getMonth() + 1, 0)

  const openStatuses = ['Draft', 'Active', 'Booked']
  const active     = orders.filter(o => openStatuses.includes(o.status || 'Draft'))

  const filtered = orders.filter(o => {
    const q = search.toLowerCase()
    const matchSearch = !q || [o.style_number, o.buyer_name, o.po_number, o.job_number, o.description].some(f => f?.toLowerCase().includes(q))
    const matchBuyer  = !filterBuyer  || o.buyer_name === filterBuyer
    const matchStatus = !filterStatus || o.status === filterStatus
    return matchSearch && matchBuyer && matchStatus
  }).sort((a, b) => {
    const { col, dir } = sort
    let va, vb
    if (col === 'ship_date')    { va = a.ship_date || 'zzz'; vb = b.ship_date || 'zzz' }
    else if (col === 'created_at') { va = a.created_at || ''; vb = b.created_at || '' }
    else if (col === 'job_number') { va = a.job_number || 'zzz'; vb = b.job_number || 'zzz' }
    else if (col === 'buyer_name') { va = (a.buyer_name || '').toLowerCase(); vb = (b.buyer_name || '').toLowerCase() }
    else if (col === 'total_qty')  { va = a.total_qty || 0; vb = b.total_qty || 0 }
    else if (col === 'status')     { va = a.status || ''; vb = b.status || '' }
    else { va = a[col] || ''; vb = b[col] || '' }
    if (va < vb) return dir === 'asc' ? -1 : 1
    if (va > vb) return dir === 'asc' ? 1 : -1
    return 0
  })

  const dueThisMonth = active.filter(o => o.ship_date && new Date(o.ship_date) <= monEnd)
  const dueThisWeek  = active.filter(o => o.ship_date && new Date(o.ship_date) <= weekEnd)
  const openFiltered = filtered.filter(o => openStatuses.includes(o.status || 'Draft'))
  const totalQty     = openFiltered.reduce((s, o) => s + (o.total_qty || 0), 0)
  const totalValue   = openFiltered.reduce((s, o) => { const tq = parseFloat(o.total_qty) || 0; const tv = parseFloat(o.total_value_usd) || 0; const bal = parseFloat(o.balance_qty) || 0; return s + (tq > 0 ? (tv * bal / tq) : tv) }, 0)

  function toggleSort(col) {
    setSort(s => s.col === col ? { col, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { col, dir: col === 'ship_date' || col === 'created_at' ? 'asc' : 'asc' })
  }

  function daysRemaining(dateStr) {
    if (!dateStr) return null
    const d = new Date(dateStr); d.setHours(0,0,0,0)
    const t = new Date(); t.setHours(0,0,0,0)
    return Math.round((d - t) / 86400000)
  }

  function daysLabel(days) {
    if (days === null) return null
    if (days === 0)  return { text: 'Today',        color: '#dc2626', weight: 800 }
    if (days < 0)   return { text: `${Math.abs(days)}d overdue`, color: '#dc2626', weight: 700 }
    if (days <= 7)  return { text: `${days}d left`,  color: '#ea580c', weight: 700 }
    if (days <= 30) return { text: `${days}d left`,  color: '#d97706', weight: 600 }
    return              { text: `${days}d`,          color: '#9ca3af', weight: 400 }
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
        <button style={tabStyle('orders')} onClick={() => setTab('orders')}><span style={{ display:'inline-flex', alignItems:'center', gap:6 }}>Buyer Purchase Orders{tabNotices.orders && tab !== 'orders' ? <span style={{ width:8, height:8, borderRadius:'50%', background:'#F59E0B', display:'inline-block' }} /> : null}</span></button>
        <button style={tabStyle('jobs')}   onClick={() => setTab('jobs')}><span style={{ display:'inline-flex', alignItems:'center', gap:6 }}>Jobs{tabNotices.jobs && tab !== 'jobs' ? <span style={{ width:8, height:8, borderRadius:'50%', background:'#F59E0B', display:'inline-block' }} /> : null}</span></button>
        <button style={tabStyle('queues')} onClick={() => setTab('queues')}><span style={{ display:'inline-flex', alignItems:'center', gap:6 }}>Queues{tabNotices.queues && tab !== 'queues' ? <span style={{ width:8, height:8, borderRadius:'50%', background:'#F59E0B', display:'inline-block' }} /> : null}</span></button>
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
          <label className="btn btn-secondary" style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }} title="Import orders from CSV">
            <Upload size={13} /> Import
            <input type="file" accept=".csv" style={{ display: 'none' }} onChange={handleImportFile} />
          </label>
          <button className="btn btn-secondary" style={{ display: 'flex', alignItems: 'center', gap: 6 }} onClick={downloadImportTemplate} title="Download blank import template">
            <Download size={13} /> Template
          </button>
          <button className="btn btn-secondary" style={{ display: 'flex', alignItems: 'center', gap: 6 }}
            onClick={() => {
              if (filtered.length === 0) return
              const cols = ['Job','Style','Buyer','Brand','PO #','Factory Ref','Qty','Value USD','Ship Date','Status']
              const rows = filtered.map(o => [o.job_number||'',o.style_number||'',o.buyer_name||'',o.brand_name||'',o.po_number||'',o.factory_ref||'',o.total_qty||'',o.total_value_usd||'',o.ship_date||'',o.status||''])
              const csv = [cols, ...rows].map(r => r.map(v => `"${String(v).replace(/"/g,'""')}"`).join(',')).join('\n')
              const a = document.createElement('a'); a.href = 'data:text/csv;charset=utf-8,' + encodeURIComponent(csv)
              a.download = `orders-${new Date().toISOString().slice(0,10)}.csv`; a.click()
            }}>
            Export CSV
          </button>
          <button className="btn btn-secondary" style={{ display: 'flex', alignItems: 'center', gap: 6 }}
            onClick={() => setShowPrint(true)}
            disabled={selected.size === 0}
            title={selected.size === 0 ? 'Select orders to print' : `Print ${selected.size} order${selected.size>1?'s':''}`}>
            <Printer size={13} /> {selected.size > 0 ? `Print (${selected.size})` : 'Print'}
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
              <option>Draft</option><option>Active</option><option>Booked</option><option>Shipped</option><option>Cancelled</option>
            </select>
            <div style={{ marginLeft:'auto', display:'flex', gap:8 }}>
              <button className="btn btn-secondary btn-sm" disabled={selected.size === 0} onClick={() => setShowAssignJob(true)}>Assign Job</button>
              <button className="btn btn-secondary btn-sm" disabled={selected.size === 0} onClick={() => setShowChangeStatus(true)}>Change Status</button>
              <button className="btn btn-secondary btn-sm" disabled={selected.size !== 1} onClick={(e) => selectedOrderObjs[0] && duplicateOrder(selectedOrderObjs[0], e)}>Duplicate Order</button>
            </div>
          </div>

          {/* Bulk bar */}
          {selected.size > 0 && (
            <div style={{ padding: '7px 24px', background: '#eff6ff', borderBottom: '1px solid #dbeafe', display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
              <span style={{ fontSize: 12, color: '#2563eb', fontWeight: 600 }}>{selected.size} selected</span>
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
                    {[
                      { label: '',         col: null },
                      { label: 'Job / Status', col: 'job_number' },
                      { label: 'Buyer',    col: 'buyer_name' },
                      { label: 'PO #',     col: null },
                      { label: 'Style / Desc', col: null },
                      { label: 'Factory Ref', col: null },
                      { label: 'Qty / Ship / Bal',      col: 'total_qty' },
                      { label: 'Value (USD)', col: null },
                      { label: 'Ship Date', col: 'ship_date' },
                      { label: 'Placed',   col: 'created_at' },
                      { label: 'Merch.',   col: null },
                    ].map(({ label, col }) => (
                      <th key={label} onClick={() => col && toggleSort(col)}
                        style={{ fontSize: 10, fontWeight: 600, color: sort.col === col ? '#0d0d0d' : '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.5px', padding: '9px 12px', textAlign: 'left', borderBottom: '1px solid #f3f4f6', whiteSpace: 'nowrap', cursor: col ? 'pointer' : 'default', userSelect: 'none' }}>
                        {label}{col && sort.col === col ? (sort.dir === 'asc' ? ' ↑' : ' ↓') : col ? <span style={{ color: '#d1d5db' }}> ↕</span> : ''}
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
                        <td style={{ padding: '9px 8px', borderBottom: '1px solid #f9fafb' }} onClick={() => openEdit(o)}>
                          <div style={{ width: 32, height: 32, background: '#f3f4f6', borderRadius: 5, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            <Layers size={13} color="#9ca3af" />
                          </div>
                        </td>
                        <td style={{ padding: '9px 12px', borderBottom: '1px solid #f9fafb' }} onClick={() => openEdit(o)}>
                          <div style={{ fontFamily: 'monospace', fontWeight: 700, fontSize: 12, color: '#0d0d0d' }}>{o.job_number || '—'}</div>
                          <div style={{ display:'inline-flex', alignItems:'center', gap:6, marginTop: 5 }}>
                            <span style={{ width:8, height:8, borderRadius:'50%', background: statusColor[o.status] || statusColor.Draft, display:'inline-block' }} />
                            <span style={{ color: statusColor[o.status] || statusColor.Draft, fontSize: 10, fontWeight: 700 }}>{o.status || 'Draft'}</span>
                          </div>
                        </td>
                        <td style={{ padding: '9px 12px', borderBottom: '1px solid #f9fafb', whiteSpace: 'nowrap' }} onClick={() => openEdit(o)}>
                          <div style={{ fontSize: 12, fontWeight: 600 }}>{o.buyer_name}</div>
                          {o.brand_name && <div style={{ fontSize: 10, color: '#7c3aed', fontWeight: 600 }}>{o.brand_name}</div>}
                        </td>
                        <td style={{ padding: '9px 12px', borderBottom: '1px solid #f9fafb', fontSize: 11, color: '#6b7280', fontFamily: 'monospace' }} onClick={() => openEdit(o)}>{o.po_number || '—'}</td>
                        <td style={{ padding: '9px 12px', borderBottom: '1px solid #f9fafb', maxWidth: 200 }} onClick={() => openEdit(o)}>
                          <div style={{ fontSize: 12, fontWeight: 600 }}>{o.style_number}</div>
                          {o.description && <div style={{ fontSize: 11, color: '#6b7280', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{o.description}</div>}
                        </td>
                        <td style={{ padding: '9px 12px', borderBottom: '1px solid #f9fafb', fontSize: 11, color: '#6b7280', fontFamily: 'monospace' }} onClick={() => openEdit(o)}>{o.factory_ref || '—'}</td>
                        <td style={{ padding: '9px 12px', borderBottom: '1px solid #f9fafb', fontFamily: 'monospace', fontSize: 11 }} onClick={() => openEdit(o)}><div style={{ fontWeight:700 }}>{o.total_qty?.toLocaleString() || '—'}</div><div style={{ color:'#2563eb', marginTop:2 }}>Ship {Number(o.shipped_qty || 0).toLocaleString()}</div><div style={{ color:'#111827', marginTop:2 }}>Bal {Number(o.balance_qty || 0).toLocaleString()}</div></td>
                        <td style={{ padding: '9px 12px', borderBottom: '1px solid #f9fafb', fontSize: 12, fontWeight: 700 }} onClick={() => openEdit(o)}>{o.total_value_usd ? `$${parseFloat(o.total_value_usd).toLocaleString(undefined, { maximumFractionDigits: 0 })}` : '—'}</td>
                        <td style={{ padding: '9px 12px', borderBottom: '1px solid #f9fafb', whiteSpace: 'nowrap' }} onClick={() => openEdit(o)}>
                          {o.ship_date ? (() => {
                            const days = daysRemaining(o.ship_date)
                            const dl = daysLabel(days)
                            return (
                              <div>
                                <div style={{ fontSize: 11, color: dateColor(o.ship_date), fontWeight: isOverdue ? 700 : 400 }}>{fmtDate(o.planned_date || o.ship_date)}</div>
                                {dl && <div style={{ fontSize: 10, color: dl.color, fontWeight: dl.weight, marginTop: 1 }}>{dl.text}</div>}
                              </div>
                            )
                          })() : <span style={{ color: '#9ca3af' }}>—</span>}
                        </td>
                        <td style={{ padding: '9px 12px', borderBottom: '1px solid #f9fafb', fontSize: 11, color: '#9ca3af', whiteSpace: 'nowrap' }} onClick={() => openEdit(o)}>
                          {o.created_at ? new Date(o.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) : '—'}
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
              {openFiltered.length} open orders{filtered.length !== openFiltered.length ? ` · ${filtered.length} total` : ''}
            </span>
            <div style={{ display: 'flex', gap: 20, alignItems: 'center' }}>
              {totalValue > 0 && <span style={{ fontSize: 12, color: '#6b7280' }}>Value: <strong style={{ color: '#16a34a' }}>${totalValue.toLocaleString(undefined, { maximumFractionDigits: 0 })}</strong></span>}
              {totalQty > 0   && <span style={{ fontSize: 12, color: '#6b7280' }}>Qty: <strong>{totalQty.toLocaleString()}</strong></span>}
            </div>
          </div>
        </>
      )}

      {tab === 'jobs'   && <JobsTab onEditOrder={openEdit} />}
      {tab === 'queues' && <QueuesTab onEditOrder={openEdit} />}

      {wizardOpen     && <OrderWizard order={editOrder} onClose={closeWizard} />}
      {showChangeStatus && (
        <ChangeStatusModal
          selectedOrders={selectedOrderObjs}
          onClose={() => setShowChangeStatus(false)}
          onDone={async (nextStatus, ids=[]) => {
            if (ids.length) {
              setOrders(prev => prev.map(o => ids.includes(o.id) ? { ...o, status: nextStatus } : o))
            }
            markTabUpdated('ordersPage', 'orders')
            setTabNotices(getPageTabNoticeMap('ordersPage', ['orders','jobs','queues']))
            setShowChangeStatus(false)
            setSelected(new Set())
            await loadOrders()
          }}
        />
      )}
      {showAssignJob  && (
        <AssignJobModal
          selectedOrders={selectedOrderObjs}
          onClose={() => setShowAssignJob(false)}
          onDone={() => { markTabUpdated('ordersPage', 'jobs'); setTabNotices(getPageTabNoticeMap('ordersPage', ['orders','jobs','queues'])); setShowAssignJob(false); setSelected(new Set()); loadOrders() }}
        />
      )}
      {showPrint && (
        <PrintPopup
          selectedOrders={selectedOrderObjs}
          onClose={() => setShowPrint(false)}
        />
      )}
      <Dialogs />
    </div>
  )
}