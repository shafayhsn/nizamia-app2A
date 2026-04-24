import React, { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { Search, Plus, Trash2, X, Lock, Unlock, Printer, Pencil } from 'lucide-react'
import { generatePONumber, generateWONumber } from '../lib/utils'
import { printPurchaseOrder, printWorkOrder } from '../components/PrintReports'
import { getPageTabNoticeMap, markTabSeen, markTabUpdated } from '../lib/tabNotices'

function fmtDate(d) {
  if (!d) return '—'
  return new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
}
const today = new Date(); today.setHours(0,0,0,0)
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
function normText(v) {
  return String(v || '').trim().toLowerCase()
}
function pickKnownName(raw, options = []) {
  const rawNorm = normText(raw)
  if (!rawNorm) return null
  const direct = options.find(opt => normText(opt) === rawNorm)
  if (direct) return direct
  return options.find(opt => rawNorm.includes(normText(opt)) || normText(opt).includes(rawNorm)) || null
}

function usageNumeric(v) {
  if (v == null) return 0
  if (typeof v === 'number') return Number.isFinite(v) ? v : 0
  if (typeof v === 'string') {
    const n = parseFloat(v)
    return Number.isFinite(n) ? n : 0
  }
  if (typeof v === 'object') {
    if (v.na || v.disabled) return 0
    const candidate = v.value ?? v.qty ?? v.consumption ?? v.cons ?? v.amount ?? 0
    const n = parseFloat(candidate)
    return Number.isFinite(n) ? n : 0
  }
  return 0
}
const mkInp = (locked, extra) => ({ width:'100%', height:32, padding:'0 10px', border:'1px solid #e5e7eb', borderRadius:6, fontSize:12, fontFamily:'Inter,sans-serif', outline:'none', background:locked?'#f9f9f9':'#fff', ...(extra||{}) })
const mkSel = (locked) => ({ ...mkInp(locked), cursor:locked?'not-allowed':'pointer' })
const lbl = { fontSize:11, fontWeight:500, color:'#6b7280', display:'block', marginBottom:4 }
const PASSKEY = 'admin'

const PO_TAX_RATE_KEY = 'nizamia_po_sales_tax_rate'
const SPEC_BREAKDOWN_RE = /\n?\[Break-down:\s*([\s\S]*)\]\s*$/i
const NOTES_TAX_RE = /\n?\[PO_TAX:(\{.*?\})\]\s*$/i
function getSavedTaxRate() {
  const n = parseFloat(localStorage.getItem(PO_TAX_RATE_KEY))
  return Number.isFinite(n) ? n : 18
}
function encodeSpec(spec, breakdown) {
  const clean = String(spec || '').replace(SPEC_BREAKDOWN_RE, '').trim()
  const bd = String(breakdown || '').trim()
  return bd ? `${clean}${clean ? '\n' : ''}[Break-down: ${bd}]` : clean
}
function decodeSpec(spec) {
  const raw = String(spec || '')
  const m = raw.match(SPEC_BREAKDOWN_RE)
  return { specification: raw.replace(SPEC_BREAKDOWN_RE, '').trim(), breakdown: m ? m[1].trim() : '' }
}
function encodeNotes(notes, taxEnabled, taxRate) {
  const clean = String(notes || '').replace(NOTES_TAX_RE, '').trim()
  const meta = `[PO_TAX:${JSON.stringify({ enabled: !!taxEnabled, rate: parseFloat(taxRate) || 0 })}]`
  return `${clean}${clean ? '\n' : ''}${meta}`
}
function decodeNotes(notes) {
  const raw = String(notes || '')
  const m = raw.match(NOTES_TAX_RE)
  let tax = null
  if (m) { try { tax = JSON.parse(m[1]) } catch { tax = null } }
  return { notes: raw.replace(NOTES_TAX_RE, '').trim(), tax }
}
function hydratePOItems(rows = []) {
  return (rows || []).map((row, idx) => {
    const dec = decodeSpec(row.specification)
    return { ...row, _id: row._id || row.id || String(idx), specification: dec.specification, breakdown: row.breakdown || dec.breakdown }
  })
}

function extractModalQReference(items = [], order = null) {
  const refs = new Set()
  ;(items || []).forEach(it => {
    const dec = decodeSpec(it.specification)
    const txt = `${it.breakdown || dec.breakdown || ''} ${it.specification || ''} ${it.q_number || ''}`
    ;(txt.match(/Q\d+/gi) || []).forEach(q => refs.add(q.toUpperCase()))
  })
  return Array.from(refs).join(', ') || order?.q_number || '—'
}

const TH = ({ children, right }) => (
  <th style={{ fontSize:10, fontWeight:600, color:'#9ca3af', padding:'9px 12px', textAlign:right?'right':'left', textTransform:'uppercase', letterSpacing:'0.5px', borderBottom:'1px solid #f3f4f6', whiteSpace:'nowrap' }}>{children}</th>
)
const TD = ({ children, style }) => (
  <td style={{ padding:'9px 12px', borderBottom:'1px solid #f9fafb', fontSize:12, ...(style||{}) }}>{children}</td>
)


function normalizeQueueBreakdown(rows = []) {
  const map = new Map()
  rows.forEach((row) => {
    const qNo = row?.q_number || ''
    const qRef = qNo || row?.id || row?.label || ''
    if (!qRef) return
    const key = `${qRef}__${row?.unit || ''}`
    const existing = map.get(key)
    const qty = parseFloat(row?.req_qty) || 0
    if (existing) {
      existing.req_qty += qty
      if (!existing.label && row?.label) existing.label = row.label
      if (!existing.split_rule && row?.split_rule) existing.split_rule = row.split_rule
      return
    }
    map.set(key, {
      id: row?.id || key,
      q_number: qNo || null,
      label: row?.label || qNo || 'Queued',
      split_rule: row?.split_rule || '',
      req_qty: qty,
      unit: row?.unit || '',
      color_name: row?.color_name || '',
    })
  })
  return Array.from(map.values())
    .filter((row) => row.req_qty > 0)
    .sort((a, b) => String(a.q_number || a.label || '').localeCompare(String(b.q_number || b.label || ''), undefined, { numeric: true, sensitivity: 'base' }))
}

function PasskeyModal({ onUnlock, onClose }) {
  const [val, setVal] = useState('')
  const [err, setErr] = useState(false)
  const check = () => { if (val === PASSKEY) { onUnlock() } else { setErr(true); setVal('') } }
  return (
    <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.4)', zIndex:500, display:'flex', alignItems:'center', justifyContent:'center' }}>
      <div style={{ background:'#fff', borderRadius:10, padding:28, width:320, boxShadow:'0 16px 48px rgba(0,0,0,0.2)', textAlign:'center' }}>
        <Lock size={22} color="#0d0d0d" style={{ marginBottom:10 }} />
        <div style={{ fontSize:14, fontWeight:700, marginBottom:4 }}>Enter Passkey</div>
        <div style={{ fontSize:12, color:'#9ca3af', marginBottom:16 }}>This document is locked for editing.</div>
        <input type="password" value={val} onChange={e=>{ setVal(e.target.value); setErr(false) }}
          onKeyDown={e=>e.key==='Enter'&&check()} autoFocus placeholder="Passkey"
          style={{ width:'100%', height:38, padding:'0 12px', border:`1px solid ${err?'#dc2626':'#e5e7eb'}`, borderRadius:7, fontSize:14, textAlign:'center', letterSpacing:4, outline:'none', marginBottom:8, fontFamily:'Inter,sans-serif' }} />
        {err && <div style={{ fontSize:12, color:'#dc2626', marginBottom:8 }}>Incorrect passkey</div>}
        <div style={{ display:'flex', gap:8, justifyContent:'center' }}>
          <button className="btn btn-secondary" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" onClick={check}>Unlock</button>
        </div>
      </div>
    </div>
  )
}

function POModal({ po, orders, suppliers, prefillItems, onClose, onSaved }) {
  const isNew = !po
  const decodedPO = decodeNotes(po?.notes || '')
  const initialTaxRate = decodedPO.tax?.rate || getSavedTaxRate()
  const [taxEnabled, setTaxEnabled] = useState(isNew ? false : !!decodedPO.tax?.enabled)
  const [taxRate] = useState(initialTaxRate)
  const [form, setForm] = useState({
    po_number: po?.po_number||'', order_id: po?.order_id || prefillItems?.[0]?.order_id || '',
    supplier_id: po?.supplier_id||'',
    po_date: po?.po_date||new Date().toISOString().slice(0,10),
    delivery_date: po?.delivery_date||'', currency: po?.currency||'PKR',
    payment_terms: po?.payment_terms||'', status: po?.status||'Draft', notes: decodedPO.notes||'',
  })
  const [items, setItems] = useState(
    po?.items?.length ? hydratePOItems(po.items)
    : prefillItems?.length ? hydratePOItems(prefillItems)
    : [{ _id:'1', description:'', specification:'', breakdown:'', qty:'', unit:'yards', unit_rate:'', amount:'', source_type:null, source_id:null }]
  )
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)
  const [locked, setLocked] = useState(!isNew)
  const [showPasskey, setShowPasskey] = useState(false)

  const set = k => e => setForm(f=>({ ...f, [k]:e.target.value }))
  const updItem = (idx,k,v) => setItems(its => {
    const n=[...its]; n[idx]={ ...n[idx], [k]:v }
    if (k==='qty'||k==='unit_rate') {
      const q=parseFloat(k==='qty'?v:n[idx].qty)||0
      const r=parseFloat(k==='unit_rate'?v:n[idx].unit_rate)||0
      n[idx].amount = q*r ? (q*r).toFixed(2) : ''
    }
    return n
  })
  const total = items.reduce((s,i)=>s+(parseFloat(i.amount)||0),0)
  const taxAmount = taxEnabled ? total * ((parseFloat(taxRate)||0)/100) : 0
  const grandTotal = total + taxAmount
  const selectedOrder = orders.find(o => o.id === form.order_id)
  const qReference = extractModalQReference(items, selectedOrder)

  const handleSave = async () => {
    if (!form.supplier_id) { setError('Select a supplier'); return }
    setSaving(true)
    try {
      const poNum = form.po_number || await generatePONumber()
      const payload = { ...form, po_number:poNum, notes: encodeNotes(form.notes, taxEnabled, taxRate) }
      let poId
      if (po?.id) {
        await supabase.from('purchase_orders').update(payload).eq('id', po.id)
        poId = po.id
        await supabase.from('purchase_order_items').delete().eq('po_id', poId)
      } else {
        const { data:newPO, error:pe } = await supabase.from('purchase_orders').insert([payload]).select().single()
        if (pe) throw new Error(pe.message)
        poId = newPO.id
      }
      const rows = items.filter(i=>i.description).map((i,idx)=>({
        po_id:poId, description:i.description, specification:encodeSpec(i.specification, i.breakdown)||null,
        qty:parseFloat(i.qty)||null, unit:i.unit||null,
        unit_rate:parseFloat(i.unit_rate)||null, amount:parseFloat(i.amount)||null,
        source_type:i.source_type||null, source_id:i.source_id||null, sort_order:idx,
      }))
      if (rows.length) await supabase.from('purchase_order_items').insert(rows)
      markTabUpdated('purchasingPage', 'pos')
      onSaved()
    } catch(e) { setError(e.message) }
    setSaving(false)
  }

  const handlePrint = async () => {
    if (!po) return
    const supplier=suppliers.find(s=>s.id===po.supplier_id)
    const order=orders.find(o=>o.id===po.order_id)
    await printPurchaseOrder({ ...po, notes: encodeNotes(form.notes, taxEnabled, taxRate), items }, supplier, order, taxEnabled ? taxRate : null)
  }

  const handleDelete = async () => {
    if (!window.confirm(`Delete PO ${po.po_number}? This cannot be undone.`)) return
    try {
      await supabase.from('purchase_order_items').delete().eq('po_id', po.id)
      await supabase.from('purchase_orders').delete().eq('id', po.id)
      onClose()
      onSaved?.()
    } catch (e) {
      alert('Error deleting PO: ' + e.message)
    }
  }

  return (
    <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.45)', zIndex:300, display:'flex', alignItems:'center', justifyContent:'center', padding:24 }}>
      <div style={{ background:'#fff', borderRadius:12, width:'100%', maxWidth:860, maxHeight:'calc(100vh - 48px)', display:'flex', flexDirection:'column', boxShadow:'0 24px 80px rgba(0,0,0,0.22)', overflow:'hidden' }}>
        <div style={{ padding:'14px 24px', borderBottom:'1px solid #f0f0ee', display:'flex', alignItems:'center', gap:10 }}>
          <span style={{ fontSize:14, fontWeight:700 }}>{isNew?'New Purchase Order':`PO — ${po.po_number}`}</span>
          <div style={{ flex:1 }} />
          <button type="button" disabled={locked} onClick={()=>!locked&&setTaxEnabled(v=>!v)} style={{ border:`2px solid ${taxEnabled?'#0d0d0d':'#d1d5db'}`, background:taxEnabled?'#0d0d0d':'#fff', color:taxEnabled?'#fff':'#6b7280', borderRadius:999, padding:'7px 12px', fontSize:12, fontWeight:800, letterSpacing:'0.3px', cursor:locked?'not-allowed':'pointer' }}>
            GST {taxEnabled ? `${taxRate}% ON` : 'OFF'}
          </button>
          {!isNew && <button className="btn btn-secondary btn-sm" onClick={handlePrint}><Printer size={12} /> Print</button>}
          {!isNew && <button className="btn btn-secondary btn-sm" onClick={()=>locked?setShowPasskey(true):setLocked(true)}>{locked?<><Unlock size={12} /> Edit</>:<><Lock size={12} /> Lock</>}</button>}
          {!isNew && <button className="btn" style={{background:'#fee2e2',color:'#dc2626',border:'1px solid #fecaca'}} onClick={handleDelete}><Trash2 size={12} /> Delete</button>}
          <button style={{ background:'none', border:'none', cursor:'pointer', color:'#9ca3af' }} onClick={onClose}><X size={16} /></button>
        </div>
        <div style={{ flex:1, overflowY:'auto', padding:'20px 24px' }}>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:12, marginBottom:16 }}>
            <div><label style={lbl}>Supplier *</label>
              <select style={mkSel(locked)} value={form.supplier_id} onChange={set('supplier_id')} disabled={locked}>
                <option value="">Select supplier...</option>
                {suppliers.map(s=><option key={s.id} value={s.id}>{s.name}</option>)}
              </select></div>
            <div><label style={lbl}>Q#</label><input style={mkInp(true, { fontWeight:700, color:'#0d0d0d' })} value={qReference} disabled /></div>
            <div><label style={lbl}>PO Date</label><input style={mkInp(isNew || locked)} type="date" value={form.po_date} onChange={set('po_date')} disabled={isNew || locked} title="PO date is locked. Use Edit with admin password for existing PO changes." /></div>
            <div><label style={lbl}>Delivery Date</label><input style={mkInp(locked)} type="date" value={form.delivery_date} onChange={set('delivery_date')} disabled={locked} /></div>
            <div><label style={lbl}>Currency</label>
              <select style={mkSel(locked)} value={form.currency} onChange={set('currency')} disabled={locked}>
                {['PKR','USD','EUR','GBP'].map(c=><option key={c}>{c}</option>)}
              </select></div>
            <div><label style={lbl}>Payment Terms</label><input style={mkInp(locked)} value={form.payment_terms} onChange={set('payment_terms')} placeholder="e.g. 30 days net" disabled={locked} /></div>
            <div><label style={lbl}>Status</label>
              <select style={mkSel(locked)} value={form.status} onChange={set('status')} disabled={locked}>
                {['Draft','Issued','Acknowledged','Delivered','Cancelled'].map(s=><option key={s}>{s}</option>)}
              </select></div>
            <div style={{ gridColumn:'2 / 4' }}><label style={lbl}>Notes</label><input style={mkInp(locked)} value={form.notes} onChange={set('notes')} placeholder="Any notes..." disabled={locked} /></div>
          </div>
          <div style={{ fontSize:12, fontWeight:700, marginBottom:8 }}>Line Items</div>
          <table style={{ width:'100%', borderCollapse:'collapse', marginBottom:10 }}>
            <thead><tr>{['Description','Specification','Break-down','Qty','Unit','Unit Rate','Amount',''].map(h=>(
              <th key={h} style={{ fontSize:10, fontWeight:600, color:'#9ca3af', padding:'0 6px 8px', textAlign:'left', textTransform:'uppercase', letterSpacing:'0.5px', whiteSpace:'nowrap' }}>{h}</th>
            ))}</tr></thead>
            <tbody>{items.map((item,idx)=>(
              <tr key={item._id||idx}>
                <td style={{ padding:'3px 4px', minWidth:160 }}><input style={{ ...mkInp(locked), height:28 }} value={item.description} onChange={e=>updItem(idx,'description',e.target.value)} placeholder="Item description" disabled={locked} /></td>
                <td style={{ padding:'3px 4px', minWidth:130 }}><input style={{ ...mkInp(locked), height:28 }} value={item.specification||''} onChange={e=>updItem(idx,'specification',e.target.value)} placeholder="Spec" disabled={locked} /></td>
                <td style={{ padding:'3px 4px', width:110 }}><input style={{ ...mkInp(locked), height:28 }} value={item.breakdown||''} onChange={e=>updItem(idx,'breakdown',e.target.value)} placeholder="Size 4 / Q1" disabled={locked} /></td>
                <td style={{ padding:'3px 4px', width:80 }}><input style={{ ...mkInp(locked), height:28, textAlign:'right' }} type="number" value={item.qty} onChange={e=>updItem(idx,'qty',e.target.value)} disabled={locked} /></td>
                <td style={{ padding:'3px 4px', width:80 }}><select style={{ ...mkSel(locked), height:28 }} value={item.unit||'yards'} onChange={e=>updItem(idx,'unit',e.target.value)} disabled={locked}>{['yards','meters','cm','inch','ft','pcs','kg','gram','cone','set','sht','ctn','roll','ltr'].map(u=><option key={u}>{u}</option>)}</select></td>
                <td style={{ padding:'3px 4px', width:100 }}><input style={{ ...mkInp(locked), height:28, textAlign:'right' }} type="number" value={item.unit_rate} onChange={e=>updItem(idx,'unit_rate',e.target.value)} placeholder="0.00" disabled={locked} /></td>
                <td style={{ padding:'3px 4px', width:100, textAlign:'right', fontSize:12, fontWeight:700 }}>{item.amount?fmtNum(parseFloat(item.amount),2):'—'}</td>
                <td style={{ padding:'3px 0 3px 4px', width:30 }}>{!locked&&items.length>1&&<button className="btn btn-ghost btn-sm" onClick={()=>setItems(its=>its.filter((_,i)=>i!==idx))}><Trash2 size={10} /></button>}</td>
              </tr>
            ))}</tbody>
          </table>
          {!locked&&<button className="btn btn-secondary btn-sm" onClick={()=>setItems(its=>[...its,{_id:String(Date.now()),description:'',specification:'',breakdown:'',qty:'',unit:'yards',unit_rate:'',amount:'',source_type:null,source_id:null}])} style={{marginBottom:12}}><Plus size={12}/> Add Line</button>}
          {total>0&&<div style={{display:'flex',justifyContent:'flex-end',paddingRight:34}}><div style={{background:'#0d0d0d',color:'#fff',padding:'8px 16px',borderRadius:6,fontSize:13,fontWeight:700}}>Subtotal: {form.currency} {fmtNum(total,2)}{taxEnabled ? ` · GST ${taxRate}%: ${form.currency} ${fmtNum(taxAmount,2)} · Grand: ${form.currency} ${fmtNum(grandTotal,2)}` : ''}</div></div>}
          {error&&<div style={{marginTop:10,fontSize:12,color:'#dc2626'}}>{error}</div>}
        </div>
        <div style={{padding:'12px 24px',borderTop:'1px solid #f0f0ee',display:'flex',justifyContent:'flex-end',gap:8}}>
          <button className="btn btn-secondary" onClick={onClose}>Close</button>
          {!locked&&<button className="btn btn-primary" onClick={handleSave} disabled={saving}>{saving?'Saving...':isNew?'Create PO':'Save Changes'}</button>}
        </div>
      </div>
      {showPasskey&&<PasskeyModal onUnlock={()=>{setLocked(false);setShowPasskey(false)}} onClose={()=>setShowPasskey(false)}/>}
    </div>
  )
}

function WOModal({ wo, orders, suppliers, prefillProcessIds, prefillItems, onClose, onSaved }) {
  const isNew = !wo
  const [form, setForm] = useState({
    wo_number: wo?.wo_number||'', order_id: wo?.order_id||'',
    vendor_id: wo?.vendor_id||'', vendor_type: wo?.vendor_type||'external',
    vendor_phone: wo?.vendor_phone||'', factory_ref: wo?.factory_ref||'',
    issue_date: wo?.issue_date||new Date().toISOString().slice(0,10),
    start_date: wo?.start_date||'', complete_by: wo?.complete_by||'',
    daily_output: wo?.daily_output||'', payment_terms: wo?.payment_terms||'',
    color: wo?.color||'', qty: wo?.qty||'', status: wo?.status||'Draft', notes: wo?.notes||'',
  })
  const [orderProcesses, setOrderProcesses] = useState([])
  const [coverage, setCoverage] = useState({})
  const [items, setItems] = useState(wo?.items || prefillItems || [])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)
  const locked = false
  const [processesLoaded, setProcessesLoaded] = useState(false)

  const loadOrderProcesses = async (orderId, currentWoId) => {
    if (!orderId) { setOrderProcesses([]); setCoverage({}); setProcessesLoaded(true); return }
    const { data:procs } = await supabase.from('order_processes').select('id,process_name').eq('order_id', orderId).order('sort_order')
    setOrderProcesses(procs||[])
    if (procs?.length) {
      const procIds = procs.map(p=>p.id)
      const { data:lines } = await supabase.from('work_order_items').select('order_process_id,qty,wo_id').in('order_process_id', procIds)
      const cov = {}
      ;(lines||[]).forEach(l => {
        if (currentWoId && l.wo_id===currentWoId) return
        cov[l.order_process_id] = (cov[l.order_process_id]||0) + (parseFloat(l.qty)||0)
      })
      setCoverage(cov)
    }
    setProcessesLoaded(true)
  }

  useEffect(() => { if (form.order_id) loadOrderProcesses(form.order_id, wo?.id) }, []) // eslint-disable-line

  useEffect(() => {
    if (items.length) return
    if (prefillItems?.length) { setItems(prefillItems); return }
    if (!prefillProcessIds?.length || !processesLoaded || !orderProcesses.length) return
    const toAdd = orderProcesses.filter(p=>prefillProcessIds.includes(p.id))
    if (toAdd.length) setItems(toAdd.map(p=>({ _id:String(Date.now())+p.id, order_process_id:p.id, process_name:p.process_name, dept_info:'', qty:form.qty||'', unit:'pcs', rate:'', amount:'' })))
  }, [processesLoaded, orderProcesses, prefillItems]) // eslint-disable-line

  const handleOrderChange = async (orderId) => {
    setForm(f=>({ ...f, order_id:orderId }))
    setProcessesLoaded(false)
    await loadOrderProcesses(orderId, wo?.id)
    setItems([])
  }

  const toggleProcess = (proc) => {
    if (locked) return
    const exists = items.find(i=>i.order_process_id===proc.id)
    if (exists) setItems(its=>its.filter(i=>i.order_process_id!==proc.id))
    else setItems(its=>[...its,{ _id:String(Date.now()), order_process_id:proc.id, process_name:proc.process_name, dept_info:'', qty:form.qty||'', unit:'pcs', rate:'', amount:'' }])
  }

  const set = k => e => setForm(f=>({ ...f, [k]:e.target.value }))
  const updItem = (idx,k,v) => setItems(its=>{
    const n=[...its]; n[idx]={ ...n[idx], [k]:v }
    if (k==='qty'||k==='rate') {
      const q=parseFloat(k==='qty'?v:n[idx].qty)||0
      const r=parseFloat(k==='rate'?v:n[idx].rate)||0
      n[idx].amount = q*r?(q*r).toFixed(2):''
    }
    return n
  })
  const total = items.reduce((s,i)=>s+(parseFloat(i.amount)||0),0)
  const orderTotalQty = orders.find(o=>o.id===form.order_id)?.total_qty||0

  const handleSave = async () => {
    if (!form.vendor_id) { setError('Select a vendor'); return }
    setSaving(true)
    try {
      const woNum = form.wo_number || await generateWONumber()
      const payload = { ...form, wo_number:woNum, qty:parseInt(form.qty)||null, daily_output:parseInt(form.daily_output)||null }
      let woId
      if (wo?.id) {
        await supabase.from('work_orders').update(payload).eq('id', wo.id)
        woId = wo.id
        await supabase.from('work_order_items').delete().eq('wo_id', woId)
      } else {
        const { data:newWO, error:we } = await supabase.from('work_orders').insert([payload]).select().single()
        if (we) throw new Error(we.message)
        woId = newWO.id
      }
      const rows = items.filter(i=>i.process_name).map((i,idx)=>({
        wo_id:woId, order_process_id:i.order_process_id||null, process_name:i.process_name,
        dept_info:i.dept_info||null, qty:parseFloat(i.qty)||null, unit:i.unit||null,
        rate:parseFloat(i.rate)||null, amount:parseFloat(i.amount)||null, sort_order:idx,
      }))
      if (rows.length) await supabase.from('work_order_items').insert(rows)
      markTabUpdated('purchasingPage', 'wos')
      onSaved()
    } catch(e) { setError(e.message) }
    setSaving(false)
  }

  const handlePrint = async () => {
    if (!wo) return
    const vendor=suppliers.find(s=>s.id===wo.vendor_id)
    const order=orders.find(o=>o.id===wo.order_id)
    await printWorkOrder({ ...wo, items }, vendor, order)
  }

  const handleDelete = async () => {
    if (!window.confirm(`Delete WO ${wo.wo_number}? This cannot be undone.`)) return
    try {
      await supabase.from('work_order_items').delete().eq('wo_id', wo.id)
      await supabase.from('work_orders').delete().eq('id', wo.id)
      onClose()
      onSaved?.()
    } catch (e) {
      alert('Error deleting WO: ' + e.message)
    }
  }

  return (
    <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.45)', zIndex:300, display:'flex', alignItems:'center', justifyContent:'center', padding:24 }}>
      <div style={{ background:'#fff', borderRadius:12, width:'100%', maxWidth:860, maxHeight:'calc(100vh - 48px)', display:'flex', flexDirection:'column', boxShadow:'0 24px 80px rgba(0,0,0,0.22)', overflow:'hidden' }}>
        <div style={{ padding:'14px 24px', borderBottom:'1px solid #f0f0ee', display:'flex', alignItems:'center', gap:10 }}>
          <span style={{ fontSize:14, fontWeight:700 }}>{isNew?'New Work Order':`WO — ${wo.wo_number}`}</span>
          <div style={{ flex:1 }} />
          {!isNew&&<button className="btn btn-secondary btn-sm" onClick={handlePrint}><Printer size={12}/> Print</button>}
          {!isNew&&<button className="btn" style={{background:'#fee2e2',color:'#dc2626',border:'1px solid #fecaca'}} onClick={handleDelete}><Trash2 size={12}/> Delete</button>}
          <button style={{ background:'none', border:'none', cursor:'pointer', color:'#9ca3af' }} onClick={onClose}><X size={16}/></button>
        </div>
        <div style={{ flex:1, overflowY:'auto', padding:'20px 24px' }}>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:12, marginBottom:16 }}>
            <div><label style={lbl}>Vendor *</label>
              <select style={mkSel(locked)} value={form.vendor_id} onChange={set('vendor_id')} disabled={locked}>
                <option value="">Select vendor...</option>
                {suppliers.filter(s => form.vendor_type==='internal' ? s.category==='Contractors' : s.category!=='Contractors').map(s=><option key={s.id} value={s.id}>{s.name}</option>)}
              </select></div>
            <div><label style={lbl}>Vendor Type</label>
              <div style={{ display:'flex', gap:6, height:32, alignItems:'center' }}>
                {['internal','external'].map(t=>(
                  <button key={t} onClick={()=>!locked&&setForm(f=>({ ...f, vendor_type:t }))}
                    style={{ flex:1, height:32, borderRadius:6, border:'1px solid', fontSize:11, fontWeight:600, cursor:locked?'default':'pointer',
                      borderColor:form.vendor_type===t?(t==='internal'?'#2563eb':'#7c3aed'):'#e5e7eb',
                      background:form.vendor_type===t?(t==='internal'?'#eff6ff':'#f5f3ff'):'#fff',
                      color:form.vendor_type===t?(t==='internal'?'#2563eb':'#7c3aed'):'#6b7280' }}>
                    {t==='internal'?'Internal':'External / CMT'}
                  </button>
                ))}
              </div></div>
            <div><label style={lbl}>Vendor Phone</label><input style={mkInp(locked)} value={form.vendor_phone} onChange={set('vendor_phone')} placeholder="03xx-xxxxxxx" disabled={locked}/></div>
            <div><label style={lbl}>Order</label>
              <select style={mkSel(locked)} value={form.order_id} onChange={e=>handleOrderChange(e.target.value)} disabled={locked}>
                <option value="">— Not linked —</option>
                {orders.map(o=><option key={o.id} value={o.id}>{o.style_number} · {o.buyer_name}</option>)}
              </select></div>
            <div><label style={lbl}>Factory Ref</label><input style={mkInp(locked)} value={form.factory_ref} onChange={set('factory_ref')} disabled={locked}/></div>
            <div><label style={lbl}>Colour</label><input style={mkInp(locked)} value={form.color} onChange={set('color')} placeholder="e.g. Stone Blue" disabled={locked}/></div>
            <div><label style={lbl}>Qty (batch for this vendor)</label><input style={mkInp(locked)} type="number" value={form.qty} onChange={set('qty')} disabled={locked}/></div>
            <div><label style={lbl}>Issue Date</label><input style={mkInp(locked)} type="date" value={form.issue_date} onChange={set('issue_date')} disabled={locked}/></div>
            <div><label style={lbl}>Start Date</label><input style={mkInp(locked)} type="date" value={form.start_date} onChange={set('start_date')} disabled={locked}/></div>
            <div><label style={lbl}>Complete By</label><input style={mkInp(locked)} type="date" value={form.complete_by} onChange={set('complete_by')} disabled={locked}/></div>
            <div><label style={lbl}>Daily Output (pcs/day)</label><input style={mkInp(locked)} type="number" value={form.daily_output} onChange={set('daily_output')} disabled={locked}/></div>
            <div><label style={lbl}>Payment Terms</label><input style={mkInp(locked)} value={form.payment_terms} onChange={set('payment_terms')} placeholder="e.g. On completion" disabled={locked}/></div>
            <div><label style={lbl}>Status</label>
              <select style={mkSel(locked)} value={form.status} onChange={set('status')} disabled={locked}>
                {['Draft','Issued','In Progress','Completed','Cancelled'].map(s=><option key={s}>{s}</option>)}
              </select></div>
          </div>
          {orderProcesses.length>0&&(
            <div style={{ marginBottom:16 }}>
              <div style={{ fontSize:12, fontWeight:700, marginBottom:6 }}>
                Processes
                {orderTotalQty>0&&<span style={{ fontSize:11, color:'#9ca3af', fontWeight:400, marginLeft:6 }}>Order total: {orderTotalQty.toLocaleString()} pcs — click to assign</span>}
              </div>
              <div style={{ display:'flex', flexWrap:'wrap', gap:6 }}>
                {orderProcesses.map(proc=>{
                  const on=items.some(i=>i.order_process_id===proc.id)
                  const covQty=coverage[proc.id]||0
                  const pct=orderTotalQty?Math.min(100,Math.round((covQty/orderTotalQty)*100)):null
                  const full=pct!==null&&pct>=100
                  return (
                    <button key={proc.id} onClick={()=>toggleProcess(proc)}
                      style={{ padding:'5px 10px', borderRadius:6, fontSize:11, fontWeight:600, border:'1px solid', cursor:locked?'default':'pointer',
                        borderColor:on?'#0d0d0d':full?'#d1fae5':'#e5e7eb',
                        background:on?'#0d0d0d':full?'#f0fdf4':'#fafafa',
                        color:on?'#fff':full?'#16a34a':'#374151' }}>
                      {proc.process_name}
                      {pct!==null&&!on&&<span style={{ marginLeft:5, fontSize:10, color:full?'#16a34a':covQty>0?'#d97706':'#9ca3af' }}>{full?'✓':covQty>0?`${pct}%`:'0%'}</span>}
                    </button>
                  )
                })}
              </div>
            </div>
          )}
          <div style={{ fontSize:12, fontWeight:700, marginBottom:8 }}>Work Order Items</div>
          {items.length===0?(
            <div style={{ fontSize:12, color:'#9ca3af', marginBottom:12, fontStyle:'italic' }}>{orderProcesses.length>0?'Select processes above to add line items.':'Add items manually below.'}</div>
          ):(
            <table style={{ width:'100%', borderCollapse:'collapse', marginBottom:10 }}>
              <thead><tr>{['Process','Dept / Info','Qty','Unit','Rate (PKR)','Amount',''].map(h=>(
                <th key={h} style={{ fontSize:10, fontWeight:600, color:'#9ca3af', padding:'0 6px 8px', textAlign:'left', textTransform:'uppercase', letterSpacing:'0.5px' }}>{h}</th>
              ))}</tr></thead>
              <tbody>{items.map((item,idx)=>(
                <tr key={item._id||idx}>
                  <td style={{ padding:'3px 4px', minWidth:130 }}><input style={{ ...mkInp(locked), height:28 }} value={item.process_name} onChange={e=>updItem(idx,'process_name',e.target.value)} placeholder="Process" disabled={locked}/></td>
                  <td style={{ padding:'3px 4px', minWidth:110 }}><input style={{ ...mkInp(locked), height:28 }} value={item.dept_info||''} onChange={e=>updItem(idx,'dept_info',e.target.value)} placeholder="Dept/info" disabled={locked}/></td>
                  <td style={{ padding:'3px 4px', width:80 }}><input style={{ ...mkInp(locked), height:28, textAlign:'right' }} type="number" value={item.qty} onChange={e=>updItem(idx,'qty',e.target.value)} disabled={locked}/></td>
                  <td style={{ padding:'3px 4px', width:70 }}><select style={{ ...mkSel(locked), height:28 }} value={item.unit||'pcs'} onChange={e=>updItem(idx,'unit',e.target.value)} disabled={locked}>{['pcs','yards','meters','cm','inch','ft','kg','gram','set'].map(u=><option key={u}>{u}</option>)}</select></td>
                  <td style={{ padding:'3px 4px', width:90 }}><input style={{ ...mkInp(locked), height:28, textAlign:'right' }} type="number" value={item.rate} onChange={e=>updItem(idx,'rate',e.target.value)} placeholder="0.00" disabled={locked}/></td>
                  <td style={{ padding:'3px 4px', width:90, textAlign:'right', fontSize:12, fontWeight:700 }}>{item.amount?fmtNum(parseFloat(item.amount),2):'—'}</td>
                  <td style={{ padding:'3px 0 3px 4px', width:30 }}>{!locked&&<button className="btn btn-ghost btn-sm" onClick={()=>setItems(its=>its.filter((_,i)=>i!==idx))}><Trash2 size={10}/></button>}</td>
                </tr>
              ))}</tbody>
            </table>
          )}
          {!locked&&<button className="btn btn-secondary btn-sm" onClick={()=>setItems(its=>[...its,{_id:String(Date.now()),order_process_id:null,process_name:'',dept_info:'',qty:'',unit:'pcs',rate:'',amount:''}])} style={{marginBottom:12}}><Plus size={12}/> Add Line Manually</button>}
          {total>0&&<div style={{display:'flex',justifyContent:'flex-end',paddingRight:34}}><div style={{background:'#0d0d0d',color:'#fff',padding:'8px 16px',borderRadius:6,fontSize:13,fontWeight:700}}>Total: PKR {fmtNum(total,2)}</div></div>}
          <div style={{ marginTop:12 }}>
            <label style={lbl}>Notes / Special Instructions</label>
            <textarea style={{ ...mkInp(locked), height:60, resize:'vertical', padding:'8px 10px' }} value={form.notes} onChange={set('notes')} disabled={locked}/>
          </div>
          {error&&<div style={{marginTop:10,fontSize:12,color:'#dc2626'}}>{error}</div>}
        </div>
        <div style={{padding:'12px 24px',borderTop:'1px solid #f0f0ee',display:'flex',justifyContent:'flex-end',gap:8}}>
          <button className="btn btn-secondary" onClick={onClose}>Close</button>
          <button className="btn btn-primary" onClick={handleSave} disabled={saving}>{saving?'Saving...':isNew?'Create WO':'Save Changes'}</button>
        </div>
      </div>
    </div>
  )
}

// ── Tab 1: Material Demand ────────────────────────────────────────────────────
function MaterialDemandTab({ suppliers }) {
  const [orders, setOrders] = useState([])
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [filterCat, setFilterCat] = useState('')
  const [selected, setSelected] = useState(new Set())
  const [showPOModal, setShowPOModal] = useState(false)
  const [expanded, setExpanded] = useState({})
  const poDataMapRef = React.useRef({})

  useEffect(() => { load() }, [])

  async function load() {
    setLoading(true)
    try {
      const { data:ords, error:ordersError } = await supabase.from('orders').select('id,job_id,job_number,buyer_name,style_number,total_qty,queue_split_rule').not('status','eq','Cancelled').order('job_number')
      if (ordersError) throw ordersError
      const allOrds = ords||[]
      const jobOrds = allOrds.filter(o=>o.job_id)
      setOrders(allOrds)
      if (!jobOrds.length) { setRows([]); setLoading(false); return }
      const idSet = new Set(jobOrds.map(o=>o.id))
      const idArr = Array.from(idSet)
      const [{ data:bom, error:bomError }, { data:emb, error:embError }, { data:wash, error:washError }, { data:poItems, error:poItemsError }, { data:sizeGroups, error:sizeGroupsError }, { data:queues, error:queuesError }] = await Promise.all([
      supabase.from('bom_items').select('id,order_id,name,category,specification,detail,unit,supplier_id,usage_rule,usage_data,base_qty,wastage,final_qty,po_status,use_cutting_qty,sort_order').order('sort_order'),
      supabase.from('embellishments').select('id,order_id,description,technique,placement,dimensions,qty,unit,vendor_id,applies_to,usage_rule,usage_data'),
      supabase.from('washing').select('id,order_id,color_id,color_name,wash_type,wash_ref,qty,unit,vendor_id'),
      supabase.from('purchase_order_items').select('qty,source_type,source_id'),
      supabase.from('size_groups').select('id,order_id,group_name,sizes,base_size').in('order_id', idArr),
      supabase.from('order_queues').select('id,order_id,q_number,label,split_rule,color_name,size_group_id,qty,status,sort_order').in('order_id', idArr).order('sort_order'),
    ])

    const sgIds = (sizeGroups||[]).map(g=>g.id)
    let sgColors = [], sgBreakdown = []
    if (sgIds.length) {
      const [{ data:colors }, { data:bd }] = await Promise.all([
        supabase.from('size_group_colors').select('id,size_group_id,color_name,sort_order').in('size_group_id', sgIds),
        supabase.from('size_group_breakdown').select('size_group_id,color_id,size,qty').in('size_group_id', sgIds),
      ])
      sgColors = colors||[]
      sgBreakdown = bd||[]
    }

    const poDataMap = {}
    for (const g of (sizeGroups||[])) {
      if (!poDataMap[g.order_id]) {
        poDataMap[g.order_id] = {
          colors:[], sizeGroups:[], allSizes:[], sgMatrix:[],
          sgColorTotals:{}, sgColorSizeMatrix:{}, sizeGroupMap:{},
        }
      }
      const pd = poDataMap[g.order_id]
      pd.sizeGroupMap[g.id] = { id:g.id, name:g.group_name, sizes:g.sizes||[], base_size:g.base_size || null }
      const colors = sgColors.filter(c=>c.size_group_id===g.id)
      const bdMap = {}
      sgBreakdown.filter(b=>b.size_group_id===g.id).forEach(b=>{
        if (!bdMap[b.color_id]) bdMap[b.color_id]={}
        bdMap[b.color_id][b.size]=(bdMap[b.color_id][b.size]||0)+b.qty
      })
      pd.sgColorSizeMatrix[g.group_name] = pd.sgColorSizeMatrix[g.group_name] || {}
      pd.sgColorTotals[g.group_name] = pd.sgColorTotals[g.group_name] || {}
      for (const c of colors) {
        const sizeMap = {}
        for (const sz of (g.sizes||[])) {
          sizeMap[sz] = parseInt(bdMap[c.id]?.[sz]) || 0
        }
        const cQty = Object.values(sizeMap).reduce((s,v)=>s+v,0)
        pd.colors.push({ name:c.color_name, qty:cQty })
        pd.sgColorSizeMatrix[g.group_name][c.color_name] = sizeMap
        pd.sgColorTotals[g.group_name][c.color_name] = cQty
      }
      const sgQty = colors.reduce((s,c)=>s+(g.sizes||[]).reduce((ss,sz)=>ss+(parseInt(bdMap[c.id]?.[sz])||0),0),0)
      pd.sizeGroups.push({ id:g.id, name:g.group_name, qty:sgQty })
      for (const sz of (g.sizes||[])) {
        const szQty = colors.reduce((s,c)=>s+(parseInt(bdMap[c.id]?.[sz])||0),0)
        const ex = pd.allSizes.find(x=>x.size===sz)
        if (ex) ex.qty += szQty; else pd.allSizes.push({ size:sz, qty:szQty })
      }
      pd.sgMatrix.push({
        sgName: g.group_name,
        colors: colors.map(c => ({
          colorName: c.color_name,
          sizes: (g.sizes||[]).map(sz => ({ size: sz, qty: parseInt(bdMap[c.id]?.[sz]) || 0 })),
          qty: (g.sizes||[]).reduce((s,sz)=>s+(parseInt(bdMap[c.id]?.[sz])||0),0),
        })),
      })
    }

    const calcReqQty = (b, ord) => {
      const wastage = parseFloat(b.wastage) || 5
      const rule = b.usage_rule || 'Generic'
      const ud = b.usage_data
      const pd = poDataMap[b.order_id]
      if (rule === 'Generic') {
        const base = parseFloat(b.base_qty) || 0
        const total = parseFloat(ord.total_qty) || 0
        if (!base || !total) return 0
        return base * total * (1 + wastage / 100)
      }
      if (!ud || !pd) return parseFloat(b.base_qty) || 0
      if (rule === 'By Color') {
        return Object.entries(ud).reduce((s,[n,cons])=>{
          const totalColorQty = (pd.colors||[]).filter(c=>c.name===n).reduce((ss,c)=>ss+(c.qty||0),0)
          return s + usageNumeric(cons) * totalColorQty * (1+wastage/100)
        },0)
      }
      if (rule === 'By Size Group') {
        return Object.entries(ud).reduce((s,[n,cons])=>{
          const g = pd.sizeGroups.find(x=>x.name===n)
          return s + usageNumeric(cons) * (g?.qty||0) * (1+wastage/100)
        },0)
      }
      if (rule === 'By Individual Sizes') {
        return Object.entries(ud).reduce((s,[sz,cons])=>{
          const found = pd.allSizes.find(x=>x.size===sz)
          return s + usageNumeric(cons) * (found?.qty||0) * (1+wastage/100)
        },0)
      }
      if (rule === 'By Batch') {
        const batches = ud.__batches || []
        return batches.reduce((sum, b) => {
          const qty = (b.cells || []).reduce((sq, cell) => {
            const sg = (pd.sgMatrix || []).find(x => normText(x.sgName) === normText(cell.sgName))
            const c = sg?.colors.find(x => normText(x.colorName) === normText(cell.colorName))
            if (cell.size) return sq + (parseFloat((c?.sizes || []).find(sz => normText(sz.size) === normText(cell.size))?.qty) || 0)
            return sq + (parseFloat(c?.qty) || 0)
          }, 0)
          return sum + usageNumeric(b.consumption) * qty * (1+wastage/100)
        }, 0)
      }
      if (rule === 'Configure Own') {
        if (ud.__matrix) {
          return ud.__matrix.reduce((s,m)=>{
            const sg = (pd.sgMatrix||[]).find(x=>x.sgName===m.sgName)
            const c  = sg?.colors.find(x=>x.colorName===m.colorName)
            return s + usageNumeric(m.consumption) * (c?.qty||0) * (1+wastage/100)
          },0)
        }
        const groups = ud.__groups||[]
        return groups.reduce((s,g)=>{
          const gQty = (g.sizes||[]).reduce((sq,sz)=>sq+(pd.allSizes.find(x=>x.size===sz)?.qty||0),0)
          return s + usageNumeric(g.consumption) * gQty * (1+wastage/100)
        },0)
      }
      return parseFloat(b.base_qty) || 0
    }

    const getQueueContext = (q, pd) => {
      const splitRule = q.split_rule || 'None'
      const label = String(q.label || '').trim()
      const splitParts = label.split('/').map(x => x.trim()).filter(Boolean)
      const knownColors = (pd?.colors || []).map(c => c.name)
      const knownGroups = (pd?.sizeGroups || []).map(g => g.name)
      const inferredColor = pickKnownName(splitParts[0], knownColors)
      const inferredGroup = pickKnownName(splitParts[splitParts.length - 1], knownGroups)
      const queueColorName = pickKnownName(q.color_name, knownColors) || inferredColor || null
      const groupFromId = q.size_group_id ? (pd?.sizeGroupMap?.[q.size_group_id]?.name || null) : null
      const groupName = pickKnownName(groupFromId, knownGroups) || inferredGroup || null
      const includeCell = (sgName, colorName) => {
        const sgMatch = !groupName || normText(sgName) === normText(groupName)
        const colorMatch = !queueColorName || normText(colorName) === normText(queueColorName)
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
            if (includeCell(sgName, colorName)) total += parseFloat(sizes?.[size]) || 0
          })
        })
        return total
      }
      const colorQtyForQueue = (colorNameWanted) => {
        let total = 0
        const matrix = pd?.sgColorTotals || {}
        Object.entries(matrix).forEach(([sgName, colorMap]) => {
          Object.entries(colorMap || {}).forEach(([colorName, qty]) => {
            if (colorName !== colorNameWanted) return
            if (includeCell(sgName, colorName)) total += parseFloat(qty) || 0
          })
        })
        return total
      }
      const sizeGroupQtyForQueue = (sgNameWanted) => {
        let total = 0
        const matrix = pd?.sgColorTotals || {}
        Object.entries(matrix).forEach(([sgName, colorMap]) => {
          if (sgName !== sgNameWanted) return
          Object.entries(colorMap || {}).forEach(([colorName, qty]) => {
            if (includeCell(sgName, colorName)) total += parseFloat(qty) || 0
          })
        })
        return total
      }
      const queueQty = parseFloat(q.qty) || 0
      return { groupName, splitRule, queueColorName, includeCell, sizeQtyForQueue, colorQtyForQueue, sizeGroupQtyForQueue, queueQty }
    }

    const calcReqQtyForQueue = (b, ord, q) => {
      const pd = poDataMap[b.order_id]
      if (!pd) return 0
      const { groupName, queueColorName, queueQty, sizeQtyForQueue, colorQtyForQueue, sizeGroupQtyForQueue } = getQueueContext(q, pd)
      const rule = b.usage_rule || 'Generic'
      const ud = b.usage_data || {}
      const wastageFactor = 1 + ((parseFloat(b.wastage) || 5) / 100)
      if (rule === 'Generic') {
        const base = parseFloat(b.base_qty) || 0
        return base * queueQty * wastageFactor
      }
      if (rule === 'By Color') {
        return Object.entries(ud).reduce((s,[colorName, cons]) => s + (usageNumeric(cons) * colorQtyForQueue(colorName) * wastageFactor), 0)
      }
      if (rule === 'By Size Group') {
        return Object.entries(ud).reduce((s,[sgName, cons]) => s + (usageNumeric(cons) * sizeGroupQtyForQueue(sgName) * wastageFactor), 0)
      }
      if (rule === 'By Individual Sizes') {
        return Object.entries(ud).reduce((s,[size, cons]) => s + (usageNumeric(cons) * sizeQtyForQueue(size) * wastageFactor), 0)
      }
      if (rule === 'By Batch') {
        const batches = ud.__batches || []
        return batches.reduce((sum, b) => {
          const qty = (b.cells || []).reduce((sq, cell) => {
            const sgName = pickKnownName(cell.sgName, pd.sizeGroups.map(g => g.name)) || cell.sgName
            const colorName = pickKnownName(cell.colorName, pd.colors.map(c => c.name)) || cell.colorName
            if ((q.split_rule === 'Colour × Size Group' || q.split_rule === 'By Ratio') && (!groupName || !queueColorName)) return sq
            if (q.split_rule === 'By Size Group' && !groupName) return sq
            if ((q.split_rule === 'By Colour' || q.split_rule === 'By Wash') && !queueColorName) return sq
            const matchesGroup = !groupName || normText(sgName) === normText(groupName) || (q.split_rule === 'By Colour' && normText(queueColorName) === normText(colorName))
            const matchesColor = !queueColorName || normText(colorName) === normText(queueColorName) || q.split_rule === 'By Size Group'
            if (!matchesGroup || !matchesColor) return sq
            if (cell.size) return sq + (pd.sgColorSizeMatrix?.[sgName]?.[colorName]?.[cell.size] || 0)
            return sq + (pd.sgColorTotals?.[sgName]?.[colorName] || 0)
          }, 0)
          return sum + usageNumeric(b.consumption) * qty * wastageFactor
        }, 0)
      }
      if (rule === 'Configure Own') {
        if (ud.__matrix) {
          return ud.__matrix.reduce((s,m)=> {
            const sgName = pickKnownName(m.sgName, pd.sizeGroups.map(g => g.name)) || m.sgName
            const colorName = pickKnownName(m.colorName, pd.colors.map(c => c.name)) || m.colorName
            if ((q.split_rule === 'Colour × Size Group' || q.split_rule === 'By Ratio') && (!groupName || !queueColorName)) return s
            if (q.split_rule === 'By Size Group' && !groupName) return s
            if ((q.split_rule === 'By Colour' || q.split_rule === 'By Wash') && !queueColorName) return s
            const matchesGroup = !groupName || normText(sgName) === normText(groupName) || (q.split_rule === 'By Colour' && normText(queueColorName) === normText(colorName))
            const matchesColor = !queueColorName || normText(colorName) === normText(queueColorName) || q.split_rule === 'By Size Group'
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
      return 0
    }

    const calcEmbellishmentReqForQueue = (e, ord, q) => {
      const pd = poDataMap[e.order_id]
      const rule = e.usage_rule || 'Generic'
      const ud = e.usage_data || {}
      const queueQty = parseFloat(q.qty) || 0
      if (!pd) return parseFloat(e.qty) || queueQty || 0
      const { colorQtyForQueue, sizeGroupQtyForQueue, sizeQtyForQueue, groupName, queueColorName } = getQueueContext(q, pd)
      if (rule === 'By Color') return Object.entries(ud).reduce((s,[n,cons])=>s+(usageNumeric(cons)*colorQtyForQueue(n)),0)
      if (rule === 'By Size Group') return Object.entries(ud).reduce((s,[n,cons])=>s+(usageNumeric(cons)*sizeGroupQtyForQueue(n)),0)
      if (rule === 'By Individual Sizes') return Object.entries(ud).reduce((s,[sz,cons])=>s+(usageNumeric(cons)*sizeQtyForQueue(sz)),0)
      if (rule === 'Configure Own' && ud.__matrix) {
        return ud.__matrix.reduce((s,m)=> {
          const sgName = pickKnownName(m.sgName, pd.sizeGroups.map(g => g.name)) || m.sgName
          const colorName = pickKnownName(m.colorName, pd.colors.map(c => c.name)) || m.colorName
          if ((q.split_rule === 'Colour × Size Group' || q.split_rule === 'By Ratio') && (!groupName || !queueColorName)) return s
          if (q.split_rule === 'By Size Group' && !groupName) return s
          if ((q.split_rule === 'By Colour' || q.split_rule === 'By Wash') && !queueColorName) return s
          const matchesGroup = !groupName || normText(sgName) === normText(groupName) || (q.split_rule === 'By Colour' && normText(queueColorName) === normText(colorName))
          const matchesColor = !queueColorName || normText(colorName) === normText(queueColorName) || q.split_rule === 'By Size Group'
          if (!matchesGroup || !matchesColor) return s
          const cellQty = pd.sgColorTotals?.[sgName]?.[colorName] || 0
          return s + (usageNumeric(m.consumption) * cellQty)
        },0)
      }
      if (rule === 'Generic' && ud.generic) return (parseFloat(ud.generic) || 0) * queueQty
      return queueQty
    }

    poDataMapRef.current = poDataMap
    const purchasedMap = {}
    ;(poItems||[]).forEach(p=>{ if (p.source_id) purchasedMap[p.source_id]=(purchasedMap[p.source_id]||0)+(parseFloat(p.qty)||0) })
    const queuesByOrder = {}
    ;(queues || []).forEach(q => {
      if (!queuesByOrder[q.order_id]) queuesByOrder[q.order_id] = []
      queuesByOrder[q.order_id].push(q)
    })
    const built = []
    ;(bom||[]).filter(b=>idSet.has(b.order_id)).forEach(b=>{
      const ord=allOrds.find(o=>o.id===b.order_id); if (!ord) return
      const cat=b.category==='Fabric'?'Fabric':b.category==='Stitching Trim'?'S. Trim':'P. Trim'
      const req_qty = calcReqQty(b,ord)
      const queue_breakdown = normalizeQueueBreakdown((queuesByOrder[b.order_id] || []).map(q => ({
        id: `${b.id}_${q.id}`,
        q_number: q.q_number,
        label: q.label,
        split_rule: q.split_rule,
        req_qty: calcReqQtyForQueue(b, ord, q),
        unit: b.unit || '',
      })))
      const normalizedReqQty = queue_breakdown.length ? queue_breakdown.reduce((s, x) => s + (parseFloat(x.req_qty) || 0), 0) : req_qty
      const displayName = cat === 'Fabric' && b.specification ? `${b.name} — ${b.specification}` : b.name
      built.push({ id:b.id, order_id:b.order_id, order:ord, source_type:'bom', source_id:b.id, cat, name:displayName, specification:b.detail || b.specification || '', req_qty:normalizedReqQty, purchased:purchasedMap[b.id]||0, unit:b.unit||'', usage_rule:b.usage_rule, usage_data:b.usage_data, wastage:b.wastage, base_qty:b.base_qty, queue_breakdown })
    })
    ;(emb||[]).filter(e=>idSet.has(e.order_id)).forEach(e=>{
      const ord=allOrds.find(o=>o.id===e.order_id); if (!ord) return
      const ePd=poDataMap[e.order_id]
      const eRule=e.usage_rule||'Generic'
      const eUd=e.usage_data
      let eReqQty=parseFloat(e.qty)||parseFloat(ord.total_qty)||0
      if (eUd && ePd) {
        if (eRule==='By Color') { eReqQty=Object.entries(eUd).reduce((s,[n,cons])=>{ const totalColorQty = (ePd.colors||[]).filter(c=>c.name===n).reduce((ss,c)=>ss+(c.qty||0),0); return s+usageNumeric(cons)*totalColorQty },0)||eReqQty }
        else if (eRule==='By Size Group') { eReqQty=Object.entries(eUd).reduce((s,[n,cons])=>{ const g=ePd.sizeGroups.find(x=>x.name===n); return s+usageNumeric(cons)*(g?.qty||0) },0)||eReqQty }
        else if (eRule==='By Individual Sizes') { eReqQty=Object.entries(eUd).reduce((s,[sz,cons])=>{ const f=ePd.allSizes.find(x=>x.size===sz); return s+usageNumeric(cons)*(f?.qty||0) },0)||eReqQty }
        else if (eRule==='Configure Own'&&eUd.__matrix) { eReqQty=eUd.__matrix.reduce((s,m)=>{ const sg=ePd.sgMatrix?.find(x=>x.sgName===m.sgName); const c=sg?.colors.find(x=>x.colorName===m.colorName); return s+usageNumeric(m.consumption)*(c?.qty||0) },0)||eReqQty }
        else if (eRule==='By Batch'&&eUd.__batches) { eReqQty=eUd.__batches.reduce((sum,b)=>sum+usageNumeric(b.consumption)*(b.cells||[]).reduce((sq,cell)=>{ const sg=ePd.sgMatrix?.find(x=>x.sgName===cell.sgName); const c=sg?.colors.find(x=>x.colorName===cell.colorName); if (cell.size) return sq + (parseFloat((c?.sizes || []).find(sz => normText(sz.size) === normText(cell.size))?.qty) || 0); return sq+(c?.qty||0) },0),0)||eReqQty }
        else if (eRule==='Generic'&&eUd.generic) { eReqQty=usageNumeric(eUd.generic)*(parseFloat(ord.total_qty)||0)||eReqQty }
      }
      const queue_breakdown = normalizeQueueBreakdown((queuesByOrder[e.order_id] || []).map(q => ({
        id: `${e.id}_${q.id}`,
        q_number: q.q_number,
        label: q.label,
        split_rule: q.split_rule,
        req_qty: calcEmbellishmentReqForQueue(e, ord, q),
        unit: e.unit || 'pcs',
      })))
      const normalizedReqQty = queue_breakdown.length ? queue_breakdown.reduce((s, x) => s + (parseFloat(x.req_qty) || 0), 0) : eReqQty
      built.push({ id:e.id, order_id:e.order_id, order:ord, source_type:'embellishment', source_id:e.id, cat:'Embellishment', name:e.description||e.technique||'Embellishment', specification:[e.technique,e.placement,e.dimensions].filter(Boolean).join(' · '), req_qty:normalizedReqQty, purchased:purchasedMap[e.id]||0, unit:e.unit||'pcs', usage_rule:eRule, usage_data:eUd, queue_breakdown })
    })
    ;(wash||[]).filter(w=>idSet.has(w.order_id)).forEach(w=>{
      const ord=allOrds.find(o=>o.id===w.order_id); if (!ord) return
      const orderQueues = queuesByOrder[w.order_id] || []
      const queue_breakdown = orderQueues.map(q => {
        if (q.split_rule === 'By Colour' || q.split_rule === 'By Wash') return q.color_name === w.color_name ? { id:`${w.id}_${q.id}`, q_number:q.q_number, label:q.label, split_rule:q.split_rule, req_qty:parseFloat(q.qty)||0, unit:'pcs' } : null
        if (q.split_rule === 'Colour × Size Group' || q.split_rule === 'By Ratio') return q.color_name === w.color_name ? { id:`${w.id}_${q.id}`, q_number:q.q_number, label:q.label, split_rule:q.split_rule, req_qty:parseFloat(q.qty)||0, unit:'pcs' } : null
        if (q.split_rule === 'By Size Group') {
          const pd = poDataMap[w.order_id]
          const groupName = pd?.sizeGroupMap?.[q.size_group_id]?.name
          const qty = pd?.sgColorTotals?.[groupName]?.[w.color_name] || 0
          return qty ? { id:`${w.id}_${q.id}`, q_number:q.q_number, label:q.label, split_rule:q.split_rule, req_qty:qty, unit:'pcs' } : null
        }
        return { id:`${w.id}_${q.id}`, q_number:q.q_number, label:q.label, split_rule:q.split_rule, req_qty:parseFloat(q.qty)||0, unit:'pcs' }
      }).filter(Boolean)
      const req_qty = queue_breakdown.reduce((s,x)=>s+(parseFloat(x.req_qty)||0),0) || parseFloat(w.qty) || 0
      built.push({ id:w.id, order_id:w.order_id, order:ord, source_type:'washing', source_id:w.id, cat:'Wash', name:[w.wash_type,w.color_name].filter(Boolean).join(' — ')||'Washing', specification:w.wash_ref||'', req_qty, purchased:purchasedMap[w.id]||0, unit:'pcs', queue_breakdown })
    })
      if (bomError) throw bomError
      if (embError) throw embError
      if (washError) throw washError
      if (poItemsError) throw poItemsError
      if (sizeGroupsError) throw sizeGroupsError
      if (queuesError) throw queuesError

    const buildUsageBreakdown = (r) => {
      const pd = poDataMap[r.order_id]
      const rule = r.usage_rule || ''
      const ud = r.usage_data || {}
      const factor = 1 + ((parseFloat(r.wastage) || 0) / 100)
      if (!pd || !ud || typeof ud !== 'object') return []
      const unit = r.unit || 'pcs'
      if (rule === 'By Individual Sizes') {
        return Object.entries(ud).map(([size, cons]) => {
          const sz = pd.allSizes.find(x => normText(x.size) === normText(size))
          const qty = usageNumeric(cons) * (parseFloat(sz?.qty) || 0) * factor
          return qty > 0 ? { breakdown: `Size ${size}`, req_qty: qty, unit } : null
        }).filter(Boolean)
      }
      if (rule === 'By Color') {
        return Object.entries(ud).map(([color, cons]) => {
          const qty = (pd.colors || []).filter(c => normText(c.name) === normText(color)).reduce((sum, c) => sum + (parseFloat(c.qty) || 0), 0)
          const req = usageNumeric(cons) * qty * factor
          return req > 0 ? { breakdown: color, req_qty: req, unit } : null
        }).filter(Boolean)
      }
      if (rule === 'By Size Group') {
        return Object.entries(ud).map(([group, cons]) => {
          const g = (pd.sizeGroups || []).find(x => normText(x.name) === normText(group))
          const req = usageNumeric(cons) * (parseFloat(g?.qty) || 0) * factor
          return req > 0 ? { breakdown: group, req_qty: req, unit } : null
        }).filter(Boolean)
      }
      if (rule === 'By Batch' && Array.isArray(ud.__batches)) {
        return ud.__batches.map((b, ix) => {
          const qty = (b.cells || []).reduce((sq, cell) => {
            const sg = pickKnownName(cell.sgName, pd.sizeGroups.map(g => g.name)) || cell.sgName || ''
            const color = pickKnownName(cell.colorName, pd.colors.map(c => c.name)) || cell.colorName || ''
            if (cell.size) return sq + (pd.sgColorSizeMatrix?.[sg]?.[color]?.[cell.size] || 0)
            return sq + (pd.sgColorTotals?.[sg]?.[color] || 0)
          }, 0)
          const req = usageNumeric(b.consumption) * qty * factor
          const details = (b.cells || []).map(cell => [cell.sgName, cell.colorName, cell.size ? `Size ${cell.size}` : ''].filter(Boolean).join(' / ')).join(', ')
          return req > 0 ? { breakdown: `${b.name || `Batch ${ix+1}`}${details ? ` — ${details}` : ''}`, req_qty: req, unit } : null
        }).filter(Boolean)
      }
      if (rule === 'Configure Own' && Array.isArray(ud.__matrix)) {
        return ud.__matrix.map((m, ix) => {
          const sg = pickKnownName(m.sgName, pd.sizeGroups.map(g => g.name)) || m.sgName || ''
          const color = pickKnownName(m.colorName, pd.colors.map(c => c.name)) || m.colorName || ''
          const qty = pd.sgColorTotals?.[sg]?.[color] || 0
          const req = usageNumeric(m.consumption) * qty * factor
          return req > 0 ? { breakdown: [sg, color].filter(Boolean).join(' / ') || `Breakdown ${ix+1}`, req_qty: req, unit } : null
        }).filter(Boolean)
      }
      return []
    }

      built.forEach(r => { r.usage_breakdown = buildUsageBreakdown(r) })
      setRows(built)
    } catch (err) {
      console.error('MaterialDemandTab load failed', err)
      setRows([])
    } finally {
      setLoading(false)
    }
  }

  const filtered = rows.filter(r=>{
    const q=search.toLowerCase()
    return (!q||[r.name,r.order.buyer_name,r.order.style_number,r.order.job_number].some(f=>f?.toLowerCase().includes(q))) && (!filterCat||r.cat===filterCat)
  })
  const grouped = {}
  filtered.forEach(r=>{ if (!grouped[r.order_id]) grouped[r.order_id]={order:r.order,rows:[]}; grouped[r.order_id].rows.push(r) })
  const catStyle = { Fabric:{color:'#2563eb',bg:'#eff6ff'}, 'S. Trim':{color:'#d97706',bg:'#fff7ed'}, 'P. Trim':{color:'#7c3aed',bg:'#f5f3ff'}, Embellishment:{color:'#be185d',bg:'#fdf2f8'}, Wash:{color:'#0891b2',bg:'#ecfeff'} }
  const selStyle = { height:32, border:'1px solid #e5e7eb', borderRadius:7, fontSize:12, padding:'0 10px', background:'#fff', cursor:'pointer', fontFamily:'Inter,sans-serif' }
  const rowKey = (rowId) => `row:${rowId}`
  const qKey = (rowId, qRef) => `q:${rowId}:${qRef}`
  const queueRef = (q) => q?.q_number || q?.id || q?.label || 'queued'
  const selectedQueueKeysForRow = (r) => (r.queue_breakdown || []).map(q => qKey(r.id, queueRef(q))).filter(k => selected.has(k))
  const rowSelectionState = (r) => {
    const childKeys = (r.queue_breakdown || []).map(q => qKey(r.id, queueRef(q)))
    if (!childKeys.length) return { checked: selected.has(rowKey(r.id)), partial: false }
    const picked = childKeys.filter(k => selected.has(k)).length
    return { checked: picked === childKeys.length && picked > 0, partial: picked > 0 && picked < childKeys.length }
  }
  const toggleRowSelection = (r) => {
    const childKeys = (r.queue_breakdown || []).map(q => qKey(r.id, queueRef(q)))
    setSelected(prev => {
      const s = new Set(prev)
      if (!childKeys.length) {
        const key = rowKey(r.id)
        s.has(key) ? s.delete(key) : s.add(key)
        return s
      }
      const allSelected = childKeys.every(k => s.has(k))
      childKeys.forEach(k => { if (allSelected) s.delete(k); else s.add(k) })
      s.delete(rowKey(r.id))
      return s
    })
  }
  const toggleQueueSelection = (r, q) => {
    const key = qKey(r.id, queueRef(q))
    setSelected(prev => {
      const s = new Set(prev)
      s.has(key) ? s.delete(key) : s.add(key)
      s.delete(rowKey(r.id))
      return s
    })
  }
  const getAllSelectableKeys = () => filtered.flatMap(r => (r.queue_breakdown || []).length ? (r.queue_breakdown || []).map(q => qKey(r.id, queueRef(q))) : [rowKey(r.id)])
  const selectionCount = selected.size
  const buildQueueLine = (r, q) => ({
    _id: `${r.id}_${queueRef(q)}`,
    description: r.name,
    specification: r.specification || '',
    breakdown: `${q.label || q.q_number || 'Queued'}${q.q_number ? ' [' + q.q_number + ']' : ''}`,
    qty: q.req_qty || '',
    unit: q.unit || r.unit || 'pcs',
    unit_rate: '',
    amount: '',
    source_type: r.source_type,
    source_id: r.source_id,
    order_id: r.order_id,
    q_number: q.q_number || q.label || '',
  })
  const buildPrefill = () => {
    const lines = []
    for (const r of filtered) {
      const childKeys = selectedQueueKeysForRow(r)
      if (childKeys.length) {
        ;(r.queue_breakdown || []).forEach(q => {
          if (selected.has(qKey(r.id, queueRef(q)))) {
            const usageLines = r.usage_breakdown || []
            if (usageLines.length) usageLines.forEach((u, ix) => lines.push({ _id:`${r.id}_${queueRef(q)}_${ix}`, description:r.name, specification:r.specification, breakdown:`${u.breakdown}${q.q_number ? ' [' + q.q_number + ']' : ''}`, qty:u.req_qty||'', unit:u.unit||r.unit||'pcs', unit_rate:'', amount:'', source_type:r.source_type, source_id:r.source_id, order_id:r.order_id, q_number:q.q_number || q.label || '' }))
            else lines.push(buildQueueLine(r, q))
          }
        })
        continue
      }
      if (selected.has(rowKey(r.id))) {
        
        const usageLines = r.usage_breakdown || []
        if (usageLines.length) usageLines.forEach((u, ix) => lines.push({ _id:`${r.id}_${ix}`, description:r.name, specification:r.specification, breakdown:u.breakdown, qty:u.req_qty||'', unit:u.unit||r.unit||'pcs', unit_rate:'', amount:'', source_type:r.source_type, source_id:r.source_id, order_id:r.order_id, q_number:'' }))
        else lines.push({ _id:r.id, description:r.name, specification:r.specification, breakdown:'', qty:r.req_qty||'', unit:r.unit||'pcs', unit_rate:'', amount:'', source_type:r.source_type, source_id:r.source_id, order_id:r.order_id, q_number:'' })
      }
    }
    return lines
  }
  const balColor = (req,purch) => { const bal=req-purch; if (bal<=0) return '#16a34a'; if (purch>0) return '#d97706'; return '#374151' }
  const toggleExpanded = (id) => setExpanded(prev => ({ ...prev, [id]: !prev[id] }))

  return (
    <>
      <div style={{ padding:'10px 24px', borderBottom:'1px solid #f3f4f6', display:'flex', alignItems:'center', gap:8, flexShrink:0 }}>
        <div style={{ position:'relative', width:280 }}>
          <Search size={13} style={{ position:'absolute', left:9, top:'50%', transform:'translateY(-50%)', color:'#9ca3af' }}/>
          <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search item, style, buyer..." style={{ width:'100%', paddingLeft:28, height:32, border:'1px solid #e5e7eb', borderRadius:7, fontSize:12, fontFamily:'Inter,sans-serif', outline:'none', background:'#fafafa' }}/>
        </div>
        <select value={filterCat} onChange={e=>setFilterCat(e.target.value)} style={selStyle}>
          <option value="">All Categories</option>
          <option>Fabric</option><option>S. Trim</option><option>P. Trim</option><option>Embellishment</option><option>Wash</option>
        </select>
        <div style={{ marginLeft:'auto' }}>
          <button className="btn btn-primary btn-sm" onClick={()=>setShowPOModal(true)} disabled={selectionCount===0}>+ Generate PO {selectionCount>0?`(${selectionCount})`:''}</button>
        </div>
      </div>
      {selectionCount>0&&(
        <div style={{ padding:'7px 24px', background:'#eff6ff', borderBottom:'1px solid #dbeafe', display:'flex', alignItems:'center', gap:8, flexShrink:0 }}>
          <span style={{ fontSize:12, color:'#2563eb', fontWeight:600 }}>{selectionCount} selections ready for PO</span>
          <button className="btn btn-sm btn-secondary" onClick={()=>setSelected(new Set())}><X size={11}/> Clear</button>
        </div>
      )}
      <div style={{ flex:1, overflowY:'auto', overflowX:'auto' }}>
        {loading?<div style={{ padding:60, textAlign:'center', color:'#9ca3af', fontSize:12 }}>Loading...</div>
        :filtered.length===0?<div style={{ padding:60, textAlign:'center', color:'#9ca3af', fontSize:12 }}>{orders.filter(o=>o.job_id).length===0?'No job-assigned orders yet.':'No demand items found.'}</div>
        :(
          <table style={{ width:'100%', borderCollapse:'collapse', minWidth:980 }}>
            <thead><tr style={{ background:'#fafafa', position:'sticky', top:0, zIndex:10 }}>
              <th style={{ width:40, padding:'9px 0 9px 18px', borderBottom:'1px solid #f3f4f6' }}><input type="checkbox" checked={selectionCount===getAllSelectableKeys().length&&getAllSelectableKeys().length>0} onChange={()=>{ const keys=getAllSelectableKeys(); setSelected(selectionCount===keys.length?new Set():new Set(keys)) }}/></th>
              <th style={{ width:34, padding:'9px 6px', borderBottom:'1px solid #f3f4f6' }}></th>
              <TH>Cat</TH><TH>Item / Spec</TH><TH right>Required</TH><TH right>Purchased</TH><TH right>Balance</TH>
            </tr></thead>
            <tbody>
              {Object.values(grouped).map(grp=>(
                <React.Fragment key={grp.order.id}>
                  <tr><td colSpan={7} style={{ padding:'7px 18px', background:'#f9fafb', borderBottom:'1px solid #f0f0ee', borderTop:'1px solid #f0f0ee' }}>
                    <span style={{ fontSize:11, fontWeight:700, fontFamily:'monospace', color:'#0d0d0d' }}>{grp.order.job_number||'—'}</span>
                    <span style={{ fontSize:11, color:'#6b7280', marginLeft:8 }}>{grp.order.buyer_name} · {grp.order.style_number}</span>
                    {grp.order.total_qty&&<span style={{ fontSize:11, color:'#9ca3af', marginLeft:8 }}>{grp.order.total_qty.toLocaleString()} pcs</span>}
                    {grp.order.queue_split_rule && <span style={{ fontSize:10, color:'#7c3aed', background:'#f5f3ff', padding:'2px 7px', borderRadius:4, fontWeight:700, marginLeft:8 }}>{grp.order.queue_split_rule}</span>}
                  </td></tr>
                  {grp.rows.map(r=>{
                    const cs=catStyle[r.cat]||{}
                    const bal=r.req_qty-r.purchased
                    const hasQueues = (r.queue_breakdown || []).length > 0
                    const isOpen = !!expanded[r.id]
                    return (
                      <React.Fragment key={r.id}>
                        <tr style={{ background:(rowSelectionState(r).checked||rowSelectionState(r).partial)?'#f0f9ff':'' }}
                          onMouseEnter={e=>{ if(!(rowSelectionState(r).checked||rowSelectionState(r).partial)) e.currentTarget.style.background='#fafafa' }}
                          onMouseLeave={e=>{ if(!(rowSelectionState(r).checked||rowSelectionState(r).partial)) e.currentTarget.style.background='' }}>
                          <td style={{ padding:'8px 0 8px 18px', borderBottom:isOpen?'none':'1px solid #f9fafb' }}><input type="checkbox" ref={el=>{ if(el) el.indeterminate=rowSelectionState(r).partial }} checked={rowSelectionState(r).checked} onChange={()=>toggleRowSelection(r)}/></td>
                          <td style={{ padding:'8px 6px', borderBottom:isOpen?'none':'1px solid #f9fafb' }}>
                            {hasQueues ? (
                              <button onClick={()=>toggleExpanded(r.id)} style={{ width:22, height:22, border:'1px solid #e5e7eb', borderRadius:5, background:'#fff', cursor:'pointer', fontSize:11, lineHeight:'20px', color:'#6b7280' }} title="Show queues">
                                {isOpen ? '▼' : '▶'}
                              </button>
                            ) : null}
                          </td>
                          <TD><span style={{ background:cs.bg, color:cs.color, fontSize:10, fontWeight:600, padding:'2px 7px', borderRadius:4 }}>{r.cat}</span></TD>
                          <TD><div style={{ fontSize:12, fontWeight:600 }}>{r.name}</div>{r.specification&&<div style={{ fontSize:11, color:'#9ca3af' }}>{r.specification}</div>}</TD>
                          <TD style={{ textAlign:'right', fontFamily:'monospace', fontWeight:600 }}>{r.req_qty?`${fmtNum(r.req_qty,2)} ${r.unit}`:'—'}</TD>
                          <TD style={{ textAlign:'right', fontFamily:'monospace', color:r.purchased>0?'#16a34a':'#9ca3af', fontWeight:r.purchased>0?600:400 }}>{r.purchased>0?`${fmtNum(r.purchased,2)} ${r.unit}`:'—'}</TD>
                          <TD style={{ textAlign:'right', fontFamily:'monospace', color:balColor(r.req_qty,r.purchased), fontWeight:700 }}>{r.req_qty?`${fmtNum(bal,2)} ${r.unit}`:'—'}</TD>
                        </tr>
                        {isOpen && (r.queue_breakdown || []).map(q => {
                          const qSelected = selected.has(qKey(r.id, queueRef(q)))
                          return (
                          <tr key={q.id} style={{ background:qSelected?'#eff6ff':'#fcfcfc' }}>
                            <td style={{ padding:'8px 0 8px 18px', borderBottom:'1px solid #f3f4f6' }}>
                              <input type="checkbox" checked={qSelected} onChange={()=>toggleQueueSelection(r, q)} />
                            </td>
                            <td style={{ borderBottom:'1px solid #f3f4f6' }}></td>
                            <td colSpan={2} style={{ padding:'8px 12px 8px 24px', borderBottom:'1px solid #f3f4f6' }}>
                              <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                                <span style={{ fontFamily:'var(--font-mono)', fontWeight:800, fontSize:11, color:'#0d0d0d', background:'#f3f4f6', padding:'2px 7px', borderRadius:5 }}>{q.q_number || 'Queued'}</span>
                                <span style={{ fontSize:11, fontWeight:600, color:'#374151' }}>{q.label || 'Queue'}</span>
                                <span style={{ fontSize:10, color:'#9ca3af' }}>{q.split_rule}</span>
                              </div>
                            </td>
                            <td style={{ textAlign:'right', fontFamily:'monospace', fontSize:11, fontWeight:700, padding:'8px 12px', borderBottom:'1px solid #f3f4f6' }}>{fmtNum(q.req_qty,2)} {q.unit}</td>
                            <td style={{ padding:'8px 12px', borderBottom:'1px solid #f3f4f6', color:'#cbd5e1', textAlign:'right' }}>—</td>
                            <td style={{ padding:'8px 12px', borderBottom:'1px solid #f3f4f6', color:'#cbd5e1', textAlign:'right' }}>—</td>
                          </tr>
                          )
                        })}
                      </React.Fragment>
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
        <span style={{ fontSize:11, color:'#d97706', fontWeight:600 }}>Unmet: {rows.filter(r=>r.purchased<r.req_qty).length}</span>
        <span style={{ fontSize:11, color:'#16a34a', fontWeight:600 }}>Fulfilled: {rows.filter(r=>r.req_qty>0&&r.purchased>=r.req_qty).length}</span>
      </div>
      {showPOModal&&<POModal orders={orders} suppliers={suppliers} prefillItems={buildPrefill()} onClose={()=>setShowPOModal(false)} onSaved={()=>{ setShowPOModal(false); setSelected(new Set()); load() }}/>} 
    </>
  )
}

// ── Tab 2: Process Demand ─────────────────────────────────────────────────────
function ProcessDemandTab({ suppliers }) {
  const [orders, setOrders] = useState([])
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState(new Set())
  const [showWOModal, setShowWOModal] = useState(false)
  const [prefillOrderId, setPrefillOrderId] = useState(null)

  useEffect(() => { load() }, [])

  async function load() {
    setLoading(true)
    const { data:ords } = await supabase.from('orders').select('id,job_id,job_number,buyer_name,style_number,total_qty').not('status','eq','Cancelled').order('job_number')
    const allOrds = ords||[]
    setOrders(allOrds)
    const jobOrds = allOrds.filter(o=>o.job_id)
    if (!jobOrds.length) { setRows([]); setLoading(false); return }
    const idSet = new Set(jobOrds.map(o=>o.id))
    const [{ data:procs }, { data:woItems }, { data:queues }] = await Promise.all([
      supabase.from('order_processes').select('id,order_id,process_name,sort_order').order('sort_order'),
      supabase.from('work_order_items').select('order_process_id,qty'),
      supabase.from('order_queues').select('id,order_id,q_number,label,split_rule,color_name,size_group_id,qty,status,sort_order').in('order_id', Array.from(idSet)).order('sort_order'),
    ])
    const assignedMap = {}
    ;(woItems||[]).forEach(w=>{ if (w.order_process_id) assignedMap[w.order_process_id]=(assignedMap[w.order_process_id]||0)+(parseFloat(w.qty)||0) })
    const built = []
    ;(procs||[]).filter(p=>idSet.has(p.order_id)).forEach(p=>{
      const ord=allOrds.find(o=>o.id===p.order_id); if (!ord) return
      const queue_breakdown = normalizeQueueBreakdown((queues||[]).filter(q=>q.order_id===p.order_id).map(q => ({
        id: `${p.id}_${q.id}`,
        q_number: q.q_number,
        label: q.label,
        split_rule: q.split_rule,
        req_qty: parseFloat(q.qty) || 0,
        unit: 'pcs',
        color_name: q.color_name || '',
      })))
      const req_qty = queue_breakdown.length ? queue_breakdown.reduce((s,x)=>s+(parseFloat(x.req_qty)||0),0) : (parseFloat(ord.total_qty)||0)
      built.push({ id:p.id, order_id:p.order_id, order:ord, process_name:p.process_name, req_qty, assigned:assignedMap[p.id]||0, unit:'pcs', queue_breakdown })
    })
    setRows(built)
    setLoading(false)
  }

  const filtered = rows.filter(r=>{
    const q=search.toLowerCase()
    return !q||[r.process_name,r.order.buyer_name,r.order.style_number,r.order.job_number].some(f=>f?.toLowerCase().includes(q))
  })
  const grouped = {}
  filtered.forEach(r=>{ if (!grouped[r.order_id]) grouped[r.order_id]={order:r.order,rows:[]}; grouped[r.order_id].rows.push(r) })
  const balColor = (req,assigned) => { if (req-assigned<=0) return '#16a34a'; if (assigned>0) return '#d97706'; return '#374151' }
  const [expanded, setExpanded] = useState({})
  const rowKey = (rowId) => `row:${rowId}`
  const qKey = (rowId, qRef) => `q:${rowId}:${qRef}`
  const queueRef = (q) => q?.q_number || q?.id || q?.label || 'queued'
  const selectedQueueKeysForRow = (r) => (r.queue_breakdown || []).map(q => qKey(r.id, queueRef(q))).filter(k => selected.has(k))
  const rowSelectionState = (r) => {
    const childKeys = (r.queue_breakdown || []).map(q => qKey(r.id, queueRef(q)))
    if (!childKeys.length) return { checked: selected.has(rowKey(r.id)), partial: false }
    const picked = childKeys.filter(k => selected.has(k)).length
    return { checked: picked === childKeys.length && picked > 0, partial: picked > 0 && picked < childKeys.length }
  }
  const toggleRowSelection = (r) => {
    const childKeys = (r.queue_breakdown || []).map(q => qKey(r.id, queueRef(q)))
    setSelected(prev => {
      const s = new Set(prev)
      if (!childKeys.length) {
        const key = rowKey(r.id)
        s.has(key) ? s.delete(key) : s.add(key)
        return s
      }
      const allSelected = childKeys.every(k => s.has(k))
      childKeys.forEach(k => { if (allSelected) s.delete(k); else s.add(k) })
      s.delete(rowKey(r.id))
      return s
    })
  }
  const toggleQueueSelection = (r, q) => {
    const key = qKey(r.id, queueRef(q))
    setSelected(prev => {
      const s = new Set(prev)
      s.has(key) ? s.delete(key) : s.add(key)
      s.delete(rowKey(r.id))
      return s
    })
  }
  const getAllSelectableKeys = () => filtered.flatMap(r => (r.queue_breakdown || []).length ? (r.queue_breakdown || []).map(q => qKey(r.id, queueRef(q))) : [rowKey(r.id)])
  const selectionCount = selected.size
  const toggleExpanded = (id) => setExpanded(prev => ({ ...prev, [id]: !prev[id] }))
  const buildPrefillItems = () => {
    const lines = []
    for (const r of filtered) {
      const childKeys = selectedQueueKeysForRow(r)
      if (childKeys.length) {
        ;(r.queue_breakdown || []).forEach(q => {
          if (selected.has(qKey(r.id, queueRef(q)))) {
            lines.push({
              _id: `${r.id}_${queueRef(q)}`,
              order_process_id: r.id,
              process_name: r.process_name,
              dept_info: `${q.label || q.q_number}${q.color_name ? ' · ' + q.color_name : ''} [${q.q_number}]`,
              qty: q.req_qty || '',
              unit: q.unit || 'pcs',
              rate: '',
              amount: '',
            })
          }
        })
        continue
      }
      if (selected.has(rowKey(r.id))) {
        lines.push({ _id:r.id, order_process_id:r.id, process_name:r.process_name, dept_info:'', qty:r.req_qty||'', unit:r.unit||'pcs', rate:'', amount:'' })
      }
    }
    return lines
  }

  const handleGenerateWO = () => {
    const firstRow = filtered.find(r => selected.has(rowKey(r.id)) || (r.queue_breakdown || []).some(q => selected.has(qKey(r.id, queueRef(q)))))
    if (!firstRow) return
    setPrefillOrderId(firstRow.order_id)
    setShowWOModal(true)
  }

  const CoverageBar = ({ req, assigned }) => {
    if (!req) return <span style={{ color:'#9ca3af', fontSize:11 }}>—</span>
    const pct = Math.min(100,Math.round((assigned/req)*100))
    const color = pct>=100?'#16a34a':pct>0?'#d97706':'#e5e7eb'
    return (
      <div style={{ display:'flex', alignItems:'center', gap:6 }}>
        <div style={{ width:60, height:5, background:'#f3f4f6', borderRadius:3, overflow:'hidden' }}>
          <div style={{ width:`${pct}%`, height:'100%', background:color, borderRadius:3 }}/>
        </div>
        <span style={{ fontSize:11, color, fontWeight:600 }}>{pct}%</span>
      </div>
    )
  }

  return (
    <>
      <div style={{ padding:'10px 24px', borderBottom:'1px solid #f3f4f6', display:'flex', alignItems:'center', gap:8, flexShrink:0 }}>
        <div style={{ position:'relative', width:280 }}>
          <Search size={13} style={{ position:'absolute', left:9, top:'50%', transform:'translateY(-50%)', color:'#9ca3af' }}/>
          <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search process, style, buyer..." style={{ width:'100%', paddingLeft:28, height:32, border:'1px solid #e5e7eb', borderRadius:7, fontSize:12, fontFamily:'Inter,sans-serif', outline:'none', background:'#fafafa' }}/>
        </div>
        <div style={{ marginLeft:'auto' }}>
          <button className="btn btn-primary btn-sm" onClick={handleGenerateWO} disabled={selectionCount===0}>+ Generate WO {selectionCount>0?`(${selectionCount})`:''}</button>
        </div>
      </div>
      {selectionCount>0&&(
        <div style={{ padding:'7px 24px', background:'#f5f3ff', borderBottom:'1px solid #ede9fe', display:'flex', alignItems:'center', gap:8, flexShrink:0 }}>
          <span style={{ fontSize:12, color:'#7c3aed', fontWeight:600 }}>{selectionCount} selections ready for WO</span>
          <button className="btn btn-sm btn-secondary" onClick={()=>setSelected(new Set())}><X size={11}/> Clear</button>
        </div>
      )}
      <div style={{ flex:1, overflowY:'auto', overflowX:'auto' }}>
        {loading?<div style={{ padding:60, textAlign:'center', color:'#9ca3af', fontSize:12 }}>Loading...</div>
        :filtered.length===0?<div style={{ padding:60, textAlign:'center', color:'#9ca3af', fontSize:12 }}>{orders.filter(o=>o.job_id).length===0?'No job-assigned orders yet.':'No processes found. Add processes in Step 9 of the order wizard.'}</div>
        :(
          <table style={{ width:'100%', borderCollapse:'collapse', minWidth:820 }}>
            <thead><tr style={{ background:'#fafafa', position:'sticky', top:0, zIndex:10 }}>
              <th style={{ width:40, padding:'9px 0 9px 18px', borderBottom:'1px solid #f3f4f6' }}><input type="checkbox" checked={selectionCount===getAllSelectableKeys().length&&getAllSelectableKeys().length>0} onChange={()=>{ const keys=getAllSelectableKeys(); setSelected(selectionCount===keys.length?new Set():new Set(keys)) }}/></th>
              <th style={{ width:34, padding:'9px 6px', borderBottom:'1px solid #f3f4f6' }}></th>
              <TH>Process</TH><TH right>Order Qty</TH><TH right>Assigned</TH><TH right>Balance</TH><TH>Coverage</TH>
            </tr></thead>
            <tbody>
              {Object.values(grouped).map(grp=>(
                <React.Fragment key={grp.order.id}>
                  <tr><td colSpan={7} style={{ padding:'7px 18px', background:'#f9fafb', borderBottom:'1px solid #f0f0ee', borderTop:'1px solid #f0f0ee' }}>
                    <span style={{ fontSize:11, fontWeight:700, fontFamily:'monospace', color:'#0d0d0d' }}>{grp.order.job_number||'—'}</span>
                    <span style={{ fontSize:11, color:'#6b7280', marginLeft:8 }}>{grp.order.buyer_name} · {grp.order.style_number}</span>
                    {grp.order.total_qty&&<span style={{ fontSize:11, color:'#9ca3af', marginLeft:8 }}>{grp.order.total_qty.toLocaleString()} pcs</span>}
                  </td></tr>
                  {grp.rows.map(r=>{
                    const bal=r.req_qty-r.assigned
                    const hasQueues = (r.queue_breakdown || []).length > 0
                    const isOpen = !!expanded[r.id]
                    const selState = rowSelectionState(r)
                    return (
                      <React.Fragment key={r.id}>
                        <tr style={{ background:(selState.checked||selState.partial)?'#faf5ff':'' }}
                          onMouseEnter={e=>{ if(!(selState.checked||selState.partial)) e.currentTarget.style.background='#fafafa' }}
                          onMouseLeave={e=>{ if(!(selState.checked||selState.partial)) e.currentTarget.style.background='' }}>
                          <td style={{ padding:'8px 0 8px 18px', borderBottom:isOpen?'none':'1px solid #f9fafb' }}><input type="checkbox" ref={el=>{ if(el) el.indeterminate=selState.partial }} checked={selState.checked} onChange={()=>toggleRowSelection(r)}/></td>
                          <td style={{ padding:'8px 6px', borderBottom:isOpen?'none':'1px solid #f9fafb' }}>
                            {hasQueues ? (
                              <button onClick={()=>toggleExpanded(r.id)} style={{ width:22, height:22, border:'1px solid #e5e7eb', borderRadius:5, background:'#fff', cursor:'pointer', fontSize:11, lineHeight:'20px', color:'#6b7280' }} title="Show queues">
                                {isOpen ? '▼' : '▶'}
                              </button>
                            ) : null}
                          </td>
                          <TD style={{ fontWeight:600 }}>{r.process_name}</TD>
                          <TD style={{ textAlign:'right', fontFamily:'monospace', fontWeight:600 }}>{r.req_qty?`${fmtNum(r.req_qty)} pcs`:'—'}</TD>
                          <TD style={{ textAlign:'right', fontFamily:'monospace', color:r.assigned>0?'#16a34a':'#9ca3af', fontWeight:r.assigned>0?600:400 }}>{r.assigned>0?`${fmtNum(r.assigned)} pcs`:'—'}</TD>
                          <TD style={{ textAlign:'right', fontFamily:'monospace', color:balColor(r.req_qty,r.assigned), fontWeight:700 }}>{r.req_qty?`${fmtNum(bal)} pcs`:'—'}</TD>
                          <TD><CoverageBar req={r.req_qty} assigned={r.assigned}/></TD>
                        </tr>
                        {hasQueues && isOpen && (r.queue_breakdown || []).map(q => {
                          const qSelected = selected.has(qKey(r.id, queueRef(q)))
                          return (
                            <tr key={q.id} style={{ background:qSelected?'#fdf4ff':'#fcfcfd' }}>
                              <td style={{ padding:'8px 0 8px 36px', borderBottom:'1px solid #f3f4f6' }}><input type="checkbox" checked={qSelected} onChange={()=>toggleQueueSelection(r, q)} /></td>
                              <td style={{ padding:'8px 6px', borderBottom:'1px solid #f3f4f6', color:'#a1a1aa', fontSize:11 }}>↳</td>
                              <td style={{ padding:'8px 12px', borderBottom:'1px solid #f3f4f6', fontSize:12 }}>
                                <div style={{ display:'flex', alignItems:'center', gap:8, flexWrap:'wrap' }}>
                                  <span style={{ fontFamily:'monospace', fontSize:11, fontWeight:700, color:'#7c3aed' }}>{q.q_number || 'Queued'}</span>
                                  <span style={{ color:'#374151' }}>{q.label || q.q_number}</span>
                                  {q.split_rule && <span style={{ fontSize:10, color:'#7c3aed', background:'#f5f3ff', padding:'2px 6px', borderRadius:4, fontWeight:700 }}>{q.split_rule}</span>}
                                </div>
                              </td>
                              <td style={{ padding:'8px 12px', borderBottom:'1px solid #f3f4f6', textAlign:'right', fontFamily:'monospace', fontSize:12, fontWeight:600 }}>{q.req_qty?`${fmtNum(q.req_qty)} pcs`:'—'}</td>
                              <td style={{ padding:'8px 12px', borderBottom:'1px solid #f3f4f6', textAlign:'right', color:'#9ca3af', fontSize:12 }}>—</td>
                              <td style={{ padding:'8px 12px', borderBottom:'1px solid #f3f4f6', textAlign:'right', fontFamily:'monospace', fontSize:12, fontWeight:700, color:'#7c3aed' }}>{q.req_qty?`${fmtNum(q.req_qty)} pcs`:'—'}</td>
                              <td style={{ padding:'8px 12px', borderBottom:'1px solid #f3f4f6' }}><span style={{ fontSize:11, color:'#7c3aed', fontWeight:600 }}>Queue</span></td>
                            </tr>
                          )
                        })}
                      </React.Fragment>
                    )
                  })}
                </React.Fragment>
              ))}
            </tbody>
          </table>
        )}
      </div>
      <div style={{ padding:'8px 24px', borderTop:'1px solid #e5e7eb', display:'flex', gap:20, background:'#fff', flexShrink:0 }}>
        <span style={{ fontSize:11, fontWeight:700, color:'#9ca3af', textTransform:'uppercase', letterSpacing:'0.4px' }}>{filtered.length} processes</span>
        <span style={{ fontSize:11, color:'#d97706', fontWeight:600 }}>Unassigned: {rows.filter(r=>r.assigned===0).length}</span>
        <span style={{ fontSize:11, color:'#d97706', fontWeight:600 }}>Partial: {rows.filter(r=>r.assigned>0&&r.assigned<r.req_qty).length}</span>
        <span style={{ fontSize:11, color:'#16a34a', fontWeight:600 }}>Fully Assigned: {rows.filter(r=>r.req_qty>0&&r.assigned>=r.req_qty).length}</span>
      </div>
      {showWOModal&&(
        <WOModal wo={prefillOrderId?{order_id:prefillOrderId}:null} orders={orders} suppliers={suppliers} prefillProcessIds={filtered.filter(r => selected.has(rowKey(r.id))).map(r => r.id)} prefillItems={buildPrefillItems()}
          onClose={()=>{ setShowWOModal(false); setPrefillOrderId(null) }}
          onSaved={()=>{ setShowWOModal(false); setPrefillOrderId(null); setSelected(new Set()); load() }}/>
      )}
    </>
  )
}

// ── Tab 3: Purchase Orders ────────────────────────────────────────────────────
function PurchaseOrdersTab({ orders, suppliers }) {
  const [pos, setPos] = useState([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [editPO, setEditPO] = useState(null)
  const [search, setSearch] = useState('')

  useEffect(() => { load() }, [])
  async function load() {
    setLoading(true)
    const { data } = await supabase.from('purchase_orders').select('*, purchase_order_items(*)').order('created_at',{ ascending:false })
    setPos(data||[])
    setLoading(false)
  }

  const filtered = pos.filter(p=>{ const q=search.toLowerCase(); return !q||[p.po_number,suppliers.find(s=>s.id===p.supplier_id)?.name,p.notes].some(f=>f?.toLowerCase().includes(q)) })
  const stStyle = { Draft:{color:'#d97706',bg:'#fff7ed'}, Issued:{color:'#2563eb',bg:'#eff6ff'}, Acknowledged:{color:'#7c3aed',bg:'#f5f3ff'}, Delivered:{color:'#16a34a',bg:'#f0fdf4'}, Cancelled:{color:'#dc2626',bg:'#fef2f2'} }

  const handlePrint = async (p,e) => {
    e.stopPropagation()
    await printPurchaseOrder({ ...p, items:p.purchase_order_items||[] }, suppliers.find(s=>s.id===p.supplier_id), orders.find(o=>o.id===p.order_id), null)
  }
  const handleDeletePO = async (p,e) => {
    e.stopPropagation()
    if (!window.confirm(`Delete PO ${p.po_number}? This cannot be undone.`)) return
    await supabase.from('purchase_order_items').delete().eq('po_id', p.id)
    await supabase.from('purchase_orders').delete().eq('id', p.id)
    load()
  }

  return (
    <>
      <div style={{ padding:'10px 24px', borderBottom:'1px solid #f3f4f6', display:'flex', alignItems:'center', gap:8, flexShrink:0 }}>
        <div style={{ position:'relative', width:280 }}>
          <Search size={13} style={{ position:'absolute', left:9, top:'50%', transform:'translateY(-50%)', color:'#9ca3af' }}/>
          <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search PO number or supplier..." style={{ width:'100%', paddingLeft:28, height:32, border:'1px solid #e5e7eb', borderRadius:7, fontSize:12, fontFamily:'Inter,sans-serif', outline:'none', background:'#fafafa' }}/>
        </div>
        <div style={{ marginLeft:'auto' }}><button className="btn btn-primary btn-sm" onClick={()=>{ setEditPO(null); setShowModal(true) }}><Plus size={12}/> New PO</button></div>
      </div>
      <div style={{ flex:1, overflowY:'auto', overflowX:'auto' }}>
        {loading?<div style={{ padding:60, textAlign:'center', color:'#9ca3af', fontSize:12 }}>Loading...</div>
        :filtered.length===0?<div style={{ padding:60, textAlign:'center', color:'#9ca3af', fontSize:12 }}>No purchase orders yet.</div>
        :(
          <table style={{ width:'100%', borderCollapse:'collapse', minWidth:760 }}>
            <thead><tr style={{ background:'#fafafa', position:'sticky', top:0, zIndex:10 }}>
              <TH>PO Number</TH><TH>Supplier</TH><TH>Order / Style</TH><TH>PO Date</TH><TH>Delivery</TH><TH>Items</TH><TH>Status</TH>
              <th style={{ borderBottom:'1px solid #f3f4f6', width:110 }}>Actions</th>
            </tr></thead>
            <tbody>{filtered.map(p=>{
              const supplier=suppliers.find(s=>s.id===p.supplier_id); const order=orders.find(o=>o.id===p.order_id)
              const ss=stStyle[p.status]||{}; const total=(p.purchase_order_items||[]).reduce((s,i)=>s+(parseFloat(i.amount)||0),0)
              return (
                <tr key={p.id} style={{ cursor:'pointer' }} onClick={()=>{ setEditPO({...p,items:p.purchase_order_items||[]}); setShowModal(true) }}
                  onMouseEnter={e=>e.currentTarget.style.background='#fafafa'} onMouseLeave={e=>e.currentTarget.style.background=''}>
                  <TD style={{ fontFamily:'monospace', fontWeight:700 }}>{p.po_number}</TD>
                  <TD style={{ fontWeight:600 }}>{supplier?.name||'—'}</TD>
                  <TD style={{ color:'#6b7280', fontSize:11 }}>{order?`${order.style_number} · ${order.buyer_name}`:'—'}</TD>
                  <TD style={{ color:'#6b7280', fontSize:11 }}>{fmtDate(p.po_date)}</TD>
                  <TD style={{ color:dateColor(p.delivery_date), fontSize:11 }}>{fmtDate(p.delivery_date)}</TD>
                  <TD style={{ fontSize:11 }}>{(p.purchase_order_items||[]).length} lines{total>0&&<span style={{ fontWeight:700, color:'#0d0d0d', marginLeft:6 }}>{p.currency} {fmtNum(total)}</span>}</TD>
                  <TD><span style={{ background:ss.bg||'#f9fafb', color:ss.color||'#6b7280', fontSize:10, fontWeight:600, padding:'2px 7px', borderRadius:4 }}>{p.status}</span></TD>
                  <td style={{ padding:'9px 8px', borderBottom:'1px solid #f9fafb', whiteSpace:'nowrap' }}><button className="btn btn-ghost btn-sm" title="Edit" onClick={e=>{ e.stopPropagation(); setEditPO({...p,items:p.purchase_order_items||[]}); setShowModal(true) }}><Pencil size={12} color="#6b7280"/></button><button className="btn btn-ghost btn-sm" title="Print" onClick={e=>handlePrint(p,e)}><Printer size={12} color="#6b7280"/></button><button className="btn btn-ghost btn-sm" title="Delete" onClick={e=>handleDeletePO(p,e)}><Trash2 size={12} color="#dc2626"/></button></td>
                </tr>
              )
            })}</tbody>
          </table>
        )}
      </div>
      {showModal&&<POModal po={editPO} orders={orders} suppliers={suppliers} onClose={()=>{ setShowModal(false); setEditPO(null) }} onSaved={()=>{ setShowModal(false); setEditPO(null); load() }}/>}
    </>
  )
}

// ── Tab 4: Work Orders ────────────────────────────────────────────────────────
function WorkOrdersTab({ orders, suppliers }) {
  const [wos, setWos] = useState([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [editWO, setEditWO] = useState(null)
  const [search, setSearch] = useState('')

  useEffect(() => { load() }, [])
  async function load() {
    setLoading(true)
    const { data } = await supabase.from('work_orders').select('*, work_order_items(*)').order('created_at',{ ascending:false })
    setWos(data||[])
    setLoading(false)
  }

  const filtered = wos.filter(w=>{ const q=search.toLowerCase(); return !q||[w.wo_number,suppliers.find(s=>s.id===w.vendor_id)?.name,w.color].some(f=>f?.toLowerCase().includes(q)) })
  const stStyle = { Draft:{color:'#d97706',bg:'#fff7ed'}, Issued:{color:'#2563eb',bg:'#eff6ff'}, 'In Progress':{color:'#7c3aed',bg:'#f5f3ff'}, Completed:{color:'#16a34a',bg:'#f0fdf4'}, Cancelled:{color:'#dc2626',bg:'#fef2f2'} }

  const handlePrint = async (w,e) => {
    e.stopPropagation()
    await printWorkOrder({ ...w, items:w.work_order_items||[] }, suppliers.find(s=>s.id===w.vendor_id), orders.find(o=>o.id===w.order_id))
  }
  const handleDeleteWO = async (w,e) => {
    e.stopPropagation()
    if (!window.confirm(`Delete WO ${w.wo_number}? This cannot be undone.`)) return
    await supabase.from('work_order_items').delete().eq('wo_id', w.id)
    await supabase.from('work_orders').delete().eq('id', w.id)
    load()
  }

  return (
    <>
      <div style={{ padding:'10px 24px', borderBottom:'1px solid #f3f4f6', display:'flex', alignItems:'center', gap:8, flexShrink:0 }}>
        <div style={{ position:'relative', width:280 }}>
          <Search size={13} style={{ position:'absolute', left:9, top:'50%', transform:'translateY(-50%)', color:'#9ca3af' }}/>
          <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search WO number or vendor..." style={{ width:'100%', paddingLeft:28, height:32, border:'1px solid #e5e7eb', borderRadius:7, fontSize:12, fontFamily:'Inter,sans-serif', outline:'none', background:'#fafafa' }}/>
        </div>
        <div style={{ marginLeft:'auto' }}><button className="btn btn-primary btn-sm" onClick={()=>{ setEditWO(null); setShowModal(true) }}><Plus size={12}/> New Work Order</button></div>
      </div>
      <div style={{ flex:1, overflowY:'auto', overflowX:'auto' }}>
        {loading?<div style={{ padding:60, textAlign:'center', color:'#9ca3af', fontSize:12 }}>Loading...</div>
        :filtered.length===0?<div style={{ padding:60, textAlign:'center', color:'#9ca3af', fontSize:12 }}>No work orders yet.</div>
        :(
          <table style={{ width:'100%', borderCollapse:'collapse', minWidth:820 }}>
            <thead><tr style={{ background:'#fafafa', position:'sticky', top:0, zIndex:10 }}>
              <TH>WO Number</TH><TH>Vendor</TH><TH>Type</TH><TH>Order / Style</TH><TH>Colour</TH><TH right>Qty</TH><TH>Processes</TH><TH>Complete By</TH><TH>Status</TH>
              <th style={{ borderBottom:'1px solid #f3f4f6', width:110 }}>Actions</th>
            </tr></thead>
            <tbody>{filtered.map(w=>{
              const vendor=suppliers.find(s=>s.id===w.vendor_id); const order=orders.find(o=>o.id===w.order_id)
              const ss=stStyle[w.status]||{}; const overdue=w.complete_by&&new Date(w.complete_by)<today&&w.status!=='Completed'
              const total=(w.work_order_items||[]).reduce((s,i)=>s+(parseFloat(i.amount)||0),0)
              const procNames=(w.work_order_items||[]).map(i=>i.process_name).filter(Boolean)
              const tc=w.vendor_type==='internal'?{color:'#2563eb',bg:'#eff6ff'}:{color:'#7c3aed',bg:'#f5f3ff'}
              return (
                <tr key={w.id} style={{ cursor:'pointer' }} onClick={()=>{ setEditWO({...w,items:w.work_order_items||[]}); setShowModal(true) }}
                  onMouseEnter={e=>e.currentTarget.style.background='#fafafa'} onMouseLeave={e=>e.currentTarget.style.background=''}>
                  <TD style={{ fontFamily:'monospace', fontWeight:700 }}>{w.wo_number}</TD>
                  <TD style={{ fontWeight:600 }}>{vendor?.name||'—'}</TD>
                  <TD><span style={{ background:tc.bg, color:tc.color, fontSize:10, fontWeight:600, padding:'2px 7px', borderRadius:4 }}>{w.vendor_type==='internal'?'Internal':'CMT'}</span></TD>
                  <TD style={{ color:'#6b7280', fontSize:11 }}>{order?`${order.style_number} · ${order.buyer_name}`:'—'}</TD>
                  <TD>{w.color||'—'}</TD>
                  <TD style={{ textAlign:'right', fontFamily:'monospace', fontWeight:600 }}>{w.qty?.toLocaleString()||'—'}</TD>
                  <TD style={{ color:'#6b7280', fontSize:11, maxWidth:160, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{procNames.slice(0,3).join(', ')}{procNames.length>3?` +${procNames.length-3}`:''}</TD>
                  <TD style={{ color:overdue?'#dc2626':'#6b7280', fontWeight:overdue?700:400, fontSize:11 }}>{fmtDate(w.complete_by)}{overdue?' ▲':''}</TD>
                  <TD><span style={{ background:ss.bg||'#f9fafb', color:ss.color||'#6b7280', fontSize:10, fontWeight:600, padding:'2px 7px', borderRadius:4 }}>{w.status}</span></TD>
                  {total>0&&<span style={{ fontSize:11, fontWeight:700, color:'#0d0d0d', marginLeft:6 }}>PKR {fmtNum(total)}</span>}
                  <td style={{ padding:'9px 8px', borderBottom:'1px solid #f9fafb', whiteSpace:'nowrap' }}><button className="btn btn-ghost btn-sm" title="Edit" onClick={e=>{ e.stopPropagation(); setEditWO({...w,items:w.work_order_items||[]}); setShowModal(true) }}><Pencil size={12} color="#6b7280"/></button><button className="btn btn-ghost btn-sm" title="Print" onClick={e=>handlePrint(w,e)}><Printer size={12} color="#6b7280"/></button><button className="btn btn-ghost btn-sm" title="Delete" onClick={e=>handleDeleteWO(w,e)}><Trash2 size={12} color="#dc2626"/></button></td>
                </tr>
              )
            })}</tbody>
          </table>
        )}
      </div>
      {showModal&&<WOModal wo={editWO} orders={orders} suppliers={suppliers} onClose={()=>{ setShowModal(false); setEditWO(null) }} onSaved={()=>{ setShowModal(false); setEditWO(null); load() }}/>}
    </>
  )
}

// ── Tab 5: Expected Deliveries ────────────────────────────────────────────────
function DeliveriesTab({ orders, suppliers }) {
  const [pos, setPos] = useState([])
  const [wos, setWos] = useState([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState('all')

  useEffect(() => { load() }, [])
  async function load() {
    setLoading(true)
    const [{ data:p }, { data:w }] = await Promise.all([
      supabase.from('purchase_orders').select('*, purchase_order_items(*)').not('status','eq','Cancelled').order('delivery_date',{nullsLast:true}),
      supabase.from('work_orders').select('*, work_order_items(*)').not('status','eq','Cancelled').order('complete_by',{nullsLast:true}),
    ])
    setPos(p||[]); setWos(w||[]); setLoading(false)
  }

  const weekEnd=new Date(today); weekEnd.setDate(today.getDate()+7)
  const monthEnd=new Date(today.getFullYear(),today.getMonth()+1,0)
  function urgencyOf(dateStr,docStatus) {
    if (docStatus==='Delivered'||docStatus==='Completed') return 'Delivered'
    if (!dateStr) return 'No Date'
    const d=new Date(dateStr)
    if (d<today) return 'Overdue'
    if (d<=weekEnd) return 'This Week'
    if (d<=monthEnd) return 'This Month'
    return 'Upcoming'
  }
  const stStyle = { Overdue:{color:'#dc2626',bg:'#fef2f2'}, 'This Week':{color:'#d97706',bg:'#fff7ed'}, 'This Month':{color:'#2563eb',bg:'#eff6ff'}, Upcoming:{color:'#6b7280',bg:'#f9fafb'}, Delivered:{color:'#16a34a',bg:'#f0fdf4'}, 'No Date':{color:'#9ca3af',bg:'#f9fafb'} }

  const poRows=pos.map(p=>{ const supplier=suppliers.find(s=>s.id===p.supplier_id); const order=orders.find(o=>o.id===p.order_id); const items=p.purchase_order_items||[]; const total=items.reduce((s,i)=>s+(parseFloat(i.amount)||0),0); return { type:'PO', ref:p.po_number, date:p.delivery_date, party:supplier?.name||'—', order, summary:items.length+' lines', value:total?`${p.currency||'PKR'} ${fmtNum(total)}`:'—', urgency:urgencyOf(p.delivery_date,p.status) } })
  const woRows=wos.map(w=>{ const order=orders.find(o=>o.id===w.order_id); const vendor=suppliers.find(s=>s.id===w.vendor_id); const items=w.work_order_items||[]; const total=items.reduce((s,i)=>s+(parseFloat(i.amount)||0),0); const procNames=items.map(i=>i.process_name).filter(Boolean); return { type:'WO', ref:w.wo_number, date:w.complete_by, party:vendor?.name||'—', order, summary:procNames.slice(0,3).join(', ')||'—', value:total?`PKR ${fmtNum(total)}`:'—', urgency:urgencyOf(w.complete_by,w.status) } })
  const all=[...poRows,...woRows].sort((a,b)=>{ const p={Overdue:0,'This Week':1,'This Month':2,Upcoming:3,'No Date':4,Delivered:5}; return (p[a.urgency]??3)-(p[b.urgency]??3)||(a.date||'').localeCompare(b.date||'') })
  const filtered=all.filter(r=>{ if (filter==='overdue') return r.urgency==='Overdue'; if (filter==='thisweek') return r.urgency==='This Week'; if (filter==='thismonth') return r.urgency==='This Month'; if (filter==='pending') return r.urgency!=='Delivered'; return true })
  const counts={ overdue:all.filter(r=>r.urgency==='Overdue').length, thisweek:all.filter(r=>r.urgency==='This Week').length, thismonth:all.filter(r=>r.urgency==='This Month').length }

  return (
    <>
      <div style={{ padding:'10px 24px', borderBottom:'1px solid #f3f4f6', display:'flex', gap:10, flexShrink:0, alignItems:'center', flexWrap:'wrap' }}>
        {[{label:'Overdue',count:counts.overdue,color:'#dc2626',f:'overdue'},{label:'This Week',count:counts.thisweek,color:'#d97706',f:'thisweek'},{label:'This Month',count:counts.thismonth,color:'#2563eb',f:'thismonth'}].map(k=>(
          <button key={k.f} onClick={()=>setFilter(filter===k.f?'all':k.f)}
            style={{ display:'flex', alignItems:'center', gap:7, padding:'5px 12px', borderRadius:7, border:`1px solid ${filter===k.f?k.color:'#e5e7eb'}`, background:filter===k.f?k.color+'18':'#fff', cursor:'pointer' }}>
            <span style={{ fontSize:15, fontWeight:800, color:k.color }}>{k.count}</span>
            <span style={{ fontSize:11, color:filter===k.f?k.color:'#6b7280', fontWeight:500 }}>{k.label}</span>
          </button>
        ))}
        <div style={{ marginLeft:'auto' }}>
          <select value={filter} onChange={e=>setFilter(e.target.value)} style={{ height:32, border:'1px solid #e5e7eb', borderRadius:7, fontSize:12, padding:'0 10px', background:'#fff', cursor:'pointer', fontFamily:'Inter,sans-serif' }}>
            <option value="all">All</option><option value="pending">Pending only</option>
            <option value="overdue">Overdue</option><option value="thisweek">This Week</option><option value="thismonth">This Month</option>
          </select>
        </div>
      </div>
      <div style={{ flex:1, overflowY:'auto', overflowX:'auto' }}>
        {loading?<div style={{ padding:60, textAlign:'center', color:'#9ca3af', fontSize:12 }}>Loading...</div>
        :filtered.length===0?<div style={{ padding:60, textAlign:'center', color:'#9ca3af', fontSize:12 }}>No deliveries match this filter.</div>
        :(
          <table style={{ width:'100%', borderCollapse:'collapse', minWidth:800 }}>
            <thead><tr style={{ background:'#fafafa', position:'sticky', top:0, zIndex:10 }}>
              <TH>Type</TH><TH>Reference</TH><TH>Party</TH><TH>Order / Style</TH><TH>Due Date</TH><TH>Summary</TH><TH>Value</TH><TH>Urgency</TH>
            </tr></thead>
            <tbody>{filtered.map((r,i)=>{
              const ss=stStyle[r.urgency]||{}; const tc=r.type==='PO'?{color:'#2563eb',bg:'#eff6ff'}:{color:'#7c3aed',bg:'#f5f3ff'}
              return (
                <tr key={i} onMouseEnter={e=>e.currentTarget.style.background='#fafafa'} onMouseLeave={e=>e.currentTarget.style.background=''}>
                  <TD><span style={{ background:tc.bg, color:tc.color, fontSize:10, fontWeight:700, padding:'2px 7px', borderRadius:4 }}>{r.type}</span></TD>
                  <TD style={{ fontFamily:'monospace', fontWeight:700 }}>{r.ref}</TD>
                  <TD style={{ fontWeight:600 }}>{r.party}</TD>
                  <TD style={{ color:'#6b7280', fontSize:11 }}>{r.order?`${r.order.style_number} · ${r.order.buyer_name}`:'—'}</TD>
                  <TD style={{ fontWeight:r.urgency==='Overdue'?700:400, color:r.urgency==='Overdue'?'#dc2626':'#374151', whiteSpace:'nowrap', fontSize:11 }}>{r.date?fmtDate(r.date):'—'}{r.urgency==='Overdue'?' ▲':''}</TD>
                  <TD style={{ color:'#6b7280', fontSize:11, maxWidth:200, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{r.summary}</TD>
                  <TD style={{ fontFamily:'monospace', fontWeight:600, fontSize:11 }}>{r.value}</TD>
                  <TD><span style={{ background:ss.bg||'#f9fafb', color:ss.color||'#6b7280', fontSize:10, fontWeight:600, padding:'2px 7px', borderRadius:4 }}>{r.urgency}</span></TD>
                </tr>
              )
            })}</tbody>
          </table>
        )}
      </div>
    </>
  )
}

// ── Main ──────────────────────────────────────────────────────────────────────
const TABS = [
  { id:'material',   label:'Material Demand' },
  { id:'process',    label:'Process Demand' },
  { id:'pos',        label:'Purchase Orders' },
  { id:'wos',        label:'Work Orders' },
  { id:'deliveries', label:'Expected Deliveries' },
]

export default function Purchasing() {
  const [tab, setTab] = useState('material')
  const [orders, setOrders] = useState([])
  const [suppliers, setSuppliers] = useState([])
  const [tabNotices, setTabNotices] = useState({ material:false, process:false, pos:false, wos:false, deliveries:false })

  useEffect(() => {
    supabase.from('orders').select('id,job_id,job_number,buyer_name,style_number,total_qty').not('status','eq','Cancelled').order('job_number').then(({data})=>setOrders(data||[]))
    supabase.from('suppliers').select('id,name,address,phone').order('name').then(({data})=>setSuppliers(data||[]))
    setTabNotices(getPageTabNoticeMap('purchasingPage', ['material','process','pos','wos','deliveries']))
  }, [])

  useEffect(() => {
    markTabSeen('purchasingPage', tab)
    setTabNotices(getPageTabNoticeMap('purchasingPage', ['material','process','pos','wos','deliveries']))
  }, [tab])

  const tabStyle = t => ({ padding:'0 16px', height:44, background:'none', border:'none', cursor:'pointer', fontSize:13, fontWeight:tab===t?600:400, color:tab===t?'#0d0d0d':'#6b7280', borderBottom:`2px solid ${tab===t?'#0d0d0d':'transparent'}`, marginBottom:-1, fontFamily:'Inter,sans-serif', whiteSpace:'nowrap' })

  return (
    <div style={{ display:'flex', flexDirection:'column', height:'100%', background:'#fff' }}>
      <div style={{ padding:'16px 24px 0', flexShrink:0 }}>
        <h1 style={{ fontSize:20, fontWeight:800, letterSpacing:'-0.4px', marginBottom:2 }}>Purchasing</h1>
        <div style={{ fontSize:11, color:'#9ca3af', marginBottom:12 }}>Material & process demand, purchase orders, work orders</div>
        <div style={{ display:'flex', borderBottom:'1px solid #e5e7eb', overflowX:'auto' }}>
          {TABS.map(t=><button key={t.id} style={tabStyle(t.id)} onClick={()=>setTab(t.id)}><span style={{ display:'inline-flex', alignItems:'center', gap:6 }}>{t.label}{tabNotices[t.id] && tab !== t.id ? <span style={{ width:8, height:8, borderRadius:'50%', background:'#F59E0B', display:'inline-block' }} /> : null}</span></button>)}
        </div>
      </div>
      {tab==='material'   && <MaterialDemandTab suppliers={suppliers}/>}
      {tab==='process'    && <ProcessDemandTab  suppliers={suppliers}/>}
      {tab==='pos'        && <PurchaseOrdersTab orders={orders} suppliers={suppliers}/>}
      {tab==='wos'        && <WorkOrdersTab     orders={orders} suppliers={suppliers}/>}
      {tab==='deliveries' && <DeliveriesTab     orders={orders} suppliers={suppliers}/>}
    </div>
  )
}
