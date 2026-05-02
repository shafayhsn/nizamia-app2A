import React, { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import { Plus, X, Search, Settings, Printer, Edit3, Trash2, Download, RefreshCw } from 'lucide-react'
import { printHTML } from '../components/PrintReports'
import { useAuth } from '../lib/authContext'

const DEFAULT_QUEUE_VISIBLE_COLUMNS = {
  q_number: true, label: true, split_rule: true, style_number: true, buyer_name: true, job_number: true,
  ship_date: false, po_number: false, store_name: false, description: false, brand_name: false,
  qty: true, shipped_qty: true, balance_qty: true, status: true,
}
const DEFAULT_QUEUE_COLUMN_ORDER = ['q_number','label','split_rule','style_number','buyer_name','job_number','ship_date','po_number','store_name','description','brand_name','qty','shipped_qty','balance_qty','status']
const QUEUE_COLUMN_LABELS = { q_number:'Q #', label:'Label', split_rule:'Split Rule', style_number:'Style', buyer_name:'Buyer', job_number:'Job', ship_date:'Delivery Date', po_number:'PO #', store_name:'Store', description:'Description', brand_name:'Brand', qty:'Qty', shipped_qty:'Shipped', balance_qty:'Balance', status:'Status' }

const inputStyle = { width:'100%', height:32, padding:'0 10px', border:'1px solid #e5e7eb', borderRadius:7, fontSize:12, outline:'none', boxSizing:'border-box', fontFamily:'var(--font)', background:'#fff' }
const thStyle = { padding:'9px 10px', borderBottom:'1px solid #f3f4f6', fontSize:10, fontWeight:800, color:'#9ca3af', textTransform:'uppercase', letterSpacing:'0.4px', whiteSpace:'nowrap' }
const tdStyle = { padding:'10px', borderBottom:'1px solid #f3f4f6', fontSize:12, color:'#374151', whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }
const DEFAULT_PKR_RATE = 278.5

function viewKey(name) {
  const user = (() => { try { return JSON.parse(localStorage.getItem('app2a.auth.user') || '{}') } catch { return {} } })()
  return `app2a.tableView.${user?.id || user?.username || 'user'}.${name}`
}
function loadTableView(name, defaultVisible, defaultOrder) {
  try {
    const saved = JSON.parse(localStorage.getItem(viewKey(name)) || 'null')
    if (saved?.visible && saved?.order) return saved
  } catch {}
  return { visible: defaultVisible, order: defaultOrder }
}
function saveTableView(name, visible, order) {
  try { localStorage.setItem(viewKey(name), JSON.stringify({ visible, order })) } catch {}
}
function DragColumnSettings({ title='Columns', subtitle='Drag to reorder fields', labels, order, visible, defaults, onChange, onReset, onClose }) {
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
      <div style={{ padding:14, display:'flex', flexDirection:'column', gap:8, overflowY:'auto' }}>{order.map(k=><div key={k} draggable onDragStart={()=>setDragKey(k)} onDragOver={e=>e.preventDefault()} onDrop={()=>moveKey(dragKey,k)} style={{ display:'flex', alignItems:'center', gap:10, padding:'8px 10px', border:'1px solid #f3f4f6', borderRadius:8, background:dragKey===k?'#f9fafb':'#fff', cursor:'grab' }}><span style={{ color:'#9ca3af', fontWeight:900, fontSize:14 }}>⋮⋮</span><input type="checkbox" checked={!!visible[k]} onChange={()=>onChange({ order, visible:{...visible,[k]:!visible[k]} })}/><span style={{ flex:1, fontSize:12, fontWeight:700 }}>{labels[k] || k}</span></div>)}</div>
      <div style={{ padding:'12px 18px', borderTop:'1px solid #f3f4f6', display:'flex', justifyContent:'space-between' }}><button className="btn btn-secondary" onClick={onReset}>Reset</button><button className="btn btn-primary" onClick={onClose}>Done</button></div>
    </div>
  </div>
}


function fmtDate(d) {
  if (!d) return '—'
  try { return new Date(d).toLocaleDateString('en-GB', { day:'numeric', month:'short', year:'numeric' }) } catch { return d }
}
function num(v) { return parseFloat(v) || 0 }
function money(v) { return num(v).toLocaleString(undefined, { maximumFractionDigits: 2 }) }
function currencyCodeFromOrder(order) {
  return String(order?.currency || order?.order_currency || order?.po_currency || order?.price_currency || order?.costing_currency || 'USD').toUpperCase()
}
function currencySymbol(code) {
  const c = String(code || 'USD').toUpperCase()
  if (c === 'USD') return '$'
  if (c === 'EUR') return '€'
  if (c === 'GBP') return '£'
  if (c === 'PKR') return 'Rs '
  return c + ' '
}
function moneyCurrency(v, code='USD') { return currencySymbol(code) + num(v).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 }) }
function pkr(v) { return moneyCurrency(v, 'PKR') }
function invoiceDueAmount(row) { return num(row?.buyer_amount_due_override) > 0 ? num(row.buyer_amount_due_override) : num(row?.value) }
function pkrForPayment(row, amount) { return num(amount) * (row?.buyer_done && num(row?.bank_realisation_rate) ? num(row.bank_realisation_rate) : (num(row?.today_pkr_rate) || DEFAULT_PKR_RATE)) }
function hasManualOverride(v) { return v !== undefined && v !== null && String(v).trim() !== '' }
function OverrideReset({ show, onReset, label='Manual override' }) { if (!show) return null; return <div style={{ marginTop:4, display:'flex', alignItems:'center', gap:6, fontSize:10.5, color:'#6b7280' }}><span>{label}</span><button type="button" onClick={onReset} style={{ border:0, background:'transparent', color:'#2563eb', fontSize:10.5, fontWeight:800, padding:0, cursor:'pointer' }}>Reset to system value</button></div> }
function weekBounds(d=new Date()) { const x=new Date(d.getFullYear(), d.getMonth(), d.getDate()); const day=(x.getDay()+6)%7; const start=new Date(x); start.setDate(x.getDate()-day); const end=new Date(start); end.setDate(start.getDate()+6); return [start,end] }
function monthBounds(d=new Date()) { return [new Date(d.getFullYear(), d.getMonth(), 1), new Date(d.getFullYear(), d.getMonth()+1, 0)] }
function dateInRange(v, a, b) { const d=parseDateLoose(v); if(!d) return false; const x=new Date(d.getFullYear(), d.getMonth(), d.getDate()); return x>=a && x<=b }
function safeRoleIsAdmin(roleName) { return String(roleName || '').toLowerCase() === 'admin' }
function safeDateOnly(v) { return v ? String(v).slice(0,10) : '' }

function parseDateLoose(v) {
  if (!v) return null
  if (v instanceof Date && !Number.isNaN(v.getTime())) return v
  const raw = String(v).trim()
  if (!raw) return null
  const iso = raw.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/)
  if (iso) {
    const d = new Date(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3]))
    return Number.isNaN(d.getTime()) ? null : d
  }
  const dmy = raw.match(/^(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{2,4})$/)
  if (dmy) {
    const y = Number(dmy[3].length === 2 ? '20' + dmy[3] : dmy[3])
    const d = new Date(y, Number(dmy[2]) - 1, Number(dmy[1]))
    return Number.isNaN(d.getTime()) ? null : d
  }
  const d = new Date(raw)
  return Number.isNaN(d.getTime()) ? null : d
}
function buyerTermsDays(order) { return num(order?.payment_terms_days || order?.buyer_payment_terms_days || order?.payment_terms || order?.buyer?.payment_terms_days) }
function parsePOTax(notes) {
  const m = String(notes || '').match(/\[PO_TAX:(.*?)\]/)
  if (!m) return null
  try { return JSON.parse(m[1]) } catch { return null }
}
function purchaseTaxByOrder(purchaseOrders) {
  const out = {}
  ;(purchaseOrders || []).forEach(po => {
    const tax = parsePOTax(po.notes)
    if (!tax?.enabled || !po.order_id) return
    const total = (po.purchase_order_items || []).reduce((a,i)=>a+num(i.amount),0)
    const taxAmount = total * (num(tax.rate) / 100)
    out[po.order_id] = (out[po.order_id] || 0) + taxAmount
  })
  return out
}
const SHIPPING_META_START = '\n\n[[APP2A_SHIPPING_META:'
const SHIPPING_META_END = ']]'
function splitShippingNotes(notes) {
  const raw = String(notes || '')
  const i = raw.indexOf(SHIPPING_META_START)
  if (i < 0) return { clean: raw, meta: {} }
  const clean = raw.slice(0, i).trim()
  const rest = raw.slice(i + SHIPPING_META_START.length)
  const j = rest.indexOf(SHIPPING_META_END)
  if (j < 0) return { clean, meta: {} }
  try { return { clean, meta: JSON.parse(atob(rest.slice(0, j))) || {} } } catch { return { clean, meta: {} } }
}
function packShippingNotes(clean, meta) {
  const encoded = btoa(JSON.stringify(meta || {}))
  return String(clean || '').trim() + SHIPPING_META_START + encoded + SHIPPING_META_END
}
function shipmentMeta(shipment) { return splitShippingNotes(shipment?.notes).meta || {} }
function shipmentCleanNotes(shipment) { return splitShippingNotes(shipment?.notes).clean || '' }
function firstNonEmpty(...vals) { return vals.find(v => v !== undefined && v !== null && String(v).trim() !== '') || '' }
function lineMeta(meta, queueId) { return meta?.lines?.[queueId] || {} }
function displayQueueLabel(label) { return String(label || '').split('__APP2A_QC__')[0] }
function nextShipmentNo(shipments) {
  const nums = (shipments || []).map(s => parseInt(String(s.shipment_no || '').replace(/\D/g,''))).filter(Number.isFinite)
  return `SHP-${String(Math.max(0, ...nums) + 1).padStart(4, '0')}`
}
function getOrderValue(order) {
  const direct = num(order?.value || order?.order_value || order?.total_value || order?.total_value_usd || order?.fob_value)
  if (direct) return direct
  const qty = num(order?.total_qty)
  const rate = num(order?.rate || order?.unit_price || order?.price || order?.fob)
  return qty && rate ? qty * rate : 0
}
function getQueueValue(order, queue) {
  const qQty = num(queue?.qty)
  const groups = order?.size_groups || []
  const norm = (v) => String(v || '').trim().toLowerCase()
  const cleanLabel = displayQueueLabel(queue?.label)
  const clean = norm(cleanLabel)
  const byId = groups.find(g => queue?.size_group_id && String(g.id) === String(queue.size_group_id))
  if (byId && num(byId.unit_price) && qQty) return qQty * num(byId.unit_price)
  const byName = groups.find(g => g?.group_name && clean.includes(norm(g.group_name)))
  if (byName && num(byName.unit_price) && qQty) return qQty * num(byName.unit_price)
  const matrixValue = groups.reduce((sum, g) => sum + (num(g.matrix_qty) * num(g.unit_price)), 0)
  const matrixQty = groups.reduce((sum, g) => sum + num(g.matrix_qty), 0)
  if (clean.includes('full po') && matrixValue) return matrixValue
  if (matrixQty && matrixValue && qQty) return (matrixValue / matrixQty) * qQty
  const orderQty = num(order?.total_qty)
  const orderValue = getOrderValue(order)
  if (orderQty && qQty && orderValue) return (orderValue / orderQty) * qQty
  const rate = num(order?.rate || order?.unit_price || order?.price || order?.fob)
  return rate && qQty ? rate * qQty : 0
}

function buildQueueRows(queues, orders, shipmentLines, sizeGroups=[], breakdownRows=[]) {
  const qtyByGroup = {}
  ;(breakdownRows || []).forEach(r => { if (r.size_group_id) qtyByGroup[r.size_group_id] = (qtyByGroup[r.size_group_id] || 0) + num(r.qty) })
  const groupsByOrder = {}
  ;(sizeGroups || []).forEach(g => { if (g.order_id) (groupsByOrder[g.order_id] ||= []).push({ ...g, matrix_qty: qtyByGroup[g.id] || 0 }) })
  const orderMap = Object.fromEntries((orders || []).map(o => [o.id, { ...o, size_groups: groupsByOrder[o.id] || [] }]))
  const shippedByQ = {}
  ;(shipmentLines || []).forEach(l => {
    const qty = num(l.shipped_qty ?? l.ship_qty)
    if (l.queue_id) shippedByQ[l.queue_id] = (shippedByQ[l.queue_id] || 0) + qty
  })
  return (queues || []).map(q => {
    const o = orderMap[q.order_id] || {}
    const shipped = shippedByQ[q.id] || 0
    const qty = num(q.qty)
    const orderQty = num(o.total_qty) || qty
    const qPurchaseTax = orderQty && num(o.purchase_tax_pkr) ? (num(o.purchase_tax_pkr) / orderQty) * qty : 0
    return { ...q, order:o, currency:currencyCodeFromOrder(o), style_number:o.style_number, buyer_name:o.buyer_name, job_number:o.job_number, ship_date:o.ship_date || o.planned_ship_date || o.planned_ex_factory, po_number:o.po_number, store_name:o.store_name, description:o.description, brand_name:o.brand_name, buyer_id:o.buyer_id, buyer_payment_terms_days:buyerTermsDays(o), purchase_tax_pkr:qPurchaseTax, shipped_qty:shipped, balance_qty:Math.max(0, qty - shipped), value:getQueueValue(o, q) }
  })
}
function isQueueRestricted(q) {
  const inactive = !String(q?.q_number || '').trim()
  const unassigned = !String(q?.job_number || '').trim()
  return inactive || unassigned
}
function trackingDays(eta) {
  if (!eta) return '—'
  const today = new Date(); today.setHours(0,0,0,0)
  const d = new Date(eta); d.setHours(0,0,0,0)
  const days = Math.ceil((d - today) / 86400000)
  if (!Number.isFinite(days)) return '—'
  if (days > 1) return `${days} days`
  if (days === 1) return '1 day'
  if (days === 0) return 'Due today'
  return `${Math.abs(days)} days late`
}

const FINAL_SHIPMENT_STATUS_CANDIDATES = ['Shipped', 'Finalized', 'Completed', 'Open', 'Draft']
const DRAFT_SHIPMENT_STATUS_CANDIDATES = ['Draft', 'Open']

async function saveShipmentHeader(payload, isEdit, id) {
  const trySave = async (body) => isEdit
    ? await supabase.from('shipments').update(body).eq('id', id).select().single()
    : await supabase.from('shipments').insert([body]).select().single()

  let res = await trySave(payload)
  if (!res.error || !/shipments_status_check|status/i.test(res.error.message || '')) return res

  const candidates = payload.status === 'Draft' ? DRAFT_SHIPMENT_STATUS_CANDIDATES : FINAL_SHIPMENT_STATUS_CANDIDATES
  for (const status of candidates) {
    res = await trySave({ ...payload, status })
    if (!res.error) return res
    if (!/shipments_status_check|status/i.test(res.error.message || '')) return res
  }

  const { status, ...withoutStatus } = payload
  return await trySave(withoutStatus)
}

function ShipmentModal({ selectedQueues, shipments, onClose, onDone, draft }) {
  const [saving, setSaving] = useState(false)
  const isEdit = !!draft?.shipment
  const [header, setHeader] = useState(() => {
    const meta = shipmentMeta(draft?.shipment)
    return {
      shipment_no: draft?.shipment?.shipment_no || nextShipmentNo(shipments),
      shipment_date: String(draft?.shipment?.shipment_date || new Date().toISOString().slice(0,10)).slice(0,10),
      container_no: firstNonEmpty(draft?.shipment?.container_no, draft?.shipment?.container_number, meta.container_no),
      cro_lp_no: firstNonEmpty(draft?.shipment?.cro_lp_no, draft?.shipment?.booking_ref, draft?.shipment?.booking_no, meta.cro_lp_no),
      gate_pass_no: firstNonEmpty(draft?.shipment?.gate_pass_no, meta.gate_pass_no),
      delivery_challan_no: firstNonEmpty(draft?.shipment?.delivery_challan_no, meta.delivery_challan_no),
      gd_no: firstNonEmpty(draft?.shipment?.gd_no, meta.gd_no),
      hbl_hawb_no: firstNonEmpty(draft?.shipment?.hbl_hawb_no, meta.hbl_hawb_no),
      fi_no: firstNonEmpty(draft?.shipment?.fi_no, meta.fi_no),
      lc_no: firstNonEmpty(draft?.shipment?.lc_no, meta.lc_no),
      tracking_url: firstNonEmpty(draft?.shipment?.tracking_url, meta.tracking_url),
      eta: draft?.shipment?.eta || '',
      etd: draft?.shipment?.etd || '',
      notes: shipmentCleanNotes(draft?.shipment)
    }
  })
  const [lines, setLines] = useState(() => {
    const existing = Object.fromEntries((draft?.lines || []).map(l => [l.queue_id, l]))
    const meta = shipmentMeta(draft?.shipment)
    return Object.fromEntries(selectedQueues.map(q => {
      const l = existing[q.id] || {}
      const lm = lineMeta(meta, q.id)
      const value = firstNonEmpty(l.value, lm.value, q.value ? Number(q.value).toFixed(2) : '')
      return [q.id, {
        qty: firstNonEmpty(l.ship_qty, l.shipped_qty, lm.qty, q.balance_qty, q.qty),
        cartons: firstNonEmpty(l.cartons, lm.cartons),
        cbm: firstNonEmpty(l.cbm, lm.cbm),
        value,
        valueManual: firstNonEmpty(l.value, lm.value) !== '',
        close_queue: !!(l.close_queue ?? lm.close_queue),
        close_reason: firstNonEmpty(l.close_reason, lm.close_reason)
      }]
    }))
  })

  const totals = useMemo(() => Object.values(lines).reduce((a, l) => ({ qty:a.qty+num(l.qty), cartons:a.cartons+num(l.cartons), cbm:a.cbm+num(l.cbm), value:a.value+num(l.value) }), { qty:0, cartons:0, cbm:0, value:0 }), [lines])
  const invalidClose = selectedQueues.some(q => {
    const l = lines[q.id] || {}
    const shippedQty = num(l.qty)
    const expectedQty = num(q.balance_qty || q.qty)
    const isOverShort = Math.abs(shippedQty - expectedQty) > 0.0001
    return l.close_queue && isOverShort && !String(l.close_reason || '').trim()
  })
  function setLine(id, patch) { setLines(prev => ({ ...prev, [id]: { ...(prev[id] || {}), ...patch } })) }
  function setShipQty(q, rawQty) {
    const current = lines[q.id] || {}
    const patch = { qty: rawQty }
    if (!current.valueManual) {
      const baseQty = num(q.balance_qty || q.qty)
      const baseValue = num(q.value)
      patch.value = baseQty && baseValue ? ((num(rawQty) / baseQty) * baseValue).toFixed(2) : current.value
    }
    setLine(q.id, patch)
  }

  function printSummary() {
    const rows = selectedQueues.map(q => `<tr><td>${q.q_number || '—'}</td><td>${q.style_number || '—'}</td><td>${q.buyer_name || '—'}</td><td style="text-align:right">${num(lines[q.id]?.qty).toLocaleString()}</td><td style="text-align:right">${num(lines[q.id]?.cartons).toLocaleString()}</td><td style="text-align:right">${money(lines[q.id]?.cbm)}</td><td style="text-align:right">${money(lines[q.id]?.value)}</td></tr>`).join('')
    printHTML(`<div style="font-family:Arial;padding:24px"><h2>Shipment Summary ${header.shipment_no || ''}</h2><p>Date: ${header.shipment_date || '—'} · Container: ${header.container_no || '—'} · Booking Ref/CRO/LP: ${header.cro_lp_no || '—'} · Gate Pass: ${header.gate_pass_no || '—'} · DC: ${header.delivery_challan_no || '—'}</p><table style="width:100%;border-collapse:collapse"><thead><tr>${['Q #','Style','Buyer','Qty','Cartons','CBM','Value'].map(h=>`<th style="border:1px solid #ddd;padding:8px;background:#f5f5f5;text-align:${['Qty','Cartons','CBM','Value'].includes(h)?'right':'left'}">${h}</th>`).join('')}</tr></thead><tbody>${rows}</tbody><tfoot><tr><td colspan="3" style="border:1px solid #ddd;padding:8px;font-weight:bold">Total</td><td style="border:1px solid #ddd;padding:8px;text-align:right;font-weight:bold">${totals.qty.toLocaleString()}</td><td style="border:1px solid #ddd;padding:8px;text-align:right;font-weight:bold">${totals.cartons.toLocaleString()}</td><td style="border:1px solid #ddd;padding:8px;text-align:right;font-weight:bold">${money(totals.cbm)}</td><td style="border:1px solid #ddd;padding:8px;text-align:right;font-weight:bold">${money(totals.value)}</td></tr></tfoot></table><p>${header.notes || ''}</p></div>`)
  }

  async function save(status) {
    if (!header.shipment_no || !header.shipment_date) { alert('Shipment No and Shipment Date are required.'); return }
    if (invalidClose) { alert('Reason is required only when Close Q is ticked and ship quantity is over/short.'); return }
    setSaving(true)
    const meta = { container_no: header.container_no || '', cro_lp_no: header.cro_lp_no || '', gate_pass_no: header.gate_pass_no || '', delivery_challan_no: header.delivery_challan_no || '', gd_no: header.gd_no || '', hbl_hawb_no: header.hbl_hawb_no || '', fi_no: header.fi_no || '', lc_no: header.lc_no || '', tracking_url: header.tracking_url || '', currency: selectedQueues[0]?.currency || 'USD', lines: Object.fromEntries(selectedQueues.map(q => [q.id, { qty:num(lines[q.id]?.qty), cartons:num(lines[q.id]?.cartons), cbm:num(lines[q.id]?.cbm), value:num(lines[q.id]?.value), close_queue:!!lines[q.id]?.close_queue, close_reason:lines[q.id]?.close_reason || '' }])) }
    const packedNotes = packShippingNotes(header.notes, meta)
    const headerPayload = { shipment_no:header.shipment_no, shipment_date:header.shipment_date, container_no:header.container_no || null, container_number:header.container_no || null, cro_lp_no:header.cro_lp_no || null, booking_ref:header.cro_lp_no || null, gate_pass_no:header.gate_pass_no || null, delivery_challan_no:header.delivery_challan_no || null, gd_no:header.gd_no || null, hbl_hawb_no:header.hbl_hawb_no || null, fi_no:header.fi_no || null, lc_no:header.lc_no || null, tracking_url:header.tracking_url || null, etd:header.etd || null, eta:header.eta || null, notes:packedNotes || null, status }
    let sh = draft?.shipment || null
    let error = null
    {
      const res = await saveShipmentHeader(headerPayload, isEdit, draft?.shipment?.id)
      sh = res.data; error = res.error
    }
    if (error && /container_no|container_number|cro_lp_no|booking_ref|gate_pass_no|delivery_challan_no|gd_no|hbl_hawb_no|fi_no|lc_no|tracking_url|schema cache/i.test(error.message || '')) {
      const fallback = { shipment_no:header.shipment_no, shipment_date:header.shipment_date, etd:header.etd || null, eta:header.eta || null, notes:packedNotes || null, status }
      const res = await saveShipmentHeader(fallback, isEdit, draft?.shipment?.id)
      sh = res.data; error = res.error
    }
    if (error || !sh) { alert(error?.message || 'Could not save shipment.'); setSaving(false); return }

    if (isEdit) await supabase.from('shipment_lines').delete().eq('shipment_id', sh.id)
    const fullLines = selectedQueues.map(q => ({ shipment_id:sh.id, queue_id:q.id, order_id:q.order_id, shipped_qty:num(lines[q.id]?.qty), ship_qty:num(lines[q.id]?.qty), cartons:num(lines[q.id]?.cartons) || null, cbm:num(lines[q.id]?.cbm) || null, value:num(lines[q.id]?.value) || null, close_queue:!!lines[q.id]?.close_queue, close_reason:lines[q.id]?.close_reason || null }))
    let res = await supabase.from('shipment_lines').insert(fullLines)
    if (res.error && /ship_qty|cartons|cbm|value|close_queue|close_reason|schema cache/i.test(res.error.message || '')) {
      const minimalLines = selectedQueues.map(q => ({ shipment_id:sh.id, queue_id:q.id, order_id:q.order_id, shipped_qty:num(lines[q.id]?.qty) }))
      res = await supabase.from('shipment_lines').insert(minimalLines)
    }
    if (res.error) { alert(res.error.message || 'Shipment saved but lines failed.'); setSaving(false); return }
    const closing = selectedQueues.filter(q => lines[q.id]?.close_queue)
    for (const q of closing) await supabase.from('order_queues').update({ status:'Completed' }).eq('id', q.id)
    setSaving(false)
    onDone()
  }

  const labelStyle = { fontSize:10.5, fontWeight:800, color:'#6b7280', display:'block', marginBottom:4 }

  return (
    <div style={{ position:'fixed', inset:0, background:'rgba(17,24,39,0.48)', zIndex:400, display:'flex', alignItems:'center', justifyContent:'center', padding:16 }}>
      <div style={{ width:'min(1360px, 96vw)', height:'min(88vh, 760px)', background:'#fff', borderRadius:14, boxShadow:'0 24px 70px rgba(0,0,0,0.25)', display:'flex', flexDirection:'column', overflow:'hidden' }}>
        <div style={{ padding:'12px 18px', borderBottom:'1px solid #eef2f7', display:'flex', alignItems:'center', justifyContent:'space-between', flexShrink:0 }}>
          <div><div style={{ fontSize:17, fontWeight:900 }}>{isEdit ? 'Edit Shipment' : 'New Shipment'}</div><div style={{ fontSize:11, color:'#6b7280', marginTop:2 }}>{selectedQueues.length} selected queue(s). Compact shipment info left, queue details right.</div></div>
          <button className="btn btn-ghost" onClick={onClose}><X size={16}/></button>
        </div>
        <div style={{ display:'grid', gridTemplateColumns:'32% 68%', flex:1, minHeight:0, overflow:'hidden' }}>
          <div style={{ padding:14, borderRight:'1px solid #eef2f7', background:'#fafafa', overflow:'hidden' }}>
            <div style={{ fontSize:10, fontWeight:900, color:'#9ca3af', letterSpacing:'.5px', textTransform:'uppercase', marginBottom:8 }}>Shipment Info</div>
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10 }}>
              {[['Shipment No','shipment_no','text'],['Shipment Date','shipment_date','date'],['Container No','container_no','text'],['Booking Ref / CRO No / LP Ref','cro_lp_no','text'],['ETD','etd','date'],['ETA','eta','date'],['Gate Pass #','gate_pass_no','text'],['Delivery Challan #','delivery_challan_no','text'],['GD #','gd_no','text'],['HBL # / HAWB #','hbl_hawb_no','text'],['F.I #','fi_no','text'],['LC #','lc_no','text']].map(([label,key,type]) => <div key={key}><label style={labelStyle}>{label}</label><input style={inputStyle} type={type} value={header[key] || ''} onChange={e=>setHeader(h=>({...h,[key]:e.target.value}))}/></div>)}
              <div style={{ gridColumn:'1 / -1' }}><label style={labelStyle}>Tracking URL</label><input style={inputStyle} type="url" placeholder="https://..." value={header.tracking_url || ''} onChange={e=>setHeader(h=>({...h,tracking_url:e.target.value}))}/></div>
              <div style={{ gridColumn:'1 / -1' }}><label style={labelStyle}>Notes</label><textarea style={{ ...inputStyle, height:62, padding:8, resize:'none' }} value={header.notes} onChange={e=>setHeader(h=>({...h,notes:e.target.value}))}/></div>
            </div>
          </div>
          <div style={{ padding:10, overflow:'auto', minWidth:0 }}>
            <table style={{ width:'100%', borderCollapse:'collapse', tableLayout:'fixed' }}>
              <thead><tr style={{ background:'#fafafa', position:'sticky', top:0, zIndex:2 }}>{['Q #','Style','Buyer','Balance','Ship Qty','Cartons','CBM','Value','Close Q','Reason'].map(h=><th key={h} style={{ ...thStyle, padding:'8px 6px', textAlign:['Balance','Ship Qty','Cartons','CBM','Value'].includes(h)?'right':'left' }}>{h}</th>)}</tr></thead>
              <tbody>{selectedQueues.map(q => <tr key={q.id}><td style={{...tdStyle,padding:'8px 6px'}}><b>{q.q_number || '—'}</b><div style={{ fontSize:9.5, color:'#9ca3af', overflow:'hidden', textOverflow:'ellipsis' }}>{displayQueueLabel(q.label)}</div></td><td style={{...tdStyle,padding:'8px 6px'}}>{q.style_number || '—'}</td><td style={{...tdStyle,padding:'8px 6px'}}>{q.buyer_name || '—'}</td><td style={{ ...tdStyle, padding:'8px 6px', textAlign:'right' }}>{num(q.balance_qty || q.qty).toLocaleString()}</td><td style={{...tdStyle,padding:'8px 6px'}}><input style={{ ...inputStyle, textAlign:'right', width:'100%' }} type="number" value={lines[q.id]?.qty || ''} onChange={e=>setShipQty(q,e.target.value)}/></td><td style={{...tdStyle,padding:'8px 6px'}}><input style={{ ...inputStyle, textAlign:'right', width:'100%' }} type="number" value={lines[q.id]?.cartons || ''} onChange={e=>setLine(q.id,{cartons:e.target.value})}/></td><td style={{...tdStyle,padding:'8px 6px'}}><input style={{ ...inputStyle, textAlign:'right', width:'100%' }} type="number" step="0.01" value={lines[q.id]?.cbm || ''} onChange={e=>setLine(q.id,{cbm:e.target.value})}/></td><td style={{...tdStyle,padding:'8px 6px'}}><input style={{ ...inputStyle, textAlign:'right', width:'100%' }} type="number" step="0.01" value={lines[q.id]?.value || ''} onChange={e=>setLine(q.id,{value:e.target.value,valueManual:true})}/><OverrideReset show={!!lines[q.id]?.valueManual} onReset={()=>setLine(q.id,{value:q.value || '',valueManual:false})}/></td><td style={{ ...tdStyle, padding:'8px 6px', textAlign:'center' }}><input type="checkbox" checked={!!lines[q.id]?.close_queue} onChange={e=>setLine(q.id,{close_queue:e.target.checked})}/></td><td style={{...tdStyle,padding:'8px 6px'}}><input style={{ ...inputStyle, width:'100%', borderColor:lines[q.id]?.close_queue && Math.abs(num(lines[q.id]?.qty) - num(q.balance_qty || q.qty)) > 0.0001 && !lines[q.id]?.close_reason ? '#f59e0b' : '#e5e7eb' }} placeholder={lines[q.id]?.close_queue && Math.abs(num(lines[q.id]?.qty) - num(q.balance_qty || q.qty)) > 0.0001 ? 'Required for over/short' : 'Optional'} value={lines[q.id]?.close_reason || ''} onChange={e=>setLine(q.id,{close_reason:e.target.value})}/></td></tr>)}</tbody>
            </table>
          </div>
        </div>
        <div style={{ padding:'10px 18px', borderTop:'1px solid #eef2f7', display:'flex', justifyContent:'space-between', alignItems:'center', background:'#fff', flexShrink:0 }}>
          <div style={{ display:'flex', alignItems:'center', gap:18, fontSize:12, color:'#111827', fontWeight:800 }}><span>Quantity: {totals.qty.toLocaleString()}</span><span>Cartons: {totals.cartons.toLocaleString()}</span><span>CBM: {money(totals.cbm)}</span><span>Value: {money(totals.value)}</span></div>
          <div style={{ display:'flex', gap:8 }}><button className="btn btn-secondary" onClick={printSummary}><Printer size={14}/> Print Summary</button><button className="btn btn-secondary" disabled={saving} onClick={()=>save('Draft')}>Save as Draft</button><button className="btn btn-primary" disabled={saving} onClick={()=>save('Shipped')}>{saving ? 'Saving...' : (isEdit ? 'Update Shipment' : 'Create Shipment')}</button></div>
        </div>
      </div>
    </div>
  )
}

function CreateShipmentTab({ loading, rows, selectedIds, setSelectedIds, onNewShipment, isAdmin }) {
  const [search, setSearch] = useState('')
  const [groupBy, setGroupBy] = useState('none')
  const [sort, setSort] = useState({ col:'q_number', dir:'asc' })
  const [filterBuyer, setFilterBuyer] = useState('')
  const [filterStyle, setFilterStyle] = useState('')
  const [filterJob, setFilterJob] = useState('')
  const [filterRule, setFilterRule] = useState('')
  const [filterStatus, setFilterStatus] = useState('')
  const [quickFilter, setQuickFilter] = useState('all')
  const savedQueueView = loadTableView('shipping.bookings', DEFAULT_QUEUE_VISIBLE_COLUMNS, DEFAULT_QUEUE_COLUMN_ORDER)
  const [visibleCols, setVisibleCols] = useState(savedQueueView.visible)
  const [colOrder, setColOrder] = useState(savedQueueView.order)
  const [showCols, setShowCols] = useState(false)
  useEffect(() => saveTableView('shipping.bookings', visibleCols, colOrder), [visibleCols, colOrder])

  const buyers = [...new Set(rows.map(q => q.buyer_name).filter(Boolean))].sort()
  const styles = [...new Set(rows.map(q => q.style_number).filter(Boolean))].sort()
  const jobs = [...new Set(rows.map(q => q.job_number).filter(Boolean))].sort()
  const rules = [...new Set(rows.map(q => q.split_rule).filter(Boolean))].sort()
  const statuses = [...new Set(rows.map(q => q.status).filter(Boolean))].sort()
  const visibleKeys = colOrder.filter(k => visibleCols[k])

  const filtered = useMemo(() => {
    const s = search.toLowerCase()
    return rows.filter(q => {
      const hay = [q.q_number, displayQueueLabel(q.label), q.style_number, q.buyer_name, q.job_number, q.po_number].join(' ').toLowerCase()
      return (!s || hay.includes(s)) && (!filterBuyer || q.buyer_name === filterBuyer) && (!filterStyle || q.style_number === filterStyle) && (!filterJob || q.job_number === filterJob) && (!filterRule || q.split_rule === filterRule) && (!filterStatus || q.status === filterStatus)
    }).sort((a,b) => {
      const av = sort.col.includes('qty') ? num(a[sort.col]) : String(a[sort.col] || '')
      const bv = sort.col.includes('qty') ? num(b[sort.col]) : String(b[sort.col] || '')
      const cmp = typeof av === 'number' ? av - bv : av.localeCompare(bv, undefined, { numeric:true })
      return sort.dir === 'asc' ? cmp : -cmp
    })
  }, [rows, search, filterBuyer, filterStyle, filterJob, filterRule, filterStatus, sort])

  const displayRows = useMemo(() => {
    if (groupBy === 'none') return filtered.map(q => ({ type:'q', q }))
    const out = [], groups = {}
    filtered.forEach(q => { const key = q[groupBy] || '—'; (groups[key] ||= []).push(q) })
    Object.keys(groups).sort().forEach(key => { const arr = groups[key]; out.push({ type:'group', key, count:arr.length, qty:arr.reduce((s,q)=>s+num(q.qty),0), shipped:arr.reduce((s,q)=>s+num(q.shipped_qty),0) }); arr.forEach(q=>out.push({type:'q',q})) })
    return out
  }, [filtered, groupBy])

  const totalQty = rows.reduce((s,q)=>s+num(q.qty),0), shippedQty = rows.reduce((s,q)=>s+num(q.shipped_qty),0), activeRows = rows.filter(q=>String(q.q_number||'').trim()), activeQty = activeRows.reduce((s,q)=>s+num(q.qty),0), inactiveRows = rows.filter(q=>!String(q.q_number||'').trim()), inactiveQty = inactiveRows.reduce((s,q)=>s+num(q.qty),0), pct = totalQty ? Math.round((shippedQty/totalQty)*100) : 0
  const selectedCount = selectedIds.size
  function toggleSelect(id) { const q = rows.find(r => r.id === id); if (!isAdmin && !selectedIds.has(id) && isQueueRestricted(q)) { alert('Only admins can book/ship inactive or unassigned Qs.'); return } setSelectedIds(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n }) }
  function toggleAll() { setSelectedIds(prev => { if (filtered.every(q=>prev.has(q.id))) return new Set(); const allowed = filtered.filter(q => isAdmin || !isQueueRestricted(q)); const blocked = filtered.length - allowed.length; if (blocked) alert('Only admins can book/ship inactive or unassigned Qs. Restricted Qs were not selected.'); return new Set([...prev, ...allowed.map(q=>q.id)]) }) }
  function renderCell(q,k) { const right = ['qty','shipped_qty','balance_qty'].includes(k); const v = k === 'label' ? displayQueueLabel(q[k]) : k.includes('date') ? fmtDate(q[k]) : ['qty','shipped_qty','balance_qty'].includes(k) ? num(q[k]).toLocaleString() : (q[k] || '—'); return <td key={k} style={{ ...tdStyle, textAlign:right?'right':'left' }}>{k === 'status' ? <span style={{ padding:'3px 8px', borderRadius:999, background:'#f3f4f6', fontWeight:800, fontSize:11 }}>{v}</span> : v}</td> }
  function exportCSV() { const head = visibleKeys.map(k=>QUEUE_COLUMN_LABELS[k]); const lines = [head.join(',')].concat(filtered.map(q=>visibleKeys.map(k=>`"${String(k==='label'?displayQueueLabel(q[k]):q[k] ?? '').replace(/"/g,'""')}"`).join(','))); const a=document.createElement('a'); a.href=URL.createObjectURL(new Blob([lines.join('\n')],{type:'text/csv'})); a.download='shipping-queue.csv'; a.click() }
  function printList() { const head = visibleKeys.map(k=>`<th style="border:1px solid #ddd;padding:8px;background:#f5f5f5;text-align:left">${QUEUE_COLUMN_LABELS[k]}</th>`).join(''); const body = filtered.map(q=>`<tr>${visibleKeys.map(k=>`<td style="border:1px solid #ddd;padding:8px">${k==='label'?displayQueueLabel(q[k]):(q[k]??'')}</td>`).join('')}</tr>`).join(''); printHTML(`<div style="font-family:Arial;padding:24px"><h2>Shipping Queue</h2><table style="width:100%;border-collapse:collapse"><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table></div>`) }

  if (loading) return <div style={{ padding:60, textAlign:'center', color:'#9ca3af', fontSize:12 }}>Loading queues...</div>
  return <div style={{ display:'flex', flexDirection:'column', flex:1, minHeight:0, background:'#fff' }}>
    <div style={{ padding:'12px 24px', borderBottom:'1px solid #f3f4f6', display:'flex', alignItems:'center', gap:14, flexShrink:0, minWidth:0 }}>
      <div style={{ flexShrink:0 }}><div style={{ fontSize:20, fontWeight:800, letterSpacing:'-0.4px' }}>Bookings</div><div style={{ fontSize:11, color:'var(--text-light)', marginTop:1 }}>Queue mirror: select Qs first, then create shipment</div></div>
      <div style={{ display:'flex', gap:8, alignItems:'stretch', minWidth:0 }}>
        {[{l:'Total Queues',v:rows.length,q:totalQty},{l:'Active Queues',v:activeRows.length,q:activeQty},{l:'Inactive Queues',v:inactiveRows.length,q:inactiveQty}].map(k => <div key={k.l} style={{ padding:'7px 12px', border:'1px solid var(--border)', borderRadius:8, background:'#fff', minWidth:120 }}><div style={{ fontSize:9, fontWeight:700, color:'var(--text-light)', textTransform:'uppercase', letterSpacing:'0.5px', marginBottom:3 }}>{k.l}</div><div style={{ display:'flex', alignItems:'baseline', gap:8 }}><div style={{ fontSize:18, fontWeight:800, lineHeight:1 }}>{k.v}</div><div style={{ fontSize:10, color:'#6b7280', fontWeight:700 }}>{Number(k.q||0).toLocaleString()} pcs</div></div></div>)}
        <div style={{ padding:'7px 12px', border:'1px solid var(--border)', borderRadius:8, background:'#fff', minWidth:170 }}><div style={{ fontSize:9, fontWeight:700, color:'var(--text-light)', textTransform:'uppercase', letterSpacing:'0.5px', marginBottom:3 }}>Shipped Progress</div><div style={{ display:'flex', alignItems:'baseline', gap:8 }}><div style={{ fontSize:18, fontWeight:800, lineHeight:1 }}>{pct}%</div><div style={{ fontSize:10, color:'#6b7280', fontWeight:700 }}>{shippedQty.toLocaleString()} / {totalQty.toLocaleString()} pcs</div></div><div style={{ marginTop:6, height:6, borderRadius:999, background:'#e5e7eb', overflow:'hidden', border:'1px solid #d1d5db' }}><div style={{ width:`${pct}%`, height:'100%', background:'#22c55e' }} /></div></div>
      </div>
      <div style={{ marginLeft:'auto', display:'flex', gap:8, alignItems:'center', flexShrink:0 }}><span style={{ fontSize:11, color:'#6b7280', fontWeight:800 }}>{selectedCount} selected</span><button className="btn btn-secondary" style={{ height:36 }} disabled={filtered.length === 0} onClick={exportCSV}>Export</button><button className="btn btn-secondary" style={{ height:36 }} disabled={filtered.length === 0} onClick={printList}>Print</button><button className="btn btn-primary" style={{ height:36, minWidth:132 }} onClick={onNewShipment}><Plus size={15}/> New Shipment</button></div>
    </div>
    <div style={{ padding:'8px 24px', borderBottom:'1px solid #f3f4f6', display:'flex', alignItems:'center', gap:8, flexShrink:0, overflowX:'auto', overflowY:'hidden' }}>
      <div style={{ position:'relative', width:230, flex:'0 0 230px' }}><Search size={13} style={{ position:'absolute', left:9, top:'50%', transform:'translateY(-50%)', color:'#9ca3af' }} /><input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search Q#, label, style, buyer..." style={{ ...inputStyle, paddingLeft:28, background:'#fafafa' }} /></div>
      <select value={groupBy} onChange={e=>setGroupBy(e.target.value)} style={inputStyle}><option value="none">☰ No Group</option><option value="style_number">☰ By Style</option><option value="job_number">☰ By Job</option><option value="buyer_name">☰ By Buyer</option><option value="q_number">☰ By Serial / Q#</option><option value="ship_date">☰ By Delivery Date</option></select>
      <select value={`${sort.col}:${sort.dir}`} onChange={e=>{ const [col,dir]=e.target.value.split(':'); setSort({col,dir}) }} style={inputStyle}><option value="q_number:asc">⇅ Q# Asc</option><option value="q_number:desc">⇅ Q# Desc</option><option value="ship_date:asc">⇅ Delivery Asc</option><option value="ship_date:desc">⇅ Delivery Desc</option><option value="qty:desc">⇅ Qty High → Low</option><option value="qty:asc">⇅ Qty Low → High</option></select>
      <select value={filterBuyer} onChange={e=>setFilterBuyer(e.target.value)} style={inputStyle}><option value="">All Buyers</option>{buyers.map(v=><option key={v}>{v}</option>)}</select><select value={filterStyle} onChange={e=>setFilterStyle(e.target.value)} style={inputStyle}><option value="">All Styles</option>{styles.map(v=><option key={v}>{v}</option>)}</select><select value={filterJob} onChange={e=>setFilterJob(e.target.value)} style={inputStyle}><option value="">All Jobs</option>{jobs.map(v=><option key={v}>{v}</option>)}</select><select value={filterRule} onChange={e=>setFilterRule(e.target.value)} style={inputStyle}><option value="">All Split Rules</option>{rules.map(v=><option key={v}>{v}</option>)}</select><select value={filterStatus} onChange={e=>setFilterStatus(e.target.value)} style={inputStyle}><option value="">All Status</option>{statuses.map(v=><option key={v}>{v}</option>)}</select><button className="btn btn-secondary" style={{ height:32, marginLeft:'auto' }} onClick={()=>setShowCols(true)} title="Column Settings"><Settings size={15}/></button>
    </div>
    <div style={{ flex:1, overflowY:'auto', overflowX:'auto' }}>{filtered.length === 0 ? <div style={{ textAlign:'center', padding:60, color:'#9ca3af', fontSize:12 }}>No queues yet.</div> : <table style={{ width:'100%', borderCollapse:'collapse', minWidth:980 }}><thead><tr style={{ background:'#fafafa', position:'sticky', top:0, zIndex:10 }}><th style={{ width:40, padding:'9px 0 9px 18px', borderBottom:'1px solid #f3f4f6' }}><input type="checkbox" checked={filtered.length>0 && filtered.every(q=>selectedIds.has(q.id))} onChange={toggleAll}/></th>{visibleKeys.map(k=><th key={k} style={{ ...thStyle, textAlign:['qty','shipped_qty','balance_qty'].includes(k)?'right':'left' }}>{QUEUE_COLUMN_LABELS[k]}</th>)}</tr></thead><tbody>{displayRows.map(row=>{ if(row.type==='group') return <tr key={`g-${row.key}`} style={{ background:'#fdf6e3' }}><td colSpan={1+visibleKeys.length} style={{ padding:'10px 18px', borderBottom:'1px solid #eee', borderTop:'1px solid #eee' }}><div style={{ display:'flex', justifyContent:'space-between', fontSize:12, fontWeight:800 }}><span>{row.key} <span style={{ color:'#9ca3af' }}>— {row.count} queues</span></span><span>Qty: {row.qty.toLocaleString()} · Shipped: {row.shipped.toLocaleString()}</span></div></td></tr>; const q=row.q, isSel=selectedIds.has(q.id); return <tr key={q.id} style={{ background:isSel?'#f0f9ff':'' }}><td style={{ padding:'11px 0 11px 18px', borderBottom:'1px solid #f3f4f6' }}><input type="checkbox" checked={isSel} onChange={()=>toggleSelect(q.id)}/></td>{visibleKeys.map(k=>renderCell(q,k))}</tr> })}</tbody></table>}</div>
    {showCols && <DragColumnSettings title="Queue Columns" labels={QUEUE_COLUMN_LABELS} order={colOrder} visible={visibleCols} onChange={({order,visible})=>{setColOrder(order);setVisibleCols(visible)}} onReset={()=>{setVisibleCols(DEFAULT_QUEUE_VISIBLE_COLUMNS);setColOrder(DEFAULT_QUEUE_COLUMN_ORDER)}} onClose={()=>setShowCols(false)}/>}
  </div>
}

function ShipmentsTab({ shipments, shipmentLines, rows, onRefresh, onEdit }) {
  const [search, setSearch] = useState('')
  const [groupBy, setGroupBy] = useState('none')
  const [sort, setSort] = useState({ col:'shipment_date', dir:'desc' })
  const [filterStatus, setFilterStatus] = useState('')
  const [quickFilter, setQuickFilter] = useState('all')
  const [showCols, setShowCols] = useState(false)
  const [selectedShipmentIds, setSelectedShipmentIds] = useState(new Set())
  const [showSummaryRange, setShowSummaryRange] = useState(false)
  const [summaryRange, setSummaryRange] = useState({ from:'', to:'' })
  const defaultCols = { shipment_date:true, shipment_no:true, container_no:true, booking_ref:true, etd:true, eta:true, queues:true, qty:true, cartons:true, cbm:true, value:true, tracking:true, status:true }
  const labels = { shipment_date:'Ship Date', shipment_no:'Shipment Number', container_no:'Container Number', booking_ref:'Booking Ref/CRO/LP', etd:'ETD', eta:'ETA', queues:'Queues', qty:'Total Qty', cartons:'Cartons', cbm:'CBM', value:'Value', tracking:'Tracking', status:'Status' }
  const defaultOrder = ['shipment_date','shipment_no','container_no','booking_ref','etd','eta','queues','qty','cartons','cbm','value','tracking','status']
  const savedShipView = loadTableView('shipping.shipments', defaultCols, defaultOrder)
  const [visibleCols, setVisibleCols] = useState(savedShipView.visible)
  const [colOrder, setColOrder] = useState(savedShipView.order)
  useEffect(() => saveTableView('shipping.shipments', visibleCols, colOrder), [visibleCols, colOrder])
  const rowMap = Object.fromEntries(rows.map(q => [q.id, q]))
  const data = shipments.map(s => {
    const meta = shipmentMeta(s)
    const lines = shipmentLines.filter(l=>l.shipment_id===s.id)
    const lm = (l) => lineMeta(meta, l.queue_id)
    const qty=lines.reduce((a,l)=>a+num(firstNonEmpty(l.shipped_qty, l.ship_qty, lm(l).qty)),0)
    const cartons=lines.reduce((a,l)=>a+num(firstNonEmpty(l.cartons, lm(l).cartons)),0)
    const cbm=lines.reduce((a,l)=>a+num(firstNonEmpty(l.cbm, lm(l).cbm)),0)
    const value=lines.reduce((a,l)=>a+num(firstNonEmpty(l.value, lm(l).value)),0)
    const qLabels=lines.map(l=>String(rowMap[l.queue_id]?.q_number || '').trim() || 'Nil')
    const qs=qLabels.length ? qLabels.join(', ') : 'Nil'
    return { ...s, qty, cartons, cbm, value, qs, lineCount:lines.length, currency:meta.currency || lines.map(l=>rowMap[l.queue_id]?.currency).find(Boolean) || 'USD', container_no:firstNonEmpty(s.container_no, s.container_number, meta.container_no), booking_ref:firstNonEmpty(s.cro_lp_no, s.booking_ref, s.booking_no, meta.cro_lp_no), tracking_url:firstNonEmpty(s.tracking_url, meta.tracking_url), tracking:trackingDays(s.eta) }
  })
  const statuses = [...new Set(data.map(s=>s.status).filter(Boolean))].sort()
  const visibleKeys = colOrder.filter(k => visibleCols[k])
  const [weekStart, weekEnd] = weekBounds()
  const [monthStart, monthEnd] = monthBounds()
  const filtered = useMemo(() => {
    const q = search.toLowerCase()
    return data.filter(s => {
      const hay = [s.shipment_no, s.container_no, s.booking_ref, s.qs, s.status].join(' ').toLowerCase()
      return (!q || hay.includes(q)) && (!filterStatus || s.status === filterStatus)
    }).sort((a,b) => {
      const numeric = ['qty','cartons','cbm','value'].includes(sort.col)
      const av = numeric ? num(a[sort.col]) : String(a[sort.col] || '')
      const bv = numeric ? num(b[sort.col]) : String(b[sort.col] || '')
      const cmp = numeric ? av - bv : av.localeCompare(bv, undefined, { numeric:true })
      return sort.dir === 'asc' ? cmp : -cmp
    })
  }, [data, search, filterStatus, sort])
  const displayRows = useMemo(() => {
    if (groupBy === 'none') return filtered.map(s => ({ type:'shipment', s }))
    const groups = {}, out = []
    filtered.forEach(s => { const key = s[groupBy] || '—'; (groups[key] ||= []).push(s) })
    Object.keys(groups).sort().forEach(key => { const arr = groups[key]; out.push({ type:'group', key, count:arr.length, qty:arr.reduce((a,s)=>a+num(s.qty),0) }); arr.forEach(s=>out.push({ type:'shipment', s })) })
    return out
  }, [filtered, groupBy])
  const selectedShipments = data.filter(s => selectedShipmentIds.has(s.id))
  function toggleShipment(id) { setSelectedShipmentIds(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n }) }
  function toggleAllShipments() { setSelectedShipmentIds(prev => filtered.length && filtered.every(s=>prev.has(s.id)) ? new Set() : new Set([...prev, ...filtered.map(s=>s.id)])) }
  function assertOne(action) { if (selectedShipments.length !== 1) { alert(`Select exactly one shipment to ${action}.`); return null } return selectedShipments[0] }
  function printShipment(s) { const lines = shipmentLines.filter(l=>l.shipment_id===s.id); const meta=shipmentMeta(s); const body = lines.map(l=>{ const q=rowMap[l.queue_id]||{}; const lm=lineMeta(meta,l.queue_id); return `<tr><td>${q.q_number||'Nil'}</td><td>${q.style_number||'—'}</td><td>${q.buyer_name||'—'}</td><td style="text-align:right">${num(firstNonEmpty(l.shipped_qty,l.ship_qty,lm.qty)).toLocaleString()}</td><td style="text-align:right">${num(firstNonEmpty(l.cartons,lm.cartons)).toLocaleString()}</td><td style="text-align:right">${money(firstNonEmpty(l.cbm,lm.cbm))}</td><td style="text-align:right">${moneyCurrency(firstNonEmpty(l.value,lm.value), s.currency)}</td></tr>` }).join(''); printHTML(`<div style="font-family:Arial;padding:24px"><h2>Shipment ${s.shipment_no||''}</h2><p>Date: ${fmtDate(s.shipment_date)} · Container: ${s.container_no || '—'} · Booking: ${s.booking_ref || '—'} · ETD: ${fmtDate(s.etd)} · ETA: ${fmtDate(s.eta)}</p><table style="width:100%;border-collapse:collapse"><thead><tr><th>Q #</th><th>Style</th><th>Buyer</th><th>Qty</th><th>Cartons</th><th>CBM</th><th>Value</th></tr></thead><tbody>${body}</tbody></table></div>`) }
  function cellValue(s,k,jsx=true) {
    if (k === 'shipment_date' || k === 'etd' || k === 'eta') return fmtDate(s[k])
    if (k === 'booking_ref') return s.booking_ref || '—'
    if (k === 'container_no') return s.container_no || '—'
    if (k === 'queues') return s.qs || 'Nil'
    if (['qty','cartons'].includes(k)) return num(s[k]).toLocaleString()
    if (k === 'cbm') return money(s[k])
    if (k === 'value') return moneyCurrency(s[k], s.currency)
    if (k === 'tracking') return jsx && s.tracking_url ? <a href={s.tracking_url} target="_blank" rel="noreferrer" style={{ color:'#111827', fontWeight:800, textDecoration:'underline' }}>{s.tracking || 'Track'}</a> : (s.tracking || '—')
    if (k === 'status' && jsx) return <span style={{ padding:'3px 8px', borderRadius:999, background:s.status==='Draft'?'#fff7ed':'#ecfdf5', fontWeight:800, fontSize:11 }}>{s.status||'Created'}</span>
    return s[k] || '—'
  }
  function exportCSV(list=filtered) { const head = visibleKeys.map(k=>labels[k]); const lines = [head.join(',')].concat(list.map(s=>visibleKeys.map(k=>`"${String(cellValue(s,k,false)).replace(/"/g,'""')}"`).join(','))); const a=document.createElement('a'); a.href=URL.createObjectURL(new Blob([lines.join('\n')],{type:'text/csv'})); a.download='shipments.csv'; a.click() }
  function printList(list=filtered) { const head = visibleKeys.map(k=>`<th style="border:1px solid #ddd;padding:8px;background:#f5f5f5;text-align:left">${labels[k]}</th>`).join(''); const body = list.map(s=>`<tr>${visibleKeys.map(k=>`<td style="border:1px solid #ddd;padding:8px">${cellValue(s,k,false)}</td>`).join('')}</tr>`).join(''); printHTML(`<div style="font-family:Arial;padding:24px"><h2>Shipments</h2><table style="width:100%;border-collapse:collapse"><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table></div>`) }
  async function deleteShipment(s) {
    if (!window.confirm(`Delete shipment ${s.shipment_no || ''}? This cannot be undone.`)) return
    await supabase.from('shipment_lines').delete().eq('shipment_id', s.id)
    const { error } = await supabase.from('shipments').delete().eq('id', s.id)
    if (error) { alert(error.message || 'Could not delete shipment.'); return }
    setSelectedShipmentIds(new Set())
    onRefresh()
  }
  async function deleteSelected() { const s=assertOne('delete'); if (s) await deleteShipment(s) }
  function editSelected() { const s=assertOne('edit'); if (s) onEdit(s) }
  function printSelected() { const list=selectedShipments.length ? selectedShipments : filtered; if (selectedShipments.length === 1) printShipment(selectedShipments[0]); else printList(list) }
  function exportSelected() { exportCSV(selectedShipments.length ? selectedShipments : filtered) }
  function renderCell(s,k) { const right = ['qty','cartons','cbm','value'].includes(k); return <td key={k} style={{ ...tdStyle, textAlign:right?'right':'left' }}>{cellValue(s,k,true)}</td> }
  const actionBtnStyle = { height:32, width:34, padding:0, display:'inline-flex', alignItems:'center', justifyContent:'center', lineHeight:1, verticalAlign:'middle' }
  const labelStyle = { fontSize:10.5, fontWeight:800, color:'#6b7280', display:'block', marginBottom:4 }
  const shippedThisMonth = data.filter(s=>{ const d=new Date(s.shipment_date); return d>=monthStart && d<monthEnd })
  const etaThisWeek = data.filter(s=>{ const d=new Date(s.eta); return d>=weekStart && d<weekEnd }).length
  const etaThisMonth = data.filter(s=>{ const d=new Date(s.eta); return d>=monthStart && d<monthEnd }).length
  const monthQty = shippedThisMonth.reduce((a,s)=>a+num(s.qty),0), monthValue = shippedThisMonth.reduce((a,s)=>a+num(s.value),0), monthCurrency = shippedThisMonth[0]?.currency || 'USD'
  function printSummaryRange() { const from = summaryRange.from ? new Date(summaryRange.from) : null; const to = summaryRange.to ? new Date(summaryRange.to) : null; if (to) to.setHours(23,59,59,999); const list = data.filter(s=>{ const d=new Date(s.shipment_date); return (!from || d>=from) && (!to || d<=to) }); setShowSummaryRange(false); printList(list) }
  return <div style={{ display:'flex', flexDirection:'column', flex:1, minHeight:0, background:'#fff' }}>
    <div style={{ padding:'12px 24px', borderBottom:'1px solid #f3f4f6', display:'flex', justifyContent:'space-between', alignItems:'center', gap:16, flexShrink:0 }}>
      <div style={{ display:'flex', alignItems:'center', gap:16 }}>
        <div><div style={{ fontSize:20, fontWeight:800 }}>Shipments</div><div style={{ fontSize:11, color:'#6b7280' }}>Shipment records, drafts and print summaries</div></div>
        <div style={{ display:'flex', gap:8, alignItems:'stretch', minWidth:0 }}>
          <div style={{ padding:'8px 13px', border:'1px solid #e5e7eb', borderRadius:10, background:'#fff', minWidth:190, boxShadow:'0 1px 2px rgba(15,23,42,0.04)' }}><div style={{ fontSize:9, fontWeight:900, color:'#9ca3af', textTransform:'uppercase', letterSpacing:'0.55px', marginBottom:4 }}>Shipped This Month</div><div style={{ display:'flex', alignItems:'baseline', gap:8 }}><div style={{ fontSize:19, fontWeight:900, lineHeight:1 }}>{String(shippedThisMonth.length).padStart(2,'0')}</div><div style={{ fontSize:10, color:'#6b7280', fontWeight:800 }}>{monthQty.toLocaleString()} pcs · {moneyCurrency(monthValue, monthCurrency)}</div></div></div>
          <div style={{ padding:'8px 13px', border:'1px solid #e5e7eb', borderRadius:10, background:'#fff', minWidth:132, boxShadow:'0 1px 2px rgba(15,23,42,0.04)' }}><div style={{ fontSize:9, fontWeight:900, color:'#9ca3af', textTransform:'uppercase', letterSpacing:'0.55px', marginBottom:4 }}>ETA This Week</div><div style={{ display:'flex', alignItems:'baseline', gap:8 }}><div style={{ fontSize:19, fontWeight:900, lineHeight:1 }}>{String(etaThisWeek).padStart(2,'0')}</div><div style={{ fontSize:10, color:'#6b7280', fontWeight:800 }}>shipments</div></div></div>
          <div style={{ padding:'8px 13px', border:'1px solid #e5e7eb', borderRadius:10, background:'#fff', minWidth:140, boxShadow:'0 1px 2px rgba(15,23,42,0.04)' }}><div style={{ fontSize:9, fontWeight:900, color:'#9ca3af', textTransform:'uppercase', letterSpacing:'0.55px', marginBottom:4 }}>ETA This Month</div><div style={{ display:'flex', alignItems:'baseline', gap:8 }}><div style={{ fontSize:19, fontWeight:900, lineHeight:1 }}>{String(etaThisMonth).padStart(2,'0')}</div><div style={{ fontSize:10, color:'#6b7280', fontWeight:800 }}>shipments</div></div></div>
        </div>
      </div>
      <button className="btn btn-primary" onClick={()=>setShowSummaryRange(true)}>Print Summary</button>
    </div>
    <div style={{ padding:'8px 24px', borderBottom:'1px solid #f3f4f6', display:'flex', alignItems:'center', gap:8, flexShrink:0, overflow:'visible' }}>
      <div style={{ position:'relative', width:260, flex:'0 0 260px' }}><Search size={13} style={{ position:'absolute', left:9, top:'50%', transform:'translateY(-50%)', color:'#9ca3af' }} /><input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search shipment, container, booking..." style={{ ...inputStyle, paddingLeft:28, background:'#fafafa' }} /></div>
      <select value={groupBy} onChange={e=>setGroupBy(e.target.value)} style={inputStyle}><option value="none">☰ No Group</option><option value="status">☰ By Status</option><option value="shipment_date">☰ By Ship Date</option><option value="container_no">☰ By Container</option></select>
      <select value={`${sort.col}:${sort.dir}`} onChange={e=>{ const [col,dir]=e.target.value.split(':'); setSort({col,dir}) }} style={inputStyle}><option value="shipment_date:desc">⇅ Ship Date New → Old</option><option value="shipment_date:asc">⇅ Ship Date Old → New</option><option value="shipment_no:asc">⇅ Shipment # Asc</option><option value="shipment_no:desc">⇅ Shipment # Desc</option><option value="qty:desc">⇅ Qty High → Low</option><option value="eta:asc">⇅ ETA Asc</option></select>
      <select value={filterStatus} onChange={e=>setFilterStatus(e.target.value)} style={inputStyle}><option value="">All Status</option>{statuses.map(v=><option key={v}>{v}</option>)}</select>
      <div style={{ marginLeft:'auto', display:'flex', alignItems:'center', gap:6, flexShrink:0 }}>
        <span style={{ fontSize:11, color:'#6b7280', fontWeight:800 }}>{selectedShipmentIds.size} selected</span>
        <button className="btn btn-secondary" style={actionBtnStyle} onClick={onRefresh} title="Refresh"><RefreshCw size={14}/></button>
        <button className="btn btn-secondary" style={actionBtnStyle} disabled={selectedShipments.length !== 1} onClick={editSelected} title="Edit selected"><Edit3 size={14}/></button>
        <button className="btn btn-secondary" style={actionBtnStyle} disabled={!selectedShipments.length && !filtered.length} onClick={printSelected} title="Print selected/all"><Printer size={14}/></button>
        <button className="btn btn-secondary" style={actionBtnStyle} disabled={!selectedShipments.length && !filtered.length} onClick={exportSelected} title="Export selected/all"><Download size={14}/></button>
        <button className="btn btn-secondary" style={actionBtnStyle} disabled={selectedShipments.length !== 1} onClick={deleteSelected} title="Delete selected"><Trash2 size={14}/></button>
        <button className="btn btn-secondary" style={actionBtnStyle} onClick={()=>setShowCols(true)} title="Column Settings"><Settings size={15}/></button>
      </div>
    </div>
    <div style={{ flex:1, overflow:'auto' }}><table style={{ width:'100%', minWidth:1180, borderCollapse:'collapse' }}><thead><tr style={{ background:'#fafafa', position:'sticky', top:0, zIndex:10 }}><th style={{ ...thStyle, width:34, textAlign:'center' }}><input type="checkbox" checked={filtered.length>0 && filtered.every(s=>selectedShipmentIds.has(s.id))} onChange={toggleAllShipments}/></th>{visibleKeys.map(k=><th key={k} style={{ ...thStyle, textAlign:['qty','cartons','cbm','value'].includes(k)?'right':'left' }}>{labels[k]}</th>)}</tr></thead><tbody>{displayRows.length===0 ? <tr><td colSpan={visibleKeys.length+1} style={{ padding:50, textAlign:'center', color:'#9ca3af', fontSize:12 }}>No shipments yet.</td></tr> : displayRows.map(row => { if (row.type==='group') return <tr key={`g-${row.key}`} style={{ background:'#fdf6e3' }}><td colSpan={visibleKeys.length+1} style={{ padding:'10px 18px', borderBottom:'1px solid #eee', borderTop:'1px solid #eee', fontSize:12, fontWeight:800 }}>{row.key} <span style={{ color:'#9ca3af' }}>— {row.count} shipments</span><span style={{ float:'right' }}>Qty: {row.qty.toLocaleString()}</span></td></tr>; return <tr key={row.s.id}><td style={{ ...tdStyle, textAlign:'center' }}><input type="checkbox" checked={selectedShipmentIds.has(row.s.id)} onChange={()=>toggleShipment(row.s.id)}/></td>{visibleKeys.map(k=>renderCell(row.s,k))}</tr> })}</tbody></table></div>
    {showSummaryRange && <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.35)', zIndex:350, display:'flex', alignItems:'center', justifyContent:'center' }}><div style={{ background:'#fff', borderRadius:12, width:360, boxShadow:'0 18px 48px rgba(0,0,0,0.18)' }}><div style={{ padding:16, borderBottom:'1px solid #f3f4f6', display:'flex', justifyContent:'space-between', alignItems:'center' }}><b>Print Shipment Summary</b><button className="btn btn-ghost" onClick={()=>setShowSummaryRange(false)}><X size={16}/></button></div><div style={{ padding:16, display:'grid', gap:10 }}><label style={labelStyle}>From Ship Date</label><input type="date" style={inputStyle} value={summaryRange.from} onChange={e=>setSummaryRange(r=>({...r,from:e.target.value}))}/><label style={labelStyle}>To Ship Date</label><input type="date" style={inputStyle} value={summaryRange.to} onChange={e=>setSummaryRange(r=>({...r,to:e.target.value}))}/></div><div style={{ padding:16, borderTop:'1px solid #f3f4f6', display:'flex', justifyContent:'flex-end', gap:8 }}><button className="btn btn-secondary" onClick={()=>setShowSummaryRange(false)}>Cancel</button><button className="btn btn-primary" onClick={printSummaryRange}>Print</button></div></div></div>}
    {showCols && <DragColumnSettings title="Shipment Columns" labels={labels} order={colOrder} visible={visibleCols} onChange={({order,visible})=>{setColOrder(order);setVisibleCols(visible)}} onReset={()=>{setVisibleCols(defaultCols);setColOrder(defaultOrder)}} onClose={()=>setShowCols(false)}/>}
  </div>
}



function addDays(dateStr, days) {
  const d = dateStr ? new Date(dateStr) : new Date()
  if (!Number.isFinite(d.getTime())) return ''
  d.setDate(d.getDate() + days)
  return d.toISOString().slice(0,10)
}
function paymentStatus(row) {
  const dueAmount = invoiceDueAmount(row)
  const receivedFcy = num(row.buyer_received_fcy)
  const buyerComplete = !!row.buyer_done || (dueAmount > 0 && receivedFcy >= dueAmount)
  const today = new Date(); today.setHours(0,0,0,0)
  const due = row.buyer_due_date ? new Date(row.buyer_due_date) : null
  if (buyerComplete) return 'Complete'
  if (due && Number.isFinite(due.getTime())) { due.setHours(0,0,0,0); if (due < today) return 'Overdue' }
  if (receivedFcy > 0 || num(row.received_pkr) > 0) return 'Partial'
  return 'Open'
}
function settlementDefaults(s, rowData) {
  const shipDate = safeDateOnly(s.shipment_date) || new Date().toISOString().slice(0,10)
  const value = num(rowData?.value)
  const currency = rowData?.currency || 'USD'
  const termsDays = num(rowData?.buyer_payment_terms_days || rowData?.payment_terms_days)
  const todayRate = num(rowData?.today_pkr_rate || rowData?.bank_realisation_rate) || DEFAULT_PKR_RATE
  const purchaseTaxPkr = num(rowData?.purchase_tax_pkr || rowData?.linked_purchase_tax_pkr || rowData?.tax_purchase_amount_pkr)
  const taxRecoveryPct = 100
  const rebatePct = 1
  const convertedValuePkr = value * todayRate
  return {
    buyer_due_date: addDays(shipDate, termsDays),
    buyer_amount_due_override: '',
    buyer_received_fcy: '',
    bank_realisation_rate: '',
    received_pkr: '',
    buyer_received_date: '',
    buyer_notes: '',
    buyer_done: false,
    today_pkr_rate: todayRate || '',
    tax_purchase_amount_pkr: purchaseTaxPkr || '',
    tax_refund_pct: taxRecoveryPct,
    tax_expected_amount: purchaseTaxPkr ? (purchaseTaxPkr * taxRecoveryPct / 100).toFixed(2) : '',
    tax_due_date: addDays(shipDate, 30),
    tax_received_amount: '',
    tax_received_date: '',
    tax_notes: '',
    tax_done: false,
    rebate_pct: rebatePct,
    rebate_expected_amount: todayRate ? (convertedValuePkr * rebatePct / 100).toFixed(2) : '',
    rebate_due_date: '',
    rebate_received_amount: '',
    rebate_received_date: '',
    rebate_notes: '',
    rebate_done: false,
    currency
  }
}
function loadPaymentSettlements() {
  try { return JSON.parse(localStorage.getItem('app2a_payment_settlements_v1') || '{}') || {} } catch { return {} }
}
function savePaymentSettlements(data) { localStorage.setItem('app2a_payment_settlements_v1', JSON.stringify(data || {})) }

function PaymentSettlementModal({ row, settlement, onClose, onSave, isAdmin=false }) {
  const [form, setForm] = useState(() => ({ ...settlement }))
  const labelStyle = { fontSize:10.5, fontWeight:800, color:'#6b7280', display:'block', marginBottom:4 }
  const pkrRate = num(form.today_pkr_rate) || DEFAULT_PKR_RATE
  const buyerAmountOverridden = hasManualOverride(form.buyer_amount_due_override)
  const dueAmount = buyerAmountOverridden ? num(form.buyer_amount_due_override) : num(row.value)
  const expectedPkr = dueAmount * num(form.bank_realisation_rate)
  const fxDiff = expectedPkr - num(form.received_pkr)
  const buyerBalance = dueAmount - num(form.buyer_received_fcy)
  const convertedValuePkr = num(row.value) * pkrRate
  const taxExpected = num(form.tax_expected_amount)
  const rebateExpected = num(form.rebate_expected_amount)
  const taxDiff = taxExpected - num(form.tax_received_amount)
  const rebateDiff = rebateExpected - num(form.rebate_received_amount)
  const receivedLocked = { buyer: !!form.buyer_done && !!form.received_pkr, tax: !!form.tax_done && !!form.tax_received_amount, rebate: !!form.rebate_done && !!form.rebate_received_amount }
  function set(k,v){ setForm(f=>({...f,[k]:v})) }
  function card(title, children) { return <div style={{ border:'1px solid #eef2f7', borderRadius:12, background:'#fff', overflow:'hidden' }}><div style={{ padding:'10px 12px', borderBottom:'1px solid #f3f4f6', fontWeight:900, fontSize:13 }}>{title}</div><div style={{ padding:12, display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:10 }}>{children}</div></div> }
  function field(label,key,type='text', extra={}) { const { full, ...rest } = extra || {}; return <div style={full ? { gridColumn:'1 / -1' } : null}><label style={labelStyle}>{label}</label><input type={type} style={inputStyle} value={form[key] ?? ''} onChange={e=>set(key, e.target.value)} {...rest}/></div> }
  function recalcTax(purchaseTax, pct) { return num(purchaseTax) ? (num(purchaseTax) * num(pct) / 100).toFixed(2) : '' }
  function recalcRebate(rate, pct) { const r = num(rate) || DEFAULT_PKR_RATE; return num(row.value) ? (num(row.value) * r * num(pct || 1) / 100).toFixed(2) : '' }
  return <div style={{ position:'fixed', inset:0, background:'rgba(17,24,39,0.48)', zIndex:420, display:'flex', alignItems:'center', justifyContent:'center', padding:16 }}>
    <div style={{ width:'min(1120px, 96vw)', maxHeight:'88vh', background:'#fff', borderRadius:14, boxShadow:'0 24px 70px rgba(0,0,0,0.25)', display:'flex', flexDirection:'column', overflow:'hidden' }}>
      <div style={{ padding:'14px 18px', borderBottom:'1px solid #eef2f7', display:'flex', alignItems:'center', justifyContent:'space-between', flexShrink:0 }}><div><div style={{ fontSize:17, fontWeight:900 }}>Shipment Settlement</div><div style={{ fontSize:11, color:'#6b7280', marginTop:2 }}>{row.shipment_no} · {row.buyer || '—'} · Invoice {moneyCurrency(row.value, row.currency)} · Terms {num(row.buyer_payment_terms_days)} days</div></div><button className="btn btn-ghost" onClick={onClose}><X size={16}/></button></div>
      <div style={{ padding:16, overflow:'auto', display:'grid', gap:12 }}>
        {card('Buyer Payment', <>
          <div><label style={labelStyle}>Amount Due</label>{isAdmin ? <><input type="number" step="0.01" style={{...inputStyle, textAlign:'right', fontWeight:800}} value={buyerAmountOverridden ? form.buyer_amount_due_override : (row.value || '')} onChange={e=>set('buyer_amount_due_override', e.target.value)} /><OverrideReset show={buyerAmountOverridden} onReset={()=>set('buyer_amount_due_override','')} /></> : <input style={{...inputStyle, background:'#f9fafb', textAlign:'right', fontWeight:800}} value={moneyCurrency(dueAmount, row.currency)} readOnly/>}</div>
          {field('Due Date','buyer_due_date','date')}
          {field(`Received Amount (${currencySymbol(row.currency).trim() || row.currency})`,'buyer_received_fcy','number', { step:'0.01', disabled:receivedLocked.buyer })}
          {field('Realisation Rate','bank_realisation_rate','number', { step:'0.01', placeholder:'PKR rate from bank', disabled:receivedLocked.buyer })}
          <div><label style={labelStyle}>PKR Received</label><input style={{...inputStyle, background:'#f9fafb', textAlign:'right'}} value={form.buyer_received_fcy && form.bank_realisation_rate ? pkr(num(form.buyer_received_fcy) * num(form.bank_realisation_rate)) : ''} readOnly/></div>
          {field('Received Date','buyer_received_date','date', { disabled:receivedLocked.buyer })}
          <label style={{ display:'flex', alignItems:'center', gap:8, fontSize:12, fontWeight:800, marginTop:18 }}><input type="checkbox" checked={!!form.buyer_done} onChange={e=>setForm(f=>({...f,buyer_done:e.target.checked,received_pkr:e.target.checked && f.buyer_received_fcy && f.bank_realisation_rate ? (num(f.buyer_received_fcy)*num(f.bank_realisation_rate)).toFixed(2) : f.received_pkr}))}/> Payment Received / Lock</label>
        </>)}
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
          {card('Sales Tax Refund', <>
            <div>{field('Purchase Tax (PKR)','tax_purchase_amount_pkr','number', { step:'0.01', disabled:receivedLocked.tax, onChange:e=>setForm(f=>({...f,tax_purchase_amount_pkr:e.target.value,tax_expected_amount:recalcTax(e.target.value, f.tax_refund_pct)})) })}<OverrideReset show={hasManualOverride(form.tax_purchase_amount_pkr) && num(form.tax_purchase_amount_pkr)!==num(row.purchase_tax_pkr)} onReset={()=>setForm(f=>({...f,tax_purchase_amount_pkr:num(row.purchase_tax_pkr)||'',tax_expected_amount:recalcTax(num(row.purchase_tax_pkr)||'', f.tax_refund_pct)}))}/></div>
            <div>{field('Refund %','tax_refund_pct','number', { step:'0.01', disabled:receivedLocked.tax, onChange:e=>setForm(f=>({...f,tax_refund_pct:e.target.value,tax_expected_amount:recalcTax(f.tax_purchase_amount_pkr, e.target.value)})) })}<OverrideReset show={num(form.tax_refund_pct)!==100} onReset={()=>setForm(f=>({...f,tax_refund_pct:100,tax_expected_amount:recalcTax(f.tax_purchase_amount_pkr, 100)}))}/></div>
            <div><label style={labelStyle}>Refund Amount</label><input style={{...inputStyle, background:'#f9fafb', textAlign:'right'}} value={form.tax_expected_amount ? pkr(form.tax_expected_amount) : ''} readOnly/></div>
            {field('Expected Date','tax_due_date','date')}
            {field('Received PKR','tax_received_amount','number', { step:'0.01', disabled:receivedLocked.tax })}
            {field('Received Date','tax_received_date','date', { disabled:receivedLocked.tax })}
            <label style={{ display:'flex', alignItems:'center', gap:8, fontSize:12, fontWeight:800 }}><input type="checkbox" checked={!!form.tax_done} onChange={e=>set('tax_done',e.target.checked)}/> Refund Received / Lock</label>
          </>)}
          {card('Export Rebate', <>
            <div><label style={labelStyle}>Shipment Value PKR</label><input style={{...inputStyle, background:'#f9fafb', textAlign:'right'}} value={convertedValuePkr ? pkr(convertedValuePkr) : ''} readOnly/></div>
            <div>{field('Rebate %','rebate_pct','number', { step:'0.01', disabled:receivedLocked.rebate, onChange:e=>setForm(f=>({...f,rebate_pct:e.target.value,rebate_expected_amount:recalcRebate(pkrRate, e.target.value)})) })}<OverrideReset show={num(form.rebate_pct)!==1} onReset={()=>setForm(f=>({...f,rebate_pct:1,rebate_expected_amount:recalcRebate(pkrRate, 1)}))}/></div>
            <div><label style={labelStyle}>Rebate Amount</label><input style={{...inputStyle, background:'#f9fafb', textAlign:'right'}} value={form.rebate_expected_amount ? pkr(form.rebate_expected_amount) : ''} readOnly/></div>
            {field('Expected Date','rebate_due_date','date')}
            {field('Received PKR','rebate_received_amount','number', { step:'0.01', disabled:receivedLocked.rebate })}
            {field('Received Date','rebate_received_date','date', { disabled:receivedLocked.rebate })}
            <label style={{ display:'flex', alignItems:'center', gap:8, fontSize:12, fontWeight:800 }}><input type="checkbox" checked={!!form.rebate_done} onChange={e=>set('rebate_done',e.target.checked)}/> Rebate Received / Lock</label>
          </>)}
        </div>
      </div>
      <div style={{ padding:'12px 18px', borderTop:'1px solid #eef2f7', display:'flex', justifyContent:'space-between', alignItems:'center', background:'#fff', flexShrink:0 }}><div style={{ fontSize:12, fontWeight:800 }}>Closes only when Buyer Payment + Sales Tax Refund + Rebate are complete. Uncheck a received box to edit a locked amount.</div><div style={{ display:'flex', gap:8 }}><button className="btn btn-secondary" onClick={onClose}>Cancel</button><button className="btn btn-primary" onClick={()=>onSave(form)}>Save Settlement</button></div></div>
    </div>
  </div>
}

function PaymentsTab({ shipments, shipmentLines, rows, isAdmin=false }) {
  const [search, setSearch] = useState('')
  const [groupBy, setGroupBy] = useState('none')
  const [sort, setSort] = useState({ col:'buyer_due_date', dir:'asc' })
  const [filterStatus, setFilterStatus] = useState('')
  const [quickFilter, setQuickFilter] = useState('all')
  const [showCols, setShowCols] = useState(false)
  const [selectedIds, setSelectedIds] = useState(new Set())
  const [settlements, setSettlements] = useState(() => loadPaymentSettlements())
  const [editing, setEditing] = useState(null)
  useEffect(() => {
    let cancelled = false
    supabase.from('payment_settlements').select('shipment_id,payload').then(({ data, error }) => {
      if (!cancelled && !error && data) {
        const next = { ...loadPaymentSettlements() }
        data.forEach(r => { if (r.shipment_id) next[r.shipment_id] = r.payload || {} })
        setSettlements(next); savePaymentSettlements(next)
      }
    })
    return () => { cancelled = true }
  }, [])
  const defaultCols = { shipment_no:true, buyer:true, ship_date:true, qty:true, invoice_value:true, buyer_due_date:true, received_pkr:true, fx_diff:true, tax_refund:true, rebate:true, net_pending:true, status:true }
  const labels = { shipment_no:'Shipment No', buyer:'Buyer', ship_date:'Ship Date', qty:'Quantity', invoice_value:'Invoice Value', buyer_due_date:'Payment Due', received_pkr:'Received PKR', fx_diff:'FX Diff', tax_refund:'Tax Refund PKR', rebate:'Rebate PKR', net_pending:'PKR Pending', status:'Status' }
  const defaultOrder = ['shipment_no','buyer','ship_date','qty','invoice_value','buyer_due_date','received_pkr','fx_diff','tax_refund','rebate','net_pending','status']
  const savedPayView = loadTableView('shipping.payments', defaultCols, defaultOrder)
  const [visibleCols, setVisibleCols] = useState(savedPayView.visible)
  const [colOrder, setColOrder] = useState(savedPayView.order)
  useEffect(() => saveTableView('shipping.payments', visibleCols, colOrder), [visibleCols, colOrder])
  const rowMap = Object.fromEntries(rows.map(q => [q.id, q]))
  const baseData = shipments.map(s => {
    const meta = shipmentMeta(s)
    const lines = shipmentLines.filter(l => l.shipment_id === s.id)
    const lm = (l) => lineMeta(meta, l.queue_id)
    const qty = lines.reduce((a,l)=>a+num(firstNonEmpty(l.shipped_qty,l.ship_qty,lm(l).qty)),0)
    const value = lines.reduce((a,l)=>{
      const q = rowMap[l.queue_id] || {}
      const shipQty = num(firstNonEmpty(l.shipped_qty, l.ship_qty, lm(l).qty))
      const qQty = num(q.qty)
      const matrixValue = num(q.value)
      if (qQty && matrixValue && shipQty) return a + ((matrixValue / qQty) * shipQty)
      return a + num(firstNonEmpty(l.value, lm(l).value))
    },0)
    const purchaseTaxPkr = lines.reduce((a,l)=>{ const q=rowMap[l.queue_id]||{}; const shipQty=num(firstNonEmpty(l.shipped_qty,l.ship_qty,lm(l).qty)); const ratio=num(q.qty)?shipQty/num(q.qty):1; return a + (num(q.purchase_tax_pkr)*ratio) },0)
    const buyers = [...new Set(lines.map(l=>rowMap[l.queue_id]?.buyer_name).filter(Boolean))]
    const currency = meta.currency || lines.map(l=>rowMap[l.queue_id]?.currency).find(Boolean) || 'USD'
    const terms = lines.map(l=>rowMap[l.queue_id]?.buyer_payment_terms_days).find(v=>num(v)>0) || 0
    return { ...s, buyer: buyers.join(', ') || '—', ship_date:s.shipment_date, qty, value, currency, buyer_payment_terms_days:terms, purchase_tax_pkr:purchaseTaxPkr }
  })
  const data = baseData.map(s => {
    const st = { ...settlementDefaults(s, s), ...(settlements[s.id] || {}) }
    const dueAmount = invoiceDueAmount({ ...s, ...st })
    const expectedPkr = dueAmount * num(st.bank_realisation_rate)
    const fxDiff = st.received_pkr ? expectedPkr - num(st.received_pkr) : 0
    const taxPending = Math.max(0, num(st.tax_expected_amount) - num(st.tax_received_amount))
    const rebatePending = Math.max(0, num(st.rebate_expected_amount) - num(st.rebate_received_amount))
    const buyerPendingFcy = Math.max(0, dueAmount - num(st.buyer_received_fcy))
    const buyerPending = buyerPendingFcy * (num(st.bank_realisation_rate) || num(st.today_pkr_rate) || DEFAULT_PKR_RATE)
    const netPending = buyerPending + taxPending + rebatePending
    const row = { ...s, ...st, value:dueAmount, original_value:s.value, expected_pkr:expectedPkr, fx_diff:fxDiff, tax_pending:taxPending, rebate_pending:rebatePending, buyer_pending:buyerPending, net_pending:netPending }
    row.payment_status = paymentStatus(row)
    return row
  })
  const statuses = ['Open','Partial','Complete','Overdue']
  const isOverduePayment = (s) => s.payment_status === 'Overdue'
  const visibleKeys = colOrder.filter(k => visibleCols[k])
  const [weekStart, weekEnd] = weekBounds()
  const [monthStart, monthEnd] = monthBounds()
  const filtered = useMemo(() => {
    const q = search.toLowerCase()
    return data.filter(s => {
      const hay = [s.shipment_no, s.buyer, s.payment_status].join(' ').toLowerCase()
      const quickOk = quickFilter === 'all'
        || (quickFilter === 'week' && dateInRange(s.buyer_due_date, weekStart, weekEnd))
        || (quickFilter === 'month' && dateInRange(s.buyer_due_date, monthStart, monthEnd))
        || (quickFilter === 'overdue' && s.payment_status === 'Overdue')
        || (quickFilter === 'completed' && s.payment_status === 'Complete')
      return (!q || hay.includes(q)) && (!filterStatus || s.payment_status === filterStatus) && quickOk
    }).sort((a,b) => {
      const numeric = ['qty','invoice_value','received_pkr','fx_diff','tax_refund','rebate','net_pending'].includes(sort.col)
      const get = (x) => sort.col==='invoice_value'?x.value:sort.col==='tax_refund'?x.tax_expected_amount:sort.col==='rebate'?x.rebate_expected_amount:x[sort.col]
      const av = numeric ? num(get(a)) : String(get(a) || '')
      const bv = numeric ? num(get(b)) : String(get(b) || '')
      const cmp = numeric ? av - bv : av.localeCompare(bv, undefined, { numeric:true })
      return sort.dir === 'asc' ? cmp : -cmp
    })
  }, [data, search, filterStatus, sort])
  const displayRows = useMemo(() => {
    if (groupBy === 'none') return filtered.map(s => ({ type:'payment', s }))
    const groups={}, out=[]
    filtered.forEach(s=>{ const key = groupBy==='status' ? s.payment_status : (s[groupBy] || '—'); (groups[key] ||= []).push(s) })
    Object.keys(groups).sort().forEach(key=>{ const arr=groups[key]; out.push({ type:'group', key, count:arr.length, value:arr.reduce((a,s)=>a+num(s.value),0) }); arr.forEach(s=>out.push({ type:'payment', s })) })
    return out
  }, [filtered, groupBy])
  const kpiTotalUsd = data.reduce((a,s)=>a+invoiceDueAmount(s),0)
  const kpiTotalPkr = data.reduce((a,s)=>a+pkrForPayment(s, invoiceDueAmount(s)),0)
  const dueWeekRows = data.filter(s=>dateInRange(s.buyer_due_date, weekStart, weekEnd))
  const dueMonthRows = data.filter(s=>dateInRange(s.buyer_due_date, monthStart, monthEnd))
  const kpiWeekUsd = dueWeekRows.reduce((a,s)=>a+invoiceDueAmount(s),0)
  const kpiWeekPkr = dueWeekRows.reduce((a,s)=>a+pkrForPayment(s, invoiceDueAmount(s)),0)
  const kpiMonthUsd = dueMonthRows.reduce((a,s)=>a+invoiceDueAmount(s),0)
  const kpiMonthPkr = dueMonthRows.reduce((a,s)=>a+pkrForPayment(s, invoiceDueAmount(s)),0)
  const overdueRows = data.filter(s => s.payment_status === 'Overdue')
  const kpiOverdueUsd = overdueRows.reduce((a,s)=>a+invoiceDueAmount(s),0)
  const kpiOverduePkr = overdueRows.reduce((a,s)=>a+pkrForPayment(s, invoiceDueAmount(s)),0)
  function PayKpi({label, usd, pkrValue, wide=false}) { return <div style={{ padding:'8px 13px', border:'1px solid #e5e7eb', borderRadius:10, background:'#fff', minWidth:wide?190:132, boxShadow:'0 1px 2px rgba(15,23,42,0.04)' }}><div style={{ fontSize:9, fontWeight:900, color:'#9ca3af', textTransform:'uppercase', letterSpacing:'0.55px', marginBottom:4 }}>{label}</div><div style={{ display:'flex', alignItems:'baseline', gap:8 }}><div style={{ fontSize:19, fontWeight:900, lineHeight:1 }}>{moneyCurrency(usd, 'USD')}</div><div style={{ fontSize:10, color:'#6b7280', fontWeight:800, whiteSpace:'nowrap' }}>{pkr(pkrValue)}</div></div></div> }
  const selected = data.filter(s=>selectedIds.has(s.id))
  function toggle(id){ setSelectedIds(prev=>{ const n=new Set(prev); n.has(id)?n.delete(id):n.add(id); return n }) }
  function toggleAll(){ setSelectedIds(prev=> filtered.length && filtered.every(s=>prev.has(s.id)) ? new Set() : new Set([...prev, ...filtered.map(s=>s.id)])) }
  function saveSettlement(form) {
    const next = { ...settlements, [editing.id]: form }
    setSettlements(next); savePaymentSettlements(next); setEditing(null)
    supabase.from('payment_settlements').upsert({ shipment_id: editing.id, payload: form, updated_at: new Date().toISOString() }).then(() => {})
  }
  function editSelected(){ if (selected.length !== 1) { alert('Select exactly one settlement to edit.'); return } setEditing(selected[0]) }
  function dueText(dateValue){
    const d = parseDateLoose(dateValue);
    if (!d) return '';
    const today = new Date();
    const a = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    const b = new Date(d.getFullYear(), d.getMonth(), d.getDate());
    const days = Math.ceil((b - a) / 86400000);
    if (days === 0) return 'Due today';
    if (days > 0) return `${days} day${days===1?'':'s'} left`;
    return `${Math.abs(days)} day${Math.abs(days)===1?'':'s'} overdue`;
  }
  function cellValue(s,k,jsx=true){
    if (k==='ship_date') return fmtDate(s[k])
    if (k==='buyer_due_date') { const main = fmtDate(s[k]); const sub = dueText(s[k]); return jsx ? <div><div>{main}</div>{sub && <div style={{ fontSize:10.5, color:'#6b7280', marginTop:2 }}>{sub}</div>}</div> : `${main}${sub ? ' / ' + sub : ''}` }
    if (k==='qty') return num(s.qty).toLocaleString()
    if (k==='invoice_value') { const est = s.received_pkr ? pkr(s.received_pkr) : pkr(num(s.value) * (num(s.today_pkr_rate) || DEFAULT_PKR_RATE)); return jsx ? <div><div>{moneyCurrency(s.value, s.currency)}</div><div style={{ fontSize:10.5, color:'#6b7280' }}>{est}</div></div> : `${moneyCurrency(s.value, s.currency)} / ${est}` }
    if (k==='received_pkr') return s.received_pkr ? moneyCurrency(s.received_pkr, 'PKR') : '—'
    if (k==='fx_diff') return s.received_pkr ? moneyCurrency(s.fx_diff, 'PKR') : '—'
    if (k==='tax_refund') return `${pkr(s.tax_expected_amount)}${s.tax_done ? ' ✓' : ''}`
    if (k==='rebate') return `${pkr(s.rebate_expected_amount)}${s.rebate_done ? ' ✓' : ''}`
    if (k==='net_pending') return pkr(s.net_pending)
    if (k==='status' && jsx) return <span style={{ padding:'3px 8px', borderRadius:999, background:s.payment_status==='Complete'?'#ecfdf5':s.payment_status==='Overdue'?'#fef2f2':s.payment_status==='Partial'?'#fff7ed':'#f3f4f6', color:s.payment_status==='Complete'?'#047857':s.payment_status==='Overdue'?'#b91c1c':s.payment_status==='Partial'?'#b45309':'#374151', fontWeight:800, fontSize:11 }}>{s.payment_status}</span>
    if (k==='status') return s.payment_status
    return s[k] || '—'
  }
  function exportCSV(list=filtered){ const head=visibleKeys.map(k=>labels[k]); const lines=[head.join(',')].concat(list.map(s=>visibleKeys.map(k=>`"${String(cellValue(s,k,false)).replace(/"/g,'""')}"`).join(','))); const a=document.createElement('a'); a.href=URL.createObjectURL(new Blob([lines.join('\n')],{type:'text/csv'})); a.download='shipment-settlements.csv'; a.click() }
  function printList(list=filtered){ const head=visibleKeys.map(k=>`<th style="border:1px solid #ddd;padding:8px;background:#f5f5f5;text-align:left">${labels[k]}</th>`).join(''); const body=list.map(s=>`<tr>${visibleKeys.map(k=>`<td style="border:1px solid #ddd;padding:8px">${cellValue(s,k,false)}</td>`).join('')}</tr>`).join(''); printHTML(`<div style="font-family:Arial;padding:24px"><h2>Shipment Settlement / Payments</h2><table style="width:100%;border-collapse:collapse"><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table></div>`) }
  const actionBtnStyle = { height:32, width:34, padding:0, display:'inline-flex', alignItems:'center', justifyContent:'center', lineHeight:1 }
  function renderCell(s,k){ const right=['qty','invoice_value','received_pkr','fx_diff','tax_refund','rebate','net_pending'].includes(k); return <td key={k} style={{ ...tdStyle, textAlign:right?'right':'left', whiteSpace:'normal', overflow:'hidden' }}>{cellValue(s,k,true)}</td> }
  return <div style={{ display:'flex', flexDirection:'column', flex:1, minHeight:0, background:'#fff' }}>
    <div style={{ padding:'12px 24px', borderBottom:'1px solid #f3f4f6', display:'flex', justifyContent:'space-between', alignItems:'center', gap:16, flexShrink:0, overflow:'hidden' }}>
      <div style={{ display:'flex', alignItems:'center', gap:16, minWidth:0 }}>
        <div style={{ minWidth:260, flex:'0 0 auto' }}><div style={{ fontSize:20, fontWeight:800 }}>Payments</div><div style={{ fontSize:11, color:'#6b7280' }}>Buyers Payments, Sales Tax and Rebate Tracker</div></div>
        <div style={{ display:'flex', gap:8, alignItems:'stretch', minWidth:0 }}><PayKpi label="Total Payments" usd={kpiTotalUsd} pkrValue={kpiTotalPkr} wide/><PayKpi label="Due This Week" usd={kpiWeekUsd} pkrValue={kpiWeekPkr}/><PayKpi label="Due This Month" usd={kpiMonthUsd} pkrValue={kpiMonthPkr}/><PayKpi label="Overdue Payments" usd={kpiOverdueUsd} pkrValue={kpiOverduePkr}/></div>
      </div>
      <div style={{ display:'flex', alignItems:'center', justifyContent:'flex-end', gap:8, flex:'0 0 auto' }}><button className="btn btn-secondary" style={actionBtnStyle} onClick={()=>exportCSV(selected.length?selected:filtered)} title="Export"><Download size={14}/></button><button className="btn btn-secondary" style={actionBtnStyle} onClick={()=>printList(selected.length?selected:filtered)} title="Print"><Printer size={14}/></button><button className="btn btn-primary" style={{ height:32, display:'inline-flex', alignItems:'center', justifyContent:'center', whiteSpace:'nowrap' }} onClick={()=>printList(filtered)}>Print Summary</button></div>
    </div>
    <div style={{ padding:'8px 24px 0', display:'flex', gap:6, alignItems:'center', flexShrink:0 }}>
      {[['all','All'],['week','Due This Week'],['month','Due This Month'],['overdue','Overdue'],['completed','Completed']].map(([key,label]) => <button key={key} onClick={()=>setQuickFilter(key)} style={{ height:28, padding:'0 10px', borderRadius:999, border:quickFilter===key?'1px solid #111827':'1px solid #e5e7eb', background:quickFilter===key?'#111827':'#fff', color:quickFilter===key?'#fff':'#374151', fontSize:11, fontWeight:800, cursor:'pointer' }}>{label}</button>)}
    </div>
    <div style={{ padding:'8px 24px', borderBottom:'1px solid #f3f4f6', display:'grid', gridTemplateColumns:'minmax(220px, 1.1fr) minmax(150px, .9fr) minmax(180px, 1fr) minmax(150px, .9fr) auto', alignItems:'center', gap:8, flexShrink:0, overflow:'hidden', maxWidth:'100%' }}>
      <div style={{ position:'relative', minWidth:0 }}><Search size={13} style={{ position:'absolute', left:9, top:'50%', transform:'translateY(-50%)', color:'#9ca3af' }} /><input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search shipment, buyer..." style={{ ...inputStyle, width:'100%', minWidth:0, paddingLeft:28, background:'#fafafa' }} /></div>
      <select value={groupBy} onChange={e=>setGroupBy(e.target.value)} style={{ ...inputStyle, width:'100%', minWidth:0 }}><option value="none">☰ No Group</option><option value="status">☰ By Status</option><option value="buyer">☰ By Buyer</option></select>
      <select value={`${sort.col}:${sort.dir}`} onChange={e=>{ const [col,dir]=e.target.value.split(':'); setSort({col,dir}) }} style={{ ...inputStyle, width:'100%', minWidth:0 }}><option value="buyer_due_date:asc">⇅ Due Soon First</option><option value="buyer_due_date:desc">⇅ Due Later First</option><option value="invoice_value:desc">⇅ Value High → Low</option><option value="ship_date:desc">⇅ Ship Date New → Old</option><option value="net_pending:desc">⇅ Pending High → Low</option></select>
      <select value={filterStatus} onChange={e=>setFilterStatus(e.target.value)} style={{ ...inputStyle, width:'100%', minWidth:0 }}><option value="">All Status</option>{statuses.map(v=><option key={v}>{v}</option>)}</select>
      <div style={{ display:'flex', alignItems:'center', justifyContent:'flex-end', gap:6, minWidth:0, whiteSpace:'nowrap' }}><span style={{ fontSize:11, color:'#6b7280', fontWeight:800 }}>{selectedIds.size} selected</span><button className="btn btn-secondary" style={actionBtnStyle} disabled={selected.length !== 1} onClick={editSelected} title="Edit settlement"><Edit3 size={14}/></button><button className="btn btn-secondary" style={actionBtnStyle} onClick={()=>setShowCols(true)} title="Column Settings"><Settings size={15}/></button></div>
    </div>
    <div style={{ flex:1, overflowY:'auto', overflowX:'hidden' }}><table style={{ width:'100%', minWidth:0, tableLayout:'fixed', borderCollapse:'collapse' }}><thead><tr style={{ background:'#fafafa', position:'sticky', top:0, zIndex:10 }}><th style={{ ...thStyle, width:34, textAlign:'center' }}><input type="checkbox" checked={filtered.length>0 && filtered.every(s=>selectedIds.has(s.id))} onChange={toggleAll}/></th>{visibleKeys.map(k=><th key={k} style={{ ...thStyle, textAlign:['qty','invoice_value','received_pkr','fx_diff','tax_refund','rebate','net_pending'].includes(k)?'right':'left' }}>{labels[k]}</th>)}</tr></thead><tbody>{displayRows.length===0 ? <tr><td colSpan={visibleKeys.length+1} style={{ padding:50, textAlign:'center', color:'#9ca3af', fontSize:12 }}>No settlement records yet. Shipments will appear here automatically.</td></tr> : displayRows.map(row => { if(row.type==='group') return <tr key={`pg-${row.key}`} style={{ background:'#fdf6e3' }}><td colSpan={visibleKeys.length+1} style={{ padding:'10px 18px', borderBottom:'1px solid #eee', borderTop:'1px solid #eee', fontSize:12, fontWeight:800 }}>{row.key} <span style={{ color:'#9ca3af' }}>— {row.count} settlements</span></td></tr>; return <tr key={row.s.id} style={{ background:row.s.payment_status==='Overdue'?'#fff7f7':undefined }}><td style={{ ...tdStyle, textAlign:'center' }}><input type="checkbox" checked={selectedIds.has(row.s.id)} onChange={()=>toggle(row.s.id)}/></td>{visibleKeys.map(k=>renderCell(row.s,k))}</tr> })}</tbody></table></div>
    {editing && <PaymentSettlementModal row={editing} settlement={{ ...settlementDefaults(editing, editing), ...(settlements[editing.id] || {}) }} onClose={()=>setEditing(null)} onSave={saveSettlement} isAdmin={isAdmin}/>} 
    {showCols && <DragColumnSettings title="Payment Columns" labels={labels} order={colOrder} visible={visibleCols} onChange={({order,visible})=>{setColOrder(order);setVisibleCols(visible)}} onReset={()=>{setVisibleCols(defaultCols);setColOrder(defaultOrder)}} onClose={()=>setShowCols(false)}/>}
  </div>
}


export default function Shipping() {
  const [activeTab, setActiveTab] = useState('create')
  const [loading, setLoading] = useState(true)
  const [queues, setQueues] = useState([])
  const [orders, setOrders] = useState([])
  const [buyers, setBuyers] = useState([])
  const [sizeGroups, setSizeGroups] = useState([])
  const [sizeBreakdown, setSizeBreakdown] = useState([])
  const [shipments, setShipments] = useState([])
  const [shipmentLines, setShipmentLines] = useState([])
  const [selectedIds, setSelectedIds] = useState(new Set())
  const [showModal, setShowModal] = useState(false)
  const [editDraft, setEditDraft] = useState(null)
  const { user, userRole } = useAuth()
  const roleName = userRole?.role || userRole?.name || user?.role || ''
  const isAdmin = safeRoleIsAdmin(roleName)

  useEffect(() => { load() }, [])
  useEffect(() => { if (!isAdmin && activeTab === 'payments') setActiveTab('create') }, [isAdmin, activeTab])
  async function load() {
    setLoading(true)
    const [{ data: qs }, { data: ors }, { data: bs }, { data: poTaxRows }, { data: sg }, { data: bd }, { data: sh }, { data: sl }] = await Promise.all([
      supabase.from('order_queues').select('*').order('created_at', { ascending:true }),
      supabase.from('orders').select('*'),
      supabase.from('buyers').select('*'),
      supabase.from('purchase_orders').select('id,order_id,notes,purchase_order_items(amount)'),
      supabase.from('size_groups').select('*'),
      supabase.from('size_group_breakdown').select('size_group_id,qty'),
      supabase.from('shipments').select('*').order('shipment_date', { ascending:false }),
      supabase.from('shipment_lines').select('*'),
    ])
    const buyerMap = Object.fromEntries((bs || []).map(b => [b.id, b]))
    const taxByOrder = purchaseTaxByOrder(poTaxRows || [])
    const enrichedOrders = (ors || []).map(o => ({ ...o, buyer: buyerMap[o.buyer_id] || {}, buyer_payment_terms_days: buyerMap[o.buyer_id]?.payment_terms_days || buyerMap[o.buyer_id]?.payment_terms || o.buyer_payment_terms_days || o.payment_terms_days, purchase_tax_pkr: taxByOrder[o.id] || 0 }))
    setQueues(qs || []); setOrders(enrichedOrders); setBuyers(bs || []); setSizeGroups(sg || []); setSizeBreakdown(bd || []); setShipments(sh || []); setShipmentLines(sl || []); setLoading(false)
  }
  const rows = useMemo(() => buildQueueRows(queues, orders, shipmentLines, sizeGroups, sizeBreakdown), [queues, orders, shipmentLines, sizeGroups, sizeBreakdown])
  const selectedQueues = [...selectedIds].map(id => rows.find(q => q.id === id)).filter(Boolean)
  function openNewShipment() { if (!selectedQueues.length) { alert('Select at least one queue to create shipment.'); return } if (!isAdmin && selectedQueues.some(isQueueRestricted)) { alert('Only admins can book/ship inactive or unassigned Qs.'); return } setEditDraft(null); setShowModal(true) }
  function openEditShipment(shipment) {
    const lines = shipmentLines.filter(l => l.shipment_id === shipment.id)
    const qRows = lines.map(l => rows.find(q => q.id === l.queue_id)).filter(Boolean)
    if (!qRows.length) { alert('Could not find queues linked to this shipment.'); return }
    setEditDraft({ shipment, lines })
    setShowModal(true)
  }
  return <div style={{ display:'flex', flexDirection:'column', height:'100%', background:'#fff', overflow:'hidden' }}>
    <div style={{ padding:'0 24px', borderBottom:'1px solid #eef0f4', flexShrink:0 }}><div style={{ display:'flex', gap:4 }}><button style={{ padding:'12px 16px 10px', border:'none', borderBottom:activeTab==='create'?'3px solid #111827':'3px solid transparent', background:'transparent', fontSize:13, fontWeight:800, cursor:'pointer', color:activeTab==='create'?'#111827':'#6b7280' }} onClick={()=>setActiveTab('create')}>Bookings</button><button style={{ padding:'12px 16px 10px', border:'none', borderBottom:activeTab==='shipments'?'3px solid #111827':'3px solid transparent', background:'transparent', fontSize:13, fontWeight:800, cursor:'pointer', color:activeTab==='shipments'?'#111827':'#6b7280' }} onClick={()=>setActiveTab('shipments')}>Shipments</button>{isAdmin && <button style={{ padding:'12px 16px 10px', border:'none', borderBottom:activeTab==='payments'?'3px solid #111827':'3px solid transparent', background:'transparent', fontSize:13, fontWeight:800, cursor:'pointer', color:activeTab==='payments'?'#111827':'#6b7280' }} onClick={()=>setActiveTab('payments')}>Payments</button>}</div></div>
    {activeTab === 'create' ? <CreateShipmentTab loading={loading} rows={rows} selectedIds={selectedIds} setSelectedIds={setSelectedIds} onNewShipment={openNewShipment} isAdmin={isAdmin} /> : activeTab === 'shipments' ? <ShipmentsTab shipments={shipments} shipmentLines={shipmentLines} rows={rows} onRefresh={load} onEdit={openEditShipment} /> : isAdmin ? <PaymentsTab shipments={shipments} shipmentLines={shipmentLines} rows={rows} isAdmin={isAdmin} /> : <CreateShipmentTab loading={loading} rows={rows} selectedIds={selectedIds} setSelectedIds={setSelectedIds} onNewShipment={openNewShipment} isAdmin={isAdmin} />}
    {showModal && <ShipmentModal selectedQueues={editDraft ? editDraft.lines.map(l => rows.find(q => q.id === l.queue_id)).filter(Boolean) : selectedQueues} shipments={shipments} draft={editDraft} onClose={()=>{setShowModal(false); setEditDraft(null)}} onDone={()=>{ setShowModal(false); setEditDraft(null); setSelectedIds(new Set()); load(); setActiveTab('shipments') }} />}
  </div>
}
