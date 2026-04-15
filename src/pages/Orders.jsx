import React, { useState, useEffect, useRef } from 'react'
import { supabase } from '../lib/supabase'
import OrderWizard from '../components/wizard/OrderWizard'
import PrintPopup, { printHTML } from '../components/PrintReports'
import { Search, Printer, Layers, Plus, X, Check, AlertCircle, Copy, Upload, Download } from 'lucide-react'
import { generateJobNumber } from '../lib/utils'

const statusColor = { Draft: '#d97706', Active: '#2563eb', Booked: '#7c3aed', Shipped: '#16a34a', Cancelled: '#dc2626', Confirmed: '#16a34a' }
const statusBg    = { Draft: '#fff7ed', Active: '#eff6ff', Booked: '#f5f3ff', Shipped: '#f0fdf4', Cancelled: '#fef2f2', Confirmed: '#f0fdf4' }

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
  { value: 'Draft',     color: '#d97706', bg: '#fff7ed' },
  { value: 'Active',    color: '#2563eb', bg: '#eff6ff' },
  { value: 'Booked',    color: '#7c3aed', bg: '#f5f3ff' },
  { value: 'Shipped',   color: '#16a34a', bg: '#f0fdf4' },
  { value: 'Cancelled', color: '#dc2626', bg: '#fef2f2' },
]

function ChangeStatusModal({ selectedOrders, onClose, onDone }) {
  const [status, setStatus] = useState('')
  const [saving, setSaving] = useState(false)

  const handleApply = async () => {
    if (!status) return
    setSaving(true)
    await supabase.from('orders').update({ status }).in('id', selectedOrders.map(o => o.id))
    setSaving(false)
    onDone()
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 300, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ background: '#fff', borderRadius: 10, padding: 24, width: 360, boxShadow: '0 16px 48px rgba(0,0,0,0.2)' }}>
        <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 4 }}>Change Status</div>
        <div style={{ fontSize: 12, color: '#6b7280', marginBottom: 16 }}>{selectedOrders.length} order{selectedOrders.length > 1 ? 's' : ''} selected</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 20 }}>
          {STATUS_OPTIONS.map(opt => (
            <div key={opt.value} onClick={() => setStatus(opt.value)}
              style={{ padding: '9px 14px', borderRadius: 7, border: `1px solid ${status === opt.value ? opt.color : '#e5e7eb'}`, background: status === opt.value ? opt.bg : '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{ width: 10, height: 10, borderRadius: '50%', background: status === opt.value ? opt.color : '#d1d5db' }} />
              <span style={{ fontSize: 13, fontWeight: 600, color: status === opt.value ? opt.color : '#374151' }}>{opt.value}</span>
            </div>
          ))}
        </div>
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
  const [queues,   setQueues]   = useState([])
  const [orders,   setOrders]   = useState([])
  const [loading,  setLoading]  = useState(true)
  const [search,   setSearch]   = useState('')
  const [filterRule, setFilterRule] = useState('')
  const [selected, setSelected] = useState(null) // selected Q id
  const [poItems, setPoItems] = useState([])
  const [poHeaders, setPoHeaders] = useState([])

  useEffect(() => { loadAll() }, [])

  async function loadAll() {
    setLoading(true)
    const [{ data: qs }, { data: ors }, { data: pos }, { data: poi }] = await Promise.all([
      supabase.from('order_queues').select('*').order('created_at', { ascending: true }),
      supabase.from('orders').select('id,style_number,buyer_name,job_number,brand_name,queue_split_rule').order('ship_date'),
      supabase.from('purchase_orders').select('id,order_id,status'),
      supabase.from('purchase_order_items').select('po_id,specification'),
    ])
    setQueues(qs || [])
    setOrders(ors || [])
    setPoHeaders(pos || [])
    setPoItems(poi || [])
    setLoading(false)
  }

  const orderMap = Object.fromEntries((orders || []).map(o => [o.id, o]))

  const filtered = queues.filter(q => {
    const o = orderMap[q.order_id] || {}
    const matchSearch = !search || [q.q_number, q.label, o.style_number, o.buyer_name, o.job_number].some(f => f?.toLowerCase().includes(search.toLowerCase()))
    const matchRule = !filterRule || q.split_rule === filterRule
    return matchSearch && matchRule
  })

  const ruleColor = {
    'By Colour':            { bg: '#eff6ff', color: '#2563eb' },
    'By Size Group':        { bg: '#f5f3ff', color: '#7c3aed' },
    'Colour × Size Group':  { bg: '#ecfeff', color: '#0891b2' },
    'By Ratio':             { bg: '#fef3c7', color: '#b45309' },
    'Custom':               { bg: '#fafaf8', color: '#6b7280' },
  }

  const statusColor = { Pending: '#d97706', 'In Progress': '#2563eb', Completed: '#16a34a' }
  const statusBg    = { Pending: '#fff7ed', 'In Progress': '#eff6ff', Completed: '#f0fdf4' }

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
    const used = itemsForPo.some(i => qNos.some(qn => (i.specification || '').includes(`[${qn}]`)))
    if (used) lockedOrders[po.order_id] = true
  })

  const selectedQueue = selected ? queues.find(x => x.id === selected) : null
  const selectedOrderId = selectedQueue?.order_id || null
  const selectedOrder = selectedOrderId ? orderMap[selectedOrderId] : null
  const selectedOrderQueues = selectedOrderId ? (orderQueueMap[selectedOrderId] || []) : []
  const selectedOrderLocked = !!(selectedOrderId && lockedOrders[selectedOrderId])

  const handleRollbackOrderQueues = async () => {
    if (!selectedOrderId) return
    const proceed = window.confirm(`Reset queue configuration for ${selectedOrder?.style_number || 'this order'}? This will remove all generated Qs for the order.`)
    if (!proceed) return
    if (selectedOrderLocked) {
      const pw = window.prompt('This order has Qs already used in a Purchase Order. Admin password required to reset queues:')
      if (pw !== 'admin') {
        window.alert('Incorrect admin password. Queue reset cancelled.')
        return
      }
    }
    const { error: delErr } = await supabase.from('order_queues').delete().eq('order_id', selectedOrderId)
    if (delErr) { window.alert(delErr.message); return }
    await supabase.from('orders').update({ queue_split_rule: 'None' }).eq('id', selectedOrderId)
    setSelected(null)
    await loadAll()
    window.alert('Queue configuration reset. You can now reconfigure the split rule and regenerate Qs.')
  }



  const esc = (v) => String(v ?? '—').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

  async function fetchQDocData(q) {
    const ord = orderMap[q.order_id] || {}
    const [{ data: bom }, { data: washing }, { data: embellishments }, { data: processes }, { data: finishing }, { data: packs }, { data: sgs }] = await Promise.all([
      supabase.from('bom_items').select('*').eq('order_id', q.order_id).order('sort_order'),
      supabase.from('washing').select('*').eq('order_id', q.order_id),
      supabase.from('embellishments').select('*').eq('order_id', q.order_id),
      supabase.from('order_processes').select('*').eq('order_id', q.order_id).order('sort_order'),
      supabase.from('finishing').select('*').eq('order_id', q.order_id).maybeSingle(),
      supabase.from('finishing_packs').select('*').eq('order_id', q.order_id).order('sort_order'),
      supabase.from('size_groups').select('id,group_name,sizes,base_size').eq('order_id', q.order_id).order('sort_order'),
    ])
    const sgIds = (sgs || []).map(x => x.id)
    let colors = [], bd = []
    if (sgIds.length) {
      const [{ data: c }, { data: b }] = await Promise.all([
        supabase.from('size_group_colors').select('id,size_group_id,color_name,sort_order').in('size_group_id', sgIds),
        supabase.from('size_group_breakdown').select('size_group_id,color_id,size,qty').in('size_group_id', sgIds),
      ])
      colors = c || []
      bd = b || []
    }

    const sgMap = Object.fromEntries((sgs || []).map(g => [g.id, g]))
    const groupName = q.size_group_id ? (sgMap[q.size_group_id]?.group_name || null) : null
    const qSgs = q.size_group_id ? (sgs || []).filter(g => g.id === q.size_group_id) : (sgs || [])
    const qColors = q.color_name ? colors.filter(c => c.color_name === q.color_name && (!q.size_group_id || c.size_group_id === q.size_group_id)) : colors

    const sizeMap = {}
    qSgs.forEach(g => {
      const relColors = colors.filter(c => c.size_group_id === g.id).filter(c => !q.color_name || c.color_name === q.color_name)
      relColors.forEach(c => {
        ;(g.sizes || []).forEach(sz => {
          const row = bd.find(b => b.size_group_id === g.id && b.color_id === c.id && b.size === sz)
          sizeMap[sz] = (sizeMap[sz] || 0) + (parseFloat(row?.qty) || 0)
        })
      })
    })

    const wastageFactor = (x) => 1 + ((parseFloat(x) || 0) / 100)
    const totalQty = parseFloat(ord.total_qty) || 0
    const queueQty = parseFloat(q.qty) || 0
    const ratio = totalQty > 0 ? queueQty / totalQty : 0

    function calcBomQty(item) {
      const rule = item.usage_rule || 'Generic'
      const ud = item.usage_data || {}
      if (rule === 'Generic') return (parseFloat(item.base_qty) || 0) * queueQty * wastageFactor(item.wastage)
      if (rule === 'By Color' && q.color_name) return (parseFloat(ud[q.color_name]) || 0) * queueQty * wastageFactor(item.wastage)
      if (rule === 'By Size Group' && groupName) return (parseFloat(ud[groupName]) || 0) * queueQty * wastageFactor(item.wastage)
      if (rule === 'By Individual Sizes') return Object.entries(ud).reduce((s,[sz,cons]) => s + ((parseFloat(cons)||0) * (parseFloat(sizeMap[sz])||0) * wastageFactor(item.wastage)), 0)
      return ((parseFloat(item.base_qty) || 0) * queueQty * wastageFactor(item.wastage)) || ((parseFloat(item.final_qty) || 0) * ratio)
    }

    const fabricItems = (bom || []).filter(x => x.category === 'Fabric').map(x => ({ ...x, q_qty: calcBomQty(x) }))
    const trimItems = (bom || []).filter(x => x.category !== 'Fabric').map(x => ({ ...x, q_qty: calcBomQty(x) }))
    const washItems = (washing || []).filter(x => !q.color_name || x.color_name === q.color_name).map(x => ({ ...x, q_qty: parseFloat(x.qty) || queueQty }))
    const embItems = (embellishments || []).map(x => ({ ...x, q_qty: queueQty }))
    const cuttingPct = Number.isFinite(parseFloat(ord.excess_cutting_pct)) ? parseFloat(ord.excess_cutting_pct) : 0
    const cuttingQty = queueQty * (1 + (cuttingPct / 100))
    const finishingPacks = (packs || []).filter(pk => {
      if (!pk.pack_basis) return true
      if (pk.pack_basis === 'By Q#') return (pk.pack_name || '').includes(q.q_number) || (pk.config_json && JSON.stringify(pk.config_json).includes(q.q_number))
      if (pk.pack_basis === 'By Colour') return !q.color_name || (pk.pack_name || '').includes(q.color_name)
      if (pk.pack_basis === 'Colour × Size Group') return (pk.pack_name || '').includes(q.label || '')
      return true
    })
    return { ord, q, groupName, sizeMap, fabricItems, trimItems, washItems, embItems, processes: processes || [], finishing, finishingPacks, cuttingQty, cuttingPct }
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
          <div style="display:flex;align-items:center;gap:8px"><img src="${LOGO_SRC}" style="width:90px;height:auto"/><div style="font-weight:700">INTERNAL ORDER PLANNING</div></div>
          <div style="font-size:42px;font-weight:800;line-height:1">${esc(d.q.q_number)}</div>
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
        <div style="display:grid;grid-template-columns:repeat(5,1fr);gap:24px;margin-top:18px;font-size:10px;text-align:center">
          ${['MERCHANDISER','ACCOUNT MANAGER','CUTTING INCHARGE','PRODUCTION MANAGER','APPROVED BY'].map(x=>`<div><div style="height:28px"></div><div style="border-top:1px solid #111;padding-top:4px">${x}</div></div>`).join('')}
        </div>
      </div>
    </div>`
  }

  function sectionDocHTML(title, d, rows, columns, note='') {
    return `
      <div class="page">
        <div class="doc-header"><div class="doc-header-left"><img src="${LOGO_SRC}" /><div class="brand"><div class="brand-name">Nizamia Apparels</div><div class="brand-sub">Internal Production Program</div></div></div><div class="doc-header-right"><div class="doc-type">Q Program</div><div class="doc-title">${esc(title)}</div><div class="doc-sub">${esc(d.q.q_number)} · ${esc(d.q.label)}</div></div></div>
        <div class="info-grid" style="grid-template-columns:repeat(4,1fr)">
          ${[['Style', d.ord.style_number], ['Buyer', d.ord.buyer_name], ['Job', d.ord.job_number], ['Qty', `${d.q.qty || 0} pcs`], ['Color/Wash', d.q.color_name || '—'], ['Size Group', d.groupName || '—'], ['Store', d.ord.store_name || '—'], ['Ship Date', fmtDate(d.ord.ship_date)]].map(([k,v]) => `<div class="info-cell"><div class="info-label">${esc(k)}</div><div class="info-value">${esc(v)}</div></div>`).join('')}
        </div>
        ${note ? `<div class="notes-box"><div class="notes-label">Notes</div>${esc(note)}</div>` : ''}
        ${rowsHTML(rows, columns)}
      </div>`
  }

  async function printProgram(kind) {
    if (!selectedQueue) return
    const printWin = window.open('', '_blank', 'width=900,height=700')
    if (!printWin) {
      window.alert('Popup blocked. Please allow popups for this site and try again.')
      return
    }
    printWin.document.write('<!DOCTYPE html><html><head><meta charset="utf-8"><title>Preparing print…</title></head><body style="font-family:Arial,sans-serif;padding:24px;color:#374151">Preparing document…</body></html>')
    printWin.document.close()
    const d = await fetchQDocData(selectedQueue)
    if (kind === 'Print Production File') {
      const html = [
        coverHTML(d),
        sectionDocHTML('Fabric Demand', d, d.fabricItems, [{label:'Item', key:'name'},{label:'Specification', render:r=>r.specification||r.detail||'—'},{label:'Unit', key:'unit'},{label:'Required', render:r=>Math.ceil(r.q_qty||0), align:'right'}]),
        sectionDocHTML('Cutting Plan', d, Object.keys(d.sizeMap).map(sz => ({ size: sz, qty: d.sizeMap[sz] })), [{label:'Size', key:'size'},{label:'Qty', key:'qty', align:'right'}], `Cutting qty with allowance (${d.cuttingPct}%): ${Math.ceil(d.cuttingQty)} pcs`),
        sectionDocHTML('Trims Demand', d, d.trimItems, [{label:'Item', key:'name'},{label:'Category', key:'category'},{label:'Specification', render:r=>r.specification||r.detail||'—'},{label:'Unit', key:'unit'},{label:'Required', render:r=>Math.ceil(r.q_qty||0), align:'right'}]),
        sectionDocHTML('Washing', d, d.washItems, [{label:'Wash Type', key:'wash_type'},{label:'Wash Ref', key:'wash_ref'},{label:'Color', key:'color_name'},{label:'Unit', key:'unit'},{label:'Qty', render:r=>Math.ceil(r.q_qty||0), align:'right'}]),
        sectionDocHTML('Embellishment', d, d.embItems, [{label:'Description', render:r=>r.description||'Embellishment'},{label:'Technique', key:'technique'},{label:'Placement', key:'placement'},{label:'Vendor', render:r=>r.vendor_id||'—'},{label:'Qty', render:r=>Math.ceil(r.q_qty||0), align:'right'}]),
        sectionDocHTML('Finishing', d, d.finishingPacks.map(p => ({...p, cartons: Math.ceil((parseFloat(d.q.qty)||0) / (parseFloat(p.pcs_per_carton)||1)), inner: Math.ceil((parseFloat(d.q.qty)||0) / (parseFloat(p.pieces_per_inner_pack)||parseFloat(p.inner_pieces)||1 || 1)) })), [{label:'Pack', render:r=>r.pack_name||'Pack'},{label:'Basis', render:r=>r.pack_basis||'—'},{label:'Inner Pack', render:r=>r.inner_pack_type||'—'},{label:'Pcs/Inner', render:r=>r.pieces_per_inner_pack || r.inner_pieces || '—', align:'right'},{label:'Pcs/Carton', key:'pcs_per_carton', align:'right'},{label:'Cartons', key:'cartons', align:'right'}]),
      ].join('')
      printHTML(html, printWin)
      return
    }
    const map = {
      'Fabric Demand': () => sectionDocHTML('Fabric Demand', d, d.fabricItems, [{label:'Item', key:'name'},{label:'Specification', render:r=>r.specification||r.detail||'—'},{label:'Unit', key:'unit'},{label:'Required', render:r=>Math.ceil(r.q_qty||0), align:'right'}]),
      'Cutting Plan': () => sectionDocHTML('Cutting Plan', d, Object.keys(d.sizeMap).map(sz => ({ size: sz, qty: d.sizeMap[sz] })), [{label:'Size', key:'size'},{label:'Qty', key:'qty', align:'right'}], `Cutting qty with allowance (${d.cuttingPct}%): ${Math.ceil(d.cuttingQty)} pcs`),
      'Trims Demand': () => sectionDocHTML('Trims Demand', d, d.trimItems, [{label:'Item', key:'name'},{label:'Category', key:'category'},{label:'Specification', render:r=>r.specification||r.detail||'—'},{label:'Unit', key:'unit'},{label:'Required', render:r=>Math.ceil(r.q_qty||0), align:'right'}]),
      'Washing': () => sectionDocHTML('Washing', d, d.washItems, [{label:'Wash Type', key:'wash_type'},{label:'Wash Ref', key:'wash_ref'},{label:'Color', key:'color_name'},{label:'Unit', key:'unit'},{label:'Qty', render:r=>Math.ceil(r.q_qty||0), align:'right'}]),
      'Embellishment': () => sectionDocHTML('Embellishment', d, d.embItems, [{label:'Description', render:r=>r.description||'Embellishment'},{label:'Technique', key:'technique'},{label:'Placement', key:'placement'},{label:'Vendor', render:r=>r.vendor_id||'—'},{label:'Qty', render:r=>Math.ceil(r.q_qty||0), align:'right'}]),
      'Finishing': () => sectionDocHTML('Finishing', d, d.finishingPacks.map(p => ({...p, cartons: Math.ceil((parseFloat(d.q.qty)||0) / (parseFloat(p.pcs_per_carton)||1)), inner: Math.ceil((parseFloat(d.q.qty)||0) / (parseFloat(p.pieces_per_inner_pack)||parseFloat(p.inner_pieces)||1 || 1)) })), [{label:'Pack', render:r=>r.pack_name||'Pack'},{label:'Basis', render:r=>r.pack_basis||'—'},{label:'Inner Pack', render:r=>r.inner_pack_type||'—'},{label:'Pcs/Inner', render:r=>r.pieces_per_inner_pack || r.inner_pieces || '—', align:'right'},{label:'Pcs/Carton', key:'pcs_per_carton', align:'right'},{label:'Cartons', key:'cartons', align:'right'}]),
    }
    const fn = map[kind]
    if (fn) printHTML(fn(), printWin)
    else try { printWin.close() } catch (e) {}
  }

  if (loading) return <div style={{ padding: 60, textAlign: 'center', color: '#9ca3af', fontSize: 12 }}>Loading queues...</div>

  return (
    <div style={{ flex: 1, overflowY: 'auto', padding: '16px 24px' }}>
      {/* Toolbar */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
        <div style={{ position: 'relative', width: 260 }}>
          <Search size={13} style={{ position: 'absolute', left: 9, top: '50%', transform: 'translateY(-50%)', color: '#9ca3af' }} />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search Q#, label, style, buyer..."
            style={{ width: '100%', paddingLeft: 28, height: 32, border: '1px solid #e5e7eb', borderRadius: 7, fontSize: 12, outline: 'none', fontFamily: 'var(--font)' }} />
        </div>
        <select value={filterRule} onChange={e => setFilterRule(e.target.value)}
          style={{ height: 32, border: '1px solid #e5e7eb', borderRadius: 7, fontSize: 12, padding: '0 10px', fontFamily: 'var(--font)', background: '#fff', cursor: 'pointer' }}>
          <option value="">All Split Rules</option>
          {allRules.map(r => <option key={r}>{r}</option>)}
        </select>
        <span style={{ fontSize: 11, color: '#9ca3af', marginLeft: 'auto' }}>{filtered.length} queues</span>
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
                <th>Q #</th>
                <th>Label</th>
                <th>Split Rule</th>
                <th>Style</th>
                <th>Buyer</th>
                <th>Job</th>
                <th style={{ textAlign: 'right' }}>Qty</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(q => {
                const o = orderMap[q.order_id] || {}
                const rc = ruleColor[q.split_rule] || { bg: '#f5f5f3', color: '#6b7280' }
                const isSelected = selected === q.id
                return (
                  <tr key={q.id} onClick={() => setSelected(isSelected ? null : q.id)}
                    style={{ cursor: 'pointer', background: isSelected ? '#f0f9ff' : '' }}>
                    <td>
                      <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 800, fontSize: 13, color: '#0d0d0d', background: '#f3f4f6', padding: '2px 8px', borderRadius: 5 }}>
                        {q.q_number}
                      </span>
                    </td>
                    <td style={{ fontWeight: 600 }}>{q.label || '—'}</td>
                    <td>
                      <span style={{ fontSize: 10, fontWeight: 600, padding: '2px 7px', borderRadius: 4, background: rc.bg, color: rc.color }}>
                        {q.split_rule}
                      </span>
                    </td>
                    <td style={{ fontWeight: 600 }}>
                      {o.style_number || '—'}
                      {o.brand_name && <div style={{ fontSize: 10, color: '#7c3aed', fontWeight: 600 }}>{o.brand_name}</div>}
                    </td>
                    <td style={{ fontSize: 12 }}>{o.buyer_name || '—'}</td>
                    <td style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: '#6b7280' }}>{o.job_number || '—'}</td>
                    <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)', fontWeight: 700 }}>{q.qty?.toLocaleString() || '—'}</td>
                    <td>
                      <span style={{ fontSize: 10, fontWeight: 600, padding: '2px 7px', borderRadius: 4, background: statusBg[q.status] || '#fafaf8', color: statusColor[q.status] || '#6b7280' }}>
                        {q.status}
                      </span>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Selected Q detail panel */}
      {selected && selectedQueue && (
          <div style={{ marginTop: 16, background: '#fff', border: '1px solid #e8e8e6', borderRadius: 8, padding: '16px 20px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12, flexWrap:'wrap' }}>
              <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 800, fontSize: 15 }}>{selectedQueue.q_number}</span>
              <span style={{ fontSize: 13, fontWeight: 600 }}>{selectedQueue.label}</span>
              <span style={{ fontSize: 11, color: '#9ca3af' }}>{selectedQueue.split_rule}</span>
              {selectedOrderLocked && <span style={{ fontSize:10, fontWeight:700, color:'#b45309', background:'#fef3c7', padding:'3px 8px', borderRadius:999 }}>PO USED · ADMIN ONLY</span>}
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 13, fontWeight: 700, color: '#0d0d0d', marginLeft: 'auto' }}>{selectedQueue.qty?.toLocaleString()} pcs</span>
            </div>
            <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', gap:12, marginBottom:12, flexWrap:'wrap' }}>
              <div style={{ fontSize:12, color:'#6b7280' }}>
                Order queue set: <span style={{ fontWeight:700, color:'#0d0d0d' }}>{selectedOrderQueues.length}</span>
                {selectedOrder?.style_number && <span> · {selectedOrder.style_number}</span>}
                {selectedOrder?.buyer_name && <span> · {selectedOrder.buyer_name}</span>}
              </div>
              <button className="btn btn-secondary btn-sm" onClick={handleRollbackOrderQueues} style={{ color:selectedOrderLocked?'#b45309':'#dc2626', borderColor:selectedOrderLocked?'#fcd34d':'#fecaca', background:selectedOrderLocked?'#fffbeb':'#fef2f2' }}>
                Reset Queue Configuration
              </button>
            </div>
            <div style={{ display: 'flex', gap: 8, flexWrap:'wrap' }}>
              {['Fabric Demand', 'Cutting Plan', 'Trims Demand', 'Washing', 'Embellishment', 'Finishing', 'Print Production File'].map(prog => (
                <button key={prog} className={prog === 'Print Production File' ? 'btn btn-primary btn-sm' : 'btn btn-secondary btn-sm'} style={{ fontSize: 11 }}
                  onClick={() => printProgram(prog)}>
                  {prog}
                </button>
              ))}
            </div>
          </div>
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
  const [selected, setSelected]     = useState(new Set())
  const [wizardOpen, setWizardOpen] = useState(false)
  const [editOrder, setEditOrder]   = useState(null)
  const [buyers, setBuyers]         = useState([])
  const [showAssignJob, setShowAssignJob] = useState(false)
  const [showChangeStatus, setShowChangeStatus] = useState(false)
  const [showPrint, setShowPrint] = useState(false)
  const [sort, setSort] = useState({ col: 'ship_date', dir: 'asc' })

  useEffect(() => {
    loadOrders()
    supabase.from('buyers').select('id,name').order('name').then(({ data }) => setBuyers(data || []))
  }, [])

  async function loadOrders() {
    setLoading(true)
    const { data } = await supabase.from('orders').select('id,job_id,job_number,buyer_name,buyer_id,style_number,po_number,ship_date,planned_date,status,total_qty,total_value_usd,factory_ref,brand_name,store_name,merchandiser_name,description,created_at').order('ship_date', { ascending: true, nullsLast: true })
    setOrders(data || [])
    setLoading(false)
  }

  function openNew()    { setEditOrder(null);  setWizardOpen(true) }

  async function duplicateOrder(o, e) {
    e.stopPropagation()
    if (!window.confirm(`Duplicate order ${o.style_number}? Quantities will not be copied.`)) return
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
    if (error) { alert('Duplicate failed: ' + error.message); return }
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
    loadOrders()
    alert(`Order duplicated as "${newOrder.style_number}". Open it to fill in quantities.`)
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
    if (lines.length < 2) { alert('File must have at least one data row.'); return }
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
    if (rows.length === 0) { alert('No valid rows found. Make sure Style Number and Buyer Name are filled.'); return }
    // Resolve buyer IDs
    const { data: buyerList } = await supabase.from('buyers').select('id,name')
    const buyerMap = Object.fromEntries((buyerList || []).map(b => [b.name.toLowerCase(), b.id]))
    const toInsert = rows.map(r => ({ ...r, buyer_id: buyerMap[r.buyer_name.toLowerCase()] || null }))
    const { error } = await supabase.from('orders').insert(toInsert)
    if (error) { alert('Import failed: ' + error.message); return }
    alert(`Successfully imported ${toInsert.length} order${toInsert.length > 1 ? 's' : ''}.`)
    loadOrders()
    e.target.value = ''
  }
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

  const active     = orders.filter(o => o.status !== 'Cancelled')

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
  const totalQty     = filtered.reduce((s, o) => s + (o.total_qty || 0), 0)
  const totalValue   = filtered.reduce((s, o) => s + (parseFloat(o.total_value_usd) || 0), 0)

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
        <button style={tabStyle('orders')} onClick={() => setTab('orders')}>Buyer Purchase Orders</button>
        <button style={tabStyle('jobs')}   onClick={() => setTab('jobs')}>Jobs</button>
        <button style={tabStyle('queues')} onClick={() => setTab('queues')}>Queues</button>
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
          </div>

          {/* Bulk bar */}
          {selected.size > 0 && (
            <div style={{ padding: '7px 24px', background: '#eff6ff', borderBottom: '1px solid #dbeafe', display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
              <span style={{ fontSize: 12, color: '#2563eb', fontWeight: 600 }}>{selected.size} selected</span>
              <button className="btn btn-sm" style={{ background: '#0d0d0d', color: '#fff' }} onClick={() => setShowAssignJob(true)}>Assign to Job</button>
              <button className="btn btn-sm btn-secondary" onClick={() => setShowChangeStatus(true)}>Change Status</button>
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
                      { label: '',         col: null },
                      { label: 'Job / Status', col: 'job_number' },
                      { label: 'Buyer',    col: 'buyer_name' },
                      { label: 'PO #',     col: null },
                      { label: 'Style / Desc', col: null },
                      { label: 'Factory Ref', col: null },
                      { label: 'Qty',      col: 'total_qty' },
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
                        <td style={{ padding: '9px 8px', borderBottom: '1px solid #f9fafb' }} onClick={e => { e.stopPropagation(); duplicateOrder(o, e) }} title="Duplicate order">
                          <div style={{ width: 28, height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 5, cursor: 'pointer' }}
                            onMouseEnter={e => e.currentTarget.style.background='#f3f4f6'}
                            onMouseLeave={e => e.currentTarget.style.background=''}>
                            <Copy size={12} color="#9ca3af" />
                          </div>
                        </td>
                        <td style={{ padding: '9px 8px', borderBottom: '1px solid #f9fafb' }} onClick={() => openEdit(o)}>
                          <div style={{ width: 32, height: 32, background: '#f3f4f6', borderRadius: 5, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            <Layers size={13} color="#9ca3af" />
                          </div>
                        </td>
                        <td style={{ padding: '9px 12px', borderBottom: '1px solid #f9fafb' }} onClick={() => openEdit(o)}>
                          <div style={{ fontFamily: 'monospace', fontWeight: 700, fontSize: 12, color: '#0d0d0d' }}>{o.job_number || '—'}</div>
                          <span style={{ background: statusBg[o.status] || statusBg.Draft, color: statusColor[o.status] || statusColor.Draft, fontSize: 10, fontWeight: 600, padding: '1px 7px', borderRadius: 4, display: 'inline-flex', marginTop: 3 }}>{o.status}</span>
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
                        <td style={{ padding: '9px 12px', borderBottom: '1px solid #f9fafb', fontFamily: 'monospace', fontSize: 12, fontWeight: 600 }} onClick={() => openEdit(o)}>{o.total_qty?.toLocaleString() || '—'}</td>
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
              {filtered.length} orders
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
          onDone={() => { setShowChangeStatus(false); setSelected(new Set()); loadOrders() }}
        />
      )}
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
