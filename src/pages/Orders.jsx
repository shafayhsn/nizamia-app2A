import React, { useState, useEffect, useRef } from 'react'
import { supabase } from '../lib/supabase'
import OrderWizard from '../components/wizard/OrderWizard'
import PrintPopup, { printHTML } from '../components/PrintReports'
import { Search, Printer, Layers, Plus, X, Check, AlertCircle, Copy, Upload, Download, FileText, Table, Trash2, RefreshCcw, Settings, Lock, GripVertical } from 'lucide-react'
import { generateJobNumber } from '../lib/utils'
import { useAppDialogs } from '../components/ui/AppDialogs'
import { getPageTabNoticeMap, markTabSeen, markTabUpdated } from '../lib/tabNotices'
import { useAuth } from '../lib/authContext'

const LOGO_SRC = ''

const DEFAULT_ORDER_VISIBLE_COLUMNS = {
  picture: true,
  po: true,
  factory_ref: true,
  qty: true,
  value: true,
  ship_date: true,
  placed: true,
  merchandiser: true,
  q_count: true,
  season: false,
  po_count: false,
  sampling_status: false,
}

const DEFAULT_ORDER_COLUMN_ORDER = [
  'picture',
  'po',
  'factory_ref',
  'qty',
  'value',
  'ship_date',
  'placed',
  'merchandiser',
  'q_count',
  'season',
  'po_count',
  'sampling_status',
]


const DEFAULT_QUEUE_VISIBLE_COLUMNS = {
  q_number: true, label: true, split_rule: true, style_number: true, buyer_name: true, job_number: true,
  ship_date: false, po_number: false, store_name: false, description: false, brand_name: false,
  qty: true, shipped_qty: true, balance_qty: true, status: true,
}
const DEFAULT_QUEUE_COLUMN_ORDER = ['q_number','label','split_rule','style_number','buyer_name','job_number','ship_date','po_number','store_name','description','brand_name','qty','shipped_qty','balance_qty','status']
const QUEUE_COLUMN_LABELS = { q_number:'Q #', label:'Label', split_rule:'Split Rule', style_number:'Style', buyer_name:'Buyer', job_number:'Job', ship_date:'Delivery Date', po_number:'PO #', store_name:'Store', description:'Description', brand_name:'Brand', qty:'Qty', shipped_qty:'Shipped', balance_qty:'Balance', status:'Status' }

const statusColor = { Draft: '#F59E0B', Active: '#10B981', Booked: '#3B82F6', Shipped: '#8B5CF6', Cancelled: '#9CA3AF', Confirmed: '#10B981' }
const statusBg    = { Draft: '#FFF7ED', Active: '#ECFDF5', Booked: '#EFF6FF', Shipped: '#F5F3FF', Cancelled: '#F3F4F6', Confirmed: '#ECFDF5' }

function fmtDate(d) {
  if (!d) return '—'
  return new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
}

function queueRef(q) {
  return q?.q_number || q?.id || q?.label || null
}


function normalizeUsageData(ud) {
  if (!ud) return {}
  if (typeof ud === 'string') {
    try { return JSON.parse(ud) } catch (e) { return {} }
  }
  return ud
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
function OldQueuesTab({ onEditOrder }) {
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
    const matchSearch = !search || [q.q_number, displayQueueLabel(q.label), o.style_number, o.buyer_name, o.job_number].some(f => String(f || '').toLowerCase().includes(search.toLowerCase()))
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
  const displayQueueLabel = (label) => String(label || '').split('__APP2A_QC__')[0]
  const parseQueueCustomComponents = (q) => {
    const raw = q?.custom_components
    if (!raw) return []
    if (Array.isArray(raw)) return raw
    if (typeof raw === 'string') {
      try {
        const parsed = JSON.parse(raw)
        return Array.isArray(parsed) ? parsed : []
      } catch (e) {
        return []
      }
    }
    return []
  }

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
        safeQuery(supabase.from('size_group_colors').select('id,size_group_id,color_name,sort_order').in('size_group_id', sgIds).order('sort_order'), []),
        safeQuery(supabase.from('size_group_breakdown').select('size_group_id,color_id,size,qty').in('size_group_id', sgIds), []),
      ])
      colors = c || []
      bd = b || []
    }

    const sgMap = Object.fromEntries((sgs || []).map(g => [g.id, g]))
    const rawGroupName = q.size_group_id ? (sgMap[q.size_group_id]?.group_name || null) : null
    const cleanQLabel = displayQueueLabel(q.label)
    const fitName = (fitBlocks && fitBlocks[0]?.block_name) || '—'
    const qSgs = q.size_group_id ? (sgs || []).filter(g => g.id === q.size_group_id) : (sgs || [])

    const expandSelectedSizes = (labelText, availableSizes = []) => {
      const txt = String(labelText || '').trim()
      if (!txt) return []
      const sizes = (availableSizes || []).map(String)

      const rangeMatch = txt.match(/(\d+)\s*-\s*(\d+)/)
      if (rangeMatch) {
        const a = parseInt(rangeMatch[1], 10)
        const b = parseInt(rangeMatch[2], 10)
        return sizes.filter(sz => {
          const n = parseInt(String(sz).replace(/[^\d]/g, ''), 10)
          return Number.isFinite(n) && n >= Math.min(a,b) && n <= Math.max(a,b)
        })
      }

      const explicit = txt.split(/[,/]/).map(s => s.trim()).filter(Boolean)
      const matched = explicit.filter(v => sizes.includes(String(v)))
      return matched
    }

    const allGroupSizes = qSgs.length ? ((qSgs[0].sizes || []).map(String)) : []
    const selectedGroupSizes = expandSelectedSizes(cleanQLabel || q.size_group_label || rawGroupName, allGroupSizes)
    const effectiveSizes = selectedGroupSizes.length ? selectedGroupSizes : allGroupSizes

    const earlyNorm = (v) => String(v ?? '').trim().toLowerCase()
    const savedCustomComponents = parseQueueCustomComponents(q)
    const ruleNorm = earlyNorm(q.split_rule)
    const isCustomRule = ruleNorm.includes('custom')

    const makeComponentSpec = (g, c, gi, ci) => {
      const componentSizeMap = {}
      ;(g.sizes || []).map(String).forEach(sz => {
        const row = bd.find(b => b.size_group_id === g.id && b.color_id === c.id && String(b.size) === String(sz))
        const qty = parseFloat(row?.qty) || 0
        if (qty > 0) componentSizeMap[String(sz)] = qty
      })
      const componentQty = Object.values(componentSizeMap).reduce((sum, v) => sum + (parseFloat(v) || 0), 0)
      if (!(componentQty > 0)) return null
      return {
        key: `${gi}__${ci}__${g.group_name}__${c.color_name}`,
        label: `${c.color_name} / ${g.group_name}`,
        colorName: c.color_name,
        groupName: g.group_name,
        sizeGroupId: g.id,
        colorId: c.id,
        sizes: (g.sizes || []).map(String),
        sizeMap: componentSizeMap,
        qty: componentQty,
      }
    }

    const normalizeCustomComponentSpec = (component, idx) => {
      const colorName = component?.colour || component?.color || component?.wash || component?.color_name || component?.wash_name || '—'
      const groupName = component?.size_group || component?.sizeGroup || component?.size_group_name || component?.groupName || '—'
      const rawSizeMap = component?.qty_by_size || component?.qtyBySize || component?.sizeMap || {}
      const declaredSizes = Array.isArray(component?.sizes) ? component.sizes.map(String) : Object.keys(rawSizeMap).map(String)
      const sizeMap = {}
      declaredSizes.forEach(sz => {
        const qty = parseFloat(rawSizeMap?.[sz]) || 0
        if (qty > 0) sizeMap[String(sz)] = qty
      })
      Object.entries(rawSizeMap || {}).forEach(([sz, qtyRaw]) => {
        const qty = parseFloat(qtyRaw) || 0
        if (qty > 0 && !sizeMap[String(sz)]) sizeMap[String(sz)] = qty
      })
      const sizes = declaredSizes.length ? declaredSizes : Object.keys(sizeMap)
      const qty = parseFloat(component?.total_qty ?? component?.totalQty) || Object.values(sizeMap).reduce((sum, v) => sum + (parseFloat(v) || 0), 0)
      if (!(qty > 0) && !Object.values(sizeMap).some(v => (parseFloat(v) || 0) > 0)) return null
      return {
        key: component?.key || `custom_component_${idx}`,
        label: `${colorName} / ${groupName}`,
        colorName,
        groupName,
        sizeGroupId: component?.size_group_id || null,
        colorId: component?.color_id || null,
        sizes: sizes.map(String),
        sizeMap,
        qty,
        source: 'custom_components',
      }
    }

    const customComponentSpecs = savedCustomComponents
      .map((component, idx) => normalizeCustomComponentSpec(component, idx))
      .filter(Boolean)

    const allComponentSpecs = []
    ;(sgs || []).forEach((g, gi) => {
      const groupColors = colors.filter(c => c.size_group_id === g.id).sort((a,b) => (a.sort_order || 0) - (b.sort_order || 0))
      groupColors.forEach((c, ci) => {
        const spec = makeComponentSpec(g, c, gi, ci)
        if (spec) allComponentSpecs.push(spec)
      })
    })

    const parseLabelParts = (label) => {
      const cleaned = displayQueueLabel(label || '').replace(/^.*?·\s*/, '').trim()
      const parts = cleaned.split('/').map(x => x.trim()).filter(Boolean)
      return {
        color: parts[0] || cleaned || '',
        group: parts.length > 1 ? parts.slice(1).join(' / ') : cleaned || '',
      }
    }

    const parts = parseLabelParts(q.label)
    const qColorName = q.color_name || parts.color || ''
    const qGroupName = rawGroupName || q.size_group_name || q.size_group_label || parts.group || ''

    const selectedQueueComponents = (() => {
      // CRITICAL IOS RULE:
      // IOS must be the proven single-variant table repeated for each actual
      // 1 wash/colour × 1 size-group component inside the selected queue.
      // Never invent components from the full order matrix for Custom queues.
      if (isCustomRule) {
        return customComponentSpecs
      }
      if (ruleNorm.includes('full po')) {
        return allComponentSpecs
      }
      if (ruleNorm.includes('colour') && ruleNorm.includes('size group')) {
        return allComponentSpecs.filter(comp =>
          (!qColorName || earlyNorm(comp.colorName) === earlyNorm(qColorName)) &&
          (!qGroupName || earlyNorm(comp.groupName) === earlyNorm(qGroupName))
        )
      }
      if (ruleNorm.includes('ratio')) {
        return allComponentSpecs.filter(comp =>
          (!qColorName || earlyNorm(comp.colorName) === earlyNorm(qColorName)) &&
          (!qGroupName || earlyNorm(comp.groupName) === earlyNorm(qGroupName))
        )
      }
      if (ruleNorm.includes('colour') || ruleNorm.includes('wash')) {
        return allComponentSpecs.filter(comp => !qColorName || earlyNorm(comp.colorName) === earlyNorm(qColorName))
      }
      if (ruleNorm.includes('size group')) {
        return allComponentSpecs.filter(comp =>
          (q.size_group_id && String(comp.sizeGroupId) === String(q.size_group_id)) ||
          (!q.size_group_id && qGroupName && earlyNorm(comp.groupName) === earlyNorm(qGroupName))
        )
      }
      return allComponentSpecs.filter(comp =>
        (!qColorName || earlyNorm(comp.colorName) === earlyNorm(qColorName)) &&
        (!qGroupName || earlyNorm(comp.groupName) === earlyNorm(qGroupName))
      )
    })()

    const groupName = selectedQueueComponents.length === 1
      ? selectedQueueComponents[0].groupName
      : (cleanQLabel || qGroupName || rawGroupName || '—')

    const sizeMap = {}
    selectedQueueComponents.forEach(comp => {
      Object.entries(comp.sizeMap || {}).forEach(([sz, qty]) => {
        sizeMap[String(sz)] = (sizeMap[String(sz)] || 0) + (parseFloat(qty) || 0)
      })
    })

    const sizeOrder = [...new Set(selectedQueueComponents.flatMap(comp => comp.sizes || []))]
      .filter(sz => (parseFloat(sizeMap[String(sz)]) || 0) > 0)
    const ratioVals = sizeOrder.map(sz => parseFloat(sizeMap[sz]) || 0)
    const positive = ratioVals.filter(v => v > 0)
    const gcd = (a, b) => b ? gcd(b, a % b) : a
    const ratioBase = positive.length ? positive.map(v => Math.round(v)).reduce((a, b) => gcd(a, b)) : 0
    const ratioMap = {}
    sizeOrder.forEach(sz => {
      const val = parseFloat(sizeMap[sz]) || 0
      ratioMap[sz] = ratioBase && val ? Math.round(val / ratioBase) : 0
    })

    const totalQty = parseFloat(ord.total_qty) || 0
    const queueQty = parseFloat(q.qty) || Object.values(sizeMap).reduce((sum, v) => sum + (parseFloat(v) || 0), 0)
    const ratio = totalQty > 0 ? queueQty / totalQty : 0

    const wastageFactor = (x) => 1 + ((parseFloat(x) || 0) / 100)
    
    
    const normalizeUD = (ud) => {
      if (!ud) return {}
      if (typeof ud === 'string') {
        try { return JSON.parse(ud) } catch (e) { return {} }
      }
      return ud
    }

    const usageNumeric = (v) => {
      if (v == null) return 0
      if (typeof v === 'number') return Number.isFinite(v) ? v : 0
      if (typeof v === 'string') {
        const n = parseFloat(v)
        return Number.isFinite(n) ? n : 0
      }
      if (typeof v === 'object') {
        if (v.na || v.disabled) return 0
        const candidate = v.value ?? v.qty ?? v.consumption ?? v.cons ?? v.consump ?? v.amount ?? v.base_qty ?? 0
        const n = parseFloat(candidate)
        return Number.isFinite(n) ? n : 0
      }
      return 0
    }

    const norm = (v) => String(v ?? '').trim().toLowerCase()

    const pickKnownName = (raw, options = []) => {
      const rawNorm = norm(raw)
      if (!rawNorm) return null
      const direct = options.find(opt => norm(opt) === rawNorm)
      if (direct) return direct
      return options.find(opt => rawNorm.includes(norm(opt)) || norm(opt).includes(rawNorm)) || null
    }

    const selectedSizes = Object.keys(sizeMap || {}).filter(sz => (parseFloat(sizeMap[sz]) || 0) > 0)

    // Build the same order-level size/color context Purchasing uses
    const pd = {
      colors: [],
      sizeGroups: [],
      allSizes: [],
      sgMatrix: [],
      sgColorTotals: {},
      sgColorSizeMatrix: {},
      sizeGroupMap: {},
    }

    ;(sgs || []).forEach(g => {
      pd.sizeGroupMap[g.id] = { id:g.id, name:g.group_name, sizes:g.sizes||[], base_size:g.base_size || null }
      const groupColors = (colors || []).filter(c => c.size_group_id === g.id)
      const groupSizes = (g.sizes || []).map(String)
      let groupQty = 0
      const matrixColors = []
      pd.sgColorTotals[g.group_name] = pd.sgColorTotals[g.group_name] || {}
      pd.sgColorSizeMatrix[g.group_name] = pd.sgColorSizeMatrix[g.group_name] || {}

      groupColors.forEach(c => {
        const sizeVals = {}
        let colorQty = 0
        groupSizes.forEach(sz => {
          const row = (bd || []).find(b => b.size_group_id === g.id && b.color_id === c.id && String(b.size) === String(sz))
          const qty = parseFloat(row?.qty) || 0
          sizeVals[String(sz)] = qty
          colorQty += qty
        })
        groupQty += colorQty
        pd.colors.push({ name:c.color_name, qty:colorQty })
        pd.sgColorTotals[g.group_name][c.color_name] = colorQty
        pd.sgColorSizeMatrix[g.group_name][c.color_name] = sizeVals
        matrixColors.push({ colorName:c.color_name, qty:colorQty, sizeMap:sizeVals })
      })

      pd.sizeGroups.push({ id:g.id, name:g.group_name, qty:groupQty })
      pd.sgMatrix.push({ sgName:g.group_name, qty:groupQty, colors:matrixColors })
      groupSizes.forEach(sz => {
        const qty = matrixColors.reduce((s, c) => s + (parseFloat(c.sizeMap?.[String(sz)]) || 0), 0)
        pd.allSizes.push({ size:String(sz), qty, sgName:g.group_name })
      })
    })

    const getQueueContext = (queue) => {
      const splitRule = queue.split_rule || 'None'
      const label = String(queue.label || '').trim()
      const splitParts = label.split('/').map(x => x.trim()).filter(Boolean)
      const knownColors = (pd?.colors || []).map(c => c.name)
      const knownGroups = (pd?.sizeGroups || []).map(g => g.name)
      const inferredColor = pickKnownName(splitParts[0], knownColors)
      const inferredGroup = pickKnownName(splitParts[splitParts.length - 1], knownGroups)
      const queueColorName = pickKnownName(queue.color_name, knownColors) || inferredColor || null
      const groupFromId = queue.size_group_id ? (pd?.sizeGroupMap?.[queue.size_group_id]?.name || null) : null
      const effectiveGroupName = pickKnownName(groupFromId, knownGroups) || inferredGroup || pickKnownName(rawGroupName, knownGroups) || null

      const includeCell = (sgName, colorName) => {
        if (splitRule === 'Custom' && selectedQueueComponents.length) {
          return selectedQueueComponents.some(comp => norm(comp.groupName) === norm(sgName) && norm(comp.colorName) === norm(colorName))
        }
        const sgMatch = !effectiveGroupName || norm(sgName) === norm(effectiveGroupName)
        const colorMatch = !queueColorName || norm(colorName) === norm(queueColorName)
        if (splitRule === 'By Colour' || splitRule === 'By Wash') return colorMatch
        if (splitRule === 'By Size Group') return sgMatch
        if (splitRule === 'Colour × Size Group' || splitRule === 'By Ratio') return sgMatch && colorMatch
        return true
      }

      const sizeQtyForQueue = (size) => {
        let total = 0
        const matrix = pd?.sgColorSizeMatrix || {}
        Object.entries(matrix).forEach(([sgName, colorMap]) => {
          Object.entries(colorMap || {}).forEach(([colorName, sizes]) => {
            if (includeCell(sgName, colorName)) total += parseFloat(sizes?.[String(size)]) || 0
          })
        })
        return total
      }

      const colorQtyForQueue = (wanted) => {
        let total = 0
        const matrix = pd?.sgColorTotals || {}
        Object.entries(matrix).forEach(([sgName, colorMap]) => {
          Object.entries(colorMap || {}).forEach(([colorName, qty]) => {
            if (norm(colorName) !== norm(wanted)) return
            if (includeCell(sgName, colorName)) total += parseFloat(qty) || 0
          })
        })
        return total
      }

      const sizeGroupQtyForQueue = (wanted) => {
        let total = 0
        const matrix = pd?.sgColorTotals || {}
        Object.entries(matrix).forEach(([sgName, colorMap]) => {
          if (norm(sgName) !== norm(wanted)) return
          Object.entries(colorMap || {}).forEach(([colorName, qty]) => {
            if (includeCell(sgName, colorName)) total += parseFloat(qty) || 0
          })
        })
        return total
      }

      const queueQty = parseFloat(queue.qty) || 0
      return { groupName: effectiveGroupName, splitRule, queueColorName, queueQty, sizeQtyForQueue, colorQtyForQueue, sizeGroupQtyForQueue }
    }

    const calcReqQtyForQueue = (item, queue) => {
      const { groupName: ctxGroupName, queueColorName, queueQty, sizeQtyForQueue, colorQtyForQueue, sizeGroupQtyForQueue } = getQueueContext(queue)
      const ruleRaw = item.usage_rule || 'Generic'
      const rule = String(ruleRaw).trim()
      const ud = normalizeUD(item.usage_data)
      const wastageFactor = 1 + ((parseFloat(item.wastage) || 5) / 100)
      const base = parseFloat(item.base_qty) || 0

      if (rule === 'Generic' || !rule) return base * queueQty * wastageFactor
      if (rule === 'By Color' || rule === 'By Colour') {
        return Object.entries(ud || {}).reduce((s,[colorName, cons]) => s + (usageNumeric(cons) * colorQtyForQueue(colorName) * wastageFactor), 0)
      }
      if (rule === 'By Size Group') {
        return Object.entries(ud || {}).reduce((s,[sgName, cons]) => s + (usageNumeric(cons) * sizeGroupQtyForQueue(sgName) * wastageFactor), 0)
      }
      if (rule === 'By Individual Sizes' || rule === 'By Individual Size') {
        return Object.entries(ud || {}).reduce((s,[size, cons]) => s + (usageNumeric(cons) * sizeQtyForQueue(size) * wastageFactor), 0)
      }
      if (rule === 'Configure Own') {
        if (Array.isArray(ud.__matrix)) {
          return ud.__matrix.reduce((s,m)=> {
            const sgName = pickKnownName(m.sgName, pd.sizeGroups.map(g => g.name)) || m.sgName
            const colorName = pickKnownName(m.colorName, pd.colors.map(c => c.name)) || m.colorName
            if ((queue.split_rule === 'Colour × Size Group' || queue.split_rule === 'By Ratio') && (!ctxGroupName || !queueColorName)) return s
            if (queue.split_rule === 'By Size Group' && !ctxGroupName) return s
            if ((queue.split_rule === 'By Colour' || queue.split_rule === 'By Wash') && !queueColorName) return s
            const matchesGroup = !ctxGroupName || norm(sgName) === norm(ctxGroupName) || (queue.split_rule === 'By Colour' && norm(queueColorName) === norm(colorName))
            const matchesColor = !queueColorName || norm(colorName) === norm(queueColorName) || queue.split_rule === 'By Size Group'
            if (!matchesGroup || !matchesColor) return s
            const cellQty = pd.sgColorTotals?.[sgName]?.[colorName] || 0
            return s + (usageNumeric(m.consumption) * cellQty * wastageFactor)
          },0)
        }
        const groups = ud.__groups || []
        return groups.reduce((s,g)=> {
          const sizes = g.sizes || []
          const qty = sizes.reduce((sq,sz)=>sq + sizeQtyForQueue(sz), 0)
          return s + (usageNumeric(g.consumption) * qty * wastageFactor)
        },0)
      }
      if (rule === 'By Batch') {
        const rows = Array.isArray(ud?.batches) ? ud.batches : (Array.isArray(ud) ? ud : [])
        return rows.reduce((s,row) => {
          const colorName = row.color || row.color_name || row.colour || null
          if (colorName && queueColorName && norm(colorName) !== norm(queueColorName)) return s
          const rowSizesRaw = row.sizes || row.selectedSizes || row.size_group || row.size || []
          const rowSizes = Array.isArray(rowSizesRaw) ? rowSizesRaw : String(rowSizesRaw || '').split(',').map(x=>x.trim()).filter(Boolean)
          const matchedQty = rowSizes.length ? rowSizes.reduce((sq, sz) => sq + sizeQtyForQueue(sz), 0) : queueQty
          return s + usageNumeric(row) * matchedQty * wastageFactor
        },0)
      }
      return base * queueQty * wastageFactor
    }

    const getConsumpForQueue = (item, queue) => {
      const { groupName: ctxGroupName, queueColorName, queueQty, sizeQtyForQueue, colorQtyForQueue, sizeGroupQtyForQueue } = getQueueContext(queue)
      const ruleRaw = item.usage_rule || 'Generic'
      const rule = String(ruleRaw).trim()
      const ud = normalizeUD(item.usage_data)
      const base = parseFloat(item.base_qty) || 0

      const pickSingle = (vals) => {
        const clean = (vals || []).map(v => parseFloat(v) || 0).filter(v => v > 0)
        if (!clean.length) return base
        const uniq = [...new Set(clean.map(v => Number(v.toFixed(4))))]
        return uniq[0] || base
      }

      if (rule === 'Generic' || !rule) return base

      if (rule === 'By Color' || rule === 'By Colour') {
        const vals = Object.entries(ud || {})
          .filter(([colorName]) => colorQtyForQueue(colorName) > 0)
          .map(([, cons]) => usageNumeric(cons))
        return pickSingle(vals)
      }

      if (rule === 'By Size Group') {
        const vals = Object.entries(ud || {})
          .filter(([sgName]) => sizeGroupQtyForQueue(sgName) > 0)
          .map(([, cons]) => usageNumeric(cons))
        return pickSingle(vals)
      }

      if (rule === 'By Individual Sizes' || rule === 'By Individual Size') {
        const vals = Object.entries(ud || {})
          .filter(([size]) => sizeQtyForQueue(size) > 0)
          .map(([, cons]) => usageNumeric(cons))
        return pickSingle(vals)
      }

      if (rule === 'Configure Own') {
        if (Array.isArray(ud.__matrix)) {
          const vals = ud.__matrix.flatMap((m) => {
            const sgName = pickKnownName(m.sgName, pd.sizeGroups.map(g => g.name)) || m.sgName
            const colorName = pickKnownName(m.colorName, pd.colors.map(c => c.name)) || m.colorName
            if ((queue.split_rule === 'Colour × Size Group' || queue.split_rule === 'By Ratio') && (!ctxGroupName || !queueColorName)) return []
            if (queue.split_rule === 'By Size Group' && !ctxGroupName) return []
            if ((queue.split_rule === 'By Colour' || queue.split_rule === 'By Wash') && !queueColorName) return []
            const matchesGroup = !ctxGroupName || norm(sgName) === norm(ctxGroupName) || (queue.split_rule === 'By Colour' && norm(queueColorName) === norm(colorName))
            const matchesColor = !queueColorName || norm(colorName) === norm(queueColorName) || queue.split_rule === 'By Size Group'
            if (!matchesGroup || !matchesColor) return []
            const cellQty = pd.sgColorTotals?.[sgName]?.[colorName] || 0
            return cellQty > 0 ? [usageNumeric(m.consumption)] : []
          })
          return pickSingle(vals)
        }
        const groups = ud.__groups || []
        const vals = groups.flatMap((g) => {
          const sizes = g.sizes || []
          const qty = sizes.reduce((sq, sz) => sq + sizeQtyForQueue(sz), 0)
          return qty > 0 ? [usageNumeric(g.consumption)] : []
        })
        return pickSingle(vals)
      }

      if (rule === 'By Batch') {
        const rows = Array.isArray(ud?.batches) ? ud.batches : (Array.isArray(ud) ? ud : [])
        const vals = rows.flatMap((row) => {
          const colorName = row.color || row.color_name || row.colour || null
          if (colorName && queueColorName && norm(colorName) !== norm(queueColorName)) return []
          const rowSizesRaw = row.sizes || row.selectedSizes || row.size_group || row.size || []
          const rowSizes = Array.isArray(rowSizesRaw) ? rowSizesRaw : String(rowSizesRaw || '').split(',').map(x => x.trim()).filter(Boolean)
          const matchedQty = rowSizes.length ? rowSizes.reduce((sq, sz) => sq + sizeQtyForQueue(sz), 0) : queueQty
          return matchedQty > 0 ? [usageNumeric(row)] : []
        })
        return pickSingle(vals)
      }

      return base
    }
const libMap = Object.fromEntries((libs || []).map(x => [x.id, x]))
    const fabricItems = (bom || []).filter(x => x.category === 'Fabric').map(x => {
      const lib = x.library_item_id ? libMap[x.library_item_id] : null
      const consump = getConsumpForQueue(x, q)
      return {
        ...x,
        q_qty: calcReqQtyForQueue(x, q),
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
      const consump = getConsumpForQueue(x, q)
      return {
        ...x,
        q_qty: calcReqQtyForQueue(x, q),
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

    const makeRatioMap = (sizes, map) => {
      const vals = (sizes || []).map(sz => parseFloat(map?.[sz]) || 0)
      const pos = vals.filter(v => v > 0)
      const rb = pos.length ? pos.map(v => Math.round(v)).reduce((a, b) => gcd(a, b)) : 0
      const out = {}
      ;(sizes || []).forEach(sz => {
        const val = parseFloat(map?.[sz]) || 0
        out[sz] = rb && val ? Math.round(val / rb) : 0
      })
      return out
    }
    const customQueueMissingComponents = isCustomRule && !customComponentSpecs.length

    const variantBlocks = selectedQueueComponents.length
      ? selectedQueueComponents.map(comp => {
          const compSizes = (comp.sizes || []).filter(sz => (parseFloat(comp.sizeMap?.[sz]) || 0) > 0)
          const compRatio = makeRatioMap(compSizes, comp.sizeMap)
          const compCutting = compSizes.reduce((sum, sz) => sum + Math.round((parseFloat(comp.sizeMap?.[sz]) || 0) * (1 + cuttingPct / 100)), 0)
          return { ...comp, sizeOrder: compSizes, ratioMap: compRatio, cuttingQty: compCutting }
        })
      : [{ label: groupName || washName || '—', colorName: q.color_name || null, groupName, sizeMap, sizeOrder, ratioMap, qty: queueQty, cuttingQty }]

    return {
      ord, q: { ...q, label: cleanQLabel }, groupName, fitName, washName, sizeMap, sizeOrder, ratioMap, variantBlocks, customQueueMissingComponents,
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
    if (d.customQueueMissingComponents) {
      return `<div style="width:210mm;min-height:297mm;padding:12mm;font-family:Arial,sans-serif;color:#000;box-sizing:border-box;">
        <div style="font-size:22px;font-weight:900;margin-bottom:8mm;">IOS Print Blocked</div>
        <div style="border:2px solid #000;padding:8mm;font-size:14px;line-height:1.5;">
          <strong>Custom queue missing component data.</strong><br/>
          Regenerate this queue after running the <code>order_queues.custom_components</code> migration.
          IOS cannot print Custom queues without saved wash × size-group components.
        </div>
      </div>`
    }
    const qRef     = d.q.q_number || 'Queued'
    const sizeCols = (d.sizeOrder || []).filter(sz => (d.sizeMap[sz] || 0) > 0)

    const th  = 'border:1px solid #000;padding:2.7px 4px;font-size:9.15px;font-weight:800;text-align:center;vertical-align:middle;white-space:nowrap;line-height:1.22;'
    const td  = 'border:1px solid #000;padding:2.65px 4px;font-size:9px;vertical-align:middle;line-height:1.22;'
    const tdC = td + 'text-align:center;'
    const tdR = td + 'text-align:right;'
    const blk = 'background:#000;color:#fff;letter-spacing:1.5px;text-transform:uppercase;'

    const shortUom = (u) => {
      if (!u) return 'pcs'
      const s = String(u).toLowerCase()
      if (s.includes('yard') || s === 'yds') return 'yds'
      if (s.includes('meter') || s === 'm') return 'm'
      if (s.includes('roll')) return 'roll'
      if (s.includes('kg')) return 'kg'
      if (s.includes('cone')) return 'cone'
      if (s.includes('set')) return 'set'
      if (s.includes('ctn')) return 'ctn'
      return u
    }

    const titleCase = (v) => String(v || '').replace(/(^|\s|\/|-)([a-z])/g, (_, a, b) => `${a}${b.toUpperCase()}`)
    const normalizePackMeta = (raw) => {
      const ud = normalizeUsageData(raw)
      const perPack = parseFloat(ud?._packing_qty ?? ud?.packing_qty ?? ud?.pack_qty ?? ud?.qty_per_pack ?? ud?.per_pack_qty ?? 0)
      const packUnit = String(ud?._packing_unit ?? ud?.packing_unit ?? ud?.pack_unit ?? ud?.req_unit ?? '').trim()
      const itemUnit = shortUom(ud?._packing_base_unit || ud?.base_unit || ud?.consump_unit || ud?.uom || '')
      return { perPack, packUnit, itemUnit }
    }
    const formatPackLogic = (item, preferConsumpUnit = false) => {
      const meta = normalizePackMeta(item?.usage_data)
      if (!(meta.perPack > 0)) return '—'
      const numeratorUnit = preferConsumpUnit ? shortUom(item?.unit) : (meta.itemUnit || shortUom(item?.unit))
      const left = Number.isInteger(meta.perPack) ? String(Math.trunc(meta.perPack)) : meta.perPack.toFixed(2).replace(/\.00$/, '')
      const right = meta.packUnit || 'pack'
      return `${left}${numeratorUnit ? ` ${numeratorUnit}` : ''}/${right}`
    }
    const formatPackRequirement = (item) => {
      const req = parseFloat(item?.q_qty) || 0
      const meta = normalizePackMeta(item?.usage_data)
      if (meta.perPack > 0) {
        const packs = Math.ceil(req / meta.perPack)
        const baseLabel = String(meta.packUnit || 'pack').trim().toLowerCase().replace(/s$/, '')
        const label = packs === 1 ? baseLabel : `${baseLabel}s`
        return packs > 0 ? `${packs.toLocaleString()} ${label}` : '—'
      }
      const uom = shortUom(item?.unit)
      return req > 0 ? `${Math.ceil(req).toLocaleString()} ${uom}` : '—'
    }
    const formatConsump = (value, uom) => {
      const n = parseFloat(value) || 0
      if (n <= 0) return '—'
      const shown = Math.abs(n - Math.round(n)) < 0.0001 ? String(Math.round(n)) : n.toFixed(2)
      return `${shown} ${uom}`
    }

    const fabricRows = (d.fabricItems || []).map(r => {
      const uom = shortUom(r.unit)
      const req = parseFloat(r.q_qty) || 0
      return `<tr>
        <td style="${td};white-space:nowrap;">${esc(r.name || '—')}</td>
        <td style="${td};white-space:nowrap;">${esc(r.shade || '—')}</td>
        <td style="${td}">${esc(r.content || '—')}</td>
        <td style="${tdC};white-space:nowrap;">${esc(r.weight || '—')}</td>
        <td style="${tdC};white-space:nowrap;">${esc(r.width || '—')}</td>
        <td style="${tdC};white-space:nowrap;">${formatConsump(r.consump, uom)}</td>
        <td style="${tdR};white-space:nowrap;">${req > 0 ? `${Math.ceil(req).toLocaleString()} ${uom}` : '—'}</td>
      </tr>`
    }).join('') || `<tr><td style="${tdC}" colspan="7">No fabric items</td></tr>`

    const trimRow = (r) => {
      const type = String(r.category || '').toLowerCase().includes('stitch') ? 'Stitching' : 'Packing'
      const shade = r.specification || r.detail || r.shade || '—'
      const packLogic = formatPackLogic(r, true)
      return `<tr>
        <td style="${td};white-space:nowrap;">${esc(type)}</td>
        <td style="${td};white-space:nowrap;">${esc(r.name || '—')}</td>
        <td style="${td}">${esc(shade)}</td>
        <td style="${tdC};white-space:nowrap;">${formatConsump(r.consump, shortUom(r.unit))}</td>
        <td style="${tdC};white-space:nowrap;">${esc(packLogic)}</td>
        <td style="${tdR};white-space:nowrap;">${esc(formatPackRequirement(r))}</td>
        <td style="${tdC};white-space:nowrap;">${esc(r.po_number || '—')}</td>
        <td style="${tdC};white-space:nowrap;">${esc(r.po_status || '—')}</td>
      </tr>`
    }
    const stitchRows  = (d.stitchItems  || []).map(trimRow).join('') || `<tr><td style="${tdC}" colspan="8">—</td></tr>`
    const packingRows = (d.packingItems || []).map(trimRow).join('')
    const dividerRow = packingRows ? `<tr><td colspan="8" style="background:#cfcfcf;height:5px;padding:0;border:1px solid #777;font-size:0;line-height:0;">&nbsp;</td></tr>` : ''

    const embText = (d.embItems || []).length > 0
      ? (d.embItems).map(e => {
          const parts = [e.description, e.technique, e.placement ? '@' + e.placement : null].filter(Boolean)
          return esc(parts.join(' · '))
        }).join('<br/>')
      : '—'

    const blisterEach  = d.blisterEach  !== '—' ? d.blisterEach  : '—'
    const blisterTotal = d.blisterTotal !== '—' ? d.blisterTotal : '—'
    const cartonEach   = d.cartonEach   !== '—' ? d.cartonEach   : '—'
    const cartonTotal  = d.cartonTotal  !== '—' ? d.cartonTotal  : '—'

    const nowStr = new Date().toLocaleString('en-GB', {
      day: '2-digit', month: '2-digit', year: '2-digit',
      hour: 'numeric', minute: '2-digit', hour12: true,
    }).replace(',', ' -')
    const factoryRef = (d.ord.factory_ref || '').trim() || [d.ord.style_number, d.ord.store_name].filter(Boolean).join(' -') || '—'

    const variantBlocks = (d.variantBlocks && d.variantBlocks.length ? d.variantBlocks : [{
      label: d.groupName || d.washName || '—',
      colorName: d.q.color_name || '',
      groupName: d.groupName || '',
      sizeMap: d.sizeMap || {},
      ratioMap: d.ratioMap || {},
      qty: d.q.qty || 0,
      cuttingQty: d.cuttingQty || 0,
    }]).filter(b => (parseFloat(b.qty) || Object.values(b.sizeMap || {}).some(v => (parseFloat(v) || 0) > 0)))
    const isMultiVariant = variantBlocks.length > 1
    const variantTotalQty = variantBlocks.reduce((sum, b) => sum + (parseFloat(b.qty) || Object.values(b.sizeMap || {}).reduce((s, v) => s + (parseFloat(v) || 0), 0)), 0) || (parseFloat(d.q.qty) || 0)
    const variantTotalCutting = variantBlocks.reduce((sum, b) => sum + (parseFloat(b.cuttingQty) || 0), 0) || (parseFloat(d.cuttingQty) || 0)
    const formatVariantLabel = (b) => {
      const top = b.colorName || String(b.label || '').split('/')[0]?.trim() || '—'
      const bottom = b.groupName || String(b.label || '').split('/').slice(1).join('/').trim() || ''
      return `<div style="font-weight:800;line-height:1.2;">${esc(top)}</div>${bottom ? `<div style="font-size:8.3px;font-weight:600;line-height:1.2;margin-top:1px;">${esc(bottom)}</div>` : ''}`
    }
    const renderBreakdownTable = (b) => {
      const blockSizeMap = b.sizeMap || {}
      const localSizeCols = (b.sizeOrder && b.sizeOrder.length ? b.sizeOrder : Object.keys(blockSizeMap))
        .map(String)
        .filter(sz => (parseFloat(blockSizeMap[sz]) || 0) > 0)
      const cols = localSizeCols.length ? localSizeCols : sizeCols
      const blockRatioMap = b.ratioMap || {}
      const blockQty = parseFloat(b.qty) || cols.reduce((sum, sz) => sum + (parseFloat(blockSizeMap[sz]) || 0), 0)
      const blockCutting = parseFloat(b.cuttingQty) || cols.reduce((sum, sz) => sum + Math.round((parseFloat(blockSizeMap[sz]) || 0) * (1 + (parseFloat(d.cuttingPct) || 0) / 100)), 0)
      const ratioTotal = cols.reduce((sum, sz) => sum + (parseFloat(blockRatioMap[sz]) || 0), 0)
      return `
        <table class="ios-component-table" style="width:100%;border-collapse:collapse;table-layout:fixed;margin-bottom:1.4mm;page-break-inside:avoid;break-inside:avoid;">
          <colgroup>
            <col style="width:24%"/>
            <col style="width:22%"/>
            ${cols.map(() => '<col style="width:9%"/>').join('')}
            <col style="width:11%"/>
          </colgroup>
          <thead>
            <tr>
              <th style="${th}${blk}">SIZE GROUP / WASH</th>
              <th style="${th}${blk}">DETAILS</th>
              ${cols.map(sz => `<th style="${th}${blk}">${esc(sz)}</th>`).join('')}
              <th style="${th}${blk}">TOTAL</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td style="${tdC};font-weight:800;" rowspan="4">${formatVariantLabel(b)}</td>
              <td style="${td};font-weight:700;white-space:nowrap;">Order Quantity</td>
              ${cols.map(sz => `<td style="${tdC}">${esc(blockSizeMap[sz] || 0)}</td>`).join('')}
              <td style="${tdC};font-weight:700;">${esc(blockQty || 0)}</td>
            </tr>
            <tr>
              <td style="${td};font-weight:700;">Ratio</td>
              ${cols.map(sz => `<td style="${tdC}">${esc(blockRatioMap[sz] || 0)}</td>`).join('')}
              <td style="${tdC}">${ratioTotal}</td>
            </tr>
            <tr>
              <td style="${td};font-weight:700;">Cutting Qty +${esc(d.cuttingPct || 0)}%</td>
              ${cols.map(sz => `<td style="${tdC}">${Math.round((parseFloat(blockSizeMap[sz]) || 0) * (1 + (parseFloat(d.cuttingPct) || 0) / 100))}</td>`).join('')}
              <td style="${tdC};font-weight:700;">${Math.ceil(blockCutting || 0)}</td>
            </tr>
            <tr>
              <td style="${td};color:#555;">Zipper Usage/Size</td>
              ${cols.map(() => `<td style="${tdC}"></td>`).join('')}
              <td style="${tdC}"></td>
            </tr>
          </tbody>
        </table>`
    }
    const breakdownTables = variantBlocks.map(renderBreakdownTable).join('')
    const breakdownTotalBox = isMultiVariant ? `
      <table style="width:100%;border-collapse:collapse;table-layout:fixed;margin-bottom:1mm;">
        <tbody>
          <tr>
            <td style="${td};font-weight:900;background:#f3f4f6;text-align:right;">QUEUE TOTAL</td>
            <td style="${tdC};font-weight:900;background:#f3f4f6;width:25mm;">${esc(variantTotalQty)}</td>
          </tr>
          <tr>
            <td style="${td};font-weight:900;background:#f3f4f6;text-align:right;">CUTTING TOTAL</td>
            <td style="${tdC};font-weight:900;background:#f3f4f6;width:25mm;">${Math.ceil(variantTotalCutting)}</td>
          </tr>
        </tbody>
      </table>` : ''

    return `
      <style>
        @media print {
          .ios-page { width:210mm; min-height:297mm; page-break-after:auto; }
          .ios-variant-block { page-break-inside: avoid; break-inside: avoid; }
          thead { display: table-header-group; }
          tr { page-break-inside: avoid; break-inside: avoid; }
        }
      </style>
      <div class="ios-page" style="width:210mm;min-height:297mm;padding:5mm 4mm 4mm 4mm;font-family:Arial,sans-serif;color:#000;background:#fff;box-sizing:border-box;display:flex;flex-direction:column;gap:1mm;">

        <div style="display:flex;justify-content:space-between;font-size:8.1px;color:#333;">
          <div>Document Ref#IOS-${esc(qRef)}</div>
          <div>Date Created: ${esc(nowStr)}</div>
          <div>Username: admin</div>
        </div>

        <div style="display:grid;grid-template-columns:1fr auto 1fr;align-items:center;border-bottom:2px solid #000;padding-bottom:2mm;">
          <div>
            <div style="font-size:18px;font-weight:900;line-height:1.05;">NIZAMIA APPARELS</div>
            <div style="font-size:8px;font-weight:700;letter-spacing:1.8px;text-transform:uppercase;">Internal Order Sheet</div>
          </div>
          <div style="display:flex;justify-content:center;">
            <div style="background:#000;color:#fff;border:2px solid #000;border-radius:50%;width:13mm;height:13mm;display:flex;align-items:center;justify-content:center;font-size:10px;font-weight:900;">IOS</div>
          </div>
          <div style="text-align:right;font-size:24px;font-weight:900;line-height:1;">${esc(qRef)}</div>
        </div>

        <table style="width:100%;border-collapse:collapse;table-layout:fixed;">
          <colgroup>
            <col style="width:15%"/>
            <col style="width:12%"/>
            <col style="width:16%"/>
            <col style="width:11%"/>
            <col style="width:16%"/>
            <col style="width:12%"/>
            <col style="width:18%"/>
          </colgroup>
          <tr>
            <td style="border:none;padding:0 2px 0.5mm 0;font-size:8.7px;font-weight:700;">Brand</td>
            <td style="border:none;padding:0 2px 0.5mm 0;font-size:8.7px;font-weight:700;">Style Ne</td>
            <td style="border:none;padding:0 2px 0.5mm 0;font-size:8.7px;font-weight:700;">Fit Name</td>
            <td style="border:none;padding:0 2px 0.5mm 0;font-size:8.7px;font-weight:700;">PO#</td>
            <td style="border:none;padding:0 2px 0.5mm 0;font-size:8.7px;font-weight:700;">Factory Ref</td>
            <td style="border:none;padding:0 2px 0.5mm 0;font-size:8.7px;font-weight:700;">Store</td>
            <td style="border:none;padding:0 2px 0.5mm 0;font-size:8.7px;font-weight:700;">Ship Date</td>
          </tr>
          <tr>
            <td style="border:none;padding:0 2px 1.2mm 0;font-size:10px;font-weight:700;white-space:nowrap;">${esc(d.ord.brand_name || '—')}</td>
            <td style="border:none;padding:0 2px 1.2mm 0;font-size:10px;white-space:nowrap;">${esc(d.ord.style_number || '—')}</td>
            <td style="border:none;padding:0 2px 1.2mm 0;font-size:10px;white-space:nowrap;">${esc(d.fitName || '—')}</td>
            <td style="border:none;padding:0 2px 1.2mm 0;font-size:10px;white-space:nowrap;">${esc(d.ord.po_number || '—')}</td>
            <td style="border:none;padding:0 2px 1.2mm 0;font-size:10px;white-space:nowrap;">${esc(factoryRef)}</td>
            <td style="border:none;padding:0 2px 1.2mm 0;font-size:10px;white-space:nowrap;">${esc(d.ord.store_name || '—')}</td>
            <td style="border:none;padding:0 2px 1.2mm 0;font-size:10px;white-space:nowrap;">${esc(fmtDate(d.ord.ship_date))}</td>
          </tr>
        </table>

        <div style="font-size:10.8px;font-weight:800;margin-bottom:0.7mm;">Order BreakDown</div>
        ${breakdownTables}
        ${breakdownTotalBox}

        <div style="font-size:10.8px;font-weight:800;margin-bottom:0.7mm;">Materials &amp; Trims Requirements</div>
        <table style="width:100%;border-collapse:collapse;table-layout:fixed;margin-bottom:0.8mm;">
          <colgroup>
            <col style="width:13%"/>
            <col style="width:16%"/>
            <col style="width:31%"/>
            <col style="width:11%"/>
            <col style="width:8%"/>
            <col style="width:10%"/>
            <col style="width:11%"/>
          </colgroup>
          <thead>
            <tr>${['Item', 'Shade', 'Content', 'Weight', 'Width', 'Consump', 'Required'].map(h => `<th style="${th}${blk}">${h}</th>`).join('')}</tr>
          </thead>
          <tbody>${fabricRows}</tbody>
        </table>

        <table style="width:100%;border-collapse:collapse;table-layout:fixed;margin-bottom:1mm;">
          <colgroup>
            <col style="width:10%"/>
            <col style="width:12%"/>
            <col style="width:25%"/>
            <col style="width:11%"/>
            <col style="width:13%"/>
            <col style="width:13%"/>
            <col style="width:8%"/>
            <col style="width:8%"/>
          </colgroup>
          <thead>
            <tr>${['Type', 'Item', 'Shade', 'Consump', 'Pack', 'Req', 'PO#', 'Status'].map(h => `<th style="${th}${blk}">${h}</th>`).join('')}</tr>
          </thead>
          <tbody>
            ${stitchRows}
            ${dividerRow}
            ${packingRows}
          </tbody>
        </table>

        <table style="width:100%;border-collapse:collapse;margin-top:auto;table-layout:fixed;">
          <colgroup>
            <col style="width:37%"/>
            <col style="width:19%"/>
            <col style="width:13%"/>
            <col style="width:9%"/>
            <col style="width:9%"/>
            <col style="width:13%"/>
          </colgroup>
          <thead>
            <tr>
              <th style="${th}${blk}">Embellishment &amp; Decoration</th>
              <th style="${th}${blk}">Packing Instructions</th>
              <th style="${th}${blk}" colspan="3">Packing</th>
              <th style="${th}${blk}">Merchandiser</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td style="${td};vertical-align:top;font-size:8.6px;height:16mm;" rowspan="3">${embText}</td>
              <td style="${td};vertical-align:top;height:16mm;" rowspan="3">
                <div style="display:flex;align-items:center;gap:3px;margin-bottom:3px;"><div style="width:9px;height:9px;border:1px solid #000;flex-shrink:0;"></div><span style="font-size:8.6px;">Solid Pack</span></div>
                <div style="display:flex;align-items:center;gap:3px;margin-bottom:3px;"><div style="width:9px;height:9px;border:1px solid #000;flex-shrink:0;"></div><span style="font-size:8.6px;">Ratio Pack</span></div>
                <div style="display:flex;align-items:center;gap:3px;margin-bottom:3px;"><div style="width:9px;height:9px;border:1px solid #000;flex-shrink:0;"></div><span style="font-size:8.6px;">Flat Pack</span></div>
                <div style="display:flex;align-items:center;gap:3px;"><div style="width:9px;height:9px;border:1px solid #000;flex-shrink:0;"></div><span style="font-size:8.6px;">Hanger Pack</span></div>
              </td>
              <th style="${th}">Type</th>
              <th style="${th}">Each</th>
              <th style="${th}">Total</th>
              <td style="${td};vertical-align:top;height:16mm;" rowspan="3">&nbsp;</td>
            </tr>
            <tr>
              <td style="${td};font-size:8.6px;">Blisters</td>
              <td style="${tdC};font-size:8.6px;">${esc(String(blisterEach))}</td>
              <td style="${tdC};font-size:8.6px;">${esc(String(blisterTotal))}</td>
            </tr>
            <tr>
              <td style="${td};font-size:8.6px;">Cartons</td>
              <td style="${tdC};font-size:8.6px;">${esc(String(cartonEach))}</td>
              <td style="${tdC};font-size:8.6px;">${esc(String(cartonTotal))}</td>
            </tr>
          </tbody>
        </table>

      </div>`
  }

  function buildCuttingPlanHTML(d) {
    const qRef = d.q.q_number || 'Queued'
    const blocks = Array.isArray(d.variantBlocks) && d.variantBlocks.length ? d.variantBlocks : []
    const cuttingPct = Number.isFinite(parseFloat(d.cuttingPct)) ? parseFloat(d.cuttingPct) : 0
    const fmtInt = (v) => Math.round(parseFloat(v) || 0).toLocaleString('en-US')
    const titleCase = (v) => String(v || '').replace(/(^|\s|\/|-)([a-z])/g, (_, a, b) => `${a}${b.toUpperCase()}`)
    const gcdLocal = (a, b) => b ? gcdLocal(b, a % b) : Math.abs(a)
    const makeRatioMapLocal = (sizes, map) => {
      const vals = (sizes || []).map(sz => Math.round(parseFloat(map?.[sz]) || 0)).filter(v => v > 0)
      const base = vals.length ? vals.reduce((a, b) => gcdLocal(a, b)) : 0
      const out = {}
      ;(sizes || []).forEach(sz => {
        const v = Math.round(parseFloat(map?.[sz]) || 0)
        out[sz] = base && v ? Math.round(v / base) : 0
      })
      return out
    }
    const th = 'border:1px solid #000;padding:2.4px 4px;font-size:8.9px;font-weight:900;text-align:center;vertical-align:middle;line-height:1.15;white-space:nowrap;'
    const td = 'border:1px solid #000;padding:2.4px 4px;font-size:8.7px;vertical-align:middle;line-height:1.15;'
    const tdC = td + 'text-align:center;'
    const tdR = td + 'text-align:right;'
    const blk = 'background:#000;color:#fff;letter-spacing:1.8px;text-transform:uppercase;'

    const blockTables = blocks.map((block) => {
      const sizes = (block.sizeOrder || block.sizes || []).filter(sz => (parseFloat(block.sizeMap?.[sz]) || 0) > 0)
      const ratioMap = block.ratioMap || makeRatioMapLocal(sizes, block.sizeMap || {})
      const cutMap = {}
      sizes.forEach(sz => { cutMap[sz] = Math.round((parseFloat(block.sizeMap?.[sz]) || 0) * (1 + cuttingPct / 100)) })
      const orderTotal = sizes.reduce((sum, sz) => sum + (parseFloat(block.sizeMap?.[sz]) || 0), 0)
      const ratioTotal = sizes.reduce((sum, sz) => sum + (parseFloat(ratioMap?.[sz]) || 0), 0)
      const cutTotal = sizes.reduce((sum, sz) => sum + (parseFloat(cutMap?.[sz]) || 0), 0)
      const label = `${block.colorName || block.washName || '—'} / ${block.groupName || '—'}`
      const head = sizes.map(sz => `<th style="${th}${blk}">${esc(sz)}</th>`).join('')
      const qtyCells = sizes.map(sz => `<td style="${tdR}">${fmtInt(block.sizeMap?.[sz])}</td>`).join('')
      const ratioCells = sizes.map(sz => `<td style="${tdR}">${fmtInt(ratioMap?.[sz])}</td>`).join('')
      const cutCells = sizes.map(sz => `<td style="${tdR}">${fmtInt(cutMap?.[sz])}</td>`).join('')
      return `<table style="width:100%;border-collapse:collapse;table-layout:fixed;margin-bottom:1.2mm;page-break-inside:avoid;">
        <thead><tr><th style="${th}${blk};width:24%">Size Group / Wash</th><th style="${th}${blk};width:18%">Details</th>${head}<th style="${th}${blk};width:10%">Total</th></tr></thead>
        <tbody>
          <tr><td style="${tdC};font-weight:900;text-transform:uppercase;" rowspan="4">${esc(titleCase(label))}</td><td style="${td};font-weight:800;">Order Quantity</td>${qtyCells}<td style="${tdR};font-weight:900;">${fmtInt(orderTotal)}</td></tr>
          <tr><td style="${td};font-weight:800;">Ratio</td>${ratioCells}<td style="${tdR};font-weight:900;">${fmtInt(ratioTotal)}</td></tr>
          <tr><td style="${td};font-weight:800;">Cutting Qty +${esc(cuttingPct)}%</td>${cutCells}<td style="${tdR};font-weight:900;">${fmtInt(cutTotal)}</td></tr>
          <tr><td style="${td};color:#555;">Zipper Usage/Size</td>${sizes.map(() => `<td style="${tdC}">&nbsp;</td>`).join('')}<td style="${tdC}">&nbsp;</td></tr>
        </tbody>
      </table>`
    }).join('') || '<div style="border:1px solid #000;padding:6mm;font-size:12px;font-weight:800;">No queue breakdown data found.</div>'

    const visibleFabricItems = (d.fabricItems || []).filter(item => {
      const req = parseFloat(String(item.q_qty ?? item.required ?? '').replace(/,/g, '')) || 0
      return req > 0
    })
    const fabricRows = visibleFabricItems.length ? visibleFabricItems.map(item => `<tr>
      <td style="${td}">${esc(item.name || '—')}</td>
      <td style="${td}">${esc(item.shade || item.lib_colour || '—')}</td>
      <td style="${td}">${esc(item.content || item.detail || '—')}</td>
      <td style="${tdC}">${esc(item.weight || '—')}</td>
      <td style="${tdC}">${esc(item.width || '—')}</td>
      <td style="${tdR}">${item.consump ? esc(item.consump) : '—'}</td>
      <td style="${tdR}">${item.q_qty ? `${fmtInt(item.q_qty)} ${esc(item.unit || '')}` : '—'}</td>
    </tr>`).join('') : `<tr><td style="${tdC}" colspan="7">No fabric items with required quantity</td></tr>`

    const cutHeaderCell = (label, width) => `<th style="${th}${blk};width:${width};font-size:7.2px;line-height:1.05;white-space:normal;word-break:normal;overflow-wrap:break-word;letter-spacing:.8px;padding:2px 1.5px;">${label}</th>`
    const cuttingHeaders = [
      ['Date','7.5%'], ['Cut #','6.5%'], ['Wash','11.5%'], ['Size<br/>Range','7.5%'], ['Shrinkage','7.5%'], ['Width','6%'],
      ['Cutting<br/>Qty','7.5%'], ['Marker<br/>Length','8%'], ['Layers','6%'], ['Fabric<br/>Used','8%'], ['Body<br/>Consump','8%'], ['Lining<br/>Used','8%'], ['Cut Issued<br/>To','8%']
    ]
    const cuttingHeaderHTML = cuttingHeaders.map(([label, width]) => cutHeaderCell(label, width)).join('')
    const emptyRows = Array.from({ length: 10 }).map(() => `<tr>${cuttingHeaders.map(() => `<td style="${td};height:8.3mm;padding:1.8px 2px;">&nbsp;</td>`).join('')}</tr>`).join('')

    return `<div style="width:210mm;min-height:297mm;padding:6mm 8mm;box-sizing:border-box;font-family:Arial,sans-serif;color:#000;background:#fff;">
      <style>@page{size:A4;margin:0}body{margin:0;background:#fff}*{box-sizing:border-box}tr{page-break-inside:avoid}.cp-page{page-break-after:auto}</style>
      <div class="cp-page" style="min-height:285mm;display:flex;flex-direction:column;">
        <div style="display:grid;grid-template-columns:1fr 1fr 1fr;align-items:start;font-size:8.5px;margin-bottom:3mm;"><div>Document Ref#CP-${esc(qRef)}</div><div style="text-align:center;">Date Created: ${new Date().toLocaleDateString('en-GB')} - ${new Date().toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'})}</div><div style="text-align:right;">Username: admin</div></div>
        <div style="display:grid;grid-template-columns:1fr auto 1fr;align-items:center;border-bottom:2px solid #000;padding-bottom:2mm;margin-bottom:2.5mm;"><div><div style="font-size:21px;font-weight:900;line-height:.92;">NIZAMIA<br/>APPARELS</div></div><div style="text-align:center;font-size:21px;font-weight:900;text-transform:uppercase;">Cutting Program</div><div style="text-align:right;font-size:30px;font-weight:900;">${esc(qRef)}</div></div>
        <table style="width:100%;border-collapse:collapse;table-layout:fixed;margin-bottom:5mm;"><tr>${[['Brand', d.ord.buyer_name], ['Style Ne', d.ord.style_number], ['Fit Name', d.fitName || '—'], ['PO#', d.ord.po_number], ['Factory Ref', d.ord.factory_ref || d.ord.job_number], ['Store', d.ord.store_name], ['Ship Date', fmtDate(d.ord.ship_date)]].map(([k,v]) => `<td style="font-size:8.8px;font-weight:900;vertical-align:top;">${esc(k)}<br/><span style="font-weight:700;">${esc(v || '—')}</span></td>`).join('')}</tr></table>
        <div style="font-size:12px;font-weight:900;margin-bottom:1mm;">Order Breakdown / Order Quantity</div>
        ${blockTables}
        <div style="font-size:12px;font-weight:900;margin:2mm 0 1mm;">Fabrication Info</div>
        <table style="width:100%;border-collapse:collapse;table-layout:fixed;margin-bottom:3mm;"><thead><tr>${['Item','Shade','Content','Weight','Width','Consump','Required'].map(h => `<th style="${th}${blk}">${h}</th>`).join('')}</tr></thead><tbody>${fabricRows}</tbody></table>
        <div style="font-size:12px;font-weight:900;margin:1mm 0;">Embellishment Check</div>
        <table style="width:100%;border-collapse:collapse;table-layout:fixed;margin-bottom:3mm;"><tr><td style="${td};height:13mm;width:10%;"><div style="width:12px;height:12px;border:1px solid #000;margin-bottom:2px;"></div>Embroidery</td><td style="${td};width:10%;"><div style="width:12px;height:12px;border:1px solid #000;margin-bottom:2px;"></div>Print</td><td style="${td};width:12%;"><div style="width:12px;height:12px;border:1px solid #000;margin-bottom:2px;"></div>Other:</td><td style="${td};width:13%;font-weight:800;">Number of Panels</td><td style="${td};font-weight:800;">Notes:</td></tr></table>
        <div style="font-size:12px;font-weight:900;margin:1mm 0;">Cutting Table</div>
        <table style="width:100%;border-collapse:collapse;table-layout:fixed;margin-bottom:4mm;"><thead><tr>${cuttingHeaderHTML}</tr></thead><tbody>${emptyRows}</tbody></table>
        <table style="width:100%;border-collapse:collapse;table-layout:fixed;margin-top:auto;"><tr>${['Merchandiser','Cutting Manager','General Manager','Director'].map(lbl => `<td style="border:1px solid #000;height:20mm;position:relative;text-align:center;font-size:11px;font-weight:900;"><div style="position:absolute;left:0;right:0;bottom:3mm;">${esc(lbl)}</div></td>`).join('')}</tr></table>
      </div>
    </div>`
  }
  function buildTrimsProgramHTML(d) {
    if (d.customQueueMissingComponents) {
      return `<div style="width:210mm;min-height:297mm;padding:12mm;font-family:Arial,sans-serif;color:#000;box-sizing:border-box;">
        <div style="font-size:22px;font-weight:900;margin-bottom:8mm;">Trims Program Blocked</div>
        <div style="border:2px solid #000;padding:8mm;font-size:14px;line-height:1.5;">
          <strong>Custom queue missing component data.</strong><br/>
          Regenerate this queue after running the <code>order_queues.custom_components</code> migration.
        </div>
      </div>`
    }
    const qRef = d.q.q_number || 'Queued'
    const blocks = Array.isArray(d.variantBlocks) && d.variantBlocks.length ? d.variantBlocks : []
    const cuttingPct = Number.isFinite(parseFloat(d.cuttingPct)) ? parseFloat(d.cuttingPct) : 0
    const fmtInt = (v) => Math.round(parseFloat(v) || 0).toLocaleString('en-US')
    const titleCase = (v) => String(v || '').replace(/(^|\s|\/|-)([a-z])/g, (_, a, b) => `${a}${b.toUpperCase()}`)
    const gcdLocal = (a, b) => b ? gcdLocal(b, a % b) : Math.abs(a)
    const makeRatioMapLocal = (sizes, map) => {
      const vals = (sizes || []).map(sz => Math.round(parseFloat(map?.[sz]) || 0)).filter(v => v > 0)
      const base = vals.length ? vals.reduce((a, b) => gcdLocal(a, b)) : 0
      const out = {}
      ;(sizes || []).forEach(sz => {
        const v = Math.round(parseFloat(map?.[sz]) || 0)
        out[sz] = base && v ? Math.round(v / base) : 0
      })
      return out
    }
    const th = 'border:1px solid #000;padding:2.2px 3px;font-size:8.4px;font-weight:900;text-align:center;vertical-align:middle;line-height:1.12;white-space:nowrap;'
    const td = 'border:1px solid #000;padding:2.2px 3px;font-size:8.25px;vertical-align:middle;line-height:1.15;'
    const tdC = td + 'text-align:center;'
    const tdR = td + 'text-align:right;'
    const blk = 'background:#000;color:#fff;letter-spacing:1.5px;text-transform:uppercase;'

    const blockTables = blocks.map((block) => {
      const sizes = (block.sizeOrder || block.sizes || []).filter(sz => (parseFloat(block.sizeMap?.[sz]) || 0) > 0)
      const ratioMap = block.ratioMap || makeRatioMapLocal(sizes, block.sizeMap || {})
      const cutMap = {}
      sizes.forEach(sz => { cutMap[sz] = Math.round((parseFloat(block.sizeMap?.[sz]) || 0) * (1 + cuttingPct / 100)) })
      const orderTotal = sizes.reduce((sum, sz) => sum + (parseFloat(block.sizeMap?.[sz]) || 0), 0)
      const ratioTotal = sizes.reduce((sum, sz) => sum + (parseFloat(ratioMap?.[sz]) || 0), 0)
      const cutTotal = sizes.reduce((sum, sz) => sum + (parseFloat(cutMap?.[sz]) || 0), 0)
      const label = `${block.colorName || block.washName || '—'} / ${block.groupName || '—'}`
      const head = sizes.map(sz => `<th style="${th}${blk}">${esc(sz)}</th>`).join('')
      const qtyCells = sizes.map(sz => `<td style="${tdR}">${fmtInt(block.sizeMap?.[sz])}</td>`).join('')
      const ratioCells = sizes.map(sz => `<td style="${tdR}">${fmtInt(ratioMap?.[sz])}</td>`).join('')
      const cutCells = sizes.map(sz => `<td style="${tdR}">${fmtInt(cutMap?.[sz])}</td>`).join('')
      return `<table style="width:100%;border-collapse:collapse;table-layout:fixed;margin-bottom:1.2mm;page-break-inside:avoid;">
        <thead><tr><th style="${th}${blk};width:24%">Size Group / Wash</th><th style="${th}${blk};width:18%">Details</th>${head}<th style="${th}${blk};width:10%">Total</th></tr></thead>
        <tbody>
          <tr><td style="${tdC};font-weight:900;text-transform:uppercase;" rowspan="4">${esc(titleCase(label))}</td><td style="${td};font-weight:800;">Order Quantity</td>${qtyCells}<td style="${tdR};font-weight:900;">${fmtInt(orderTotal)}</td></tr>
          <tr><td style="${td};font-weight:800;">Ratio</td>${ratioCells}<td style="${tdR};font-weight:900;">${fmtInt(ratioTotal)}</td></tr>
          <tr><td style="${td};font-weight:800;">Cutting Qty +${esc(cuttingPct)}%</td>${cutCells}<td style="${tdR};font-weight:900;">${fmtInt(cutTotal)}</td></tr>
          <tr><td style="${td};color:#555;">Zipper Usage/Size</td>${sizes.map(() => `<td style="${tdC}">&nbsp;</td>`).join('')}<td style="${tdC}">&nbsp;</td></tr>
        </tbody>
      </table>`
    }).join('') || '<div style="border:1px solid #000;padding:6mm;font-size:12px;font-weight:800;">No queue breakdown data found.</div>'

    const shortUom = (u) => { if (!u) return 'pcs'; const x=String(u).toLowerCase(); if (x.includes('yard')||x==='yds') return 'yds'; if (x.includes('meter')||x==='m') return 'm'; if (x.includes('roll')) return 'roll'; if (x.includes('kg')) return 'kg'; if (x.includes('cone')) return 'cone'; if (x.includes('set')) return 'set'; if (x.includes('ctn')) return 'ctn'; return u }
    const usageNum = (v) => { if (v == null) return 0; if (typeof v === 'number') return Number.isFinite(v)?v:0; if (typeof v === 'string') return parseFloat(v)||0; if (typeof v === 'object') return parseFloat(v.value ?? v.qty ?? v.consumption ?? v.cons ?? v.consump ?? v.amount ?? v.base_qty ?? 0) || 0; return 0 }
    const normalizePackMeta = (raw) => { const ud = normalizeUsageData(raw); return { perPack: parseFloat(ud?._packing_qty ?? ud?.packing_qty ?? ud?.pack_qty ?? ud?.qty_per_pack ?? ud?.per_pack_qty ?? 0), packUnit: String(ud?._packing_unit ?? ud?.packing_unit ?? ud?.pack_unit ?? ud?.req_unit ?? '').trim(), itemUnit: shortUom(ud?._packing_base_unit || ud?.base_unit || ud?.consump_unit || ud?.uom || '') } }
    const formatConsump = (value, uom) => { const n=parseFloat(value)||0; if(n<=0)return '—'; const shown=Math.abs(n-Math.round(n))<.0001?String(Math.round(n)):n.toFixed(2).replace(/\.00$/,''); return `${shown} ${uom}` }
    const formatPackLogic = (item) => { const meta=normalizePackMeta(item?.usage_data); if (!(meta.perPack>0)) return '—'; const left=Number.isInteger(meta.perPack)?String(Math.trunc(meta.perPack)):meta.perPack.toFixed(2).replace(/\.00$/,''); const numeratorUnit=meta.itemUnit||shortUom(item?.unit); return `${left}${numeratorUnit ? ` ${numeratorUnit}` : ''}/${meta.packUnit || 'pack'}` }
    const formatReq = (qty, item) => { const req=parseFloat(qty)||0; if (!(req>0)) return '—'; const meta=normalizePackMeta(item?.usage_data); if(meta.perPack>0){ const packs=Math.ceil(req/meta.perPack); const baseLabel=String(meta.packUnit||'pack').trim().toLowerCase().replace(/s$/,''); return `${packs.toLocaleString()} ${packs===1?baseLabel:`${baseLabel}s`}`; } return `${Math.ceil(req).toLocaleString()} ${shortUom(item?.unit)}` }
    const trimType = (item) => String(item.category || '').toLowerCase().includes('stitch') ? 'Stitching' : 'Packing'
    const poText = (v) => (!v || v === '—' || String(v).toLowerCase() === 'pending') ? 'X' : String(v)
    const circle = '<span style="display:inline-block;width:10px;height:10px;border:1.4px solid #000;border-radius:50%;"></span>'
    const parentTd = td + 'background:#e6e6e6;font-weight:900;color:#000;'
    const parentTdC = tdC + 'background:#e6e6e6;font-weight:900;color:#000;'
    const parentTdR = tdR + 'background:#e6e6e6;font-weight:900;color:#000;'
    const queueSizeQty = {}; (blocks || []).forEach(b => Object.entries(b.sizeMap || {}).forEach(([sz, qty]) => { queueSizeQty[String(sz)] = (queueSizeQty[String(sz)] || 0) + (parseFloat(qty) || 0) }))
    const wastageFactor = (item) => 1 + ((parseFloat(item?.wastage) || 5) / 100)
    const childBreakdownRows = (item) => {
      const rule = String(item.usage_rule || 'Generic').trim(); const ud=normalizeUsageData(item.usage_data); const base=parseFloat(item.base_qty)||parseFloat(item.consump)||0; const wf=wastageFactor(item); const rows=[]
      if (rule === 'By Individual Sizes' || rule === 'By Individual Size') Object.entries(ud||{}).forEach(([sz, consRaw]) => { const q=parseFloat(queueSizeQty[String(sz)])||0; const cons=usageNum(consRaw); if(q>0&&cons>0) rows.push({desc:`Size ${sz}`, cons, req:q*cons*wf}) })
      else if (rule === 'By Size Group' || rule === 'By Color' || rule === 'By Colour') Object.entries(ud||{}).forEach(([key, consRaw]) => { const cons=usageNum(consRaw); if(cons>0) rows.push({desc:String(key), cons, req:parseFloat(item.q_qty)||0}) })
      else if (rule === 'Configure Own' && Array.isArray(ud?.__matrix)) ud.__matrix.forEach(m => { const cons=usageNum(m.consumption); if(cons>0) rows.push({desc:[m.colorName,m.sgName].filter(Boolean).join(' / ') || item.shade || item.specification || '—', cons, req:parseFloat(item.q_qty)||0}) })
      else if (rule === 'Configure Own' && Array.isArray(ud?.__groups)) ud.__groups.forEach(g => { const cons=usageNum(g.consumption); const sizes=Array.isArray(g.sizes)?g.sizes.join(', '):''; if(cons>0) rows.push({desc:sizes?`Sizes ${sizes}`:(g.name||'Custom Group'), cons, req:parseFloat(item.q_qty)||0}) })
      if(!rows.length) rows.push({desc:item.shade||item.specification||item.detail||'—', cons:base, req:parseFloat(item.q_qty)||0})
      return rows
    }
    const trimRows = (d.trimItems || []).flatMap((item) => {
      const children = childBreakdownRows(item)
      const parent = `<tr><td style="${parentTd}">${esc(trimType(item))}</td><td style="${parentTd}">${esc(item.name || '—')}</td><td style="${parentTd}">${esc(item.shade || item.specification || item.detail || '—')}</td><td style="${parentTdC}">&nbsp;</td><td style="${parentTdC};white-space:nowrap;">${esc(formatPackLogic(item))}</td><td style="${parentTdR}">${esc(formatReq(item.q_qty, item))}</td><td style="${parentTdC}">${esc(poText(item.po_number))}</td><td style="${parentTdC}">${esc(poText(item.po_status))}</td><td style="${parentTdC}">${circle}</td><td style="${parentTdC}">${circle}</td></tr>`
      const childRows = children.map(ch => `<tr><td style="${tdC};color:#555;">↳</td><td style="${td}">&nbsp;</td><td style="${td}">${esc(ch.desc || '—')}</td><td style="${tdC};white-space:nowrap;">${formatConsump(ch.cons, shortUom(item.unit))}</td><td style="${tdC}">&nbsp;</td><td style="${tdR};white-space:nowrap;">${esc(formatReq(ch.req, item))}</td><td style="${tdC}">&nbsp;</td><td style="${tdC}">&nbsp;</td><td style="${tdC}">&nbsp;</td><td style="${tdC}">&nbsp;</td></tr>`).join('')
      return [parent + childRows]
    }).join('') || `<tr><td style="${tdC}" colspan="10">No trims configured</td></tr>`

    return `<div style="width:210mm;min-height:297mm;padding:6mm 8mm;box-sizing:border-box;font-family:Arial,sans-serif;color:#000;background:#fff;"><style>@page{size:A4;margin:0}body{margin:0;background:#fff}*{box-sizing:border-box}tr{page-break-inside:avoid}.tp-page{page-break-after:auto}</style><div class="tp-page" style="min-height:285mm;display:flex;flex-direction:column;"><div style="display:grid;grid-template-columns:1fr 1fr 1fr;align-items:start;font-size:8.5px;margin-bottom:3mm;"><div>Document Ref#TP-${esc(qRef)}</div><div style="text-align:center;">Date Created: ${new Date().toLocaleDateString('en-GB')} - ${new Date().toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'})}</div><div style="text-align:right;">Username: admin</div></div><div style="display:grid;grid-template-columns:1fr auto 1fr;align-items:center;border-bottom:2px solid #000;padding-bottom:2mm;margin-bottom:2.5mm;"><div><div style="font-size:21px;font-weight:900;line-height:.92;">NIZAMIA<br/>APPARELS</div></div><div style="text-align:center;font-size:21px;font-weight:900;text-transform:uppercase;">Trims Program</div><div style="text-align:right;font-size:30px;font-weight:900;">${esc(qRef)}</div></div><table style="width:100%;border-collapse:collapse;table-layout:fixed;margin-bottom:5mm;"><tr>${[['Brand', d.ord.buyer_name], ['Style Ne', d.ord.style_number], ['Fit Name', d.fitName || '—'], ['PO#', d.ord.po_number], ['Factory Ref', d.ord.factory_ref || d.ord.job_number], ['Store', d.ord.store_name], ['Ship Date', fmtDate(d.ord.ship_date)]].map(([k,v]) => `<td style="font-size:8.8px;font-weight:900;vertical-align:top;">${esc(k)}<br/><span style="font-weight:700;">${esc(v || '—')}</span></td>`).join('')}</tr></table><div style="font-size:12px;font-weight:900;margin-bottom:1mm;">Order Breakdown / Order Quantity</div>${blockTables}<div style="font-size:12px;font-weight:900;margin:2mm 0 1mm;">Trims Detailed Sheet</div><table style="width:100%;border-collapse:collapse;table-layout:fixed;margin-bottom:4mm;"><colgroup><col style="width:8%"/><col style="width:14%"/><col style="width:27%"/><col style="width:8%"/><col style="width:9%"/><col style="width:10%"/><col style="width:7%"/><col style="width:8%"/><col style="width:4.5%"/><col style="width:4.5%"/></colgroup><thead><tr>${['Type','Item','Shade / Description','Consump','Pack','Req','PO#','Status','Approval','Testing'].map(h => `<th style="${th}${blk};font-size:7.6px;white-space:normal;letter-spacing:.8px;">${h}</th>`).join('')}</tr></thead><tbody>${trimRows}</tbody></table><table style="width:100%;border-collapse:collapse;table-layout:fixed;margin-top:auto;"><tr>${['Merchandiser','Store Manager','General Manager','Director'].map(lbl => `<td style="border:1px solid #000;height:20mm;position:relative;text-align:center;font-size:11px;font-weight:900;"><div style="position:absolute;left:0;right:0;bottom:3mm;">${esc(lbl)}</div></td>`).join('')}</tr></table></div></div>`
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
    if (kind === 'Cutting Plan') return buildCuttingPlanHTML(d)
    if (kind === 'Trims Demand') return buildTrimsProgramHTML(d)
    if (kind === 'Print Production File') {
      return [
        coverHTML(d),
        sectionDocHTML('Fabric Demand', d, d.fabricItems, [{label:'Item', key:'name'},{label:'Specification', render:r=>r.specification||r.detail||'—'},{label:'Unit', key:'unit'},{label:'Required', render:r=>Math.ceil(r.q_qty||0), align:'right'}]),
        sectionDocHTML('Cutting Plan', d, Object.keys(d.sizeMap).map(sz => ({ size: sz, qty: d.sizeMap[sz] })), [{label:'Size', key:'size'},{label:'Qty', key:'qty', align:'right'}], `Cutting qty with allowance (${d.cuttingPct}%): ${Math.ceil(d.cuttingQty)} pcs`),
        buildTrimsProgramHTML(d),
        sectionDocHTML('Washing', d, d.washItems, [{label:'Wash Type', key:'wash_type'},{label:'Wash Ref', key:'wash_ref'},{label:'Color', key:'color_name'},{label:'Unit', key:'unit'},{label:'Qty', render:r=>Math.ceil(r.q_qty||0), align:'right'}]),
        sectionDocHTML('Embellishment', d, d.embItems, [{label:'Description', render:r=>r.description||'Embellishment'},{label:'Technique', key:'technique'},{label:'Placement', key:'placement'},{label:'Vendor', render:r=>r.vendor_id||'—'},{label:'Qty', render:r=>Math.ceil(r.q_qty||0), align:'right'}]),
        sectionDocHTML('Finishing', d, d.finishingPacks.map(p => ({...p, cartons: Math.ceil((parseFloat(d.q.qty)||0) / (parseFloat(p.pcs_per_carton)||1)), inner: Math.ceil((parseFloat(d.q.qty)||0) / (parseFloat(p.pieces_per_inner_pack)||parseFloat(p.inner_pieces)||1 || 1)) })), [{label:'Pack', render:r=>r.pack_name||'Pack'},{label:'Basis', render:r=>r.pack_basis||'—'},{label:'Inner Pack', render:r=>r.inner_pack_type||'—'},{label:'Pcs/Inner', render:r=>r.pieces_per_inner_pack || r.inner_pieces || '—', align:'right'},{label:'Pcs/Carton', key:'pcs_per_carton', align:'right'},{label:'Cartons', key:'cartons', align:'right'}]),
      ].join('')
    }
    const map = {
      'Fabric Demand': () => sectionDocHTML('Fabric Demand', d, d.fabricItems, [{label:'Item', key:'name'},{label:'Specification', render:r=>r.specification||r.detail||'—'},{label:'Unit', key:'unit'},{label:'Required', render:r=>Math.ceil(r.q_qty||0), align:'right'}]),
      'Cutting Plan': () => sectionDocHTML('Cutting Plan', d, Object.keys(d.sizeMap).map(sz => ({ size: sz, qty: d.sizeMap[sz] })), [{label:'Size', key:'size'},{label:'Qty', key:'qty', align:'right'}], `Cutting qty with allowance (${d.cuttingPct}%): ${Math.ceil(d.cuttingQty)} pcs`),
      'Trims Demand': () => buildTrimsProgramHTML(d),
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
      return [q.q_number || 'Queued', displayQueueLabel(q.label) || '', q.split_rule || '', o.style_number || '', o.buyer_name || '', o.job_number || '', q.qty || '', q.status || '']
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
      return `<tr><td>${esc(q.q_number || 'Queued')}</td><td>${esc(displayQueueLabel(q.label))}</td><td>${esc(q.split_rule)}</td><td>${esc(o.style_number)}</td><td>${esc(o.buyer_name)}</td><td style="text-align:right">${esc(q.qty)}</td><td>${esc(q.status)}</td></tr>`
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
                    <td style={{ fontWeight: 600 }}>{displayQueueLabel(q.label) || '—'}</td>
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


function DragColumnSettings({ title='Columns', subtitle='Drag to reorder fields', labels, order, visible, onChange, onReset, onClose }) {
  const [dragKey, setDragKey] = useState(null)
  function moveKey(fromKey, toKey) {
    if (!fromKey || !toKey || fromKey === toKey) return
    const next = order.filter(k => k !== fromKey)
    const idx = next.indexOf(toKey)
    next.splice(idx < 0 ? next.length : idx, 0, fromKey)
    onChange({ order: next, visible })
  }
  return <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.35)', zIndex:300, display:'flex', alignItems:'center', justifyContent:'center' }} onClick={onClose}>
    <div style={{ background:'#fff', borderRadius:12, width:460, maxHeight:'80vh', overflow:'hidden', boxShadow:'0 18px 48px rgba(0,0,0,0.18)', display:'flex', flexDirection:'column' }} onClick={e=>e.stopPropagation()}>
      <div style={{ padding:'16px 18px', borderBottom:'1px solid #f3f4f6', display:'flex', justifyContent:'space-between' }}><div><div style={{ fontSize:15, fontWeight:800 }}>{title}</div><div style={{ fontSize:11, color:'#9ca3af' }}>{subtitle}</div></div><button className="btn btn-ghost" onClick={onClose}><X size={16}/></button></div>
      <div style={{ padding:14, display:'flex', flexDirection:'column', gap:8, overflowY:'auto' }}>{order.map(k=><div key={k} draggable onDragStart={()=>setDragKey(k)} onDragOver={e=>e.preventDefault()} onDrop={()=>moveKey(dragKey,k)} onDragEnd={()=>setDragKey(null)} style={{ display:'flex', alignItems:'center', gap:10, padding:'8px 10px', border:'1px solid #f3f4f6', borderRadius:8, background:dragKey===k?'#f9fafb':'#fff', cursor:'grab' }}><span style={{ color:'#9ca3af', fontWeight:900, fontSize:14 }}>⋮⋮</span><input type="checkbox" checked={!!visible[k]} onChange={()=>onChange({ order, visible:{...visible,[k]:!visible[k]} })}/><span style={{ flex:1, fontSize:12, fontWeight:700 }}>{labels[k] || k}</span></div>)}</div>
      <div style={{ padding:'12px 18px', borderTop:'1px solid #f3f4f6', display:'flex', justifyContent:'space-between' }}><button className="btn btn-secondary" onClick={onReset}>Reset</button><button className="btn btn-primary" onClick={onClose}>Done</button></div>
    </div>
  </div>
}

function QueuesTab({ onEditOrder }) {
  const { user } = useAuth()
  const queuePrefsKey = `app2a.queue.tablePrefs.${user?.username || user?.email || user?.id || 'default'}`
  const readQueuePrefs = () => {
    try { return JSON.parse(localStorage.getItem(queuePrefsKey) || '{}') || {} } catch(e) { return {} }
  }
  const initialPrefs = readQueuePrefs()
  const [queues, setQueues] = useState([])
  const [orders, setOrders] = useState([])
  const [shipments, setShipments] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState(initialPrefs.search || '')
  const [selectedIds, setSelectedIds] = useState(new Set())
  const [groupBy, setGroupBy] = useState(initialPrefs.groupBy || 'none')
  const [sort, setSort] = useState(initialPrefs.sort?.col ? initialPrefs.sort : { col:'q_number', dir:'asc' })
  const [filterBuyer, setFilterBuyer] = useState(initialPrefs.filterBuyer || '')
  const [filterStyle, setFilterStyle] = useState(initialPrefs.filterStyle || '')
  const [filterJob, setFilterJob] = useState(initialPrefs.filterJob || '')
  const [filterRule, setFilterRule] = useState(initialPrefs.filterRule || '')
  const [filterStatus, setFilterStatus] = useState(initialPrefs.filterStatus || '')
  const [showCols, setShowCols] = useState(false)
  const [visibleCols, setVisibleCols] = useState(() => ({ ...DEFAULT_QUEUE_VISIBLE_COLUMNS, ...(initialPrefs.visibleCols || {}) }))
  const [colOrder, setColOrder] = useState(() => initialPrefs.colOrder || DEFAULT_QUEUE_COLUMN_ORDER)

  useEffect(() => { loadAll() }, [])
  useEffect(() => {
    try {
      localStorage.setItem(queuePrefsKey, JSON.stringify({
        search, groupBy, sort, filterBuyer, filterStyle, filterJob, filterRule, filterStatus, visibleCols, colOrder
      }))
    } catch(e) {}
  }, [queuePrefsKey, search, groupBy, sort, filterBuyer, filterStyle, filterJob, filterRule, filterStatus, visibleCols, colOrder])

  async function loadAll() {
    setLoading(true)
    const [{ data: qs }, { data: ors }, { data: sl }] = await Promise.all([
      supabase.from('order_queues').select('*').order('created_at', { ascending:true }),
      supabase.from('orders').select('id,style_number,buyer_name,job_number,brand_name,description,store_name,ship_date,po_number,total_qty').order('ship_date'),
      supabase.from('shipment_lines').select('queue_id,shipped_qty')
    ])
    setQueues(qs || []); setOrders(ors || []); setShipments(sl || []); setLoading(false)
  }

  const cleanLabel = (v) => String(v || '').split('__APP2A_QC__')[0]
  const orderMap = Object.fromEntries((orders || []).map(o => [o.id, o]))
  const shippedByQ = {}
  ;(shipments || []).forEach(l => { shippedByQ[l.queue_id] = (shippedByQ[l.queue_id] || 0) + (parseFloat(l.shipped_qty) || 0) })
  const rows = (queues || []).map(q => {
    const order = orderMap[q.order_id] || {}
    const qty = parseFloat(q.qty) || 0
    const shipped = shippedByQ[q.id] || 0
    const balance = Math.max(0, qty - shipped)
    const derived_status = balance <= 0 && shipped > 0 ? 'Completed' : shipped > 0 ? 'Partially Shipped' : (q.status || 'Queued')
    return { ...q, order, shipped_qty: shipped, balance_qty: balance, derived_status }
  })

  const values = key => [...new Set(rows.map(q => key === 'buyer' ? q.order?.buyer_name : key === 'style' ? q.order?.style_number : key === 'job' ? q.order?.job_number : key === 'rule' ? q.split_rule : q.derived_status).filter(Boolean))].sort()
  const buyers = values('buyer'), styles = values('style'), jobs = values('job'), rules = values('rule'), statuses = values('status')
  const totalQty = rows.reduce((s,q)=>s+(parseFloat(q.qty)||0),0)
  const shippedQty = rows.reduce((s,q)=>s+(parseFloat(q.shipped_qty)||0),0)
  const pct = totalQty ? Math.min(100, Math.round(shippedQty / totalQty * 100)) : 0
  const activeRows = rows.filter(q => String(q.q_number || '').trim())
  const inactiveRows = rows.filter(q => !String(q.q_number || '').trim())
  const activeQty = activeRows.reduce((s,q)=>s+(parseFloat(q.qty)||0),0)
  const inactiveQty = inactiveRows.reduce((s,q)=>s+(parseFloat(q.qty)||0),0)

  const cellText = (q, key) => {
    const o = q.order || {}
    if (key === 'q_number') return q.q_number || 'Queued'
    if (key === 'label') return cleanLabel(q.label) || '—'
    if (key === 'split_rule') return q.split_rule || '—'
    if (key === 'style_number') return o.style_number || '—'
    if (key === 'buyer_name') return o.buyer_name || '—'
    if (key === 'job_number') return o.job_number || '—'
    if (key === 'ship_date') return fmtDate(o.ship_date)
    if (key === 'po_number') return o.po_number || '—'
    if (key === 'store_name') return o.store_name || '—'
    if (key === 'description') return o.description || '—'
    if (key === 'brand_name') return o.brand_name || '—'
    if (key === 'qty') return Number(q.qty || 0).toLocaleString()
    if (key === 'shipped_qty') return Number(q.shipped_qty || 0).toLocaleString()
    if (key === 'balance_qty') return Number(q.balance_qty || 0).toLocaleString()
    if (key === 'status') return q.derived_status
    return '—'
  }
  const sortVal = (q, col) => col === 'q_number' ? (parseInt(String(q.q_number || '').replace(/\D/g,'')) || 999999) : col === 'qty' || col === 'shipped_qty' || col === 'balance_qty' ? parseFloat(q[col]) || 0 : String(cellText(q,col)).toLowerCase()
  const filtered = rows.filter(q => {
    const term = search.toLowerCase()
    return (!term || DEFAULT_QUEUE_COLUMN_ORDER.some(k => String(cellText(q,k)).toLowerCase().includes(term))) &&
      (!filterBuyer || q.order?.buyer_name === filterBuyer) && (!filterStyle || q.order?.style_number === filterStyle) &&
      (!filterJob || q.order?.job_number === filterJob) && (!filterRule || q.split_rule === filterRule) && (!filterStatus || q.derived_status === filterStatus)
  }).sort((a,b) => {
    const av = sortVal(a, sort.col), bv = sortVal(b, sort.col)
    if (av < bv) return sort.dir === 'asc' ? -1 : 1
    if (av > bv) return sort.dir === 'asc' ? 1 : -1
    return 0
  })

  const selected = [...selectedIds].map(id => rows.find(q => q.id === id)).filter(Boolean)
  const selectedActive = selected.filter(q => String(q.q_number || '').trim())
  const selectedInactive = selected.filter(q => !String(q.q_number || '').trim())
  const actionMode = selected.length === 0 ? 'none' : selectedActive.length === selected.length ? 'reset' : selectedInactive.length === selected.length ? 'activate' : 'mixed'
  const actionDisabled = actionMode === 'none' || actionMode === 'mixed'

  function toggleSelect(id) { setSelectedIds(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n }) }
  function toggleAll() { const ids = filtered.map(q=>q.id); setSelectedIds(ids.length && ids.every(id => selectedIds.has(id)) ? new Set() : new Set(ids)) }
  async function runAction() {
    if (actionMode === 'activate') {
      const { data: existing } = await supabase.from('order_queues').select('q_number').not('q_number','is',null)
      let maxQ = Math.max(0, ...((existing || []).map(r => parseInt(String(r.q_number || '').replace(/\D/g,''))).filter(Number.isFinite)))
      for (const q of selectedInactive) {
        maxQ += 1
        const { error } = await supabase.from('order_queues').update({ q_number:`Q${maxQ}`, status:q.status === 'Queued' ? 'Pending' : q.status }).eq('id', q.id)
        if (error) { window.alert(error.message); return }
      }
    }
    if (actionMode === 'reset') {
      if (!window.confirm(`Reset ${selectedActive.length} active queue${selectedActive.length === 1 ? '' : 's'}?`)) return
      const { error } = await supabase.from('order_queues').update({ q_number:null, status:'Queued' }).in('id', selectedActive.map(q=>q.id))
      if (error) { window.alert(error.message); return }
    }
    setSelectedIds(new Set()); await loadAll()
  }

  const groupValue = q => groupBy === 'style_number' ? (q.order?.style_number || 'Unassigned') : groupBy === 'job_number' ? (q.order?.job_number || 'Unassigned') : groupBy === 'buyer_name' ? (q.order?.buyer_name || 'Unassigned') : groupBy === 'q_number' ? (q.q_number || 'Queued') : groupBy === 'ship_date' ? (q.order?.ship_date || 'No Delivery Date') : ''
  const displayRows = groupBy === 'none' ? filtered.map(q => ({ type:'queue', q })) : (() => {
    const out = [], map = new Map()
    filtered.forEach(q => { const k = groupValue(q); if (!map.has(k)) { const g = { type:'group', key:k, count:0, qty:0, shipped:0 }; map.set(k,g); out.push(g) } const g = map.get(k); g.count++; g.qty += parseFloat(q.qty)||0; g.shipped += parseFloat(q.shipped_qty)||0 })
    const final = []
    out.forEach(g => { final.push(g); filtered.filter(q => groupValue(q) === g.key).forEach(q => final.push({ type:'queue', q })) })
    return final
  })()
  const visibleKeys = colOrder.filter(k => visibleCols[k])
  const thStyle = { padding:'9px 8px', borderBottom:'1px solid #f3f4f6', fontSize:10, fontWeight:800, color:'#9ca3af', textTransform:'uppercase', letterSpacing:'0.35px', whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }
  const tdStyle = { padding:'10px 8px', borderBottom:'1px solid #f3f4f6', fontSize:12, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }
  const badge = (text, bg, color) => <span style={{ fontSize:10, fontWeight:600, padding:'2px 7px', borderRadius:4, background:bg, color }}>{text}</span>
  const renderCell = (q,k) => {
    if (k === 'q_number') return <td style={tdStyle}>{badge(cellText(q,k), '#f3f4f6', '#111827')}</td>
    if (k === 'split_rule') return <td style={tdStyle}>{badge(cellText(q,k), '#ecfeff', '#0891b2')}</td>
    if (k === 'status') return <td style={tdStyle}>{badge(cellText(q,k), q.derived_status === 'Completed' ? '#f0fdf4' : q.derived_status === 'Partially Shipped' ? '#ecfeff' : '#fff7ed', q.derived_status === 'Completed' ? '#16a34a' : q.derived_status === 'Partially Shipped' ? '#0891b2' : '#d97706')}</td>
    if (['qty','shipped_qty','balance_qty'].includes(k)) return <td style={{ ...tdStyle, textAlign:'right', fontFamily:'var(--font-mono)', fontWeight:k === 'shipped_qty' ? 500 : 700, color:k === 'shipped_qty' ? '#2563eb' : '#111827' }}>{cellText(q,k)}</td>
    if (k === 'style_number') return <td style={{ ...tdStyle, fontWeight:600 }}>{cellText(q,k)}{q.order?.brand_name && <div style={{ fontSize:10, color:'#7c3aed', fontWeight:600 }}>{q.order.brand_name}</div>}</td>
    return <td style={tdStyle}>{cellText(q,k)}</td>
  }
  function exportCSV() {
    const header = groupBy === 'none' ? visibleKeys.map(k=>QUEUE_COLUMN_LABELS[k]||k) : ['Group / Queue', ...visibleKeys.map(k=>QUEUE_COLUMN_LABELS[k]||k)]
    const rowsForExport = displayRows.map(row => {
      if (row.type === 'group') return [`${row.key} — ${row.count} queues · Qty ${row.qty.toLocaleString()} · Shipped ${row.shipped.toLocaleString()}`, ...visibleKeys.map(() => '')]
      return groupBy === 'none' ? visibleKeys.map(k => cellText(row.q,k)) : ['', ...visibleKeys.map(k => cellText(row.q,k))]
    })
    const csv = [header, ...rowsForExport].map(r => r.map(v => `"${String(v).replace(/"/g,'""')}"`).join(',')).join('\n')
    const a=document.createElement('a'); a.href='data:text/csv;charset=utf-8,'+encodeURIComponent(csv); a.download=`queues-${new Date().toISOString().slice(0,10)}.csv`; a.click()
  }
  function printList() {
    const head = (groupBy === 'none' ? visibleKeys : ['__group', ...visibleKeys]).map(k => `<th style="border:1px solid #ddd;padding:8px;background:#f5f5f5;text-align:left">${k === '__group' ? 'Group / Queue' : (QUEUE_COLUMN_LABELS[k]||k)}</th>`).join('')
    const body = displayRows.map(row => {
      if (row.type === 'group') return `<tr><td colspan="${(groupBy === 'none' ? visibleKeys.length : visibleKeys.length + 1)}" style="border:1px solid #ddd;padding:8px;background:#fdf6e3;font-weight:bold">${row.key} — ${row.count} queues · Qty ${row.qty.toLocaleString()} · Shipped ${row.shipped.toLocaleString()}</td></tr>`
      const cells = visibleKeys.map(k => `<td style="border:1px solid #ddd;padding:8px">${cellText(row.q,k)}</td>`).join('')
      return `<tr>${groupBy === 'none' ? '' : '<td style="border:1px solid #ddd;padding:8px"></td>'}${cells}</tr>`
    }).join('')
    printHTML(`<div style="font-family:Arial;padding:24px"><h2>Queue List</h2><table style="width:100%;border-collapse:collapse"><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table></div>`)
  }

  if (loading) return <div style={{ padding:60, textAlign:'center', color:'#9ca3af', fontSize:12 }}>Loading queues...</div>
  return (
    <div style={{ display:'flex', flexDirection:'column', flex:1, minHeight:0, background:'#fff' }}>
      <div style={{ padding:'12px 24px', borderBottom:'1px solid #f3f4f6', display:'flex', alignItems:'center', gap:14, flexShrink:0, minWidth:0 }}>
        <div style={{ flexShrink:0 }}><div style={{ fontSize:20, fontWeight:800, letterSpacing:'-0.4px' }}>Queue</div><div style={{ fontSize:11, color:'var(--text-light)', marginTop:1 }}>Production queue status and shipment tracking</div></div>
        <div style={{ display:'flex', gap:8, alignItems:'stretch', minWidth:0, flex:'1 1 auto', overflow:'hidden' }}>
          {[{l:'Total Queues',v:rows.length,q:totalQty},{l:'Active Queues',v:activeRows.length,q:activeQty},{l:'Inactive Queues',v:inactiveRows.length,q:inactiveQty}].map(k => <div key={k.l} style={{ padding:'7px 12px', border:'1px solid var(--border)', borderRadius:8, background:'#fff', minWidth:110 }}><div style={{ fontSize:9, fontWeight:700, color:'var(--text-light)', textTransform:'uppercase', letterSpacing:'0.5px', marginBottom:3 }}>{k.l}</div><div style={{ display:'flex', alignItems:'baseline', gap:8 }}><div style={{ fontSize:18, fontWeight:800, lineHeight:1 }}>{k.v}</div><div style={{ fontSize:10, color:'#6b7280', fontWeight:700 }}>{Number(k.q||0).toLocaleString()} pcs</div></div></div>)}
          <div style={{ padding:'7px 12px', border:'1px solid var(--border)', borderRadius:8, background:'#fff', minWidth:155 }}>
            <div style={{ fontSize:9, fontWeight:700, color:'var(--text-light)', textTransform:'uppercase', letterSpacing:'0.5px', marginBottom:3 }}>Shipped Progress</div>
            <div style={{ display:'flex', alignItems:'baseline', gap:8 }}><div style={{ fontSize:18, fontWeight:800, lineHeight:1 }}>{pct}%</div><div style={{ fontSize:10, color:'#6b7280', fontWeight:700 }}>{shippedQty.toLocaleString()} / {totalQty.toLocaleString()} pcs</div></div>
            <div style={{ marginTop:6, height:6, borderRadius:999, background:'#e5e7eb', overflow:'hidden', border:'1px solid #d1d5db' }}><div style={{ width:`${pct}%`, height:'100%', background:'#22c55e' }} /></div>
          </div>
        </div>
        <div style={{ marginLeft:'auto', display:'flex', gap:8, alignItems:'center', flexShrink:0 }}><button className="btn btn-secondary" style={{ height:34, padding:'0 14px' }} disabled={filtered.length === 0} onClick={exportCSV}>Export</button><button className="btn btn-secondary" style={{ height:34, padding:'0 14px' }} disabled={filtered.length === 0} onClick={printList}>Print</button><button className="btn btn-primary" style={{ height:34, padding:'0 14px', background:actionMode === 'activate' ? '#16a34a' : actionMode === 'reset' ? '#374151' : '#e5e7eb', color:actionDisabled ? '#9ca3af' : '#fff', borderColor:'transparent', minWidth:112 }} disabled={actionDisabled} title={actionMode === 'mixed' ? 'Mixed selection — select same state queues' : ''} onClick={runAction}>{actionMode === 'reset' ? 'Reset Queue' : 'Activate Queue'}</button></div>
      </div>
      <div style={{ padding:'8px 24px', borderBottom:'1px solid #f3f4f6', display:'flex', alignItems:'center', gap:8, flexShrink:0, overflow:'hidden', minWidth:0 }}>
        <div style={{ position:'relative', width:220, flex:'0 1 220px', minWidth:170 }}><Search size={13} style={{ position:'absolute', left:9, top:'50%', transform:'translateY(-50%)', color:'#9ca3af' }} /><input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search Q#, label, style, buyer..." style={{ width:'100%', paddingLeft:28, paddingRight:10, height:32, border:'1px solid var(--border)', borderRadius:7, fontSize:12, fontFamily:'var(--font)', outline:'none', background:'#fafafa' }} /></div>
        <select value={groupBy} onChange={e=>setGroupBy(e.target.value)} style={{ height:32, border:'1px solid var(--border)', borderRadius:7, fontSize:12, padding:'0 8px', background:'#fff', minWidth:0, flex:'1 1 110px', maxWidth:170 }}><option value="none">☰ No Group</option><option value="style_number">☰ By Style</option><option value="job_number">☰ By Job</option><option value="buyer_name">☰ By Buyer</option><option value="q_number">☰ By Serial / Q#</option><option value="ship_date">☰ By Delivery Date</option></select>
        <select value={`${sort.col}:${sort.dir}`} onChange={e=>{ const [col,dir]=e.target.value.split(':'); setSort({col,dir}) }} style={{ height:32, border:'1px solid var(--border)', borderRadius:7, fontSize:12, padding:'0 8px', background:'#fff', minWidth:0, flex:'1 1 110px', maxWidth:170 }}><option value="q_number:asc">⇅ Q# Asc</option><option value="q_number:desc">⇅ Q# Desc</option><option value="ship_date:asc">⇅ Delivery Asc</option><option value="ship_date:desc">⇅ Delivery Desc</option><option value="qty:desc">⇅ Qty High → Low</option><option value="qty:asc">⇅ Qty Low → High</option></select>
        <select value={filterBuyer} onChange={e=>setFilterBuyer(e.target.value)} style={{ height:32, border:'1px solid var(--border)', borderRadius:7, fontSize:12, padding:'0 8px', background:'#fff', minWidth:0, flex:'1 1 110px', maxWidth:170 }}><option value="">All Buyers</option>{buyers.map(v=><option key={v}>{v}</option>)}</select>
        <select value={filterStyle} onChange={e=>setFilterStyle(e.target.value)} style={{ height:32, border:'1px solid var(--border)', borderRadius:7, fontSize:12, padding:'0 8px', background:'#fff', minWidth:0, flex:'1 1 110px', maxWidth:170 }}><option value="">All Styles</option>{styles.map(v=><option key={v}>{v}</option>)}</select>
        <select value={filterJob} onChange={e=>setFilterJob(e.target.value)} style={{ height:32, border:'1px solid var(--border)', borderRadius:7, fontSize:12, padding:'0 8px', background:'#fff', minWidth:0, flex:'1 1 110px', maxWidth:170 }}><option value="">All Jobs</option>{jobs.map(v=><option key={v}>{v}</option>)}</select>
        <select value={filterRule} onChange={e=>setFilterRule(e.target.value)} style={{ height:32, border:'1px solid var(--border)', borderRadius:7, fontSize:12, padding:'0 8px', background:'#fff', minWidth:0, flex:'1 1 110px', maxWidth:170 }}><option value="">All Split Rules</option>{rules.map(v=><option key={v}>{v}</option>)}</select>
        <select value={filterStatus} onChange={e=>setFilterStatus(e.target.value)} style={{ height:32, border:'1px solid var(--border)', borderRadius:7, fontSize:12, padding:'0 8px', background:'#fff', minWidth:0, flex:'1 1 110px', maxWidth:170 }}><option value="">All Status</option>{statuses.map(v=><option key={v}>{v}</option>)}</select>
        <button className="btn btn-secondary" style={{ height:32, width:42, padding:0, marginLeft:'auto', flex:'0 0 42px' }} onClick={()=>setShowCols(true)} title="Column Settings"><Settings size={15} /></button>
      </div>
      <div style={{ flex:1, overflowY:'auto', overflowX:'hidden', minWidth:0 }}>{filtered.length === 0 ? <div style={{ textAlign:'center', padding:60, color:'#9ca3af', fontSize:12 }}>No queues yet.</div> : <table style={{ width:'100%', borderCollapse:'collapse', tableLayout:'fixed' }}><thead><tr style={{ background:'#fafafa', position:'sticky', top:0, zIndex:10 }}><th style={{ width:36, padding:'9px 0 9px 14px', borderBottom:'1px solid #f3f4f6' }}><input type="checkbox" checked={filtered.length>0 && filtered.every(q=>selectedIds.has(q.id))} onChange={toggleAll}/></th>{visibleKeys.map(k=><th key={k} style={{ ...thStyle, textAlign:['qty','shipped_qty','balance_qty'].includes(k)?'right':'left' }}>{QUEUE_COLUMN_LABELS[k]}</th>)}</tr></thead><tbody>{displayRows.map(row=>{ if(row.type==='group') return <tr key={`g-${row.key}`} style={{ background:'#fdf6e3' }}><td colSpan={1+visibleKeys.length} style={{ padding:'10px 18px', borderBottom:'1px solid #eee', borderTop:'1px solid #eee' }}><div style={{ display:'flex', justifyContent:'space-between', fontSize:12, fontWeight:800 }}><span>{row.key} <span style={{ color:'#9ca3af' }}>— {row.count} queues</span></span><span>Qty: {row.qty.toLocaleString()} · Shipped: {row.shipped.toLocaleString()}</span></div></td></tr>; const q=row.q, isSel=selectedIds.has(q.id); return <tr key={q.id} style={{ background:isSel?'#f0f9ff':'' }}><td style={{ padding:'10px 0 10px 14px', borderBottom:'1px solid #f3f4f6' }}><input type="checkbox" checked={isSel} onChange={()=>toggleSelect(q.id)}/></td>{visibleKeys.map(k=><React.Fragment key={k}>{renderCell(q,k)}</React.Fragment>)}</tr> })}</tbody></table>}</div>
      {showCols && <DragColumnSettings title="Queue Columns" subtitle="Drag fields to reorder; tick to show/hide" labels={QUEUE_COLUMN_LABELS} order={colOrder} visible={visibleCols} onChange={({order,visible})=>{setColOrder(order);setVisibleCols(visible)}} onReset={()=>{setVisibleCols(DEFAULT_QUEUE_VISIBLE_COLUMNS);setColOrder(DEFAULT_QUEUE_COLUMN_ORDER)}} onClose={()=>setShowCols(false)}/>}
    </div>
  )
}

// ── Main Orders Page ──────────────────────────────────────────────────────────
export default function Orders() {
  const { alert, confirm, prompt, Dialogs } = useAppDialogs()
  const { user } = useAuth()
  const orderTablePrefsKey = `app2a.tableView.${user?.id || user?.username || user?.email || 'user'}.orders.main`
  const viewPrefs = (() => {
    try { return JSON.parse(localStorage.getItem('app2a.orders.viewPrefs') || '{}') || {} }
    catch (e) { return {} }
  })()
  const [tab, setTab]               = useState(viewPrefs.tab || 'orders')
  const [orders, setOrders]         = useState([])
  const [loading, setLoading]       = useState(true)
  const [search, setSearch]         = useState(viewPrefs.search || '')
  const [filterBuyer, setFilterBuyer]   = useState(viewPrefs.filterBuyer || '')
  const [filterStatus, setFilterStatus] = useState(Array.isArray(viewPrefs.filterStatus) ? viewPrefs.filterStatus : [])
  const [statusDropdownOpen, setStatusDropdownOpen] = useState(false)
  const [selected, setSelected]     = useState(new Set())
  const [wizardOpen, setWizardOpen] = useState(false)
  const [editOrder, setEditOrder]   = useState(null)
  const [buyers, setBuyers]         = useState([])
  const [showAssignJob, setShowAssignJob] = useState(false)
  const [showChangeStatus, setShowChangeStatus] = useState(false)
  const [showPrint, setShowPrint] = useState(false)
  const [showColumnSettings, setShowColumnSettings] = useState(false)
  const [visibleColumns, setVisibleColumns] = useState(() => {
    try {
      const saved = localStorage.getItem(orderTablePrefsKey + '.visible') || localStorage.getItem('orders.visibleColumns.v2') || localStorage.getItem('orders.visibleColumns.v1')
      if (saved) return { ...DEFAULT_ORDER_VISIBLE_COLUMNS, ...JSON.parse(saved) }
    } catch (e) {}
    return { ...DEFAULT_ORDER_VISIBLE_COLUMNS }
  })
  const [columnOrder, setColumnOrder] = useState(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(orderTablePrefsKey + '.order') || localStorage.getItem('orders.columnOrder.v1') || '[]')
      if (Array.isArray(saved) && saved.length) {
        const merged = [...saved, ...DEFAULT_ORDER_COLUMN_ORDER.filter(k => !saved.includes(k))]
        return merged.filter(k => DEFAULT_ORDER_COLUMN_ORDER.includes(k))
      }
    } catch (e) {}
    return [...DEFAULT_ORDER_COLUMN_ORDER]
  })
  const [dragColumnKey, setDragColumnKey] = useState(null)
  const [sort, setSort] = useState(viewPrefs.sort && viewPrefs.sort.col ? viewPrefs.sort : { col: 'ship_date', dir: 'asc' })
  const [groupBy, setGroupBy] = useState(viewPrefs.groupBy || 'none')
  const [tabNotices, setTabNotices] = useState({ orders:false, queues:false })

  useEffect(() => {
    loadOrders()
    supabase.from('buyers').select('id,name').order('name').then(({ data }) => setBuyers(data || []))
    setTabNotices(getPageTabNoticeMap('ordersPage', ['orders','queues']))
  }, [])

  useEffect(() => {
    markTabSeen('ordersPage', tab)
    setTabNotices(getPageTabNoticeMap('ordersPage', ['orders','queues']))
  }, [tab])

  useEffect(() => {
    try {
      localStorage.setItem('app2a.orders.viewPrefs', JSON.stringify({
        tab,
        search,
        filterBuyer,
        filterStatus,
        sort,
        groupBy,
      }))
    } catch (e) {}
  }, [tab, search, filterBuyer, filterStatus, sort, groupBy])

  useEffect(() => {
    try { localStorage.setItem(orderTablePrefsKey + '.visible', JSON.stringify(visibleColumns)) } catch (e) {}
  }, [visibleColumns, orderTablePrefsKey])

  useEffect(() => {
    try { localStorage.setItem(orderTablePrefsKey + '.order', JSON.stringify(columnOrder)) } catch (e) {}
  }, [columnOrder, orderTablePrefsKey])

  async function loadOrders() {
    setLoading(true)
    const [{ data }, { data: shipmentRows }, { data: queueRows }] = await Promise.all([
      supabase.from('orders').select('id,job_id,job_number,buyer_name,buyer_id,style_number,po_number,ship_date,planned_date,status,total_qty,total_value_usd,factory_ref,brand_name,store_name,merchandiser_name,description,created_at').order('ship_date', { ascending: true, nullsLast: true }),
      supabase.from('shipment_lines').select('order_id,shipped_qty'),
      supabase.from('order_queues').select('order_id'),
    ])
    const shippedByOrder = {}
    ;(shipmentRows || []).forEach(r => { shippedByOrder[r.order_id] = (shippedByOrder[r.order_id] || 0) + (parseFloat(r.shipped_qty) || 0) })
    const qCountByOrder = {}
    ;(queueRows || []).forEach(r => { if (r.order_id) qCountByOrder[r.order_id] = (qCountByOrder[r.order_id] || 0) + 1 })
    const mapped = (data || []).map(o => ({
      ...o,
      shipped_qty: shippedByOrder[o.id] || 0,
      balance_qty: Math.max(0, (parseFloat(o.total_qty) || 0) - (shippedByOrder[o.id] || 0)),
      q_count: qCountByOrder[o.id] || 0,
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
    setTabNotices(getPageTabNoticeMap('ordersPage', ['orders','queues']))
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
  function closeWizard(){ markTabUpdated('ordersPage', 'orders'); setTabNotices(getPageTabNoticeMap('ordersPage', ['orders','queues'])); setWizardOpen(false); setEditOrder(null); loadOrders() }

  function visibleJobNumber(o) {
    // Job counter resets can leave old job_number text on orders after job_id is cleared.
    // Only show/export/search the job number when the order is actually linked to a job.
    return o?.job_id ? (o.job_number || '') : ''
  }

  async function delinkSelectedJobs() {
    const ids = [...selected]
    if (!ids.length) return
    const linked = selectedOrderObjs.filter(o => o.job_id || o.job_number)
    if (!linked.length) {
      await alert('Selected order(s) are not linked to any job.', { title:'No Job Link' })
      return
    }
    const pass = await prompt(`Admin password required to delink ${linked.length} order(s) from job.`, {
      title:'Delink Job',
      placeholder:'Enter admin password',
      password:true,
      confirmText:'Delink'
    })
    if (pass === null) return
    if (pass !== 'admin') {
      await alert('Incorrect password.', { title:'Access Denied' })
      return
    }
    if (!await confirm(`Delink ${linked.length} order(s) from their job? Orders will remain, only job_id and job_number will be cleared.`, { title:'Confirm Delink', confirmText:'Delink' })) return
    const { error } = await supabase.from('orders').update({ job_id:null, job_number:null }).in('id', linked.map(o => o.id))
    if (error) { await alert('Could not delink job: ' + error.message, { title:'Delink Failed' }); return }
    setOrders(prev => prev.map(o => linked.some(x => x.id === o.id) ? { ...o, job_id:null, job_number:null } : o))
    setSelected(new Set())
    markTabUpdated('ordersPage', 'orders')
    setTabNotices(getPageTabNoticeMap('ordersPage', ['orders','queues']))
    await loadOrders()
    await alert('Selected order(s) delinked from job.', { title:'Job Delinked' })
  }

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
    setTabNotices(getPageTabNoticeMap('ordersPage', ['orders','queues']))
    setSelected(new Set())
    loadOrders()
  }

  const today  = new Date()
  const in21   = new Date(today); in21.setDate(today.getDate() + 21)
  const weekEnd = new Date(today); weekEnd.setDate(today.getDate() + 7)
  const monEnd  = new Date(today.getFullYear(), today.getMonth() + 1, 0)

  const openStatuses = ['Draft', 'Active', 'Booked']
  const active     = orders.filter(o => openStatuses.includes(o.status || 'Draft'))

  const sortOptions = [
    { col: 'buyer_name', label: 'Buyer' },
    { col: 'job_number', label: 'Job Number' },
    { col: 'created_at', label: 'Order Date' },
    { col: 'ship_date', label: 'Shipment Date' },
    { col: 'style_number', label: 'Style Number' },
    { col: 'total_qty', label: 'Quantity' },
    { col: 'total_value_usd', label: 'Value' },
  ]

  const groupOptions = [
    { value: 'none', label: 'No Group' },
    { value: 'style_number', label: 'By Style Number' },
    { value: 'job_number', label: 'By Job #' },
    { value: 'store_name', label: 'By Store' },
    { value: 'ship_date', label: 'By Delivery' },
  ]

  const statusOptions = ['Draft', 'Active', 'Booked', 'Shipped', 'Cancelled']

  const sortDropdownOptions = [
    { col: 'ship_date', dir: 'asc', label: 'Ship Date (Asc)' },
    { col: 'ship_date', dir: 'desc', label: 'Ship Date (Desc)' },
    { col: 'job_number', dir: 'asc', label: 'Job Number (Asc)' },
    { col: 'job_number', dir: 'desc', label: 'Job Number (Desc)' },
    { col: 'total_value_usd', dir: 'desc', label: 'Value (High → Low)' },
    { col: 'total_value_usd', dir: 'asc', label: 'Value (Low → High)' },
  ]

  const toggleStatusFilter = (status) => {
    setFilterStatus(prev => prev.includes(status) ? prev.filter(s => s !== status) : [...prev, status])
  }

  const statusLabel = () => {
    if (!filterStatus.length || filterStatus.length === statusOptions.length) return 'Status: All'
    if (filterStatus.length === 1) return `Status: ${filterStatus[0]}`
    return `Status: ${filterStatus.length}`
  }

  const orderStatusRank = (status) => {
    const s = status || 'Draft'
    if (s === 'Active' || s === 'Booked') return 0
    if (s === 'Draft') return 1
    if (s === 'Shipped') return 2
    if (s === 'Cancelled') return 3
    return 4
  }

  const comparePrimitive = (va, vb, dir) => {
    if (va < vb) return dir === 'asc' ? -1 : 1
    if (va > vb) return dir === 'asc' ? 1 : -1
    return 0
  }

  const sortValue = (o, col) => {
    if (col === 'ship_date') return o.ship_date || '9999-12-31'
    if (col === 'created_at') return o.created_at || '9999-12-31'
    if (col === 'job_number') return (visibleJobNumber(o) || 'zzzzzz').toLowerCase()
    if (col === 'buyer_name') return (o.buyer_name || '').toLowerCase()
    if (col === 'style_number') return (o.style_number || '').toLowerCase()
    if (col === 'total_qty') return parseFloat(o.total_qty) || 0
    if (col === 'total_value_usd') return parseFloat(o.total_value_usd) || 0
    if (col === 'status') return o.status || ''
    return (o[col] || '').toString().toLowerCase()
  }

  const filtered = orders.filter(o => {
    const q = search.toLowerCase()
    const matchSearch = !q || [o.style_number, o.buyer_name, o.po_number, visibleJobNumber(o), o.description].some(f => f?.toLowerCase().includes(q))
    const matchBuyer  = !filterBuyer  || o.buyer_name === filterBuyer
    const matchStatus = !filterStatus.length || filterStatus.includes(o.status || 'Draft')
    return matchSearch && matchBuyer && matchStatus
  }).sort((a, b) => {
    const { col, dir } = sort
    if (col === 'ship_date') {
      const statusCompare = comparePrimitive(orderStatusRank(a.status), orderStatusRank(b.status), 'asc')
      if (statusCompare !== 0) return statusCompare
    }
    const primary = comparePrimitive(sortValue(a, col), sortValue(b, col), dir)
    if (primary !== 0) return primary
    return comparePrimitive(sortValue(a, 'style_number'), sortValue(b, 'style_number'), 'asc')
  })

  const groupLabel = (key, value) => {
    const clean = value || 'Unassigned'
    if (key === 'style_number') return `Style ${clean}`
    if (key === 'job_number') return `Job # ${clean}`
    if (key === 'store_name') return `Store ${clean}`
    if (key === 'ship_date') return `Delivery ${clean}`
    return clean
  }

  const groupValue = (o) => {
    if (groupBy === 'style_number') return o.style_number || 'Unassigned'
    if (groupBy === 'job_number') return visibleJobNumber(o) || 'Unassigned'
    if (groupBy === 'store_name') return o.store_name || 'Unassigned'
    if (groupBy === 'ship_date') return o.ship_date || 'No Delivery Date'
    return ''
  }

  const displayedRows = groupBy === 'none' ? filtered.map(o => ({ type:'order', order:o })) : (() => {
    const groups = []
    const map = new Map()
    filtered.forEach(o => {
      const value = groupValue(o)
      if (!map.has(value)) {
        const group = { type:'group', key: value, label: groupLabel(groupBy, value), count:0, qty:0, value:0 }
        map.set(value, group)
        groups.push(group)
      }
      const group = map.get(value)
      group.count += 1
      group.qty += Number(o.total_qty || 0)
      group.value += Number(o.total_value_usd || 0)
    })
    const rows = []
    groups.forEach(group => {
      rows.push(group)
      filtered.filter(o => groupValue(o) === group.key).forEach(o => rows.push({ type:'order', order:o, groupKey:group.key }))
    })
    return rows
  })()

  const dueThisMonth = active.filter(o => o.ship_date && new Date(o.ship_date) <= monEnd)
  const dueThisWeek  = active.filter(o => o.ship_date && new Date(o.ship_date) <= weekEnd)
  const unassignedOrders = active.filter(o => !visibleJobNumber(o))
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
  const selectedHasLinkedJob = selectedOrderObjs.some(o => visibleJobNumber(o))
  const selectedAllLinkedJobs = selectedOrderObjs.length > 0 && selectedOrderObjs.every(o => visibleJobNumber(o))
  const assignDelinkLabel = selected.size === 0 ? 'Assign / Delink Job' : selectedAllLinkedJobs ? 'Delink from Job' : 'Assign to Job'

  function handleAssignDelinkJob() {
    if (!selectedOrderObjs.length) return
    if (selectedAllLinkedJobs) delinkSelectedJobs()
    else setShowAssignJob(true)
  }

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

  const sortSelectStyle = { ...selStyle, minWidth: 150, maxWidth: 170 }
  const actionBtnStyle = { height: 32, minHeight: 32, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }
  const squareBtnStyle = { ...actionBtnStyle, width: 32, minWidth: 32, padding: 0 }

  const pinnedColumns = [
    { key: 'job_status', label: 'Job / Status' },
    { key: 'buyer', label: 'Buyer' },
    { key: 'style_desc', label: 'Style / Description' },
  ]
  const configurableColumnMap = {
    picture: { key: 'picture', label: 'Picture', sort: null },
    po: { key: 'po', label: 'PO #', sort: null },
    factory_ref: { key: 'factory_ref', label: 'Factory Ref', sort: null },
    qty: { key: 'qty', label: 'Qty / Ship / Balance', sort: 'total_qty' },
    value: { key: 'value', label: 'Value (USD)', sort: 'total_value_usd' },
    ship_date: { key: 'ship_date', label: 'Ship Date', sort: 'ship_date' },
    placed: { key: 'placed', label: 'Placed', sort: 'created_at' },
    merchandiser: { key: 'merchandiser', label: 'Merch.', sort: null },
    q_count: { key: 'q_count', label: '#Qs', sort: null },
    season: { key: 'season', label: 'Season', sort: null },
    po_count: { key: 'po_count', label: 'PO Count', sort: null },
    sampling_status: { key: 'sampling_status', label: 'Sampling Status', sort: null },
  }
  const configurableColumns = columnOrder.map(key => configurableColumnMap[key]).filter(Boolean)
  const visibleConfigColumns = configurableColumns.filter(c => c.key !== 'picture' && visibleColumns[c.key])
  const resetVisibleColumns = () => {
    setVisibleColumns({ ...DEFAULT_ORDER_VISIBLE_COLUMNS })
    setColumnOrder([...DEFAULT_ORDER_COLUMN_ORDER])
  }
  const toggleColumn = (key) => setVisibleColumns(prev => ({ ...prev, [key]: !prev[key] }))
  const moveColumn = (fromKey, toKey) => {
    if (!fromKey || !toKey || fromKey === toKey) return
    setColumnOrder(prev => {
      const next = [...prev]
      const from = next.indexOf(fromKey)
      const to = next.indexOf(toKey)
      if (from < 0 || to < 0) return prev
      const [item] = next.splice(from, 1)
      next.splice(to, 0, item)
      return next
    })
  }

  const renderColumnCell = (o, key) => {
    const isOverdue = o.ship_date && new Date(o.ship_date) < today
    if (key === 'po') return <td style={{ padding: '9px 12px', borderBottom: '1px solid #f9fafb', fontSize: 11, color: '#6b7280', fontFamily: 'monospace' }} onClick={() => openEdit(o)}>{o.po_number || '—'}</td>
    if (key === 'factory_ref') return <td style={{ padding: '9px 12px', borderBottom: '1px solid #f9fafb', fontSize: 11, color: '#6b7280', fontFamily: 'monospace' }} onClick={() => openEdit(o)}>{o.factory_ref || '—'}</td>
    if (key === 'qty') return <td style={{ padding: '9px 12px', borderBottom: '1px solid #f9fafb', fontFamily: 'monospace', fontSize: 11 }} onClick={() => openEdit(o)}><div style={{ fontWeight:700 }}>{o.total_qty?.toLocaleString() || '—'}</div><div style={{ color:'#2563eb', marginTop:2 }}>Ship {Number(o.shipped_qty || 0).toLocaleString()}</div><div style={{ color:'#111827', marginTop:2 }}>Bal {Number(o.balance_qty || 0).toLocaleString()}</div></td>
    if (key === 'value') return <td style={{ padding: '9px 12px', borderBottom: '1px solid #f9fafb', fontSize: 12, fontWeight: 700 }} onClick={() => openEdit(o)}>{o.total_value_usd ? `$${parseFloat(o.total_value_usd).toLocaleString(undefined, { maximumFractionDigits: 0 })}` : '—'}</td>
    if (key === 'ship_date') return <td style={{ padding: '9px 12px', borderBottom: '1px solid #f9fafb', whiteSpace: 'nowrap' }} onClick={() => openEdit(o)}>{o.ship_date ? (() => { const days = daysRemaining(o.ship_date); const dl = daysLabel(days); return <div><div style={{ fontSize: 11, color: dateColor(o.ship_date), fontWeight: isOverdue ? 700 : 400 }}>{fmtDate(o.planned_date || o.ship_date)}</div>{dl && <div style={{ fontSize: 10, color: dl.color, fontWeight: dl.weight, marginTop: 1 }}>{dl.text}</div>}</div> })() : <span style={{ color: '#9ca3af' }}>—</span>}</td>
    if (key === 'placed') return <td style={{ padding: '9px 12px', borderBottom: '1px solid #f9fafb', fontSize: 11, color: '#9ca3af', whiteSpace: 'nowrap' }} onClick={() => openEdit(o)}>{o.created_at ? new Date(o.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) : '—'}</td>
    if (key === 'merchandiser') return <td style={{ padding: '9px 12px', borderBottom: '1px solid #f9fafb', fontSize: 11, color: '#6b7280' }} onClick={() => openEdit(o)}>{o.merchandiser_name ? o.merchandiser_name.split(' ').map((p, i) => i === 0 ? p[0] + '.' : p).join(' ') : '—'}</td>
    if (key === 'q_count') return <td style={{ padding: '9px 12px', borderBottom: '1px solid #f9fafb', fontSize: 12, fontWeight: 800, color: (o.q_count || 0) ? '#111827' : '#9ca3af', fontFamily: 'monospace' }} onClick={() => openEdit(o)}>{Number(o.q_count || 0)}</td>
    if (key === 'season') return <td style={{ padding: '9px 12px', borderBottom: '1px solid #f9fafb', fontSize: 11, color: '#6b7280' }} onClick={() => openEdit(o)}>{o.season || '—'}</td>
    if (key === 'po_count') return <td style={{ padding: '9px 12px', borderBottom: '1px solid #f9fafb', fontSize: 11, color: '#6b7280' }} onClick={() => openEdit(o)}>{o.po_count ?? '—'}</td>
    if (key === 'sampling_status') return <td style={{ padding: '9px 12px', borderBottom: '1px solid #f9fafb', fontSize: 11, color: '#6b7280' }} onClick={() => openEdit(o)}>{o.sampling_status || '—'}</td>
    return null
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: '#fff' }}>

      {/* Tabs */}
      <div style={{ display: 'flex', padding: '0 24px', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
        <button style={tabStyle('orders')} onClick={() => setTab('orders')}><span style={{ display:'inline-flex', alignItems:'center', gap:6 }}>Buyer Purchase Orders{tabNotices.orders && tab !== 'orders' ? <span style={{ width:8, height:8, borderRadius:'50%', background:'#F59E0B', display:'inline-block' }} /> : null}</span></button>
        <button style={tabStyle('queues')} onClick={() => setTab('queues')}><span style={{ display:'inline-flex', alignItems:'center', gap:6 }}>Queues{tabNotices.queues && tab !== 'queues' ? <span style={{ width:8, height:8, borderRadius:'50%', background:'#F59E0B', display:'inline-block' }} /> : null}</span></button>
      </div>

      {/* Page header */}
      {tab === 'orders' && <div style={{ padding: '12px 24px', borderBottom: '1px solid #f3f4f6', display: 'flex', alignItems: 'center', gap: 14, flexShrink: 0 }}>
        <div style={{ flexShrink: 0 }}>
          <div style={{ fontSize: 20, fontWeight: 800, letterSpacing: '-0.4px' }}>Orders</div>
          <div style={{ fontSize: 11, color: 'var(--text-light)', marginTop: 1 }}>Production status and delivery tracking</div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          {[
            { label: 'Total Orders',   value: active.length },
            { label: 'Unassigned Orders', value: unassignedOrders.length, amber: unassignedOrders.length > 0 },
            { label: 'Due This Month', value: dueThisMonth.length, amber: dueThisMonth.length > 0 },
            { label: 'Due This Week',  value: dueThisWeek.length,  amber: dueThisWeek.length > 0 },
          ].map(kpi => (
            <div key={kpi.label} style={{ padding: '6px 12px', border: '1px solid var(--border)', borderRadius: 8, background: '#fff', minWidth: 100 }}>
              <div style={{ fontSize: 9, fontWeight: 600, color: 'var(--text-light)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 2 }}>{kpi.label}</div>
              <div style={{ fontSize: 18, fontWeight: 800, letterSpacing: '-0.5px', lineHeight: 1, color: kpi.amber ? '#d97706' : '#0d0d0d' }}>{kpi.value}</div>
            </div>
          ))}
        </div>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 8, alignItems: 'center' }}>
          <label className="btn btn-secondary" style={{ ...squareBtnStyle, cursor: 'pointer' }} title="Import Orders">
            <Upload size={15} />
            <input type="file" accept=".csv" style={{ display: 'none' }} onChange={handleImportFile} />
          </label>
          <button className="btn btn-secondary" style={squareBtnStyle} onClick={downloadImportTemplate} title="Download Template">
            <FileText size={15} />
          </button>
          <button className="btn btn-secondary" style={squareBtnStyle} title="Export Data / Export Excel"
            onClick={() => {
              if (filtered.length === 0) return
              const cols = ['Job','Style','Buyer','Brand','PO #','Factory Ref','Qty','Value USD','Ship Date','Status']
              const rows = filtered.map(o => [visibleJobNumber(o),o.style_number||'',o.buyer_name||'',o.brand_name||'',o.po_number||'',o.factory_ref||'',o.total_qty||'',o.total_value_usd||'',o.ship_date||'',o.status||''])
              const csv = [cols, ...rows].map(r => r.map(v => `"${String(v).replace(/"/g,'""')}"`).join(',')).join('\n')
              const a = document.createElement('a'); a.href = 'data:text/csv;charset=utf-8,' + encodeURIComponent(csv)
              a.download = `orders-${new Date().toISOString().slice(0,10)}.csv`; a.click()
            }}>
            <Table size={15} />
          </button>
          <button className="btn btn-secondary" style={squareBtnStyle}
            onClick={() => setShowPrint(true)}
            disabled={selected.size === 0}
            title={selected.size === 0 ? 'Select orders to print' : `Print ${selected.size} order${selected.size>1?'s':''}`}>
            <Printer size={15} />
          </button>
          <button className="btn btn-primary" style={actionBtnStyle} onClick={openNew}>+ New Order</button>
        </div>      </div>}

      {tab === 'orders' && (
        <>
          {/* Toolbar */}
          <div style={{ padding: '8px 24px', borderBottom: '1px solid #f3f4f6', display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
            <div style={{ position: 'relative', width: 280, flexShrink: 0 }}>
              <Search size={13} style={{ position: 'absolute', left: 9, top: '50%', transform: 'translateY(-50%)', color: '#9ca3af' }} />
              <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search job, style, buyer..."
                style={{ width: '100%', paddingLeft: 28, paddingRight: 10, height: 32, border: '1px solid var(--border)', borderRadius: 7, fontSize: 12, fontFamily: 'var(--font)', outline: 'none', background: '#fafafa' }} />
            </div>
            <select value={groupBy} onChange={e => setGroupBy(e.target.value)} style={{ ...sortSelectStyle, minWidth: 142 }} title="Group orders">
              {groupOptions.map(opt => <option key={opt.value} value={opt.value}>☰ {opt.label}</option>)}
            </select>
            <select value={`${sort.col}:${sort.dir}`} onChange={e => { const [col, dir] = e.target.value.split(':'); setSort({ col, dir }) }} style={sortSelectStyle} title="Sort orders">
              {sortDropdownOptions.map(opt => <option key={`${opt.col}:${opt.dir}`} value={`${opt.col}:${opt.dir}`}>⇅ {opt.label}</option>)}
            </select>
            <select value={filterBuyer} onChange={e => setFilterBuyer(e.target.value)} style={selStyle}>
              <option value="">All Buyers</option>
              {buyers.map(b => <option key={b.id} value={b.name}>{b.name}</option>)}
            </select>
            <div style={{ position:'relative' }}>
              <button type="button" className="btn btn-secondary" style={{ ...selStyle, minWidth: 118, display:'inline-flex', alignItems:'center', justifyContent:'space-between', gap:8 }} onClick={() => setStatusDropdownOpen(v => !v)}>
                <span>{statusLabel()}</span><span style={{ color:'#9ca3af' }}>▾</span>
              </button>
              {statusDropdownOpen && (
                <div style={{ position:'absolute', top:36, left:0, zIndex:50, width:190, background:'#fff', border:'1px solid var(--border)', borderRadius:8, boxShadow:'0 12px 28px rgba(15,23,42,0.12)', padding:8 }}>
                  <div style={{ display:'flex', justifyContent:'space-between', gap:8, padding:'4px 4px 8px', borderBottom:'1px solid #f3f4f6', marginBottom:6 }}>
                    <button type="button" onClick={() => setFilterStatus([...statusOptions])} style={{ border:0, background:'transparent', color:'#2563eb', fontSize:11, fontWeight:700, cursor:'pointer' }}>Select All</button>
                    <button type="button" onClick={() => setFilterStatus([])} style={{ border:0, background:'transparent', color:'#6b7280', fontSize:11, fontWeight:700, cursor:'pointer' }}>Clear All</button>
                  </div>
                  {statusOptions.map(st => (
                    <label key={st} style={{ display:'flex', alignItems:'center', gap:8, padding:'6px 6px', fontSize:12, cursor:'pointer', borderRadius:6 }}>
                      <input type="checkbox" checked={filterStatus.includes(st)} onChange={() => toggleStatusFilter(st)} />
                      <span>{st}</span>
                    </label>
                  ))}
                </div>
              )}
            </div>
            <div style={{ marginLeft:'auto', display:'flex', gap:8, alignItems:'center' }}>
              <button className={selectedAllLinkedJobs ? "btn btn-danger" : "btn btn-secondary"} style={actionBtnStyle} disabled={selected.size === 0} onClick={handleAssignDelinkJob} title={selectedHasLinkedJob && !selectedAllLinkedJobs ? 'Mixed selection: unlinked orders will be assigned to a job' : assignDelinkLabel}>{assignDelinkLabel}</button>
              <button className="btn btn-secondary" style={squareBtnStyle} disabled={selected.size === 0} onClick={() => setShowChangeStatus(true)} title="Change Status">
                <RefreshCcw size={15} />
              </button>
              <button className="btn btn-secondary" style={squareBtnStyle} disabled={selected.size !== 1} onClick={(e) => selectedOrderObjs[0] && duplicateOrder(selectedOrderObjs[0], e)} title="Duplicate Order">
                <Copy size={15} />
              </button>
              <button className="btn btn-danger" style={squareBtnStyle} disabled={selected.size === 0} onClick={deleteSelected} title="Delete Order">
                <Trash2 size={15} />
              </button>
              <button className="btn btn-secondary" style={squareBtnStyle} onClick={() => setShowColumnSettings(true)} title="Column Settings">
                <Settings size={15} />
              </button>
            </div>
          </div>

          {/* Table */}
          <div style={{ flex: 1, overflowY: 'auto', overflowX: 'auto' }}>
            {loading ? (
              <div style={{ padding: 60, textAlign: 'center', color: 'var(--text-light)', fontSize: 12 }}>Loading...</div>
            ) : filtered.length === 0 ? (
              <div style={{ padding: 60, textAlign: 'center' }}>
                <div style={{ opacity: 0.2, marginBottom: 10 }}><Layers size={40} /></div>
                <div style={{ fontSize: 13, color: 'var(--text-light)', marginBottom: 12 }}>
                  {search || filterBuyer || filterStatus.length ? 'No orders match your filters.' : 'No orders yet.'}
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
                    {visibleColumns.picture && <th style={{ fontSize: 10, fontWeight: 600, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.5px', padding: '9px 12px', textAlign: 'left', borderBottom: '1px solid #f3f4f6', whiteSpace: 'nowrap' }}>Picture</th>}
                    {[{ label: 'Job / Status', col: 'job_number' }, { label: 'Buyer', col: 'buyer_name' }, { label: 'Style / Desc', col: 'style_number' }, ...visibleConfigColumns.map(c => ({ label: c.label, col: c.sort }))].map(({ label, col }) => (
                      <th key={label} onClick={() => col && toggleSort(col)}
                        style={{ fontSize: 10, fontWeight: 600, color: sort.col === col ? '#0d0d0d' : '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.5px', padding: '9px 12px', textAlign: 'left', borderBottom: '1px solid #f3f4f6', whiteSpace: 'nowrap', cursor: col ? 'pointer' : 'default', userSelect: 'none' }}>
                        {label}{col && sort.col === col ? (sort.dir === 'asc' ? ' ↑' : ' ↓') : col ? <span style={{ color: '#d1d5db' }}> ↕</span> : ''}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {displayedRows.map(row => {
                    if (row.type === 'group') {
                      return (
                        <tr key={`group-${row.key}`} style={{ background:'#fdf6e3' }}>
                          <td colSpan={1 + (visibleColumns.picture ? 1 : 0) + 3 + visibleConfigColumns.length} style={{ padding:'10px 18px', borderBottom:'1px solid #eee', borderTop:'1px solid #eee' }}>
                            <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', gap:16 }}>
                              <div style={{ fontSize:12, fontWeight:800, color:'#111827' }}>{row.label} <span style={{ color:'#9ca3af', fontWeight:700 }}>— {row.count} order{row.count === 1 ? '' : 's'}</span></div>
                              <div style={{ display:'flex', gap:18, alignItems:'center', fontSize:11, color:'#6b7280', fontWeight:700 }}>
                                <span>Qty: <strong style={{ color:'#111827' }}>{row.qty.toLocaleString()}</strong></span>
                                <span>Value: <strong style={{ color:'#16a34a' }}>${row.value.toLocaleString(undefined, { maximumFractionDigits: 0 })}</strong></span>
                              </div>
                            </div>
                          </td>
                        </tr>
                      )
                    }
                    const o = row.order
                    return (
                      <tr key={o.id}
                        style={{ background: selected.has(o.id) ? '#f0f9ff' : '', cursor: 'pointer' }}
                        onMouseEnter={e => { if (!selected.has(o.id)) e.currentTarget.style.background = '#fafafa' }}
                        onMouseLeave={e => { if (!selected.has(o.id)) e.currentTarget.style.background = '' }}
                      >
                        <td style={{ padding: '9px 0 9px 18px', borderBottom: '1px solid #f9fafb' }}>
                          <input type="checkbox" checked={selected.has(o.id)} onChange={() => toggleSelect(o.id)} onClick={e => e.stopPropagation()} />
                        </td>
                        {visibleColumns.picture && <td style={{ padding: '9px 8px', borderBottom: '1px solid #f9fafb' }} onClick={() => openEdit(o)}>
                          <div style={{ width: 32, height: 32, background: '#f3f4f6', borderRadius: 5, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            <Layers size={13} color="#9ca3af" />
                          </div>
                        </td>}
                        <td style={{ padding: '9px 12px', borderBottom: '1px solid #f9fafb' }} onClick={() => openEdit(o)}>
                          <div style={{ fontFamily: 'monospace', fontWeight: 700, fontSize: 12, color: '#0d0d0d' }}>{visibleJobNumber(o) || '—'}</div>
                          <div style={{ display:'inline-flex', alignItems:'center', gap:6, marginTop: 5, padding:'3px 7px', borderRadius:999, background: statusBg[o.status] || statusBg.Draft, border:`1px solid ${statusColor[o.status] || statusColor.Draft}33` }}>
                            <span style={{ width:6, height:6, borderRadius:'50%', background: statusColor[o.status] || statusColor.Draft, display:'inline-block' }} />
                            <span style={{ color: statusColor[o.status] || statusColor.Draft, fontSize: 10, fontWeight: 700 }}>{o.status || 'Draft'}</span>
                          </div>
                        </td>
                        <td style={{ padding: '9px 12px', borderBottom: '1px solid #f9fafb', whiteSpace: 'nowrap' }} onClick={() => openEdit(o)}>
                          <div style={{ fontSize: 12, fontWeight: 600 }}>{o.buyer_name}</div>
                          {o.brand_name && <div style={{ fontSize: 10, color: '#7c3aed', fontWeight: 600 }}>{o.brand_name}</div>}
                        </td>
                        <td style={{ padding: '9px 12px', borderBottom: '1px solid #f9fafb', maxWidth: 200 }} onClick={() => openEdit(o)}>
                          <div style={{ fontSize: 12, fontWeight: 600 }}>{o.style_number}</div>
                          {o.description && <div style={{ fontSize: 11, color: '#6b7280', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{o.description}</div>}
                        </td>
                        {visibleConfigColumns.map(c => <React.Fragment key={c.key}>{renderColumnCell(o, c.key)}</React.Fragment>)}
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
            setTabNotices(getPageTabNoticeMap('ordersPage', ['orders','queues']))
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
          onDone={() => { markTabUpdated('ordersPage', 'orders'); setTabNotices(getPageTabNoticeMap('ordersPage', ['orders','queues'])); setShowAssignJob(false); setSelected(new Set()); loadOrders() }}
        />
      )}
      {showPrint && (
        <PrintPopup
          selectedOrders={selectedOrderObjs}
          onClose={() => setShowPrint(false)}
        />
      )}
      {showColumnSettings && (
        <div style={{ position:'fixed', inset:0, zIndex:260, pointerEvents:'none' }}>
          <div onClick={() => setShowColumnSettings(false)} style={{ position:'absolute', inset:0, background:'rgba(15,23,42,0.08)', pointerEvents:'auto' }} />
          <div style={{ position:'absolute', top:0, right:0, width:300, height:'100%', background:'#fff', borderLeft:'1px solid #e5e7eb', boxShadow:'-16px 0 40px rgba(15,23,42,0.14)', pointerEvents:'auto', display:'flex', flexDirection:'column' }}>
            <div style={{ height:58, display:'flex', alignItems:'center', justifyContent:'space-between', padding:'0 18px', borderBottom:'1px solid #f3f4f6' }}>
              <div style={{ fontSize:16, fontWeight:800, color:'#111827' }}>Columns</div>
              <div style={{ display:'flex', alignItems:'center', gap:12 }}>
                <button onClick={resetVisibleColumns} style={{ border:'none', background:'transparent', color:'#2563eb', fontSize:12, fontWeight:700, cursor:'pointer' }}>Reset</button>
                <button onClick={() => setShowColumnSettings(false)} style={{ border:'none', background:'transparent', color:'#9ca3af', cursor:'pointer', padding:0 }}><X size={18} /></button>
              </div>
            </div>
            <div style={{ display:'flex', gap:18, padding:'14px 18px 0 18px', borderBottom:'1px solid #f3f4f6' }}>
              <div style={{ paddingBottom:10, borderBottom:'2px solid #111827', fontSize:12, fontWeight:800, color:'#111827' }}>Manage Columns</div>
              <div style={{ paddingBottom:10, fontSize:12, fontWeight:700, color:'#9ca3af' }}>Saved Views</div>
            </div>
            <div style={{ padding:18, overflowY:'auto', flex:1 }}>
              <div style={{ position:'relative', marginBottom:18 }}>
                <Search size={14} style={{ position:'absolute', left:10, top:'50%', transform:'translateY(-50%)', color:'#9ca3af' }} />
                <input placeholder="Search columns..." readOnly style={{ width:'100%', height:36, padding:'0 10px 0 32px', border:'1px solid #e5e7eb', borderRadius:8, outline:'none', fontSize:12, color:'#9ca3af', background:'#fafafa' }} />
              </div>
              <div style={{ fontSize:12, fontWeight:800, color:'#374151', marginBottom:10 }}>Pinned <span style={{ color:'#9ca3af', fontWeight:600 }}>(always visible)</span></div>
              <div style={{ display:'flex', flexDirection:'column', gap:12, paddingBottom:16, borderBottom:'1px solid #f3f4f6', marginBottom:16 }}>
                {pinnedColumns.map(c => (
                  <div key={c.key} style={{ display:'flex', alignItems:'center', gap:10, fontSize:13, fontWeight:700, color:'#374151' }}>
                    <Plus size={14} color="#6b7280" />
                    <span style={{ flex:1 }}>{c.label}</span>
                    <Lock size={13} color="#9ca3af" />
                  </div>
                ))}
              </div>
              <div style={{ fontSize:12, fontWeight:800, color:'#374151', marginBottom:10 }}>Visible Columns <span style={{ color:'#9ca3af', fontWeight:600 }}>(drag to reorder)</span></div>
              <div style={{ display:'flex', flexDirection:'column', gap:8, paddingBottom:16, borderBottom:'1px solid #f3f4f6', marginBottom:16 }}>
                {configurableColumns.filter(c => visibleColumns[c.key]).map(c => (
                  <div
                    key={c.key}
                    draggable
                    onDragStart={(e) => { setDragColumnKey(c.key); e.dataTransfer.effectAllowed = 'move' }}
                    onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'move' }}
                    onDrop={(e) => { e.preventDefault(); moveColumn(dragColumnKey, c.key); setDragColumnKey(null) }}
                    onDragEnd={() => setDragColumnKey(null)}
                    style={{ display:'flex', alignItems:'center', gap:10, fontSize:13, fontWeight:700, color:'#374151', cursor:'grab', border:'1px solid #eef2f7', borderRadius:8, padding:'8px 9px', background: dragColumnKey === c.key ? '#f9fafb' : '#fff' }}
                    title="Drag to reorder"
                  >
                    <input type="checkbox" checked={!!visibleColumns[c.key]} onChange={() => toggleColumn(c.key)} onClick={(e) => e.stopPropagation()} style={{ width:14, height:14, accentColor:'#111827', cursor:'pointer' }} />
                    <span style={{ flex:1 }}>{c.label}</span>
                    <GripVertical size={15} color="#9ca3af" />
                  </div>
                ))}
              </div>
              <div style={{ fontSize:12, fontWeight:800, color:'#374151', marginBottom:10 }}>Hidden Columns</div>
              <div style={{ display:'flex', flexDirection:'column', gap:11 }}>
                {configurableColumns.filter(c => !visibleColumns[c.key]).map(c => (
                  <label key={c.key} style={{ display:'flex', alignItems:'center', gap:10, fontSize:13, fontWeight:700, color:'#6b7280', cursor:'pointer' }}>
                    <input type="checkbox" checked={false} onChange={() => toggleColumn(c.key)} style={{ width:14, height:14, accentColor:'#111827' }} />
                    <span style={{ flex:1 }}>{c.label}</span>
                  </label>
                ))}
                {configurableColumns.every(c => visibleColumns[c.key]) && <div style={{ fontSize:12, color:'#9ca3af' }}>No hidden columns.</div>}
              </div>
            </div>
            <div style={{ padding:18, borderTop:'1px solid #f3f4f6' }}>
              <button className="btn btn-primary" style={{ width:'100%', height:36 }} onClick={() => setShowColumnSettings(false)}>Done</button>
            </div>
          </div>
        </div>
      )}
      <Dialogs />
    </div>
  )
}