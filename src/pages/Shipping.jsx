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
const tdStyle = { padding:'10px', borderBottom:'1px solid #f3f4f6', fontSize:12, color:'#374151', whiteSpace:'nowrap' }

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
    return { ...q, order:o, currency:currencyCodeFromOrder(o), style_number:o.style_number, buyer_name:o.buyer_name, job_number:o.job_number, ship_date:o.ship_date || o.planned_ship_date || o.planned_ex_factory, po_number:o.po_number, store_name:o.store_name, description:o.description, brand_name:o.brand_name, shipped_qty:shipped, balance_qty:Math.max(0, qty - shipped), value:getQueueValue(o, q) }
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
    const meta = { container_no: header.container_no || '', cro_lp_no: header.cro_lp_no || '', gate_pass_no: header.gate_pass_no || '', delivery_challan_no: header.delivery_challan_no || '', currency: selectedQueues[0]?.currency || 'USD', lines: Object.fromEntries(selectedQueues.map(q => [q.id, { qty:num(lines[q.id]?.qty), cartons:num(lines[q.id]?.cartons), cbm:num(lines[q.id]?.cbm), value:num(lines[q.id]?.value), close_queue:!!lines[q.id]?.close_queue, close_reason:lines[q.id]?.close_reason || '' }])) }
    const packedNotes = packShippingNotes(header.notes, meta)
    const headerPayload = { shipment_no:header.shipment_no, shipment_date:header.shipment_date, container_no:header.container_no || null, container_number:header.container_no || null, cro_lp_no:header.cro_lp_no || null, booking_ref:header.cro_lp_no || null, etd:header.etd || null, eta:header.eta || null, notes:packedNotes || null, status }
    let sh = draft?.shipment || null
    let error = null
    {
      const res = await saveShipmentHeader(headerPayload, isEdit, draft?.shipment?.id)
      sh = res.data; error = res.error
    }
    if (error && /container_no|container_number|cro_lp_no|booking_ref|schema cache/i.test(error.message || '')) {
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
              {[['Shipment No','shipment_no','text'],['Shipment Date','shipment_date','date'],['Container No','container_no','text'],['Booking Ref / CRO No / LP Ref','cro_lp_no','text'],['ETD','etd','date'],['ETA','eta','date'],['Gate Pass #','gate_pass_no','text'],['Delivery Challan #','delivery_challan_no','text']].map(([label,key,type]) => <div key={key}><label style={labelStyle}>{label}</label><input style={inputStyle} type={type} value={header[key] || ''} onChange={e=>setHeader(h=>({...h,[key]:e.target.value}))}/></div>)}
              <div style={{ gridColumn:'1 / -1' }}><label style={labelStyle}>Notes</label><textarea style={{ ...inputStyle, height:62, padding:8, resize:'none' }} value={header.notes} onChange={e=>setHeader(h=>({...h,notes:e.target.value}))}/></div>
              <div style={{ gridColumn:'1 / -1', border:'1px solid #e5e7eb', borderRadius:10, padding:10, background:'#fff' }}><div style={{ fontSize:10, color:'#9ca3af', fontWeight:900, textTransform:'uppercase' }}>Live Totals</div><div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:6, marginTop:7, fontSize:11.5 }}><b>Qty: {totals.qty.toLocaleString()}</b><b>Cartons: {totals.cartons.toLocaleString()}</b><b>CBM: {money(totals.cbm)}</b><b>Value: {money(totals.value)}</b></div></div>
            </div>
          </div>
          <div style={{ padding:10, overflow:'auto', minWidth:0 }}>
            <table style={{ width:'100%', borderCollapse:'collapse', tableLayout:'fixed' }}>
              <thead><tr style={{ background:'#fafafa', position:'sticky', top:0, zIndex:2 }}>{['Q #','Style','Buyer','Balance','Ship Qty','Cartons','CBM','Value','Close Q','Reason'].map(h=><th key={h} style={{ ...thStyle, padding:'8px 6px', textAlign:['Balance','Ship Qty','Cartons','CBM','Value'].includes(h)?'right':'left' }}>{h}</th>)}</tr></thead>
              <tbody>{selectedQueues.map(q => <tr key={q.id}><td style={{...tdStyle,padding:'8px 6px'}}><b>{q.q_number || '—'}</b><div style={{ fontSize:9.5, color:'#9ca3af', overflow:'hidden', textOverflow:'ellipsis' }}>{displayQueueLabel(q.label)}</div></td><td style={{...tdStyle,padding:'8px 6px'}}>{q.style_number || '—'}</td><td style={{...tdStyle,padding:'8px 6px'}}>{q.buyer_name || '—'}</td><td style={{ ...tdStyle, padding:'8px 6px', textAlign:'right' }}>{num(q.balance_qty || q.qty).toLocaleString()}</td><td style={{...tdStyle,padding:'8px 6px'}}><input style={{ ...inputStyle, textAlign:'right', width:'100%' }} type="number" value={lines[q.id]?.qty || ''} onChange={e=>setShipQty(q,e.target.value)}/></td><td style={{...tdStyle,padding:'8px 6px'}}><input style={{ ...inputStyle, textAlign:'right', width:'100%' }} type="number" value={lines[q.id]?.cartons || ''} onChange={e=>setLine(q.id,{cartons:e.target.value})}/></td><td style={{...tdStyle,padding:'8px 6px'}}><input style={{ ...inputStyle, textAlign:'right', width:'100%' }} type="number" step="0.01" value={lines[q.id]?.cbm || ''} onChange={e=>setLine(q.id,{cbm:e.target.value})}/></td><td style={{...tdStyle,padding:'8px 6px'}}><input style={{ ...inputStyle, textAlign:'right', width:'100%' }} type="number" step="0.01" value={lines[q.id]?.value || ''} onChange={e=>setLine(q.id,{value:e.target.value,valueManual:true})}/></td><td style={{ ...tdStyle, padding:'8px 6px', textAlign:'center' }}><input type="checkbox" checked={!!lines[q.id]?.close_queue} onChange={e=>setLine(q.id,{close_queue:e.target.checked})}/></td><td style={{...tdStyle,padding:'8px 6px'}}><input style={{ ...inputStyle, width:'100%', borderColor:lines[q.id]?.close_queue && Math.abs(num(lines[q.id]?.qty) - num(q.balance_qty || q.qty)) > 0.0001 && !lines[q.id]?.close_reason ? '#f59e0b' : '#e5e7eb' }} placeholder={lines[q.id]?.close_queue && Math.abs(num(lines[q.id]?.qty) - num(q.balance_qty || q.qty)) > 0.0001 ? 'Required for over/short' : 'Optional'} value={lines[q.id]?.close_reason || ''} onChange={e=>setLine(q.id,{close_reason:e.target.value})}/></td></tr>)}</tbody>
            </table>
          </div>
        </div>
        <div style={{ padding:'10px 18px', borderTop:'1px solid #eef2f7', display:'flex', justifyContent:'space-between', alignItems:'center', background:'#fff', flexShrink:0 }}>
          <div style={{ fontSize:11, color:'#6b7280' }}>Reason is mandatory only when Close Q is ticked and ship quantity is over/short.</div>
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
  const [visibleCols, setVisibleCols] = useState(DEFAULT_QUEUE_VISIBLE_COLUMNS)
  const [colOrder, setColOrder] = useState(DEFAULT_QUEUE_COLUMN_ORDER)
  const [showCols, setShowCols] = useState(false)

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
    {showCols && <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.35)', zIndex:300, display:'flex', alignItems:'center', justifyContent:'center' }} onClick={()=>setShowCols(false)}><div style={{ background:'#fff', borderRadius:12, width:460, maxHeight:'80vh', overflow:'auto', boxShadow:'0 18px 48px rgba(0,0,0,0.18)' }} onClick={e=>e.stopPropagation()}><div style={{ padding:'16px 18px', borderBottom:'1px solid #f3f4f6', display:'flex', justifyContent:'space-between' }}><div><div style={{ fontSize:15, fontWeight:800 }}>Queue Columns</div><div style={{ fontSize:11, color:'#9ca3af' }}>Add/remove queue and general info fields</div></div><button className="btn btn-ghost" onClick={()=>setShowCols(false)}><X size={16}/></button></div><div style={{ padding:14, display:'flex', flexDirection:'column', gap:8 }}>{colOrder.map((k,i)=><div key={k} style={{ display:'flex', alignItems:'center', gap:10, padding:'8px 10px', border:'1px solid #f3f4f6', borderRadius:8 }}><input type="checkbox" checked={!!visibleCols[k]} onChange={()=>setVisibleCols(v=>({...v,[k]:!v[k]}))}/><span style={{ flex:1, fontSize:12, fontWeight:700 }}>{QUEUE_COLUMN_LABELS[k]}</span><button className="btn btn-secondary btn-sm" disabled={i===0} onClick={()=>setColOrder(a=>{const n=[...a];[n[i-1],n[i]]=[n[i],n[i-1]];return n})}>↑</button><button className="btn btn-secondary btn-sm" disabled={i===colOrder.length-1} onClick={()=>setColOrder(a=>{const n=[...a];[n[i+1],n[i]]=[n[i],n[i+1]];return n})}>↓</button></div>)}</div><div style={{ padding:'12px 18px', borderTop:'1px solid #f3f4f6', display:'flex', justifyContent:'space-between' }}><button className="btn btn-secondary" onClick={()=>{setVisibleCols(DEFAULT_QUEUE_VISIBLE_COLUMNS);setColOrder(DEFAULT_QUEUE_COLUMN_ORDER)}}>Reset</button><button className="btn btn-primary" onClick={()=>setShowCols(false)}>Done</button></div></div></div>}
  </div>
}

function ShipmentsTab({ shipments, shipmentLines, rows, onRefresh, onEdit }) {
  const [search, setSearch] = useState('')
  const [groupBy, setGroupBy] = useState('none')
  const [sort, setSort] = useState({ col:'shipment_date', dir:'desc' })
  const [filterStatus, setFilterStatus] = useState('')
  const [showCols, setShowCols] = useState(false)
  const [selectedShipmentIds, setSelectedShipmentIds] = useState(new Set())
  const defaultCols = { shipment_date:true, shipment_no:true, container_no:true, booking_ref:true, etd:true, eta:true, queues:true, qty:true, cartons:true, cbm:true, value:true, tracking:true, status:true }
  const labels = { shipment_date:'Ship Date', shipment_no:'Shipment Number', container_no:'Container Number', booking_ref:'Booking Ref/CRO/LP', etd:'ETD', eta:'ETA', queues:'Queues', qty:'Total Qty', cartons:'Cartons', cbm:'CBM', value:'Value', tracking:'Tracking', status:'Status' }
  const [visibleCols, setVisibleCols] = useState(defaultCols)
  const [colOrder, setColOrder] = useState(['shipment_date','shipment_no','container_no','booking_ref','etd','eta','queues','qty','cartons','cbm','value','tracking','status'])
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
    return { ...s, qty, cartons, cbm, value, qs, lineCount:lines.length, currency:meta.currency || lines.map(l=>rowMap[l.queue_id]?.currency).find(Boolean) || 'USD', container_no:firstNonEmpty(s.container_no, s.container_number, meta.container_no), booking_ref:firstNonEmpty(s.cro_lp_no, s.booking_ref, s.booking_no, meta.cro_lp_no), tracking:trackingDays(s.eta) }
  })
  const statuses = [...new Set(data.map(s=>s.status).filter(Boolean))].sort()
  const visibleKeys = colOrder.filter(k => visibleCols[k])
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
  const actionBtnStyle = { height:32, width:34, padding:0, display:'inline-flex', alignItems:'center', justifyContent:'center', lineHeight:1 }
  return <div style={{ display:'flex', flexDirection:'column', flex:1, minHeight:0, background:'#fff' }}>
    <div style={{ padding:'12px 24px', borderBottom:'1px solid #f3f4f6', display:'flex', justifyContent:'space-between', alignItems:'center', flexShrink:0 }}>
      <div><div style={{ fontSize:20, fontWeight:800 }}>Shipments</div><div style={{ fontSize:11, color:'#6b7280' }}>Shipment records, drafts and print summaries</div></div>
    </div>
    <div style={{ padding:'8px 24px', borderBottom:'1px solid #f3f4f6', display:'flex', alignItems:'center', gap:8, flexShrink:0, overflowX:'auto' }}>
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
    {showCols && <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.35)', zIndex:300, display:'flex', alignItems:'center', justifyContent:'center' }} onClick={()=>setShowCols(false)}><div style={{ background:'#fff', borderRadius:12, width:460, maxHeight:'80vh', overflow:'auto', boxShadow:'0 18px 48px rgba(0,0,0,0.18)' }} onClick={e=>e.stopPropagation()}><div style={{ padding:'16px 18px', borderBottom:'1px solid #f3f4f6', display:'flex', justifyContent:'space-between' }}><div><div style={{ fontSize:15, fontWeight:800 }}>Shipment Columns</div><div style={{ fontSize:11, color:'#9ca3af' }}>Add/remove shipment fields</div></div><button className="btn btn-ghost" onClick={()=>setShowCols(false)}><X size={16}/></button></div><div style={{ padding:14, display:'flex', flexDirection:'column', gap:8 }}>{colOrder.map((k,i)=><div key={k} style={{ display:'flex', alignItems:'center', gap:10, padding:'8px 10px', border:'1px solid #f3f4f6', borderRadius:8 }}><input type="checkbox" checked={!!visibleCols[k]} onChange={()=>setVisibleCols(v=>({...v,[k]:!v[k]}))}/><span style={{ flex:1, fontSize:12, fontWeight:700 }}>{labels[k]}</span><button className="btn btn-secondary btn-sm" disabled={i===0} onClick={()=>setColOrder(a=>{const n=[...a];[n[i-1],n[i]]=[n[i],n[i-1]];return n})}>↑</button><button className="btn btn-secondary btn-sm" disabled={i===colOrder.length-1} onClick={()=>setColOrder(a=>{const n=[...a];[n[i+1],n[i]]=[n[i],n[i+1]];return n})}>↓</button></div>)}</div><div style={{ padding:'12px 18px', borderTop:'1px solid #f3f4f6', display:'flex', justifyContent:'space-between' }}><button className="btn btn-secondary" onClick={()=>{setVisibleCols(defaultCols);setColOrder(['shipment_date','shipment_no','container_no','booking_ref','etd','eta','queues','qty','cartons','cbm','value','tracking','status'])}}>Reset</button><button className="btn btn-primary" onClick={()=>setShowCols(false)}>Done</button></div></div></div>}
  </div>
}


export default function Shipping() {
  const [activeTab, setActiveTab] = useState('create')
  const [loading, setLoading] = useState(true)
  const [queues, setQueues] = useState([])
  const [orders, setOrders] = useState([])
  const [sizeGroups, setSizeGroups] = useState([])
  const [sizeBreakdown, setSizeBreakdown] = useState([])
  const [shipments, setShipments] = useState([])
  const [shipmentLines, setShipmentLines] = useState([])
  const [selectedIds, setSelectedIds] = useState(new Set())
  const [showModal, setShowModal] = useState(false)
  const [editDraft, setEditDraft] = useState(null)
  const { user, userRole } = useAuth()
  const roleName = userRole?.role || userRole?.name || user?.role || ''
  const isAdmin = roleName === 'admin'

  useEffect(() => { load() }, [])
  async function load() {
    setLoading(true)
    const [{ data: qs }, { data: ors }, { data: sg }, { data: bd }, { data: sh }, { data: sl }] = await Promise.all([
      supabase.from('order_queues').select('*').order('created_at', { ascending:true }),
      supabase.from('orders').select('*'),
      supabase.from('size_groups').select('*'),
      supabase.from('size_group_breakdown').select('size_group_id,qty'),
      supabase.from('shipments').select('*').order('shipment_date', { ascending:false }),
      supabase.from('shipment_lines').select('*'),
    ])
    setQueues(qs || []); setOrders(ors || []); setSizeGroups(sg || []); setSizeBreakdown(bd || []); setShipments(sh || []); setShipmentLines(sl || []); setLoading(false)
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
    <div style={{ padding:'0 24px', borderBottom:'1px solid #eef0f4', flexShrink:0 }}><div style={{ display:'flex', gap:4 }}><button style={{ padding:'12px 16px 10px', border:'none', borderBottom:activeTab==='create'?'3px solid #111827':'3px solid transparent', background:'transparent', fontSize:13, fontWeight:800, cursor:'pointer', color:activeTab==='create'?'#111827':'#6b7280' }} onClick={()=>setActiveTab('create')}>Bookings</button><button style={{ padding:'12px 16px 10px', border:'none', borderBottom:activeTab==='shipments'?'3px solid #111827':'3px solid transparent', background:'transparent', fontSize:13, fontWeight:800, cursor:'pointer', color:activeTab==='shipments'?'#111827':'#6b7280' }} onClick={()=>setActiveTab('shipments')}>Shipments</button></div></div>
    {activeTab === 'create' ? <CreateShipmentTab loading={loading} rows={rows} selectedIds={selectedIds} setSelectedIds={setSelectedIds} onNewShipment={openNewShipment} isAdmin={isAdmin} /> : <ShipmentsTab shipments={shipments} shipmentLines={shipmentLines} rows={rows} onRefresh={load} onEdit={openEditShipment} />}
    {showModal && <ShipmentModal selectedQueues={editDraft ? editDraft.lines.map(l => rows.find(q => q.id === l.queue_id)).filter(Boolean) : selectedQueues} shipments={shipments} draft={editDraft} onClose={()=>{setShowModal(false); setEditDraft(null)}} onDone={()=>{ setShowModal(false); setEditDraft(null); setSelectedIds(new Set()); load(); setActiveTab('shipments') }} />}
  </div>
}
