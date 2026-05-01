import React, { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import { Plus, X, Search, Settings, Printer } from 'lucide-react'
import { printHTML } from '../components/PrintReports'

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
function displayQueueLabel(label) { return String(label || '').split('__APP2A_QC__')[0] }
function nextShipmentNo(shipments) {
  const nums = (shipments || []).map(s => parseInt(String(s.shipment_no || '').replace(/\D/g,''))).filter(Number.isFinite)
  return `SHP-${String(Math.max(0, ...nums) + 1).padStart(4, '0')}`
}
function getOrderValue(order) {
  const direct = num(order?.value || order?.order_value || order?.total_value || order?.fob_value)
  if (direct) return direct
  const qty = num(order?.total_qty)
  const rate = num(order?.rate || order?.unit_price || order?.price || order?.fob)
  return qty && rate ? qty * rate : 0
}
function getQueueValue(order, queue) {
  const orderQty = num(order?.total_qty)
  const qQty = num(queue?.qty)
  const orderValue = getOrderValue(order)
  if (orderQty && qQty && orderValue) return (orderValue / orderQty) * qQty
  const rate = num(order?.rate || order?.unit_price || order?.price || order?.fob)
  return rate && qQty ? rate * qQty : 0
}

function buildQueueRows(queues, orders, shipmentLines) {
  const orderMap = Object.fromEntries((orders || []).map(o => [o.id, o]))
  const shippedByQ = {}
  ;(shipmentLines || []).forEach(l => {
    const qty = num(l.shipped_qty ?? l.ship_qty)
    if (l.queue_id) shippedByQ[l.queue_id] = (shippedByQ[l.queue_id] || 0) + qty
  })
  return (queues || []).map(q => {
    const o = orderMap[q.order_id] || {}
    const shipped = shippedByQ[q.id] || 0
    const qty = num(q.qty)
    return { ...q, order:o, style_number:o.style_number, buyer_name:o.buyer_name, job_number:o.job_number, ship_date:o.ship_date || o.planned_ship_date || o.planned_ex_factory, po_number:o.po_number, store_name:o.store_name, description:o.description, brand_name:o.brand_name, shipped_qty:shipped, balance_qty:Math.max(0, qty - shipped), value:getQueueValue(o, q) }
  })
}

function ShipmentModal({ selectedQueues, shipments, onClose, onDone, draft }) {
  const [saving, setSaving] = useState(false)
  const [header, setHeader] = useState({
    shipment_no: nextShipmentNo(shipments), shipment_date: new Date().toISOString().slice(0,10), container_no:'', cro_lp_no:'', eta:'', etd:'', notes:''
  })
  const [lines, setLines] = useState(() => Object.fromEntries(selectedQueues.map(q => [q.id, {
    qty: q.balance_qty || q.qty || '', cartons:'', cbm:'', value: q.value ? Number(q.value).toFixed(2) : '', close_queue:false, close_reason:''
  }])))

  const totals = useMemo(() => Object.values(lines).reduce((a, l) => ({ qty:a.qty+num(l.qty), cartons:a.cartons+num(l.cartons), cbm:a.cbm+num(l.cbm), value:a.value+num(l.value) }), { qty:0, cartons:0, cbm:0, value:0 }), [lines])
  const invalidClose = selectedQueues.some(q => lines[q.id]?.close_queue && !String(lines[q.id]?.close_reason || '').trim())

  function setLine(id, patch) { setLines(prev => ({ ...prev, [id]: { ...(prev[id] || {}), ...patch } })) }

  function printSummary() {
    const rows = selectedQueues.map(q => `<tr><td>${q.q_number || '—'}</td><td>${q.style_number || '—'}</td><td>${q.buyer_name || '—'}</td><td style="text-align:right">${num(lines[q.id]?.qty).toLocaleString()}</td><td style="text-align:right">${num(lines[q.id]?.cartons).toLocaleString()}</td><td style="text-align:right">${money(lines[q.id]?.cbm)}</td><td style="text-align:right">${money(lines[q.id]?.value)}</td></tr>`).join('')
    printHTML(`<div style="font-family:Arial;padding:24px"><h2>Shipment Summary ${header.shipment_no || ''}</h2><p>Date: ${header.shipment_date || '—'} · Container: ${header.container_no || '—'} · CRO/LP: ${header.cro_lp_no || '—'}</p><table style="width:100%;border-collapse:collapse"><thead><tr>${['Q #','Style','Buyer','Qty','Cartons','CBM','Value'].map(h=>`<th style="border:1px solid #ddd;padding:8px;background:#f5f5f5;text-align:${['Qty','Cartons','CBM','Value'].includes(h)?'right':'left'}">${h}</th>`).join('')}</tr></thead><tbody>${rows}</tbody><tfoot><tr><td colspan="3" style="border:1px solid #ddd;padding:8px;font-weight:bold">Total</td><td style="border:1px solid #ddd;padding:8px;text-align:right;font-weight:bold">${totals.qty.toLocaleString()}</td><td style="border:1px solid #ddd;padding:8px;text-align:right;font-weight:bold">${totals.cartons.toLocaleString()}</td><td style="border:1px solid #ddd;padding:8px;text-align:right;font-weight:bold">${money(totals.cbm)}</td><td style="border:1px solid #ddd;padding:8px;text-align:right;font-weight:bold">${money(totals.value)}</td></tr></tfoot></table><p>${header.notes || ''}</p></div>`)
  }

  async function save(status) {
    if (!header.shipment_no || !header.shipment_date) { alert('Shipment No and Shipment Date are required.'); return }
    if (invalidClose) { alert('Close reason is required for any queue marked as shipped/closed.'); return }
    setSaving(true)
    const headerPayload = { shipment_no:header.shipment_no, shipment_date:header.shipment_date, container_no:header.container_no || null, cro_lp_no:header.cro_lp_no || null, etd:header.etd || null, eta:header.eta || null, notes:header.notes || null, cartons_total:totals.cartons || null, cbm_total:totals.cbm || null, status }
    let { data: sh, error } = await supabase.from('shipments').insert([headerPayload]).select().single()
    if (error && /container_no|cro_lp_no/i.test(error.message || '')) {
      const fallback = { shipment_no:header.shipment_no, shipment_date:header.shipment_date, etd:header.etd || null, eta:header.eta || null, notes:[header.notes, header.container_no ? `Container No: ${header.container_no}` : '', header.cro_lp_no ? `CRO/LP No: ${header.cro_lp_no}` : ''].filter(Boolean).join('\n'), cartons_total:totals.cartons || null, cbm_total:totals.cbm || null, status }
      ;({ data: sh, error } = await supabase.from('shipments').insert([fallback]).select().single())
    }
    if (error || !sh) { alert(error?.message || 'Could not save shipment.'); setSaving(false); return }

    const fullLines = selectedQueues.map(q => ({ shipment_id:sh.id, queue_id:q.id, order_id:q.order_id, shipped_qty:num(lines[q.id]?.qty), ship_qty:num(lines[q.id]?.qty), cartons:num(lines[q.id]?.cartons) || null, cbm:num(lines[q.id]?.cbm) || null, value:num(lines[q.id]?.value) || null, close_queue:!!lines[q.id]?.close_queue, close_reason:lines[q.id]?.close_reason || null }))
    let lineError = null
    if (fullLines.length) {
      const res = await supabase.from('shipment_lines').insert(fullLines)
      lineError = res.error
      if (lineError) {
        const minimal = selectedQueues.map(q => ({ shipment_id:sh.id, queue_id:q.id, order_id:q.order_id, shipped_qty:num(lines[q.id]?.qty) }))
        const res2 = await supabase.from('shipment_lines').insert(minimal)
        lineError = res2.error
      }
    }
    if (lineError) { alert(lineError.message || 'Shipment saved but lines failed.'); setSaving(false); return }

    const closing = selectedQueues.filter(q => lines[q.id]?.close_queue)
    for (const q of closing) await supabase.from('order_queues').update({ status:'Completed' }).eq('id', q.id)
    setSaving(false)
    onDone()
  }

  return (
    <div style={{ position:'fixed', inset:0, background:'rgba(17,24,39,0.48)', zIndex:400, display:'flex', alignItems:'center', justifyContent:'center', padding:20 }}>
      <div style={{ width:'min(1380px, 96vw)', maxHeight:'92vh', background:'#fff', borderRadius:14, boxShadow:'0 24px 70px rgba(0,0,0,0.25)', display:'flex', flexDirection:'column', overflow:'hidden' }}>
        <div style={{ padding:'15px 18px', borderBottom:'1px solid #eef2f7', display:'flex', alignItems:'center', justifyContent:'space-between' }}>
          <div><div style={{ fontSize:17, fontWeight:900 }}>New Shipment</div><div style={{ fontSize:11, color:'#6b7280', marginTop:2 }}>{selectedQueues.length} selected queue(s). Header left, queue details right.</div></div>
          <button className="btn btn-ghost" onClick={onClose}><X size={16}/></button>
        </div>
        <div style={{ display:'grid', gridTemplateColumns:'30% 70%', minHeight:560, overflow:'hidden' }}>
          <div style={{ padding:18, borderRight:'1px solid #eef2f7', background:'#fafafa', overflow:'auto' }}>
            <div style={{ fontSize:10, fontWeight:900, color:'#9ca3af', letterSpacing:'.5px', textTransform:'uppercase', marginBottom:10 }}>Shipment Info</div>
            <div style={{ display:'grid', gap:11 }}>
              {[['Shipment No','shipment_no','text'],['Shipment Date','shipment_date','date'],['Container No','container_no','text'],['CRO/LP No','cro_lp_no','text'],['ETD','etd','date'],['ETA','eta','date']].map(([label,key,type]) => <div key={key}><label style={{ fontSize:11, fontWeight:800, color:'#6b7280', display:'block', marginBottom:4 }}>{label}</label><input style={inputStyle} type={type} value={header[key]} onChange={e=>setHeader(h=>({...h,[key]:e.target.value}))}/></div>)}
              <div><label style={{ fontSize:11, fontWeight:800, color:'#6b7280', display:'block', marginBottom:4 }}>Notes</label><textarea style={{ ...inputStyle, height:92, padding:9, resize:'vertical' }} value={header.notes} onChange={e=>setHeader(h=>({...h,notes:e.target.value}))}/></div>
              <div style={{ border:'1px solid #e5e7eb', borderRadius:10, padding:12, background:'#fff', marginTop:4 }}><div style={{ fontSize:10, color:'#9ca3af', fontWeight:900, textTransform:'uppercase' }}>Live Totals</div><div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8, marginTop:8, fontSize:12 }}><b>Qty: {totals.qty.toLocaleString()}</b><b>Cartons: {totals.cartons.toLocaleString()}</b><b>CBM: {money(totals.cbm)}</b><b>Value: {money(totals.value)}</b></div></div>
            </div>
          </div>
          <div style={{ padding:16, overflow:'auto' }}>
            <table style={{ width:'100%', borderCollapse:'collapse', minWidth:980 }}>
              <thead><tr style={{ background:'#fafafa', position:'sticky', top:0, zIndex:2 }}>{['Q #','Style','Buyer','Balance','Ship Qty','Cartons','CBM','Value','Close Q','Reason'].map(h=><th key={h} style={{ ...thStyle, textAlign:['Balance','Ship Qty','Cartons','CBM','Value'].includes(h)?'right':'left' }}>{h}</th>)}</tr></thead>
              <tbody>{selectedQueues.map(q => <tr key={q.id}><td style={tdStyle}><b>{q.q_number || '—'}</b><div style={{ fontSize:10, color:'#9ca3af' }}>{displayQueueLabel(q.label)}</div></td><td style={tdStyle}>{q.style_number || '—'}</td><td style={tdStyle}>{q.buyer_name || '—'}</td><td style={{ ...tdStyle, textAlign:'right' }}>{num(q.balance_qty || q.qty).toLocaleString()}</td><td style={tdStyle}><input style={{ ...inputStyle, textAlign:'right', width:95 }} type="number" value={lines[q.id]?.qty || ''} onChange={e=>setLine(q.id,{qty:e.target.value})}/></td><td style={tdStyle}><input style={{ ...inputStyle, textAlign:'right', width:90 }} type="number" value={lines[q.id]?.cartons || ''} onChange={e=>setLine(q.id,{cartons:e.target.value})}/></td><td style={tdStyle}><input style={{ ...inputStyle, textAlign:'right', width:90 }} type="number" step="0.01" value={lines[q.id]?.cbm || ''} onChange={e=>setLine(q.id,{cbm:e.target.value})}/></td><td style={tdStyle}><input style={{ ...inputStyle, textAlign:'right', width:105 }} type="number" step="0.01" value={lines[q.id]?.value || ''} onChange={e=>setLine(q.id,{value:e.target.value})}/></td><td style={{ ...tdStyle, textAlign:'center' }}><input type="checkbox" checked={!!lines[q.id]?.close_queue} onChange={e=>setLine(q.id,{close_queue:e.target.checked})}/></td><td style={tdStyle}><input style={{ ...inputStyle, width:190, borderColor:lines[q.id]?.close_queue && !lines[q.id]?.close_reason ? '#f59e0b' : '#e5e7eb' }} placeholder={lines[q.id]?.close_queue ? 'Required reason' : 'Optional'} value={lines[q.id]?.close_reason || ''} onChange={e=>setLine(q.id,{close_reason:e.target.value})}/></td></tr>)}</tbody>
            </table>
          </div>
        </div>
        <div style={{ padding:'12px 18px', borderTop:'1px solid #eef2f7', display:'flex', justifyContent:'space-between', alignItems:'center', background:'#fff' }}>
          <div style={{ fontSize:11, color:'#6b7280' }}>Factory close checkbox means this Q is manually closed even with over/short quantity; reason is mandatory.</div>
          <div style={{ display:'flex', gap:8 }}><button className="btn btn-secondary" onClick={printSummary}><Printer size={14}/> Print Summary</button><button className="btn btn-secondary" disabled={saving} onClick={()=>save('Draft')}>Save as Draft</button><button className="btn btn-primary" disabled={saving} onClick={()=>save('Created')}>{saving ? 'Saving...' : 'Create Shipment'}</button></div>
        </div>
      </div>
    </div>
  )
}

function CreateShipmentTab({ loading, rows, selectedIds, setSelectedIds, onNewShipment }) {
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
  function toggleSelect(id) { setSelectedIds(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n }) }
  function toggleAll() { setSelectedIds(prev => filtered.every(q=>prev.has(q.id)) ? new Set() : new Set([...prev, ...filtered.map(q=>q.id)])) }
  function renderCell(q,k) { const right = ['qty','shipped_qty','balance_qty'].includes(k); const v = k === 'label' ? displayQueueLabel(q[k]) : k.includes('date') ? fmtDate(q[k]) : ['qty','shipped_qty','balance_qty'].includes(k) ? num(q[k]).toLocaleString() : (q[k] || '—'); return <td key={k} style={{ ...tdStyle, textAlign:right?'right':'left' }}>{k === 'status' ? <span style={{ padding:'3px 8px', borderRadius:999, background:'#f3f4f6', fontWeight:800, fontSize:11 }}>{v}</span> : v}</td> }
  function exportCSV() { const head = visibleKeys.map(k=>QUEUE_COLUMN_LABELS[k]); const lines = [head.join(',')].concat(filtered.map(q=>visibleKeys.map(k=>`"${String(k==='label'?displayQueueLabel(q[k]):q[k] ?? '').replace(/"/g,'""')}"`).join(','))); const a=document.createElement('a'); a.href=URL.createObjectURL(new Blob([lines.join('\n')],{type:'text/csv'})); a.download='shipping-queue.csv'; a.click() }
  function printList() { const head = visibleKeys.map(k=>`<th style="border:1px solid #ddd;padding:8px;background:#f5f5f5;text-align:left">${QUEUE_COLUMN_LABELS[k]}</th>`).join(''); const body = filtered.map(q=>`<tr>${visibleKeys.map(k=>`<td style="border:1px solid #ddd;padding:8px">${k==='label'?displayQueueLabel(q[k]):(q[k]??'')}</td>`).join('')}</tr>`).join(''); printHTML(`<div style="font-family:Arial;padding:24px"><h2>Shipping Queue</h2><table style="width:100%;border-collapse:collapse"><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table></div>`) }

  if (loading) return <div style={{ padding:60, textAlign:'center', color:'#9ca3af', fontSize:12 }}>Loading queues...</div>
  return <div style={{ display:'flex', flexDirection:'column', flex:1, minHeight:0, background:'#fff' }}>
    <div style={{ padding:'12px 24px', borderBottom:'1px solid #f3f4f6', display:'flex', alignItems:'center', gap:14, flexShrink:0, minWidth:0 }}>
      <div style={{ flexShrink:0 }}><div style={{ fontSize:20, fontWeight:800, letterSpacing:'-0.4px' }}>Create Shipment</div><div style={{ fontSize:11, color:'var(--text-light)', marginTop:1 }}>Queue mirror: select Qs first, then create shipment</div></div>
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

function ShipmentsTab({ shipments, shipmentLines, rows, onRefresh }) {
  const rowMap = Object.fromEntries(rows.map(q => [q.id, q]))
  const data = shipments.map(s => { const lines = shipmentLines.filter(l=>l.shipment_id===s.id); const qty=lines.reduce((a,l)=>a+num(l.shipped_qty ?? l.ship_qty),0); const cartons=lines.reduce((a,l)=>a+num(l.cartons),0) || num(s.cartons_total); const cbm=lines.reduce((a,l)=>a+num(l.cbm),0) || num(s.cbm_total); const qs=lines.map(l=>rowMap[l.queue_id]?.q_number).filter(Boolean).join(', '); return { ...s, qty, cartons, cbm, qs, lineCount:lines.length } })
  function printShipment(s) { const lines = shipmentLines.filter(l=>l.shipment_id===s.id); const body = lines.map(l=>{ const q=rowMap[l.queue_id]||{}; return `<tr><td>${q.q_number||'—'}</td><td>${q.style_number||'—'}</td><td>${q.buyer_name||'—'}</td><td style="text-align:right">${num(l.shipped_qty ?? l.ship_qty).toLocaleString()}</td></tr>` }).join(''); printHTML(`<div style="font-family:Arial;padding:24px"><h2>Shipment ${s.shipment_no||''}</h2><p>Date: ${fmtDate(s.shipment_date)} · ETD: ${fmtDate(s.etd)} · ETA: ${fmtDate(s.eta)}</p><table style="width:100%;border-collapse:collapse"><tbody>${body}</tbody></table></div>`) }
  return <div style={{ background:'#fff', flex:1, overflow:'auto' }}><div style={{ padding:'12px 24px', borderBottom:'1px solid #f3f4f6', display:'flex', justifyContent:'space-between', alignItems:'center' }}><div><div style={{ fontSize:20, fontWeight:800 }}>Shipments</div><div style={{ fontSize:11, color:'#6b7280' }}>Shipment records, drafts and print summaries</div></div><button className="btn btn-secondary" onClick={onRefresh}>Refresh</button></div><div style={{ overflow:'auto' }}><table style={{ width:'100%', minWidth:980, borderCollapse:'collapse' }}><thead><tr style={{ background:'#fafafa', position:'sticky', top:0 }}>{['Shipment No','Date','Container / CRO','ETA / ETD','Queues','Total Qty','Cartons','CBM','Status','Actions'].map(h=><th key={h} style={{ ...thStyle, textAlign:['Total Qty','Cartons','CBM'].includes(h)?'right':'left' }}>{h}</th>)}</tr></thead><tbody>{data.length===0 ? <tr><td colSpan="10" style={{ padding:50, textAlign:'center', color:'#9ca3af', fontSize:12 }}>No shipments yet.</td></tr> : data.map(s=><tr key={s.id}><td style={tdStyle}><b>{s.shipment_no||'—'}</b></td><td style={tdStyle}>{fmtDate(s.shipment_date)}</td><td style={tdStyle}>{s.container_no || '—'}<div style={{ fontSize:10, color:'#9ca3af' }}>{s.cro_lp_no || ''}</div></td><td style={tdStyle}>ETA {fmtDate(s.eta)}<div style={{ fontSize:10, color:'#9ca3af' }}>ETD {fmtDate(s.etd)}</div></td><td style={tdStyle}>{s.qs || `${s.lineCount} line(s)`}</td><td style={{ ...tdStyle, textAlign:'right' }}>{s.qty.toLocaleString()}</td><td style={{ ...tdStyle, textAlign:'right' }}>{s.cartons.toLocaleString()}</td><td style={{ ...tdStyle, textAlign:'right' }}>{money(s.cbm)}</td><td style={tdStyle}><span style={{ padding:'3px 8px', borderRadius:999, background:s.status==='Draft'?'#fff7ed':'#ecfdf5', fontWeight:800, fontSize:11 }}>{s.status||'Created'}</span></td><td style={tdStyle}><button className="btn btn-secondary btn-sm" onClick={()=>printShipment(s)}>Print Summary</button></td></tr>)}</tbody></table></div></div>
}

export default function Shipping() {
  const [activeTab, setActiveTab] = useState('create')
  const [loading, setLoading] = useState(true)
  const [queues, setQueues] = useState([])
  const [orders, setOrders] = useState([])
  const [shipments, setShipments] = useState([])
  const [shipmentLines, setShipmentLines] = useState([])
  const [selectedIds, setSelectedIds] = useState(new Set())
  const [showModal, setShowModal] = useState(false)

  useEffect(() => { load() }, [])
  async function load() {
    setLoading(true)
    const [{ data: qs }, { data: ors }, { data: sh }, { data: sl }] = await Promise.all([
      supabase.from('order_queues').select('*').order('created_at', { ascending:true }),
      supabase.from('orders').select('*'),
      supabase.from('shipments').select('*').order('shipment_date', { ascending:false }),
      supabase.from('shipment_lines').select('*'),
    ])
    setQueues(qs || []); setOrders(ors || []); setShipments(sh || []); setShipmentLines(sl || []); setLoading(false)
  }
  const rows = useMemo(() => buildQueueRows(queues, orders, shipmentLines), [queues, orders, shipmentLines])
  const selectedQueues = [...selectedIds].map(id => rows.find(q => q.id === id)).filter(Boolean)
  function openNewShipment() { if (!selectedQueues.length) { alert('Select at least one queue to create shipment.'); return } setShowModal(true) }
  return <div style={{ display:'flex', flexDirection:'column', height:'100%', background:'#fff', overflow:'hidden' }}>
    <div style={{ padding:'14px 24px 0', borderBottom:'1px solid #eef0f4', flexShrink:0 }}><div style={{ display:'flex', alignItems:'flex-end', justifyContent:'space-between', marginBottom:12 }}><div><h1 style={{ fontSize:22, fontWeight:900, margin:0, color:'#111827' }}>Shipping</h1><div style={{ fontSize:12, color:'#6b7280', marginTop:4 }}>Queue-driven shipment creation and shipment records.</div></div></div><div style={{ display:'flex', gap:4 }}><button style={{ padding:'10px 16px', border:'none', borderBottom:activeTab==='create'?'3px solid #111827':'3px solid transparent', background:'transparent', fontSize:13, fontWeight:800, cursor:'pointer', color:activeTab==='create'?'#111827':'#6b7280' }} onClick={()=>setActiveTab('create')}>Create Shipment</button><button style={{ padding:'10px 16px', border:'none', borderBottom:activeTab==='shipments'?'3px solid #111827':'3px solid transparent', background:'transparent', fontSize:13, fontWeight:800, cursor:'pointer', color:activeTab==='shipments'?'#111827':'#6b7280' }} onClick={()=>setActiveTab('shipments')}>Shipments</button></div></div>
    {activeTab === 'create' ? <CreateShipmentTab loading={loading} rows={rows} selectedIds={selectedIds} setSelectedIds={setSelectedIds} onNewShipment={openNewShipment} /> : <ShipmentsTab shipments={shipments} shipmentLines={shipmentLines} rows={rows} onRefresh={load} />}
    {showModal && <ShipmentModal selectedQueues={selectedQueues} shipments={shipments} onClose={()=>setShowModal(false)} onDone={()=>{ setShowModal(false); setSelectedIds(new Set()); load(); setActiveTab('shipments') }} />}
  </div>
}
