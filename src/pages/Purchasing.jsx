import React, { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { Search, Plus, Trash2, X, Lock, Unlock, Printer } from 'lucide-react'
import { generatePONumber, generateWONumber } from '../lib/utils'
import { printPurchaseOrder, printWorkOrder } from '../components/PrintReports'

function fmtDate(d) {
  if (!d) return '—'
  return new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
}
const today = new Date()
function dateColor(d) {
  if (!d) return '#9ca3af'
  const dt = new Date(d)
  if (dt < today) return '#dc2626'
  const in14 = new Date(today); in14.setDate(today.getDate() + 14)
  if (dt <= in14) return '#d97706'
  return '#9ca3af'
}
function fmtNum(n, dec = 0) {
  return (parseFloat(n) || 0).toLocaleString(undefined, { minimumFractionDigits: dec, maximumFractionDigits: dec })
}

const PASSKEY = '1234'

function PasskeyModal({ onUnlock, onClose }) {
  const [val, setVal] = useState('')
  const [err, setErr] = useState(false)
  const check = () => { if (val === PASSKEY) { onUnlock() } else { setErr(true); setVal('') } }
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 500, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ background: '#fff', borderRadius: 10, padding: 28, width: 320, boxShadow: '0 16px 48px rgba(0,0,0,0.2)', textAlign: 'center' }}>
        <Lock size={22} color="#0d0d0d" style={{ marginBottom: 10 }} />
        <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 4 }}>Enter Passkey</div>
        <div style={{ fontSize: 12, color: '#9ca3af', marginBottom: 16 }}>This document is locked for editing.</div>
        <input type="password" value={val} onChange={e => { setVal(e.target.value); setErr(false) }}
          onKeyDown={e => e.key === 'Enter' && check()} autoFocus placeholder="Passkey"
          style={{ width: '100%', height: 38, padding: '0 12px', border: `1px solid ${err ? '#dc2626' : '#e5e7eb'}`, borderRadius: 7, fontSize: 14, textAlign: 'center', letterSpacing: 4, outline: 'none', marginBottom: 8, fontFamily: 'Inter,sans-serif' }} />
        {err && <div style={{ fontSize: 12, color: '#dc2626', marginBottom: 8 }}>Incorrect passkey</div>}
        <div style={{ display: 'flex', gap: 8, justifyContent: 'center' }}>
          <button className="btn btn-secondary" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" onClick={check}>Unlock</button>
        </div>
      </div>
    </div>
  )
}

function POModal({ po, orders, suppliers, prefillItems, onClose, onSaved }) {
  const isNew = !po
  const [form, setForm] = useState({
    po_number: po?.po_number || '', order_id: po?.order_id || '',
    supplier_id: po?.supplier_id || '',
    po_date: po?.po_date || new Date().toISOString().slice(0, 10),
    delivery_date: po?.delivery_date || '', currency: po?.currency || 'PKR',
    payment_terms: po?.payment_terms || '', status: po?.status || 'Draft', notes: po?.notes || '',
  })
  const [items, setItems] = useState(
    po?.items?.length ? po.items
    : prefillItems?.length ? prefillItems
    : [{ _id: '1', description: '', specification: '', qty: '', unit: 'yards', unit_rate: '', amount: '', source_type: null, source_id: null }]
  )
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)
  const [locked, setLocked] = useState(!isNew)
  const [showPasskey, setShowPasskey] = useState(false)

  const handleOrderChange = async (orderId) => {
    setForm(f => ({ ...f, order_id: orderId }))
    if (!orderId || prefillItems?.length) return
    const { data: bom } = await supabase.from('bom_items').select('*').eq('order_id', orderId).order('sort_order')
    if (bom?.length) {
      setItems(bom.map((b, i) => ({
        _id: String(i), description: b.name || '', specification: b.specification || '',
        qty: b.final_qty || b.base_qty || '', unit: b.unit || 'yards',
        unit_rate: '', amount: '', source_type: 'bom', source_id: b.id,
      })))
    }
  }

  const set = k => e => setForm(f => ({ ...f, [k]: e.target.value }))
  const updItem = (idx, k, v) => setItems(its => {
    const n = [...its]; n[idx] = { ...n[idx], [k]: v }
    if (k === 'qty' || k === 'unit_rate') {
      const qty = parseFloat(k === 'qty' ? v : n[idx].qty) || 0
      const rate = parseFloat(k === 'unit_rate' ? v : n[idx].unit_rate) || 0
      n[idx].amount = qty * rate ? (qty * rate).toFixed(2) : ''
    }
    return n
  })
  const total = items.reduce((s, i) => s + (parseFloat(i.amount) || 0), 0)

  const handleSave = async () => {
    if (!form.supplier_id) { setError('Select a supplier'); return }
    setSaving(true)
    try {
      let poNum = form.po_number || await generatePONumber()
      const payload = { ...form, po_number: poNum }
      let poId
      if (po?.id) {
        await supabase.from('purchase_orders').update(payload).eq('id', po.id)
        poId = po.id
        await supabase.from('purchase_order_items').delete().eq('po_id', poId)
      } else {
        const { data: newPO, error: pe } = await supabase.from('purchase_orders').insert([payload]).select().single()
        if (pe) throw new Error(pe.message)
        poId = newPO.id
      }
      const rows = items.filter(i => i.description).map((i, idx) => ({
        po_id: poId, description: i.description, specification: i.specification || null,
        qty: parseFloat(i.qty) || null, unit: i.unit || null,
        unit_rate: parseFloat(i.unit_rate) || null, amount: parseFloat(i.amount) || null,
        source_type: i.source_type || null, source_id: i.source_id || null, sort_order: idx,
      }))
      if (rows.length) await supabase.from('purchase_order_items').insert(rows)
      onSaved()
    } catch (e) { setError(e.message) }
    setSaving(false)
  }

  const handlePrint = async () => {
    if (!po) return
    const supplier = suppliers.find(s => s.id === po.supplier_id)
    const order = orders.find(o => o.id === po.order_id)
    await printPurchaseOrder({ ...po, items }, supplier, order, null)
  }

  const inp = { width: '100%', height: 32, padding: '0 10px', border: '1px solid #e5e7eb', borderRadius: 6, fontSize: 12, fontFamily: 'Inter,sans-serif', outline: 'none', background: locked ? '#f9f9f9' : '#fff' }
  const sel = { ...inp, cursor: locked ? 'not-allowed' : 'pointer' }
  const lbl = { fontSize: 11, fontWeight: 500, color: '#6b7280', display: 'block', marginBottom: 4 }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 300, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
      <div style={{ background: '#fff', borderRadius: 12, width: '100%', maxWidth: 860, maxHeight: 'calc(100vh - 48px)', display: 'flex', flexDirection: 'column', boxShadow: '0 24px 80px rgba(0,0,0,0.22)', overflow: 'hidden' }}>
        <div style={{ padding: '14px 24px', borderBottom: '1px solid #f0f0ee', display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: 14, fontWeight: 700 }}>{isNew ? 'New Purchase Order' : `PO — ${po.po_number}`}</span>
          <div style={{ flex: 1 }} />
          {!isNew && <button className="btn btn-secondary btn-sm" onClick={handlePrint}><Printer size={12} /> Print</button>}
          {!isNew && (
            <button className="btn btn-secondary btn-sm" onClick={() => locked ? setShowPasskey(true) : setLocked(true)}>
              {locked ? <><Unlock size={12} /> Edit</> : <><Lock size={12} /> Lock</>}
            </button>
          )}
          <button style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#9ca3af' }} onClick={onClose}><X size={16} /></button>
        </div>
        <div style={{ flex: 1, overflowY: 'auto', padding: '20px 24px' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12, marginBottom: 16 }}>
            <div><label style={lbl}>Supplier *</label>
              <select style={sel} value={form.supplier_id} onChange={set('supplier_id')} disabled={locked}>
                <option value="">Select supplier...</option>
                {suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select></div>
            <div><label style={lbl}>Order (optional)</label>
              <select style={sel} value={form.order_id} onChange={e => handleOrderChange(e.target.value)} disabled={locked}>
                <option value="">— Not linked —</option>
                {orders.map(o => <option key={o.id} value={o.id}>{o.style_number} · {o.buyer_name}</option>)}
              </select></div>
            <div><label style={lbl}>PO Date</label><input style={inp} type="date" value={form.po_date} onChange={set('po_date')} disabled={locked} /></div>
            <div><label style={lbl}>Delivery Date</label><input style={inp} type="date" value={form.delivery_date} onChange={set('delivery_date')} disabled={locked} /></div>
            <div><label style={lbl}>Currency</label>
              <select style={sel} value={form.currency} onChange={set('currency')} disabled={locked}>
                {['PKR','USD','EUR','GBP'].map(c => <option key={c}>{c}</option>)}
              </select></div>
            <div><label style={lbl}>Payment Terms</label><input style={inp} value={form.payment_terms} onChange={set('payment_terms')} placeholder="e.g. 30 days net" disabled={locked} /></div>
            <div><label style={lbl}>Status</label>
              <select style={sel} value={form.status} onChange={set('status')} disabled={locked}>
                {['Draft','Issued','Acknowledged','Delivered','Cancelled'].map(s => <option key={s}>{s}</option>)}
              </select></div>
            <div style={{ gridColumn: '2 / 4' }}><label style={lbl}>Notes</label><input style={inp} value={form.notes} onChange={set('notes')} placeholder="Any notes..." disabled={locked} /></div>
          </div>
          <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 8 }}>Line Items</div>
          <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: 10 }}>
            <thead><tr>
              {['Description','Specification','Qty','Unit','Unit Rate','Amount',''].map(h => (
                <th key={h} style={{ fontSize: 10, fontWeight: 600, color: '#9ca3af', padding: '0 6px 8px', textAlign: 'left', textTransform: 'uppercase', letterSpacing: '0.5px', whiteSpace: 'nowrap' }}>{h}</th>
              ))}
            </tr></thead>
            <tbody>
              {items.map((item, idx) => (
                <tr key={item._id || idx}>
                  <td style={{ padding: '3px 4px', minWidth: 160 }}><input style={{ ...inp, height: 28 }} value={item.description} onChange={e => updItem(idx,'description',e.target.value)} placeholder="Item description" disabled={locked} /></td>
                  <td style={{ padding: '3px 4px', minWidth: 130 }}><input style={{ ...inp, height: 28 }} value={item.specification||''} onChange={e => updItem(idx,'specification',e.target.value)} placeholder="Spec" disabled={locked} /></td>
                  <td style={{ padding: '3px 4px', width: 80 }}><input style={{ ...inp, height: 28, textAlign: 'right' }} type="number" value={item.qty} onChange={e => updItem(idx,'qty',e.target.value)} disabled={locked} /></td>
                  <td style={{ padding: '3px 4px', width: 80 }}>
                    <select style={{ ...sel, height: 28 }} value={item.unit||'yards'} onChange={e => updItem(idx,'unit',e.target.value)} disabled={locked}>
                      {['yards','meters','pcs','kg','cone','set','sht','ctn','roll','ltr'].map(u => <option key={u}>{u}</option>)}
                    </select></td>
                  <td style={{ padding: '3px 4px', width: 100 }}><input style={{ ...inp, height: 28, textAlign: 'right' }} type="number" value={item.unit_rate} onChange={e => updItem(idx,'unit_rate',e.target.value)} placeholder="0.00" disabled={locked} /></td>
                  <td style={{ padding: '3px 4px', width: 100, textAlign: 'right', fontSize: 12, fontWeight: 700 }}>{item.amount ? fmtNum(parseFloat(item.amount),2) : '—'}</td>
                  <td style={{ padding: '3px 0 3px 4px', width: 30 }}>
                    {!locked && items.length > 1 && <button className="btn btn-ghost btn-sm" onClick={() => setItems(its => its.filter((_,i)=>i!==idx))}><Trash2 size={10} /></button>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!locked && <button className="btn btn-secondary btn-sm" onClick={() => setItems(its => [...its, { _id: String(Date.now()), description:'', specification:'', qty:'', unit:'yards', unit_rate:'', amount:'', source_type:null, source_id:null }])} style={{ marginBottom: 12 }}><Plus size={12} /> Add Line</button>}
          {total > 0 && <div style={{ display: 'flex', justifyContent: 'flex-end', paddingRight: 34 }}><div style={{ background: '#0d0d0d', color: '#fff', padding: '8px 16px', borderRadius: 6, fontSize: 13, fontWeight: 700 }}>Total: {form.currency} {fmtNum(total,2)}</div></div>}
          {error && <div style={{ marginTop: 10, fontSize: 12, color: '#dc2626' }}>{error}</div>}
        </div>
        <div style={{ padding: '12px 24px', borderTop: '1px solid #f0f0ee', display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <button className="btn btn-secondary" onClick={onClose}>Close</button>
          {!locked && <button className="btn btn-primary" onClick={handleSave} disabled={saving}>{saving ? 'Saving...' : isNew ? 'Create PO' : 'Save Changes'}</button>}
        </div>
      </div>
      {showPasskey && <PasskeyModal onUnlock={() => { setLocked(false); setShowPasskey(false) }} onClose={() => setShowPasskey(false)} />}
    </div>
  )
}

function WOModal({ wo, orders, suppliers, onClose, onSaved }) {
  const isNew = !wo
  const [form, setForm] = useState({
    wo_number: wo?.wo_number || '', order_id: wo?.order_id || '',
    vendor_id: wo?.vendor_id || '', vendor_type: wo?.vendor_type || 'external',
    vendor_phone: wo?.vendor_phone || '', factory_ref: wo?.factory_ref || '',
    issue_date: wo?.issue_date || new Date().toISOString().slice(0,10),
    start_date: wo?.start_date || '', complete_by: wo?.complete_by || '',
    daily_output: wo?.daily_output || '', payment_terms: wo?.payment_terms || '',
    color: wo?.color || '', qty: wo?.qty || '', status: wo?.status || 'Draft', notes: wo?.notes || '',
  })
  const [orderProcesses, setOrderProcesses] = useState([])
  const [coverage, setCoverage] = useState({})
  const [items, setItems] = useState(wo?.items || [])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)
  const [locked, setLocked] = useState(!isNew)
  const [showPasskey, setShowPasskey] = useState(false)

  const loadOrderProcesses = async (orderId) => {
    if (!orderId) { setOrderProcesses([]); setCoverage({}); return }
    const { data: procs } = await supabase.from('order_processes').select('id,process_name').eq('order_id', orderId).order('sort_order')
    setOrderProcesses(procs || [])
    if (procs?.length) {
      const procIds = procs.map(p => p.id)
      const { data: lines } = await supabase.from('work_order_items').select('order_process_id,qty,wo_id').in('order_process_id', procIds)
      const cov = {}
      ;(lines || []).forEach(l => {
        if (wo?.id && l.wo_id === wo.id) return
        cov[l.order_process_id] = (cov[l.order_process_id] || 0) + (parseFloat(l.qty) || 0)
      })
      setCoverage(cov)
    }
  }

  useEffect(() => { if (form.order_id) loadOrderProcesses(form.order_id) }, []) // eslint-disable-line

  const handleOrderChange = async (orderId) => {
    setForm(f => ({ ...f, order_id: orderId }))
    await loadOrderProcesses(orderId)
    setItems([])
  }

  const toggleProcess = (proc) => {
    if (locked) return
    const exists = items.find(i => i.order_process_id === proc.id)
    if (exists) {
      setItems(its => its.filter(i => i.order_process_id !== proc.id))
    } else {
      setItems(its => [...its, { _id: String(Date.now()), order_process_id: proc.id, process_name: proc.process_name, dept_info: '', qty: form.qty || '', unit: 'pcs', rate: '', amount: '' }])
    }
  }

  const set = k => e => setForm(f => ({ ...f, [k]: e.target.value }))
  const updItem = (idx, k, v) => setItems(its => {
    const n = [...its]; n[idx] = { ...n[idx], [k]: v }
    if (k === 'qty' || k === 'rate') {
      const qty = parseFloat(k === 'qty' ? v : n[idx].qty) || 0
      const rate = parseFloat(k === 'rate' ? v : n[idx].rate) || 0
      n[idx].amount = qty * rate ? (qty * rate).toFixed(2) : ''
    }
    return n
  })
  const total = items.reduce((s, i) => s + (parseFloat(i.amount) || 0), 0)
  const orderTotalQty = orders.find(o => o.id === form.order_id)?.total_qty || 0

  const handleSave = async () => {
    if (!form.vendor_id) { setError('Select a vendor'); return }
    setSaving(true)
    try {
      let woNum = form.wo_number || await generateWONumber()
      const payload = { ...form, wo_number: woNum, qty: parseInt(form.qty) || null, daily_output: parseInt(form.daily_output) || null }
      let woId
      if (wo?.id) {
        await supabase.from('work_orders').update(payload).eq('id', wo.id)
        woId = wo.id
        await supabase.from('work_order_items').delete().eq('wo_id', woId)
      } else {
        const { data: newWO, error: we } = await supabase.from('work_orders').insert([payload]).select().single()
        if (we) throw new Error(we.message)
        woId = newWO.id
      }
      const rows = items.filter(i => i.process_name).map((i, idx) => ({
        wo_id: woId, order_process_id: i.order_process_id || null,
        process_name: i.process_name, dept_info: i.dept_info || null,
        qty: parseFloat(i.qty) || null, unit: i.unit || null,
        rate: parseFloat(i.rate) || null, amount: parseFloat(i.amount) || null, sort_order: idx,
      }))
      if (rows.length) await supabase.from('work_order_items').insert(rows)
      onSaved()
    } catch (e) { setError(e.message) }
    setSaving(false)
  }

  const handlePrint = async () => {
    if (!wo) return
    const vendor = suppliers.find(s => s.id === wo.vendor_id)
    const order = orders.find(o => o.id === wo.order_id)
    await printWorkOrder({ ...wo, items }, vendor, order)
  }

  const inp = { width: '100%', height: 32, padding: '0 10px', border: '1px solid #e5e7eb', borderRadius: 6, fontSize: 12, fontFamily: 'Inter,sans-serif', outline: 'none', background: locked ? '#f9f9f9' : '#fff' }
  const sel = { ...inp, cursor: locked ? 'not-allowed' : 'pointer' }
  const lbl = { fontSize: 11, fontWeight: 500, color: '#6b7280', display: 'block', marginBottom: 4 }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 300, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
      <div style={{ background: '#fff', borderRadius: 12, width: '100%', maxWidth: 860, maxHeight: 'calc(100vh - 48px)', display: 'flex', flexDirection: 'column', boxShadow: '0 24px 80px rgba(0,0,0,0.22)', overflow: 'hidden' }}>
        <div style={{ padding: '14px 24px', borderBottom: '1px solid #f0f0ee', display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: 14, fontWeight: 700 }}>{isNew ? 'New Work Order' : `WO — ${wo.wo_number}`}</span>
          <div style={{ flex: 1 }} />
          {!isNew && <button className="btn btn-secondary btn-sm" onClick={handlePrint}><Printer size={12} /> Print</button>}
          {!isNew && (
            <button className="btn btn-secondary btn-sm" onClick={() => locked ? setShowPasskey(true) : setLocked(true)}>
              {locked ? <><Unlock size={12} /> Edit</> : <><Lock size={12} /> Lock</>}
            </button>
          )}
          <button style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#9ca3af' }} onClick={onClose}><X size={16} /></button>
        </div>
        <div style={{ flex: 1, overflowY: 'auto', padding: '20px 24px' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12, marginBottom: 16 }}>
            <div><label style={lbl}>Vendor *</label>
              <select style={sel} value={form.vendor_id} onChange={set('vendor_id')} disabled={locked}>
                <option value="">Select vendor...</option>
                {suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select></div>
            <div><label style={lbl}>Vendor Type</label>
              <div style={{ display: 'flex', gap: 6, height: 32, alignItems: 'center' }}>
                {['internal','external'].map(t => (
                  <button key={t} onClick={() => !locked && setForm(f => ({ ...f, vendor_type: t }))}
                    style={{ flex: 1, height: 32, borderRadius: 6, border: '1px solid', fontSize: 11, fontWeight: 600, cursor: locked ? 'default' : 'pointer',
                      borderColor: form.vendor_type === t ? (t==='internal'?'#2563eb':'#7c3aed') : '#e5e7eb',
                      background: form.vendor_type === t ? (t==='internal'?'#eff6ff':'#f5f3ff') : '#fff',
                      color: form.vendor_type === t ? (t==='internal'?'#2563eb':'#7c3aed') : '#6b7280' }}>
                    {t === 'internal' ? 'Internal' : 'External / CMT'}
                  </button>
                ))}
              </div></div>
            <div><label style={lbl}>Vendor Phone</label><input style={inp} value={form.vendor_phone} onChange={set('vendor_phone')} placeholder="03xx-xxxxxxx" disabled={locked} /></div>
            <div><label style={lbl}>Order</label>
              <select style={sel} value={form.order_id} onChange={e => handleOrderChange(e.target.value)} disabled={locked}>
                <option value="">— Not linked —</option>
                {orders.map(o => <option key={o.id} value={o.id}>{o.style_number} · {o.buyer_name}</option>)}
              </select></div>
            <div><label style={lbl}>Factory Ref</label><input style={inp} value={form.factory_ref} onChange={set('factory_ref')} disabled={locked} /></div>
            <div><label style={lbl}>Colour</label><input style={inp} value={form.color} onChange={set('color')} placeholder="e.g. Stone Blue" disabled={locked} /></div>
            <div><label style={lbl}>Qty (batch for this vendor)</label><input style={inp} type="number" value={form.qty} onChange={set('qty')} disabled={locked} /></div>
            <div><label style={lbl}>Issue Date</label><input style={inp} type="date" value={form.issue_date} onChange={set('issue_date')} disabled={locked} /></div>
            <div><label style={lbl}>Start Date</label><input style={inp} type="date" value={form.start_date} onChange={set('start_date')} disabled={locked} /></div>
            <div><label style={lbl}>Complete By</label><input style={inp} type="date" value={form.complete_by} onChange={set('complete_by')} disabled={locked} /></div>
            <div><label style={lbl}>Daily Output (pcs/day)</label><input style={inp} type="number" value={form.daily_output} onChange={set('daily_output')} disabled={locked} /></div>
            <div><label style={lbl}>Payment Terms</label><input style={inp} value={form.payment_terms} onChange={set('payment_terms')} placeholder="e.g. On completion" disabled={locked} /></div>
            <div><label style={lbl}>Status</label>
              <select style={sel} value={form.status} onChange={set('status')} disabled={locked}>
                {['Draft','Issued','In Progress','Completed','Cancelled'].map(s => <option key={s}>{s}</option>)}
              </select></div>
          </div>

          {orderProcesses.length > 0 && (
            <div style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 6 }}>
                Processes
                {orderTotalQty > 0 && <span style={{ fontSize: 11, color: '#9ca3af', fontWeight: 400, marginLeft: 6 }}>Order total: {orderTotalQty.toLocaleString()} pcs — click to assign to this WO</span>}
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {orderProcesses.map(proc => {
                  const on = items.some(i => i.order_process_id === proc.id)
                  const covQty = coverage[proc.id] || 0
                  const pct = orderTotalQty ? Math.min(100, Math.round((covQty / orderTotalQty) * 100)) : null
                  const full = pct !== null && pct >= 100
                  return (
                    <button key={proc.id} onClick={() => toggleProcess(proc)}
                      style={{ padding: '5px 10px', borderRadius: 6, fontSize: 11, fontWeight: 600, border: '1px solid', cursor: locked ? 'default' : 'pointer',
                        borderColor: on ? '#0d0d0d' : full ? '#d1fae5' : '#e5e7eb',
                        background: on ? '#0d0d0d' : full ? '#f0fdf4' : '#fafafa',
                        color: on ? '#fff' : full ? '#16a34a' : '#374151' }}>
                      {proc.process_name}
                      {pct !== null && !on && (
                        <span style={{ marginLeft: 5, fontSize: 10, color: full ? '#16a34a' : covQty > 0 ? '#d97706' : '#9ca3af' }}>
                          {full ? '✓' : covQty > 0 ? `${pct}%` : '0%'}
                        </span>
                      )}
                    </button>
                  )
                })}
              </div>
            </div>
          )}

          <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 8 }}>Work Order Items</div>
          {items.length === 0 ? (
            <div style={{ fontSize: 12, color: '#9ca3af', marginBottom: 12, fontStyle: 'italic' }}>
              {orderProcesses.length > 0 ? 'Select processes above to add line items.' : 'Add items manually below.'}
            </div>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: 10 }}>
              <thead><tr>
                {['Process','Dept / Info','Qty','Unit','Rate (PKR)','Amount',''].map(h => (
                  <th key={h} style={{ fontSize: 10, fontWeight: 600, color: '#9ca3af', padding: '0 6px 8px', textAlign: 'left', textTransform: 'uppercase', letterSpacing: '0.5px' }}>{h}</th>
                ))}
              </tr></thead>
              <tbody>
                {items.map((item, idx) => (
                  <tr key={item._id || idx}>
                    <td style={{ padding: '3px 4px', minWidth: 130 }}><input style={{ ...inp, height: 28 }} value={item.process_name} onChange={e => updItem(idx,'process_name',e.target.value)} placeholder="Process" disabled={locked} /></td>
                    <td style={{ padding: '3px 4px', minWidth: 110 }}><input style={{ ...inp, height: 28 }} value={item.dept_info||''} onChange={e => updItem(idx,'dept_info',e.target.value)} placeholder="Dept/info" disabled={locked} /></td>
                    <td style={{ padding: '3px 4px', width: 80 }}><input style={{ ...inp, height: 28, textAlign: 'right' }} type="number" value={item.qty} onChange={e => updItem(idx,'qty',e.target.value)} disabled={locked} /></td>
                    <td style={{ padding: '3px 4px', width: 70 }}>
                      <select style={{ ...sel, height: 28 }} value={item.unit||'pcs'} onChange={e => updItem(idx,'unit',e.target.value)} disabled={locked}>
                        {['pcs','yards','meters','kg','set'].map(u => <option key={u}>{u}</option>)}
                      </select></td>
                    <td style={{ padding: '3px 4px', width: 90 }}><input style={{ ...inp, height: 28, textAlign: 'right' }} type="number" value={item.rate} onChange={e => updItem(idx,'rate',e.target.value)} placeholder="0.00" disabled={locked} /></td>
                    <td style={{ padding: '3px 4px', width: 90, textAlign: 'right', fontSize: 12, fontWeight: 700 }}>{item.amount ? fmtNum(parseFloat(item.amount),2) : '—'}</td>
                    <td style={{ padding: '3px 0 3px 4px', width: 30 }}>
                      {!locked && <button className="btn btn-ghost btn-sm" onClick={() => setItems(its => its.filter((_,i)=>i!==idx))}><Trash2 size={10} /></button>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {!locked && (
            <button className="btn btn-secondary btn-sm" onClick={() => setItems(its => [...its, { _id: String(Date.now()), order_process_id: null, process_name:'', dept_info:'', qty:'', unit:'pcs', rate:'', amount:'' }])} style={{ marginBottom: 12 }}>
              <Plus size={12} /> Add Line Manually
            </button>
          )}
          {total > 0 && <div style={{ display: 'flex', justifyContent: 'flex-end', paddingRight: 34 }}><div style={{ background: '#0d0d0d', color: '#fff', padding: '8px 16px', borderRadius: 6, fontSize: 13, fontWeight: 700 }}>Total: PKR {fmtNum(total,2)}</div></div>}
          <div style={{ marginTop: 12 }}>
            <label style={lbl}>Notes / Special Instructions</label>
            <textarea style={{ ...inp, height: 60, resize: 'vertical', padding: '8px 10px' }} value={form.notes} onChange={set('notes')} disabled={locked} />
          </div>
          {error && <div style={{ marginTop: 10, fontSize: 12, color: '#dc2626' }}>{error}</div>}
        </div>
        <div style={{ padding: '12px 24px', borderTop: '1px solid #f0f0ee', display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <button className="btn btn-secondary" onClick={onClose}>Close</button>
          {!locked && <button className="btn btn-primary" onClick={handleSave} disabled={saving}>{saving ? 'Saving...' : isNew ? 'Create WO' : 'Save Changes'}</button>}
        </div>
      </div>
      {showPasskey && <PasskeyModal onUnlock={() => { setLocked(false); setShowPasskey(false) }} onClose={() => setShowPasskey(false)} />}
    </div>
  )
}

function DemandTab({ suppliers }) {
  const [orders, setOrders] = useState([])
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [filterCat, setFilterCat] = useState('')
  const [filterStatus, setFilterStatus] = useState('')
  const [selected, setSelected] = useState(new Set())
  const [showPOModal, setShowPOModal] = useState(false)

  useEffect(() => { load() }, [])

  async function load() {
    setLoading(true)
    const { data: ords } = await supabase.from('orders')
      .select('id,job_id,job_number,buyer_name,style_number,total_qty')
      .not('status','eq','Cancelled').order('job_number')
    const allOrds = ords || []
    const jobOrds = allOrds.filter(o => o.job_id)
    setOrders(allOrds)
    if (!jobOrds.length) { setRows([]); setLoading(false); return }

    const idSet = new Set(jobOrds.map(o => o.id))
    const [{ data: bom }, { data: emb }, { data: wash }] = await Promise.all([
      supabase.from('bom_items').select('*').order('sort_order'),
      supabase.from('embellishments').select('*'),
      supabase.from('washing').select('*'),
    ])

    const built = []
    ;(bom||[]).filter(b => idSet.has(b.order_id)).forEach(b => {
      const ord = allOrds.find(o => o.id === b.order_id); if (!ord) return
      const cat = b.category==='Fabric'?'Fabric':b.category==='Stitching Trim'?'S. Trim':'P. Trim'
      built.push({ id:b.id, order_id:b.order_id, order:ord, source_type:'bom', source_id:b.id, cat, name:b.name, specification:b.specification||b.detail||'', req_qty:b.final_qty||b.base_qty||0, unit:b.unit||'', supplier_id:b.supplier_id||null, po_status:b.po_status||'No PO' })
    })
    ;(emb||[]).filter(e => idSet.has(e.order_id)).forEach(e => {
      const ord = allOrds.find(o => o.id === e.order_id); if (!ord) return
      built.push({ id:e.id, order_id:e.order_id, order:ord, source_type:'embellishment', source_id:e.id, cat:'Embellishment', name:e.description||e.technique||'Embellishment', specification:[e.technique,e.placement,e.dimensions].filter(Boolean).join(' · '), req_qty:e.qty||ord.total_qty||0, unit:e.unit||'pcs', supplier_id:e.vendor_id||null, po_status:'No PO' })
    })
    ;(wash||[]).filter(w => idSet.has(w.order_id)).forEach(w => {
      const ord = allOrds.find(o => o.id === w.order_id); if (!ord) return
      built.push({ id:w.id, order_id:w.order_id, order:ord, source_type:'washing', source_id:w.id, cat:'Wash', name:[w.wash_type,w.color_name].filter(Boolean).join(' — ')||'Washing', specification:w.wash_ref||'', req_qty:w.qty||0, unit:w.unit||'pcs', supplier_id:w.vendor_id||null, po_status:'No PO' })
    })
    setRows(built)
    setLoading(false)
  }

  const filtered = rows.filter(r => {
    const q = search.toLowerCase()
    const ms = !q || [r.name,r.order.buyer_name,r.order.style_number,r.order.job_number].some(f=>f?.toLowerCase().includes(q))
    return ms && (!filterCat||r.cat===filterCat) && (!filterStatus||(r.po_status||'No PO')===filterStatus)
  })
  const grouped = {}
  filtered.forEach(r => { if (!grouped[r.order_id]) grouped[r.order_id]={order:r.order,rows:[]}; grouped[r.order_id].rows.push(r) })
  const noPo = rows.filter(r=>!r.po_status||r.po_status==='No PO').length
  const issued = rows.filter(r=>r.po_status==='PO Issued').length

  const catStyle = { Fabric:{color:'#2563eb',bg:'#eff6ff'}, 'S. Trim':{color:'#d97706',bg:'#fff7ed'}, 'P. Trim':{color:'#7c3aed',bg:'#f5f3ff'}, Embellishment:{color:'#be185d',bg:'#fdf2f8'}, Wash:{color:'#0891b2',bg:'#ecfeff'} }
  const stStyle = { 'No PO':{color:'#d97706',bg:'#fff7ed'}, 'PO Issued':{color:'#16a34a',bg:'#f0fdf4'}, Partial:{color:'#2563eb',bg:'#eff6ff'}, Delivered:{color:'#6b7280',bg:'#f9fafb'} }
  const selStyle = { height:32, border:'1px solid #e5e7eb', borderRadius:7, fontSize:12, padding:'0 10px', background:'#fff', cursor:'pointer', fontFamily:'Inter,sans-serif' }

  const buildPrefill = () => filtered.filter(r=>selected.has(r.id)).map(r => ({ _id:r.id, description:r.name, specification:r.specification, qty:r.req_qty||'', unit:r.unit||'pcs', unit_rate:'', amount:'', source_type:r.source_type, source_id:r.source_id }))

  return (
    <>
      <div style={{ padding:'10px 24px', borderBottom:'1px solid #f3f4f6', display:'flex', alignItems:'center', gap:8, flexShrink:0 }}>
        <div style={{ position:'relative', width:280 }}>
          <Search size={13} style={{ position:'absolute', left:9, top:'50%', transform:'translateY(-50%)', color:'#9ca3af' }} />
          <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search item, style, buyer..."
            style={{ width:'100%', paddingLeft:28, height:32, border:'1px solid #e5e7eb', borderRadius:7, fontSize:12, fontFamily:'Inter,sans-serif', outline:'none', background:'#fafafa' }} />
        </div>
        <select value={filterCat} onChange={e=>setFilterCat(e.target.value)} style={selStyle}>
          <option value="">All Categories</option>
          <option>Fabric</option><option>S. Trim</option><option>P. Trim</option><option>Embellishment</option><option>Wash</option>
        </select>
        <select value={filterStatus} onChange={e=>setFilterStatus(e.target.value)} style={selStyle}>
          <option value="">All Statuses</option>
          <option>No PO</option><option>PO Issued</option><option>Partial</option><option>Delivered</option>
        </select>
        <div style={{ marginLeft:'auto' }}>
          <button className="btn btn-primary btn-sm" onClick={()=>setShowPOModal(true)} disabled={selected.size===0}>
            + Generate PO {selected.size>0?`(${selected.size})`:''}
          </button>
        </div>
      </div>
      {selected.size > 0 && (
        <div style={{ padding:'7px 24px', background:'#eff6ff', borderBottom:'1px solid #dbeafe', display:'flex', alignItems:'center', gap:8, flexShrink:0 }}>
          <span style={{ fontSize:12, color:'#2563eb', fontWeight:600 }}>{selected.size} items selected</span>
          <button className="btn btn-sm btn-secondary" onClick={()=>setSelected(new Set())}><X size={11} /> Clear</button>
        </div>
      )}
      <div style={{ flex:1, overflowY:'auto', overflowX:'auto' }}>
        {loading ? <div style={{ padding:60, textAlign:'center', color:'#9ca3af', fontSize:12 }}>Loading...</div>
        : filtered.length===0 ? (
          <div style={{ padding:60, textAlign:'center', color:'#9ca3af', fontSize:12 }}>
            {orders.filter(o=>o.job_id).length===0 ? 'No job-assigned orders yet. Assign orders to a job from the Orders page.' : 'No demand items found matching your filters.'}
          </div>
        ) : (
          <table style={{ width:'100%', borderCollapse:'collapse', minWidth:860 }}>
            <thead>
              <tr style={{ background:'#fafafa', position:'sticky', top:0, zIndex:10 }}>
                <th style={{ width:40, padding:'9px 0 9px 18px', borderBottom:'1px solid #f3f4f6' }}>
                  <input type="checkbox" checked={selected.size===filtered.length&&filtered.length>0} onChange={()=>setSelected(selected.size===filtered.length?new Set():new Set(filtered.map(r=>r.id)))} />
                </th>
                {['Job','Cat','Item / Spec','Req Qty','Supplier','Status'].map(h => (
                  <th key={h} style={{ fontSize:10, fontWeight:600, color:'#9ca3af', padding:'9px 12px', textAlign:'left', textTransform:'uppercase', letterSpacing:'0.5px', borderBottom:'1px solid #f3f4f6' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {Object.values(grouped).map(grp => (
                <React.Fragment key={grp.order.id}>
                  <tr><td colSpan={7} style={{ padding:'7px 18px', background:'#f9fafb', borderBottom:'1px solid #f0f0ee', borderTop:'1px solid #f0f0ee' }}>
                    <span style={{ fontSize:11, fontWeight:700, fontFamily:'monospace', color:'#0d0d0d' }}>{grp.order.job_number||'—'}</span>
                    <span style={{ fontSize:11, color:'#6b7280', marginLeft:8 }}>{grp.order.buyer_name} · {grp.order.style_number}</span>
                    {grp.order.total_qty && <span style={{ fontSize:11, color:'#9ca3af', marginLeft:8 }}>{grp.order.total_qty.toLocaleString()} pcs</span>}
                  </td></tr>
                  {grp.rows.map(r => {
                    const cs = catStyle[r.cat]||{}; const ss = stStyle[r.po_status||'No PO']||{}
                    return (
                      <tr key={r.id} style={{ background:selected.has(r.id)?'#f0f9ff':'' }}
                        onMouseEnter={e=>{if(!selected.has(r.id))e.currentTarget.style.background='#fafafa'}}
                        onMouseLeave={e=>{if(!selected.has(r.id))e.currentTarget.style.background=''}}>
                        <td style={{ padding:'8px 0 8px 18px', borderBottom:'1px solid #f9fafb' }}>
                          <input type="checkbox" checked={selected.has(r.id)} onChange={()=>setSelected(p=>{const s=new Set(p);s.has(r.id)?s.delete(r.id):s.add(r.id);return s})} />
                        </td>
                        <td style={{ padding:'8px 12px', borderBottom:'1px solid #f9fafb', fontFamily:'monospace', fontSize:11, fontWeight:600 }}>{grp.order.job_number||'—'}</td>
                        <td style={{ padding:'8px 12px', borderBottom:'1px solid #f9fafb' }}><span style={{ background:cs.bg, color:cs.color, fontSize:10, fontWeight:600, padding:'2px 7px', borderRadius:4 }}>{r.cat}</span></td>
                        <td style={{ padding:'8px 12px', borderBottom:'1px solid #f9fafb', maxWidth:260 }}>
                          <div style={{ fontSize:12, fontWeight:600 }}>{r.name}</div>
                          {r.specification && <div style={{ fontSize:11, color:'#9ca3af' }}>{r.specification}</div>}
                        </td>
                        <td style={{ padding:'8px 12px', borderBottom:'1px solid #f9fafb', fontSize:12, fontWeight:700, fontFamily:'monospace' }}>{r.req_qty?`${parseFloat(r.req_qty).toLocaleString()} ${r.unit}`:'—'}</td>
                        <td style={{ padding:'8px 12px', borderBottom:'1px solid #f9fafb', fontSize:12 }}>{suppliers.find(s=>s.id===r.supplier_id)?.name||<span style={{color:'#9ca3af',fontStyle:'italic'}}>Unassigned</span>}</td>
                        <td style={{ padding:'8px 12px', borderBottom:'1px solid #f9fafb' }}><span style={{ background:ss.bg||'#f9fafb', color:ss.color||'#6b7280', fontSize:10, fontWeight:600, padding:'2px 7px', borderRadius:4 }}>{r.po_status||'No PO'}</span></td>
                      </tr>
                    )
                  })}
                </React.Fragment>
              ))}
            </tbody>
          </table>
        )}
      </div>
      <div style={{ padding:'8px 24px', borderTop:'1px solid #e5e7eb', display:'flex', gap:20, background:'#fff', flexShrink:0 }}>
        <span style={{ fontSize:11, fontWeight:700, color:'#9ca3af', textTransform:'uppercase', letterSpacing:'0.4px' }}>{filtered.length} items</span>
        <span style={{ fontSize:11, color:'#d97706', fontWeight:600 }}>No PO: {noPo}</span>
        <span style={{ fontSize:11, color:'#16a34a', fontWeight:600 }}>PO Issued: {issued}</span>
      </div>
      {showPOModal && <POModal orders={orders} suppliers={suppliers} prefillItems={buildPrefill()} onClose={()=>setShowPOModal(false)} onSaved={()=>{setShowPOModal(false);setSelected(new Set());load()}} />}
    </>
  )
}

function POsTab({ orders, suppliers }) {
  const [pos, setPos] = useState([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [editPO, setEditPO] = useState(null)
  const [search, setSearch] = useState('')

  useEffect(() => { load() }, [])
  async function load() {
    setLoading(true)
    const { data } = await supabase.from('purchase_orders').select('*, purchase_order_items(*)').order('created_at', { ascending: false })
    setPos(data || [])
    setLoading(false)
  }

  const filtered = pos.filter(p => {
    const q = search.toLowerCase()
    return !q || [p.po_number, suppliers.find(s=>s.id===p.supplier_id)?.name, p.notes].some(f=>f?.toLowerCase().includes(q))
  })

  const stStyle = { Draft:{color:'#d97706',bg:'#fff7ed'}, Issued:{color:'#2563eb',bg:'#eff6ff'}, Acknowledged:{color:'#7c3aed',bg:'#f5f3ff'}, Delivered:{color:'#16a34a',bg:'#f0fdf4'}, Cancelled:{color:'#dc2626',bg:'#fef2f2'} }

  const handlePrint = async (p, e) => {
    e.stopPropagation()
    const supplier = suppliers.find(s=>s.id===p.supplier_id)
    const order = orders.find(o=>o.id===p.order_id)
    await printPurchaseOrder({ ...p, items: p.purchase_order_items||[] }, supplier, order, null)
  }

  return (
    <>
      <div style={{ padding:'10px 24px', borderBottom:'1px solid #f3f4f6', display:'flex', alignItems:'center', gap:8, flexShrink:0 }}>
        <div style={{ position:'relative', width:280 }}>
          <Search size={13} style={{ position:'absolute', left:9, top:'50%', transform:'translateY(-50%)', color:'#9ca3af' }} />
          <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search PO number or supplier..."
            style={{ width:'100%', paddingLeft:28, height:32, border:'1px solid #e5e7eb', borderRadius:7, fontSize:12, fontFamily:'Inter,sans-serif', outline:'none', background:'#fafafa' }} />
        </div>
        <div style={{ marginLeft:'auto' }}><button className="btn btn-primary btn-sm" onClick={()=>{setEditPO(null);setShowModal(true)}}><Plus size={12} /> New PO</button></div>
      </div>
      <div style={{ flex:1, overflowY:'auto', overflowX:'auto' }}>
        {loading ? <div style={{ padding:60, textAlign:'center', color:'#9ca3af', fontSize:12 }}>Loading...</div>
        : filtered.length===0 ? <div style={{ padding:60, textAlign:'center', color:'#9ca3af', fontSize:12 }}>No purchase orders yet.</div>
        : (
          <table style={{ width:'100%', borderCollapse:'collapse', minWidth:760 }}>
            <thead><tr style={{ background:'#fafafa', position:'sticky', top:0, zIndex:10 }}>
              {['PO Number','Supplier','Order / Style','PO Date','Delivery','Items','Status',''].map(h => (
                <th key={h} style={{ fontSize:10, fontWeight:600, color:'#9ca3af', padding:'9px 12px', textAlign:'left', textTransform:'uppercase', letterSpacing:'0.5px', borderBottom:'1px solid #f3f4f6', whiteSpace:'nowrap' }}>{h}</th>
              ))}
            </tr></thead>
            <tbody>
              {filtered.map(p => {
                const supplier=suppliers.find(s=>s.id===p.supplier_id); const order=orders.find(o=>o.id===p.order_id)
                const ss=stStyle[p.status]||{}; const total=(p.purchase_order_items||[]).reduce((s,i)=>s+(parseFloat(i.amount)||0),0)
                return (
                  <tr key={p.id} style={{ cursor:'pointer' }} onClick={()=>{setEditPO({...p,items:p.purchase_order_items||[]});setShowModal(true)}}
                    onMouseEnter={e=>e.currentTarget.style.background='#fafafa'} onMouseLeave={e=>e.currentTarget.style.background=''}>
                    <td style={{ padding:'10px 12px', borderBottom:'1px solid #f9fafb', fontFamily:'monospace', fontSize:12, fontWeight:700 }}>{p.po_number}</td>
                    <td style={{ padding:'10px 12px', borderBottom:'1px solid #f9fafb', fontSize:12, fontWeight:600 }}>{supplier?.name||'—'}</td>
                    <td style={{ padding:'10px 12px', borderBottom:'1px solid #f9fafb', fontSize:11, color:'#6b7280' }}>{order?`${order.style_number} · ${order.buyer_name}`:'—'}</td>
                    <td style={{ padding:'10px 12px', borderBottom:'1px solid #f9fafb', fontSize:11, color:'#6b7280' }}>{fmtDate(p.po_date)}</td>
                    <td style={{ padding:'10px 12px', borderBottom:'1px solid #f9fafb', fontSize:11, color:dateColor(p.delivery_date), fontWeight:p.delivery_date&&new Date(p.delivery_date)<today?700:400 }}>{fmtDate(p.delivery_date)}</td>
                    <td style={{ padding:'10px 12px', borderBottom:'1px solid #f9fafb', fontSize:11 }}>
                      {(p.purchase_order_items||[]).length} lines
                      {total>0&&<span style={{ fontWeight:700, color:'#0d0d0d', marginLeft:6 }}>{p.currency} {fmtNum(total)}</span>}
                    </td>
                    <td style={{ padding:'10px 12px', borderBottom:'1px solid #f9fafb' }}><span style={{ background:ss.bg||'#f9fafb', color:ss.color||'#6b7280', fontSize:10, fontWeight:600, padding:'2px 7px', borderRadius:4 }}>{p.status}</span></td>
                    <td style={{ padding:'10px 8px', borderBottom:'1px solid #f9fafb' }}><button className="btn btn-ghost btn-sm" onClick={e=>handlePrint(p,e)} title="Print PO"><Printer size={12} color="#9ca3af" /></button></td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>
      {showModal && <POModal po={editPO} orders={orders} suppliers={suppliers} onClose={()=>{setShowModal(false);setEditPO(null)}} onSaved={()=>{setShowModal(false);setEditPO(null);load()}} />}
    </>
  )
}

function WorkOrdersTab({ orders, suppliers }) {
  const [wos, setWos] = useState([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [editWO, setEditWO] = useState(null)
  const [search, setSearch] = useState('')

  useEffect(() => { load() }, [])
  async function load() {
    setLoading(true)
    const { data } = await supabase.from('work_orders').select('*, work_order_items(*)').order('created_at', { ascending: false })
    setWos(data || [])
    setLoading(false)
  }

  const filtered = wos.filter(w => {
    const q = search.toLowerCase()
    return !q || [w.wo_number, suppliers.find(s=>s.id===w.vendor_id)?.name, w.color].some(f=>f?.toLowerCase().includes(q))
  })

  const stStyle = { Draft:{color:'#d97706',bg:'#fff7ed'}, Issued:{color:'#2563eb',bg:'#eff6ff'}, 'In Progress':{color:'#7c3aed',bg:'#f5f3ff'}, Completed:{color:'#16a34a',bg:'#f0fdf4'}, Cancelled:{color:'#dc2626',bg:'#fef2f2'} }

  const handlePrint = async (w, e) => {
    e.stopPropagation()
    const vendor = suppliers.find(s=>s.id===w.vendor_id)
    const order = orders.find(o=>o.id===w.order_id)
    await printWorkOrder({ ...w, items: w.work_order_items||[] }, vendor, order)
  }

  return (
    <>
      <div style={{ padding:'10px 24px', borderBottom:'1px solid #f3f4f6', display:'flex', alignItems:'center', gap:8, flexShrink:0 }}>
        <div style={{ position:'relative', width:280 }}>
          <Search size={13} style={{ position:'absolute', left:9, top:'50%', transform:'translateY(-50%)', color:'#9ca3af' }} />
          <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search WO number or vendor..."
            style={{ width:'100%', paddingLeft:28, height:32, border:'1px solid #e5e7eb', borderRadius:7, fontSize:12, fontFamily:'Inter,sans-serif', outline:'none', background:'#fafafa' }} />
        </div>
        <div style={{ marginLeft:'auto' }}><button className="btn btn-primary btn-sm" onClick={()=>{setEditWO(null);setShowModal(true)}}><Plus size={12} /> New Work Order</button></div>
      </div>
      <div style={{ flex:1, overflowY:'auto', overflowX:'auto' }}>
        {loading ? <div style={{ padding:60, textAlign:'center', color:'#9ca3af', fontSize:12 }}>Loading...</div>
        : filtered.length===0 ? <div style={{ padding:60, textAlign:'center', color:'#9ca3af', fontSize:12 }}>No work orders yet.</div>
        : (
          <table style={{ width:'100%', borderCollapse:'collapse', minWidth:800 }}>
            <thead><tr style={{ background:'#fafafa', position:'sticky', top:0, zIndex:10 }}>
              {['WO Number','Vendor','Type','Order / Style','Colour','Qty','Processes','Complete By','Status',''].map(h => (
                <th key={h} style={{ fontSize:10, fontWeight:600, color:'#9ca3af', padding:'9px 12px', textAlign:'left', textTransform:'uppercase', letterSpacing:'0.5px', borderBottom:'1px solid #f3f4f6', whiteSpace:'nowrap' }}>{h}</th>
              ))}
            </tr></thead>
            <tbody>
              {filtered.map(w => {
                const vendor=suppliers.find(s=>s.id===w.vendor_id); const order=orders.find(o=>o.id===w.order_id)
                const ss=stStyle[w.status]||{}; const overdue=w.complete_by&&new Date(w.complete_by)<today&&w.status!=='Completed'
                const total=(w.work_order_items||[]).reduce((s,i)=>s+(parseFloat(i.amount)||0),0)
                const procNames=(w.work_order_items||[]).map(i=>i.process_name).filter(Boolean)
                const tc=w.vendor_type==='internal'?{color:'#2563eb',bg:'#eff6ff'}:{color:'#7c3aed',bg:'#f5f3ff'}
                return (
                  <tr key={w.id} style={{ cursor:'pointer' }} onClick={()=>{setEditWO({...w,items:w.work_order_items||[]});setShowModal(true)}}
                    onMouseEnter={e=>e.currentTarget.style.background='#fafafa'} onMouseLeave={e=>e.currentTarget.style.background=''}>
                    <td style={{ padding:'10px 12px', borderBottom:'1px solid #f9fafb', fontFamily:'monospace', fontSize:12, fontWeight:700 }}>{w.wo_number}</td>
                    <td style={{ padding:'10px 12px', borderBottom:'1px solid #f9fafb', fontSize:12, fontWeight:600 }}>{vendor?.name||'—'}</td>
                    <td style={{ padding:'10px 12px', borderBottom:'1px solid #f9fafb' }}><span style={{ background:tc.bg, color:tc.color, fontSize:10, fontWeight:600, padding:'2px 7px', borderRadius:4 }}>{w.vendor_type==='internal'?'Internal':'CMT'}</span></td>
                    <td style={{ padding:'10px 12px', borderBottom:'1px solid #f9fafb', fontSize:11, color:'#6b7280' }}>{order?`${order.style_number} · ${order.buyer_name}`:'—'}</td>
                    <td style={{ padding:'10px 12px', borderBottom:'1px solid #f9fafb', fontSize:12 }}>{w.color||'—'}</td>
                    <td style={{ padding:'10px 12px', borderBottom:'1px solid #f9fafb', fontSize:12, fontFamily:'monospace', fontWeight:600 }}>{w.qty?.toLocaleString()||'—'}</td>
                    <td style={{ padding:'10px 12px', borderBottom:'1px solid #f9fafb', fontSize:11, color:'#6b7280', maxWidth:160, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{procNames.slice(0,3).join(', ')}{procNames.length>3?` +${procNames.length-3}`:''}</td>
                    <td style={{ padding:'10px 12px', borderBottom:'1px solid #f9fafb', fontSize:11, color:overdue?'#dc2626':'#6b7280', fontWeight:overdue?700:400 }}>{fmtDate(w.complete_by)}{overdue?' ▲':''}</td>
                    <td style={{ padding:'10px 12px', borderBottom:'1px solid #f9fafb' }}>
                      <span style={{ background:ss.bg||'#f9fafb', color:ss.color||'#6b7280', fontSize:10, fontWeight:600, padding:'2px 7px', borderRadius:4 }}>{w.status}</span>
                      {total>0&&<span style={{ fontSize:11, fontWeight:700, color:'#0d0d0d', marginLeft:6 }}>PKR {fmtNum(total)}</span>}
                    </td>
                    <td style={{ padding:'10px 8px', borderBottom:'1px solid #f9fafb' }}><button className="btn btn-ghost btn-sm" onClick={e=>handlePrint(w,e)} title="Print WO"><Printer size={12} color="#9ca3af" /></button></td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>
      {showModal && <WOModal wo={editWO} orders={orders} suppliers={suppliers} onClose={()=>{setShowModal(false);setEditWO(null)}} onSaved={()=>{setShowModal(false);setEditWO(null);load()}} />}
    </>
  )
}

function DeliveriesTab({ orders, suppliers }) {
  const [pos, setPos] = useState([])
  const [wos, setWos] = useState([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState('all')

  useEffect(() => { load() }, [])
  async function load() {
    setLoading(true)
    const [{ data: p }, { data: w }] = await Promise.all([
      supabase.from('purchase_orders').select('*, purchase_order_items(*)').not('status','eq','Cancelled').order('delivery_date',{nullsLast:true}),
      supabase.from('work_orders').select('*, work_order_items(*)').not('status','eq','Cancelled').order('complete_by',{nullsLast:true}),
    ])
    setPos(p||[]); setWos(w||[]); setLoading(false)
  }

  const todayD=new Date(); todayD.setHours(0,0,0,0)
  const weekEnd=new Date(todayD); weekEnd.setDate(todayD.getDate()+7)
  const monthEnd=new Date(todayD.getFullYear(),todayD.getMonth()+1,0)

  function statusOf(dateStr,docStatus) {
    if (docStatus==='Delivered'||docStatus==='Completed') return 'Delivered'
    if (!dateStr) return 'No Date'
    const d=new Date(dateStr)
    if (d<todayD) return 'Overdue'
    if (d<=weekEnd) return 'This Week'
    if (d<=monthEnd) return 'This Month'
    return 'Upcoming'
  }

  const stStyle = { Overdue:{color:'#dc2626',bg:'#fef2f2'}, 'This Week':{color:'#d97706',bg:'#fff7ed'}, 'This Month':{color:'#2563eb',bg:'#eff6ff'}, Upcoming:{color:'#6b7280',bg:'#f9fafb'}, Delivered:{color:'#16a34a',bg:'#f0fdf4'}, 'No Date':{color:'#9ca3af',bg:'#f9fafb'} }

  const poRows = pos.map(p => {
    const supplier=suppliers.find(s=>s.id===p.supplier_id); const order=orders.find(o=>o.id===p.order_id)
    const items=p.purchase_order_items||[]; const total=items.reduce((s,i)=>s+(parseFloat(i.amount)||0),0)
    return { type:'PO', ref:p.po_number, date:p.delivery_date, party:supplier?.name||'—', order, summary:items.length+' lines', value:total?`${p.currency||'PKR'} ${fmtNum(total)}`:'—', status:statusOf(p.delivery_date,p.status) }
  })
  const woRows = wos.map(w => {
    const order=orders.find(o=>o.id===w.order_id); const vendor=suppliers.find(s=>s.id===w.vendor_id)
    const items=w.work_order_items||[]; const total=items.reduce((s,i)=>s+(parseFloat(i.amount)||0),0)
    const procNames=items.map(i=>i.process_name).filter(Boolean)
    return { type:'WO', ref:w.wo_number, date:w.complete_by, party:vendor?.name||'—', order, summary:procNames.slice(0,3).join(', ')||'—', value:total?`PKR ${fmtNum(total)}`:'—', status:statusOf(w.complete_by,w.status) }
  })

  const all=[...poRows,...woRows].sort((a,b)=>{
    const p={Overdue:0,'This Week':1,'This Month':2,Upcoming:3,'No Date':4,Delivered:5}
    return (p[a.status]??3)-(p[b.status]??3)||(a.date||'').localeCompare(b.date||'')
  })
  const filtered=all.filter(r=>{
    if (filter==='overdue') return r.status==='Overdue'
    if (filter==='thisweek') return r.status==='This Week'
    if (filter==='thismonth') return r.status==='This Month'
    if (filter==='pending') return r.status!=='Delivered'
    return true
  })
  const counts={ overdue:all.filter(r=>r.status==='Overdue').length, thisweek:all.filter(r=>r.status==='This Week').length, thismonth:all.filter(r=>r.status==='This Month').length }
  const selStyle={ height:32, border:'1px solid #e5e7eb', borderRadius:7, fontSize:12, padding:'0 10px', background:'#fff', cursor:'pointer', fontFamily:'Inter,sans-serif' }

  return (
    <>
      <div style={{ padding:'10px 24px', borderBottom:'1px solid #f3f4f6', display:'flex', gap:12, flexShrink:0, alignItems:'center' }}>
        {[{label:'Overdue',count:counts.overdue,color:'#dc2626',f:'overdue'},{label:'This Week',count:counts.thisweek,color:'#d97706',f:'thisweek'},{label:'This Month',count:counts.thismonth,color:'#2563eb',f:'thismonth'}].map(k => (
          <button key={k.f} onClick={()=>setFilter(filter===k.f?'all':k.f)}
            style={{ display:'flex', alignItems:'center', gap:7, padding:'5px 12px', borderRadius:7, border:`1px solid ${filter===k.f?k.color:'#e5e7eb'}`, background:filter===k.f?k.color+'12':'#fff', cursor:'pointer' }}>
            <span style={{ fontSize:15, fontWeight:800, color:k.color }}>{k.count}</span>
            <span style={{ fontSize:11, color:filter===k.f?k.color:'#6b7280', fontWeight:500 }}>{k.label}</span>
          </button>
        ))}
        <div style={{ marginLeft:'auto' }}>
          <select value={filter} onChange={e=>setFilter(e.target.value)} style={selStyle}>
            <option value="all">All</option><option value="pending">Pending only</option>
            <option value="overdue">Overdue</option><option value="thisweek">This Week</option><option value="thismonth">This Month</option>
          </select>
        </div>
      </div>
      <div style={{ flex:1, overflowY:'auto', overflowX:'auto' }}>
        {loading ? <div style={{ padding:60, textAlign:'center', color:'#9ca3af', fontSize:12 }}>Loading...</div>
        : filtered.length===0 ? <div style={{ padding:60, textAlign:'center', color:'#9ca3af', fontSize:12 }}>No deliveries match this filter.</div>
        : (
          <table style={{ width:'100%', borderCollapse:'collapse', minWidth:780 }}>
            <thead><tr style={{ background:'#fafafa', position:'sticky', top:0, zIndex:10 }}>
              {['Type','Reference','Party','Order / Style','Due Date','Summary','Value','Status'].map(h => (
                <th key={h} style={{ fontSize:10, fontWeight:600, color:'#9ca3af', padding:'9px 12px', textAlign:'left', textTransform:'uppercase', letterSpacing:'0.5px', borderBottom:'1px solid #f3f4f6', whiteSpace:'nowrap' }}>{h}</th>
              ))}
            </tr></thead>
            <tbody>
              {filtered.map((r,i) => {
                const ss=stStyle[r.status]||{}; const tc=r.type==='PO'?{color:'#2563eb',bg:'#eff6ff'}:{color:'#7c3aed',bg:'#f5f3ff'}
                return (
                  <tr key={i} onMouseEnter={e=>e.currentTarget.style.background='#fafafa'} onMouseLeave={e=>e.currentTarget.style.background=''}>
                    <td style={{ padding:'9px 12px', borderBottom:'1px solid #f9fafb' }}><span style={{ background:tc.bg, color:tc.color, fontSize:10, fontWeight:700, padding:'2px 7px', borderRadius:4 }}>{r.type}</span></td>
                    <td style={{ padding:'9px 12px', borderBottom:'1px solid #f9fafb', fontFamily:'monospace', fontSize:12, fontWeight:700 }}>{r.ref}</td>
                    <td style={{ padding:'9px 12px', borderBottom:'1px solid #f9fafb', fontSize:12, fontWeight:600 }}>{r.party}</td>
                    <td style={{ padding:'9px 12px', borderBottom:'1px solid #f9fafb', fontSize:11, color:'#6b7280' }}>{r.order?`${r.order.style_number} · ${r.order.buyer_name}`:'—'}</td>
                    <td style={{ padding:'9px 12px', borderBottom:'1px solid #f9fafb', fontSize:11, fontWeight:r.status==='Overdue'?700:400, color:r.status==='Overdue'?'#dc2626':'#374151', whiteSpace:'nowrap' }}>
                      {r.date?new Date(r.date).toLocaleDateString('en-GB',{day:'numeric',month:'short',year:'numeric'}):'—'}{r.status==='Overdue'?' ▲':''}
                    </td>
                    <td style={{ padding:'9px 12px', borderBottom:'1px solid #f9fafb', fontSize:11, color:'#6b7280', maxWidth:200, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{r.summary}</td>
                    <td style={{ padding:'9px 12px', borderBottom:'1px solid #f9fafb', fontSize:11, fontFamily:'monospace', fontWeight:600 }}>{r.value}</td>
                    <td style={{ padding:'9px 12px', borderBottom:'1px solid #f9fafb' }}><span style={{ background:ss.bg||'#f9fafb', color:ss.color||'#6b7280', fontSize:10, fontWeight:600, padding:'2px 7px', borderRadius:4 }}>{r.status}</span></td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>
    </>
  )
}

const TABS = [
  { id:'demand',     label:'Material Demand' },
  { id:'pos',        label:'Purchase Orders' },
  { id:'workorders', label:'Work Orders' },
  { id:'deliveries', label:'Expected Deliveries' },
]

export default function Purchasing() {
  const [tab, setTab] = useState('demand')
  const [orders, setOrders] = useState([])
  const [suppliers, setSuppliers] = useState([])

  useEffect(() => {
    supabase.from('orders').select('id,job_id,job_number,buyer_name,style_number,description,total_qty,buyer_id').not('status','eq','Cancelled').order('job_number').then(({data})=>setOrders(data||[]))
    supabase.from('suppliers').select('id,name,address,phone').order('name').then(({data})=>setSuppliers(data||[]))
  }, [])

  const tabStyle = t => ({ padding:'0 16px', height:44, background:'none', border:'none', cursor:'pointer', fontSize:13, fontWeight:tab===t?600:400, color:tab===t?'#0d0d0d':'#6b7280', borderBottom:`2px solid ${tab===t?'#0d0d0d':'transparent'}`, marginBottom:-1, fontFamily:'Inter,sans-serif' })

  return (
    <div style={{ display:'flex', flexDirection:'column', height:'100%', background:'#fff' }}>
      <div style={{ padding:'16px 24px 0', flexShrink:0 }}>
        <h1 style={{ fontSize:20, fontWeight:800, letterSpacing:'-0.4px', marginBottom:2 }}>Purchasing</h1>
        <div style={{ fontSize:11, color:'#9ca3af', marginBottom:12 }}>Material demand, purchase orders and work orders</div>
        <div style={{ display:'flex', borderBottom:'1px solid #e5e7eb' }}>
          {TABS.map(t => <button key={t.id} style={tabStyle(t.id)} onClick={()=>setTab(t.id)}>{t.label}</button>)}
        </div>
      </div>
      {tab==='demand'     && <DemandTab     suppliers={suppliers} />}
      {tab==='pos'        && <POsTab        orders={orders} suppliers={suppliers} />}
      {tab==='workorders' && <WorkOrdersTab orders={orders} suppliers={suppliers} />}
      {tab==='deliveries' && <DeliveriesTab orders={orders} suppliers={suppliers} />}
    </div>
  )
}
