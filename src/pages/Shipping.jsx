import React, { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import { Plus, X, Search, Settings, Download, Printer, Filter, Link as LinkIcon, Check, ChevronLeft, ChevronRight } from 'lucide-react'
import { useAuth } from '../lib/authContext'

const card = { background:'#fff', border:'1px solid #e8e8e6', borderRadius:10, overflow:'hidden' }
const inp = { width:'100%', height:34, padding:'0 10px', border:'1px solid #e5e7eb', borderRadius:8, fontSize:12, outline:'none', boxSizing:'border-box', fontFamily:'var(--font)' }
const th = { textAlign:'left', padding:'10px 12px', fontSize:10, color:'#9ca3af', textTransform:'uppercase', letterSpacing:'.04em', whiteSpace:'nowrap', borderBottom:'1px solid #eee' }
const td = { padding:'12px', borderBottom:'1px solid #f5f5f3', fontSize:12, verticalAlign:'top' }
const btn = { height:34, border:'1px solid #e5e7eb', background:'#fff', borderRadius:8, padding:'0 12px', display:'inline-flex', alignItems:'center', gap:7, cursor:'pointer', fontSize:12, fontWeight:700 }
const primaryBtn = { ...btn, background:'#050505', color:'#fff', borderColor:'#050505' }

function n(v) { return Number.isFinite(parseFloat(v)) ? parseFloat(v) : 0 }
function fmtNum(v) { return n(v).toLocaleString(undefined, { maximumFractionDigits:2 }) }
function fmtDate(d) {
  if (!d) return '—'
  try { return new Date(d).toLocaleDateString('en-GB', { day:'2-digit', month:'short', year:'numeric' }) } catch { return d }
}
function money(v, currency='USD') {
  const x = n(v)
  if (!x) return '—'
  return `${currency || 'USD'} ${x.toLocaleString(undefined, { maximumFractionDigits:2 })}`
}
function getPOL(o={}) { return o.port_of_loading || o.port_loading || o.pol || '—' }
function getPOD(o={}) { return o.port_of_destination || o.port_of_discharge || o.port_destination || o.pod || '—' }
function firstVal(o={}, keys=[]) {
  for (const k of keys) if (o[k] !== undefined && o[k] !== null && String(o[k]).trim() !== '') return o[k]
  return '—'
}
function orderGeneral(o={}) {
  return {
    factory_ref:firstVal(o, ['factory_ref','factory_reference','factoryRef','factory']),
    merchandiser:firstVal(o, ['merchandiser','merchant','merch','assigned_merchandiser']),
    ship_date:firstVal(o, ['ship_date','shipment_date','ex_factory_date']),
    delivery_date:firstVal(o, ['delivery_date','deliveryDate','due_date']),
    split_rule:firstVal(o, ['split_rule','splitRule','q_split_rule']),
    currency:firstVal(o, ['currency','currency_code']),
  }
}
function addDays(date, days) {
  if (!date) return ''
  const d = new Date(date)
  if (Number.isNaN(d.getTime())) return ''
  d.setDate(d.getDate() + Number(days || 0))
  return d.toISOString().slice(0,10)
}
function daysLeft(eta) {
  if (!eta) return null
  const today = new Date(); today.setHours(0,0,0,0)
  const e = new Date(eta); e.setHours(0,0,0,0)
  if (Number.isNaN(e.getTime())) return null
  return Math.ceil((e - today) / 86400000)
}
function daysBadge(d) {
  if (d == null) return { text:'—', bg:'#f9fafb', color:'#6b7280' }
  if (d < 0) return { text:`Delayed (${Math.abs(d)}d)`, bg:'#fef2f2', color:'#991b1b' }
  if (d <= 1) return { text:`${d}d left`, bg:'#fef2f2', color:'#991b1b' }
  if (d <= 4) return { text:`${d}d left`, bg:'#fffbeb', color:'#92400e' }
  return { text:`${d}d left`, bg:'#ecfdf5', color:'#065f46' }
}
function safeCsv(v) {
  const s = String(v ?? '')
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

const pendingColumnsDefault = [
  { key:'job_status', label:'Job / Status', visible:true },
  { key:'q_data', label:'Q Data', visible:true },
  { key:'buyer', label:'Buyer', visible:true },
  { key:'style_po', label:'Style / PO', visible:true },
  { key:'factory_ref', label:'Factory Ref', visible:false },
  { key:'merchandiser', label:'Merch.', visible:false },
  { key:'split_rule', label:'Split Rule', visible:false },
  { key:'ship_date', label:'Ship Date', visible:false },
  { key:'delivery_date', label:'Delivery Date', visible:false },
  { key:'qty', label:'Qty / Ship / Balance', visible:true },
  { key:'queue_qty', label:'Queue Qty', visible:false },
  { key:'unit_price', label:'Unit Price', visible:false },
  { key:'value', label:'Value', visible:true },
  { key:'currency', label:'Currency', visible:false },
  { key:'ports', label:'POL / POD', visible:true },
  { key:'action', label:'Action', visible:true, noExport:true },
]
const shippedColumnsDefault = [
  { key:'shipment', label:'Shipment', visible:true },
  { key:'date', label:'Shipment Date', visible:true },
  { key:'buyer_style', label:'Buyer / Style', visible:true },
  { key:'job', label:'Job', visible:false },
  { key:'factory_ref', label:'Factory Ref', visible:false },
  { key:'merchandiser', label:'Merch.', visible:false },
  { key:'ship_date', label:'Ship Date', visible:false },
  { key:'delivery_date', label:'Delivery Date', visible:false },
  { key:'q_data', label:'Q Data', visible:true },
  { key:'qty', label:'Ship Qty', visible:true },
  { key:'cartons', label:'Cartons', visible:true },
  { key:'cbm', label:'CBM', visible:true },
  { key:'unit_price', label:'Unit Price', visible:false },
  { key:'value', label:'Shipment Value', visible:true },
  { key:'currency', label:'Currency', visible:false },
  { key:'ports', label:'POL / POD', visible:true },
  { key:'eta', label:'ETA / Days Left', visible:true },
  { key:'tracking', label:'Tracking', visible:true, noExport:true },
  { key:'source', label:'Source', visible:true },
]

function useTablePrefs(key, defaults) {
  const [prefs, setPrefs] = useState(() => {
    try { return JSON.parse(localStorage.getItem(key)) || {} } catch { return {} }
  })
  const [columns, setColumns] = useState(() => prefs.columns || defaults)
  const [groupBy, setGroupBy] = useState(() => prefs.groupBy || 'none')
  const [sortBy, setSortBy] = useState(() => prefs.sortBy || 'style_asc')
  const [filterBuyer, setFilterBuyer] = useState(() => prefs.filterBuyer || 'all')
  const [filterStatus, setFilterStatus] = useState(() => prefs.filterStatus || 'all')
  useEffect(() => {
    const next = { columns, groupBy, sortBy, filterBuyer, filterStatus }
    localStorage.setItem(key, JSON.stringify(next))
  }, [key, columns, groupBy, sortBy, filterBuyer, filterStatus])
  return { columns, setColumns, groupBy, setGroupBy, sortBy, setSortBy, filterBuyer, setFilterBuyer, filterStatus, setFilterStatus }
}

function ColumnModal({ columns, setColumns, onClose }) {
  return <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,.28)', zIndex:500, display:'flex', alignItems:'center', justifyContent:'center' }}>
    <div style={{ ...card, width:360, padding:18 }}>
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:12 }}>
        <div style={{ fontSize:16, fontWeight:900 }}>Column Settings</div>
        <button style={{ border:'none', background:'none', cursor:'pointer' }} onClick={onClose}><X size={16}/></button>
      </div>
      <div style={{ fontSize:12, color:'#6b7280', marginBottom:10 }}>Choose any shipment field or linked order general-info field.</div><div style={{ display:'grid', gap:8, maxHeight:420, overflowY:'auto', paddingRight:4 }}>
        {columns.map((c, idx) => <label key={c.key} style={{ display:'flex', alignItems:'center', justifyContent:'space-between', border:'1px solid #eee', borderRadius:8, padding:'9px 10px', fontSize:12, fontWeight:700 }}>
          <span>{c.label}</span>
          <input type="checkbox" checked={c.visible} onChange={e => setColumns(cols => cols.map((x,i) => i === idx ? { ...x, visible:e.target.checked } : x))}/>
        </label>)}
      </div>
      <button style={{ ...primaryBtn, width:'100%', justifyContent:'center', marginTop:14 }} onClick={onClose}>Done</button>
    </div>
  </div>
}

function KpiCard({ label, value, sub }) {
  return <div style={{ ...card, padding:'12px 14px', minHeight:58 }}>
    <div style={{ fontSize:10, color:'#9ca3af', textTransform:'uppercase', letterSpacing:'.04em', fontWeight:800 }}>{label}</div>
    <div style={{ display:'flex', alignItems:'baseline', gap:10, marginTop:6 }}>
      <div style={{ fontSize:20, fontWeight:900, color:'#050505' }}>{value}</div>
      {sub && <div style={{ fontSize:11, fontWeight:800, color:'#6b7280' }}>{sub}</div>}
    </div>
  </div>
}

function TableControls({ search, setSearch, prefs, buyers, statuses, placeholder, onColumns, onExport, onPrint }) {
  return <div style={{ display:'flex', alignItems:'center', gap:8, padding:'12px 16px', borderBottom:'1px solid #eee', background:'#fff' }}>
    <div style={{ position:'relative', width:330 }}>
      <Search size={13} style={{ position:'absolute', left:9, top:'50%', transform:'translateY(-50%)', color:'#9ca3af' }} />
      <input style={{ ...inp, paddingLeft:28 }} value={search} onChange={e => setSearch(e.target.value)} placeholder={placeholder}/>
    </div>
    <select style={{ ...inp, width:170 }} value={prefs.groupBy} onChange={e => prefs.setGroupBy(e.target.value)}>
      <option value="none">≡ No Group</option><option value="buyer">By Buyer</option><option value="style">By Style</option><option value="job">By Job</option><option value="port">By Port</option><option value="date">By Date</option>
    </select>
    <select style={{ ...inp, width:160 }} value={prefs.sortBy} onChange={e => prefs.setSortBy(e.target.value)}>
      <option value="style_asc">⇅ Style Asc</option><option value="style_desc">⇅ Style Desc</option><option value="buyer_asc">Buyer Asc</option><option value="qty_desc">Qty Desc</option><option value="date_asc">Date Asc</option><option value="date_desc">Date Desc</option>
    </select>
    <select style={{ ...inp, width:150 }} value={prefs.filterBuyer} onChange={e => prefs.setFilterBuyer(e.target.value)}>
      <option value="all">All Buyers</option>{buyers.map(b => <option key={b} value={b}>{b}</option>)}
    </select>
    <select style={{ ...inp, width:150 }} value={prefs.filterStatus} onChange={e => prefs.setFilterStatus(e.target.value)}>
      <option value="all">All Status</option>{statuses.map(s => <option key={s} value={s}>{s}</option>)}
    </select>
    <div style={{ marginLeft:'auto', display:'flex', gap:8 }}>
      <button style={btn} title="Filters"><Filter size={14}/></button>
      <button style={btn} title="Columns" onClick={onColumns}><Settings size={14}/></button>
      <button style={btn} onClick={onExport}><Download size={14}/> Export</button>
      <button style={btn} onClick={onPrint}><Printer size={14}/> Print</button>
    </div>
  </div>
}

function groupRows(rows, groupBy) {
  if (!groupBy || groupBy === 'none') return rows.map(r => ({ type:'row', row:r }))
  const getKey = (r) => {
    if (groupBy === 'buyer') return r.buyer || 'No Buyer'
    if (groupBy === 'style') return `Style ${r.style || '—'}`
    if (groupBy === 'job') return r.job || 'No Job'
    if (groupBy === 'port') return `${r.pol || '—'} → ${r.pod || '—'}`
    if (groupBy === 'date') return r.date || r.shipment_date || 'No Date'
    return 'Group'
  }
  const buckets = new Map()
  rows.forEach(r => { const k = getKey(r); if (!buckets.has(k)) buckets.set(k, []); buckets.get(k).push(r) })
  const out = []
  buckets.forEach((items, key) => {
    out.push({ type:'group', key, count:items.length, qty:items.reduce((s,x)=>s+n(x.qty || x.balance || x.ship_qty),0), value:items.reduce((s,x)=>s+n(x.value),0) })
    items.forEach(row => out.push({ type:'row', row }))
  })
  return out
}

function CreateShipmentModal({ existingShipments, allOrders = [], onClose, onDone, user, preselectedOrder }) {
  const [step, setStep] = useState(1)
  const [queues, setQueues] = useState([])
  const [orders, setOrders] = useState(allOrders || [])
  const [priceMap, setPriceMap] = useState({})
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState({})
  const [lineMeta, setLineMeta] = useState({})
  const [closeSelected, setCloseSelected] = useState({})
  const [backfillMode, setBackfillMode] = useState(false)
  const [saving, setSaving] = useState(false)
  const isAdmin = String(user?.role || '').toLowerCase() === 'admin'
  const [header, setHeader] = useState({ shipment_no:'', shipment_date:new Date().toISOString().slice(0,10), container_no:'', booking_ref:'', notes:'', tracking_link:'' })

  useEffect(() => {
    const nums = (existingShipments || []).map(s => parseInt(String(s.shipment_no || '').replace(/\D/g,''))).filter(Number.isFinite)
    setHeader(h => ({ ...h, shipment_no:`SHP-${String(Math.max(0, ...nums) + 1).padStart(4,'0')}` }))
    load()
  }, [])

  async function load() {
    setLoading(true)
    const [{ data: qs }, { data: ors }, { data: lines }, { data: sgs }] = await Promise.all([
      supabase.from('order_queues').select('*').order('created_at', { ascending:true }),
      supabase.from('orders').select('*'),
      supabase.from('shipment_lines').select('queue_id,order_id,shipped_qty'),
      supabase.from('size_groups').select('id,order_id,unit_price,currency,group_name'),
    ])
    const shippedByQ = {}, shippedByOrder = {}
    ;(lines || []).forEach(l => { if (l.queue_id) shippedByQ[l.queue_id] = (shippedByQ[l.queue_id] || 0) + n(l.shipped_qty); if (l.order_id) shippedByOrder[l.order_id] = (shippedByOrder[l.order_id] || 0) + n(l.shipped_qty) })
    const orderMap = Object.fromEntries((ors || []).map(o => [o.id, o]))
    const pMap = {}
    ;(sgs || []).forEach(sg => { if (sg.id) pMap[`sg:${sg.id}`] = { unit_price:n(sg.unit_price), currency:sg.currency || 'USD' }; if (sg.order_id && pMap[`order:${sg.order_id}`] == null) pMap[`order:${sg.order_id}`] = { unit_price:n(sg.unit_price), currency:sg.currency || 'USD' } })
    setPriceMap(pMap); setOrders(ors || [])
    const ready = (qs || []).filter(q => String(q.q_number || '').trim() && String(q.status || '').toLowerCase() !== 'closed').map(q => {
      const total = n(q.qty), shipped = shippedByQ[q.id] || 0, ord = orderMap[q.order_id] || {}, price = pMap[`sg:${q.size_group_id}`] || pMap[`order:${q.order_id}`] || { unit_price:n(ord.unit_price), currency:ord.currency || 'USD' }
      return { ...q, order:ord, shipped_qty:shipped, balance_qty:Math.max(0, total - shipped), isBackfill:false, unit_price:price.unit_price, currency:price.currency }
    }).filter(q => q.balance_qty > 0)
    setQueues(ready)
    setLoading(false)
  }

  function defaultMeta(q) {
    const unit = n(q.unit_price), shipQty = n(q.balance_qty || q.qty)
    return { ship_qty:String(shipQty || ''), cartons:'', cbm:'', unit_price:String(unit || ''), shipment_value:String(unit && shipQty ? unit * shipQty : ''), transit_days:'', eta:addDays(header.shipment_date, 0), port_loading:getPOL(q.order), port_destination:getPOD(q.order), override_value:false }
  }
  const queueRows = useMemo(() => queues.filter(q => `${q.q_number} ${q.label || ''} ${q.order?.style_number || ''} ${q.order?.buyer_name || ''} ${q.order?.po_number || ''} ${q.order?.job_number || ''}`.toLowerCase().includes(search.toLowerCase())), [queues, search])
  const backfillRows = useMemo(() => (orders || []).filter(o => `${o.buyer_name || ''} ${o.style_number || ''} ${o.po_number || ''} ${o.job_number || ''}`.toLowerCase().includes(search.toLowerCase())).map(o => {
    const price = priceMap[`order:${o.id}`] || { unit_price:n(o.unit_price), currency:o.currency || 'USD' }
    return { id:`order-${o.id}`, order_id:o.id, q_number:'Backfill', label:o.po_number || o.style_number || 'Historical shipment', qty:n(o.total_qty), shipped_qty:0, balance_qty:n(o.total_qty), order:o, isBackfill:true, unit_price:price.unit_price, currency:price.currency }
  }), [orders, search, priceMap])
  const rows = backfillMode ? backfillRows : queueRows
  function toggleRow(q) {
    setSelected(prev => { const next = { ...prev }; if (next[q.id]) { delete next[q.id]; setLineMeta(m => { const c={...m}; delete c[q.id]; return c }); setCloseSelected(c => { const x={...c}; delete x[q.id]; return x }) } else { next[q.id]=true; setLineMeta(m => ({ ...m, [q.id]:defaultMeta(q) })) } return next })
  }
  function updateMeta(id, patch) {
    setLineMeta(prev => { const old=prev[id]||{}; let next={...old,...patch}; if (('ship_qty' in patch || 'unit_price' in patch) && !next.override_value) next.shipment_value = String(n(next.ship_qty) * n(next.unit_price) || ''); if ('transit_days' in patch) next.eta = addDays(header.shipment_date, n(next.transit_days)); return { ...prev, [id]:next } })
  }
  useEffect(() => { setLineMeta(prev => { const c={...prev}; Object.keys(c).forEach(id => c[id] = { ...c[id], eta:addDays(header.shipment_date, n(c[id].transit_days)) }); return c }) }, [header.shipment_date])
  const picked = rows.filter(q => selected[q.id])
  const totalQty = picked.reduce((s,q)=>s+n(lineMeta[q.id]?.ship_qty),0)
  const totalValue = picked.reduce((s,q)=>s+n(lineMeta[q.id]?.shipment_value),0)
  const valid = header.shipment_no && header.shipment_date && totalQty > 0

  async function insertShipmentLines(lineRows) {
    const richRows = lineRows.map(r => ({ shipment_id:r.shipment_id, order_id:r.order_id, queue_id:r.queue_id, shipped_qty:r.shipped_qty, total_cartons:r.total_cartons, cbm:r.cbm, unit_price:r.unit_price, currency:r.currency, shipment_value:r.shipment_value, port_of_loading:r.port_of_loading, port_of_destination:r.port_of_destination, transit_days:r.transit_days, eta_destination_port:r.eta_destination_port }))
    const { error } = await supabase.from('shipment_lines').insert(richRows)
    if (!error) return null
    const fallbackRows = lineRows.map(r => ({ shipment_id:r.shipment_id, order_id:r.order_id, queue_id:r.queue_id, shipped_qty:r.shipped_qty }))
    const { error: fallbackError } = await supabase.from('shipment_lines').insert(fallbackRows)
    if (!fallbackError) return 'Shipment saved, but logistics/commercial line fields were skipped because DB migration is missing.'
    return fallbackError.message || error.message || 'Could not save shipment lines'
  }
  async function handleSave() {
    if (!valid) return
    setSaving(true)
    const payload = { shipment_no:header.shipment_no, shipment_date:header.shipment_date, container_no:header.container_no || null, booking_ref:header.booking_ref || null, tracking_link:header.tracking_link || null, notes:header.notes || null, status:'Open', source:backfillMode ? 'backfill':'queue' }
    let { data: sh, error } = await supabase.from('shipments').insert([payload]).select().single()
    if (error && String(error.message || '').toLowerCase().includes('tracking_link')) {
      const { tracking_link, ...fallback } = payload
      const retry = await supabase.from('shipments').insert([fallback]).select().single(); sh=retry.data; error=retry.error
    }
    if (error || !sh) { window.alert(error?.message || 'Could not create shipment'); setSaving(false); return }
    const lineRows = picked.map(q => { const m=lineMeta[q.id]||{}; return { shipment_id:sh.id, order_id:q.order_id, queue_id:backfillMode ? null : q.id, shipped_qty:Math.max(0,n(m.ship_qty)), total_cartons:n(m.cartons)||null, cbm:n(m.cbm)||null, unit_price:n(m.unit_price)||null, currency:q.currency || q.order?.currency || 'USD', shipment_value:n(m.shipment_value)||null, port_of_loading:m.port_loading||null, port_of_destination:m.port_destination||null, transit_days:n(m.transit_days)||null, eta_destination_port:m.eta||null } }).filter(r => r.shipped_qty > 0)
    if (lineRows.length) { const lineError = await insertShipmentLines(lineRows); if (lineError) window.alert(lineError) }
    if (!backfillMode) {
      for (const q of picked) {
        const remaining = Math.round((n(q.balance_qty) - n(lineMeta[q.id]?.ship_qty)) * 1000) / 1000
        const closedBy = user?.username || user?.email || 'system'
        if (remaining === 0) await supabase.from('order_queues').update({ status:'closed', closure_type:'exact', remaining_qty:0, closed_by:closedBy, closed_at:new Date().toISOString() }).eq('id', q.id)
        else if (closeSelected[q.id] && window.confirm(`Close ${q.q_number || 'queue'} with remaining ${remaining.toLocaleString()} pcs?`)) await supabase.from('order_queues').update({ status:'closed', closure_type:'manual', remaining_qty:remaining, closed_by:closedBy, closed_at:new Date().toISOString() }).eq('id', q.id)
      }
    }
    setSaving(false); onDone()
  }

  return <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,.42)', zIndex:300, display:'flex', alignItems:'center', justifyContent:'center', padding:20 }}>
    <div style={{ ...card, width:'min(980px,94vw)', maxHeight:'84vh', display:'flex', flexDirection:'column' }}>
      <div style={{ padding:'16px 20px', borderBottom:'1px solid #eef2f7', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
        <div><div style={{ fontSize:17, fontWeight:900 }}>Create Shipment</div><div style={{ fontSize:12, color:'#6b7280', marginTop:3 }}>Step {step} of 3 · {step === 1 ? 'Select lines' : step === 2 ? 'Shipment details' : 'Quantities and values'}</div></div>
        <div style={{ display:'flex', alignItems:'center', gap:12 }}>{isAdmin && <label style={{ display:'flex', gap:6, alignItems:'center', fontSize:12, fontWeight:800, color:backfillMode?'#b45309':'#6b7280' }}><input type="checkbox" checked={backfillMode} onChange={e => { setBackfillMode(e.target.checked); setSelected({}); setLineMeta({}); setCloseSelected({}) }}/> Backfill Mode</label>}<button onClick={onClose} style={{ border:'none', background:'none', cursor:'pointer', color:'#9ca3af' }}><X size={17}/></button></div>
      </div>
      <div style={{ padding:16, minHeight:390, overflow:'auto' }}>
        {step === 1 && <>
          <div style={{ position:'relative', width:360, marginBottom:12 }}><Search size={13} style={{ position:'absolute', left:9, top:'50%', transform:'translateY(-50%)', color:'#9ca3af' }}/><input style={{ ...inp, paddingLeft:28 }} value={search} onChange={e=>setSearch(e.target.value)} placeholder={backfillMode?'Search buyer, style, PO...':'Search Q#, style, buyer, PO...'}/></div>
          {loading ? <div style={{ color:'#9ca3af', fontSize:12 }}>Loading...</div> : <div style={{ maxHeight:360, overflow:'auto', border:'1px solid #f1f5f9', borderRadius:10 }}><table style={{ width:'100%', borderCollapse:'collapse' }}><thead><tr style={{ background:'#fafafa' }}><th style={th}></th><th style={th}>{backfillMode?'Mode':'Q#'}</th><th style={th}>Buyer / Style</th><th style={{...th,textAlign:'right'}}>Balance</th><th style={th}>POL / POD</th></tr></thead><tbody>{rows.map(q => <tr key={q.id} style={{ background:selected[q.id]?'#f0f9ff':'' }}><td style={td}><input type="checkbox" checked={!!selected[q.id]} onChange={()=>toggleRow(q)}/></td><td style={{...td,fontWeight:900,fontFamily:'monospace'}}>{q.q_number}</td><td style={td}><div style={{ fontWeight:800 }}>{q.order?.buyer_name || '—'}</div><div style={{ color:'#6b7280', fontSize:11 }}>{q.order?.style_number || '—'} · {q.order?.po_number || q.order?.job_number || '—'}</div></td><td style={{...td,textAlign:'right',fontFamily:'monospace',fontWeight:800}}>{fmtNum(q.balance_qty)}</td><td style={td}><div>{getPOL(q.order)}</div><div style={{ color:'#6b7280', fontSize:11 }}>{getPOD(q.order)}</div></td></tr>)}{rows.length===0 && <tr><td colSpan={5} style={{ padding:20, textAlign:'center', color:'#9ca3af', fontSize:12 }}>No lines available.</td></tr>}</tbody></table></div>}
        </>}
        {step === 2 && <div style={{ display:'grid', gridTemplateColumns:'repeat(3, 1fr)', gap:14 }}>
          {[["Shipment No",'shipment_no'],["Shipment Date",'shipment_date'],["Container No",'container_no'],["Booking Ref",'booking_ref'],["Tracking Link",'tracking_link']].map(([label,key]) => <div key={key}><div style={{ fontSize:11, fontWeight:800, color:'#6b7280', marginBottom:5 }}>{label}</div><input style={inp} type={key==='shipment_date'?'date':'text'} value={header[key]} onChange={e=>setHeader(h=>({...h,[key]:e.target.value}))} placeholder={key==='tracking_link'?'https://...':''}/></div>)}
          <div style={{ gridColumn:'1 / -1' }}><div style={{ fontSize:11, fontWeight:800, color:'#6b7280', marginBottom:5 }}>Notes</div><textarea style={{ ...inp, height:76, padding:'9px 10px' }} value={header.notes} onChange={e=>setHeader(h=>({...h,notes:e.target.value}))}/></div>
        </div>}
        {step === 3 && <table style={{ width:'100%', borderCollapse:'collapse', minWidth:900 }}><thead><tr style={{ background:'#fafafa' }}><th style={th}>Line</th><th style={{...th,textAlign:'right'}}>Ship Qty</th><th style={{...th,textAlign:'right'}}>Cartons</th><th style={{...th,textAlign:'right'}}>CBM</th><th style={{...th,textAlign:'right'}}>Unit Price</th><th style={{...th,textAlign:'right'}}>Value</th><th style={{...th,textAlign:'right'}}>Transit Days</th><th style={th}>ETA</th>{!backfillMode && <th style={th}>Close</th>}</tr></thead><tbody>{picked.map(q => { const m=lineMeta[q.id]||defaultMeta(q); const rem=n(q.balance_qty)-n(m.ship_qty); return <tr key={q.id}><td style={td}><div style={{ fontWeight:900 }}>{q.q_number}</div><div style={{ fontSize:11, color:'#6b7280' }}>{q.order?.style_number} · {q.order?.buyer_name}</div></td><td style={td}><input style={{...inp,textAlign:'right'}} type="number" value={m.ship_qty} onChange={e=>updateMeta(q.id,{ship_qty:e.target.value})}/></td><td style={td}><input style={{...inp,textAlign:'right'}} type="number" value={m.cartons} onChange={e=>updateMeta(q.id,{cartons:e.target.value})}/></td><td style={td}><input style={{...inp,textAlign:'right'}} type="number" step="0.01" value={m.cbm} onChange={e=>updateMeta(q.id,{cbm:e.target.value})}/></td><td style={td}><input style={{...inp,textAlign:'right'}} type="number" step="0.01" value={m.unit_price} onChange={e=>updateMeta(q.id,{unit_price:e.target.value})}/></td><td style={td}><input style={{...inp,textAlign:'right'}} type="number" step="0.01" value={m.shipment_value} onChange={e=>updateMeta(q.id,{shipment_value:e.target.value,override_value:true})}/></td><td style={td}><input style={{...inp,textAlign:'right'}} type="number" value={m.transit_days} onChange={e=>updateMeta(q.id,{transit_days:e.target.value})}/></td><td style={td}>{fmtDate(m.eta)}</td>{!backfillMode && <td style={td}>{rem !== 0 ? <label style={{ fontSize:11, fontWeight:800 }}><input type="checkbox" checked={!!closeSelected[q.id]} onChange={e=>setCloseSelected(c=>({...c,[q.id]:e.target.checked}))}/> Manual close</label> : <span style={{ color:'#047857', fontWeight:800 }}>Exact</span>}</td>}</tr>})}</tbody></table>}
      </div>
      <div style={{ padding:'14px 18px', borderTop:'1px solid #eef2f7', display:'flex', alignItems:'center', justifyContent:'space-between', background:'#fff' }}>
        <div style={{ fontSize:12, color:'#6b7280' }}>{picked.length} selected · {fmtNum(totalQty)} pcs · {money(totalValue, picked[0]?.currency || 'USD')}</div>
        <div style={{ display:'flex', gap:8 }}><button style={btn} onClick={step === 1 ? onClose : () => setStep(s=>s-1)}>{step === 1 ? 'Cancel' : <><ChevronLeft size={14}/> Back</>}</button>{step < 3 ? <button style={primaryBtn} disabled={step === 1 && picked.length === 0} onClick={()=>setStep(s=>s+1)}>Next <ChevronRight size={14}/></button> : <button style={{ ...primaryBtn, opacity:valid && !saving ? 1 : .45 }} disabled={!valid || saving} onClick={handleSave}><Check size={14}/> Create Shipment</button>}</div>
      </div>
    </div>
  </div>
}

export default function Shipping() {
  const { user } = useAuth()
  const username = user?.username || user?.email || 'user'
  const pendingPrefs = useTablePrefs(`app2a.shipping.pending.${username}`, pendingColumnsDefault)
  const shippedPrefs = useTablePrefs(`app2a.shipping.shipped.${username}`, shippedColumnsDefault)
  const [activeTab, setActiveTab] = useState('pending')
  const [orders, setOrders] = useState([])
  const [shipments, setShipments] = useState([])
  const [lines, setLines] = useState([])
  const [queues, setQueues] = useState([])
  const [priceMap, setPriceMap] = useState({})
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [showCreate, setShowCreate] = useState(false)
  const [columnModal, setColumnModal] = useState(null)

  useEffect(() => { load() }, [])
  async function load() {
    setLoading(true)
    const [{data: ors}, {data: shs}, {data: lns}, {data: qs}, {data: sgs}] = await Promise.all([
      supabase.from('orders').select('*'), supabase.from('shipments').select('*').order('shipment_date', { ascending:false }), supabase.from('shipment_lines').select('*'), supabase.from('order_queues').select('*'), supabase.from('size_groups').select('id,order_id,unit_price,currency')
    ])
    const pMap = {}; (sgs || []).forEach(sg => { if (sg.order_id && pMap[sg.order_id] == null) pMap[sg.order_id] = { unit_price:n(sg.unit_price), currency:sg.currency || 'USD' } })
    setPriceMap(pMap); setOrders(ors || []); setShipments(shs || []); setLines(lns || []); setQueues(qs || []); setLoading(false)
  }
  const orderMap = useMemo(() => Object.fromEntries((orders || []).map(o => [o.id, o])), [orders])
  const shippedByOrder = useMemo(() => { const m={}; (lines || []).forEach(l => { if (l.order_id) m[l.order_id]=(m[l.order_id]||0)+n(l.shipped_qty) }); return m }, [lines])
  const pendingRowsRaw = useMemo(() => (orders || []).map(o => {
    const price=priceMap[o.id] || { unit_price:n(o.unit_price), currency:o.currency || 'USD' }
    const total=n(o.total_qty); const shipped=shippedByOrder[o.id]||0; const bal=Math.max(0,total-shipped)
    const qList=(queues||[]).filter(q => q.order_id === o.id)
    const activeQs=qList.filter(q => String(q.status||'').toLowerCase()==='active')
    const qNums=qList.map(q=>q.q_number).filter(Boolean).join(', ') || '—'
    const qQty=qList.reduce((sum,q)=>sum+n(q.qty),0)
    const g=orderGeneral(o)
    return { id:o.id, job:o.job_number || '—', status:'Open Balance', buyer:o.buyer_name || '—', style:o.style_number || '—', po:o.po_number || '—', qty:total, shipped, balance:bal, value:bal*n(price.unit_price), unit_price:n(price.unit_price), currency:price.currency || g.currency, pol:getPOL(o), pod:getPOD(o), date:o.ship_date || o.delivery_date || o.created_at, order:o, q_number:qNums, q_status:activeQs.length ? `${activeQs.length} active` : (qList.length ? 'inactive/closed' : 'No Q'), q_qty:qQty, ...g }
  }).filter(r=>r.balance>0), [orders, shippedByOrder, priceMap, queues])
  const shippedRowsRaw = useMemo(() => (shipments || []).map(s => { const rows=(lines||[]).filter(l=>l.shipment_id===s.id); const first=rows[0]||{}; const o=orderMap[first.order_id] || {}; const qty=rows.reduce((a,b)=>a+n(b.shipped_qty),0); const cartons=rows.reduce((a,b)=>a+n(b.total_cartons),0); const cbm=rows.reduce((a,b)=>a+n(b.cbm),0); const value=rows.reduce((a,b)=>a+n(b.shipment_value),0); const eta=first.eta_destination_port || s.eta || ''; const g=orderGeneral(o); const qList=rows.map(l => (queues||[]).find(q=>q.id===l.queue_id)).filter(Boolean); return { id:s.id, shipment:s.shipment_no, date:s.shipment_date, shipment_date:s.shipment_date, buyer:o.buyer_name || '—', style:o.style_number || '—', po:o.po_number || o.job_number || '—', job:o.job_number || '—', qty, cartons, cbm, value, unit_price:first.unit_price || (qty ? value/qty : 0), currency:first.currency || o.currency || 'USD', pol:first.port_of_loading || getPOL(o), pod:first.port_of_destination || getPOD(o), eta, tracking:s.tracking_link, source:s.source === 'backfill' ? 'Backfill' : 'Queue', status:s.status || 'Open', container:s.container_no, booking:s.booking_ref, q_number:qList.map(q=>q.q_number).filter(Boolean).join(', ') || (s.source === 'backfill' ? 'Backfill' : '—'), q_status:qList.map(q=>q.status).filter(Boolean).join(', ') || '—', q_qty:qList.reduce((ss,q)=>ss+n(q.qty),0), ...g } }), [shipments, lines, orderMap, queues])

  function processRows(raw, prefs) {
    let rows = raw.filter(r => `${Object.values(r).join(' ')}`.toLowerCase().includes(search.toLowerCase()))
    if (prefs.filterBuyer !== 'all') rows = rows.filter(r => r.buyer === prefs.filterBuyer)
    if (prefs.filterStatus !== 'all') rows = rows.filter(r => r.status === prefs.filterStatus)
    const [key, dir] = String(prefs.sortBy || '').split('_')
    rows = [...rows].sort((a,b) => { const va=a[key] ?? '', vb=b[key] ?? ''; if (typeof va === 'number' || typeof vb === 'number') return dir==='desc' ? n(vb)-n(va) : n(va)-n(vb); return dir==='desc' ? String(vb).localeCompare(String(va)) : String(va).localeCompare(String(vb)) })
    return rows
  }
  const prefs = activeTab === 'pending' ? pendingPrefs : shippedPrefs
  const rawRows = activeTab === 'pending' ? pendingRowsRaw : shippedRowsRaw
  const processedRows = useMemo(() => processRows(rawRows, prefs), [rawRows, search, prefs.filterBuyer, prefs.filterStatus, prefs.sortBy])
  const displayRows = useMemo(() => groupRows(processedRows, prefs.groupBy), [processedRows, prefs.groupBy])
  const buyers = [...new Set(rawRows.map(r => r.buyer).filter(Boolean))]
  const statuses = [...new Set(rawRows.map(r => r.status).filter(Boolean))]

  const kpis = activeTab === 'pending' ? [
    ['Open Orders', pendingRowsRaw.length], ['Open Balance Qty', fmtNum(pendingRowsRaw.reduce((s,r)=>s+r.balance,0))], ['Ready Queue Qty', fmtNum((queues||[]).filter(q=>String(q.status).toLowerCase()==='active').reduce((s,q)=>s+n(q.qty),0))], ['Pending Value', money(pendingRowsRaw.reduce((s,r)=>s+r.value,0), 'USD')]
  ] : [
    ['Shipments', shippedRowsRaw.length], ['Shipped Qty', fmtNum(shippedRowsRaw.reduce((s,r)=>s+r.qty,0))], ['Shipment Value', money(shippedRowsRaw.reduce((s,r)=>s+r.value,0),'USD')], ['In Transit / Delayed', shippedRowsRaw.filter(r => { const d=daysLeft(r.eta); return d != null && d >= 0 }).length]
  ]

  function getCell(row, col) {
    if (activeTab === 'pending') {
      if (col.key==='job_status') return `${row.job} | ${row.status}`
      if (col.key==='buyer') return row.buyer
      if (col.key==='q_data') return `${row.q_number} | ${row.q_status} | ${fmtNum(row.q_qty)} pcs`
      if (col.key==='style_po') return `${row.style} | ${row.po}`
      if (col.key==='qty') return `Qty ${fmtNum(row.qty)} / Ship ${fmtNum(row.shipped)} / Bal ${fmtNum(row.balance)}`
      if (col.key==='queue_qty') return fmtNum(row.q_qty)
      if (col.key==='unit_price') return money(row.unit_price, row.currency)
      if (col.key==='value') return money(row.value, row.currency)
      if (col.key==='currency') return row.currency
      if (['factory_ref','merchandiser','split_rule'].includes(col.key)) return row[col.key] || '—'
      if (['ship_date','delivery_date'].includes(col.key)) return fmtDate(row[col.key])
      if (col.key==='ports') return `${row.pol} → ${row.pod}`
      return ''
    }
    if (col.key==='shipment') return `${row.shipment} | ${row.container || 'No container'} | ${row.booking || 'No booking'}`
    if (col.key==='date') return fmtDate(row.date)
    if (col.key==='buyer_style') return `${row.buyer} | ${row.style} | ${row.po}`
    if (col.key==='q_data') return `${row.q_number} | ${row.q_status} | ${fmtNum(row.q_qty)} pcs`
    if (col.key==='job') return row.job
    if (col.key==='qty') return fmtNum(row.qty)
    if (col.key==='cartons') return row.cartons ? fmtNum(row.cartons) : '—'
    if (col.key==='cbm') return row.cbm ? fmtNum(row.cbm) : '—'
    if (col.key==='unit_price') return money(row.unit_price, row.currency)
    if (col.key==='value') return money(row.value, row.currency)
    if (col.key==='currency') return row.currency
    if (['factory_ref','merchandiser','split_rule'].includes(col.key)) return row[col.key] || '—'
    if (['ship_date','delivery_date'].includes(col.key)) return fmtDate(row[col.key])
    if (col.key==='ports') return `${row.pol} → ${row.pod}`
    if (col.key==='eta') return `${fmtDate(row.eta)} | ${daysBadge(daysLeft(row.eta)).text}`
    if (col.key==='source') return row.source
    return ''
  }
  function exportCurrent() {
    const cols = prefs.columns.filter(c => c.visible && !c.noExport)
    const csv = [cols.map(c=>safeCsv(c.label)).join(','), ...processedRows.map(r => cols.map(c => safeCsv(getCell(r,c))).join(','))].join('\n')
    const blob = new Blob([csv], { type:'text/csv;charset=utf-8;' }); const url = URL.createObjectURL(blob); const a=document.createElement('a'); a.href=url; a.download=`shipping-${activeTab}-${new Date().toISOString().slice(0,10)}.csv`; a.click(); URL.revokeObjectURL(url)
  }
  function printCurrent() {
    const cols = prefs.columns.filter(c => c.visible && !c.noExport)
    const html = `<html><head><title>Shipping ${activeTab}</title><style>body{font-family:Arial;padding:24px}table{width:100%;border-collapse:collapse}th,td{border:1px solid #ddd;padding:8px;font-size:12px;text-align:left}th{background:#f5f5f5;text-transform:uppercase;font-size:10px}</style></head><body><h2>Booking & Shipping - ${activeTab === 'pending' ? 'Pending Shipments' : 'Shipped Orders'}</h2><table><thead><tr>${cols.map(c=>`<th>${c.label}</th>`).join('')}</tr></thead><tbody>${processedRows.map(r=>`<tr>${cols.map(c=>`<td>${getCell(r,c)}</td>`).join('')}</tr>`).join('')}</tbody></table></body></html>`
    const w = window.open('', '_blank'); w.document.write(html); w.document.close(); w.print()
  }

  return <div className="page-content" style={{ display:'flex', flexDirection:'column', gap:14, padding:'0 24px 16px', overflowY:'auto', height:'100%' }}>
    <div style={{ display:'flex', gap:28, borderBottom:'1px solid #e5e7eb', margin:'0 -24px', padding:'0 24px' }}>
      <button onClick={()=>{setActiveTab('pending'); setSearch('')}} style={{ padding:'16px 4px 13px', border:'none', borderBottom:activeTab==='pending'?'2px solid #050505':'2px solid transparent', background:'none', fontWeight:activeTab==='pending'?800:600, color:activeTab==='pending'?'#050505':'#9ca3af', cursor:'pointer' }}>Pending Shipments</button>
      <button onClick={()=>{setActiveTab('shipped'); setSearch('')}} style={{ padding:'16px 4px 13px', border:'none', borderBottom:activeTab==='shipped'?'2px solid #050505':'2px solid transparent', background:'none', fontWeight:activeTab==='shipped'?800:600, color:activeTab==='shipped'?'#050505':'#9ca3af', cursor:'pointer' }}>Shipped Orders</button>
    </div>
    <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', gap:12 }}>
      <div><div style={{ fontSize:22, fontWeight:900, color:'#111827' }}>{activeTab === 'pending' ? 'Pending Shipments' : 'Shipped Orders'}</div><div style={{ fontSize:13, color:'#6b7280', marginTop:2 }}>{activeTab === 'pending' ? 'Create shipments from available balances or backfill historical data.' : 'Review shipped orders with logistics, value, ETA and tracking.'}</div></div>
      <button style={primaryBtn} onClick={()=>setShowCreate(true)}><Plus size={14}/> New Shipment</button>
    </div>
    <div style={{ display:'grid', gridTemplateColumns:'repeat(4, 1fr)', gap:12 }}>{kpis.map(([label,value]) => <KpiCard key={label} label={label} value={value}/>)}</div>
    <div style={card}>
      <TableControls search={search} setSearch={setSearch} prefs={prefs} buyers={buyers} statuses={statuses} placeholder={activeTab === 'pending' ? 'Search buyer, style, PO, port...' : 'Search shipment, buyer, style, tracking...'} onColumns={()=>setColumnModal(activeTab)} onExport={exportCurrent} onPrint={printCurrent}/>
      <div style={{ overflowX:'auto', width:'100%' }}><table style={{ width:'100%', borderCollapse:'collapse', minWidth:activeTab==='pending'?1520:1680 }}><thead><tr style={{ background:'#fafafa' }}>{prefs.columns.filter(c=>c.visible).map(c => <th key={c.key} style={c.key==='action'?{...th,textAlign:'center'}:th}>{c.label}</th>)}</tr></thead><tbody>{displayRows.map((x,i) => x.type==='group' ? <tr key={`g-${x.key}`} style={{ background:'#fff7df' }}><td colSpan={prefs.columns.filter(c=>c.visible).length} style={{ padding:'10px 12px', fontSize:13, fontWeight:900 }}>{x.key} — {x.count} rows <span style={{ float:'right', color:'#6b7280' }}>Qty: {fmtNum(x.qty)} {x.value ? `  Value: ${money(x.value,'USD')}` : ''}</span></td></tr> : <DataRow key={x.row.id || i} row={x.row} columns={prefs.columns.filter(c=>c.visible)} activeTab={activeTab} getCell={getCell} onShipment={()=>setShowCreate(true)}/>)}</tbody></table></div>
      {!loading && processedRows.length === 0 && <div style={{ padding:24, textAlign:'center', color:'#9ca3af', fontSize:12 }}>No records found.</div>}
      {loading && <div style={{ padding:24, textAlign:'center', color:'#9ca3af', fontSize:12 }}>Loading...</div>}
    </div>
    {columnModal && <ColumnModal columns={prefs.columns} setColumns={prefs.setColumns} onClose={()=>setColumnModal(null)}/>} 
    {showCreate && <CreateShipmentModal existingShipments={shipments} allOrders={orders} user={user} onClose={()=>setShowCreate(false)} onDone={()=>{setShowCreate(false); load()}}/>}
  </div>
}

function DataRow({ row, columns, activeTab, getCell, onShipment }) {
  return <tr>
    {columns.map(c => {
      if (activeTab === 'pending' && c.key === 'job_status') return <td key={c.key} style={td}><div style={{ fontWeight:900, fontFamily:'monospace' }}>{row.job}</div><span style={{ marginTop:6, display:'inline-flex', fontSize:10, fontWeight:900, borderRadius:999, padding:'4px 8px', background:'#ecfdf5', color:'#047857' }}>{row.status}</span></td>
      if (c.key === 'q_data') return <td key={c.key} style={td}><div style={{ fontWeight:900, fontFamily:'monospace' }}>{row.q_number}</div><div style={{ fontSize:11, color:'#6b7280' }}>{row.q_status} · {fmtNum(row.q_qty)} pcs</div></td>
      if (activeTab === 'pending' && c.key === 'style_po') return <td key={c.key} style={td}><div style={{ fontWeight:900 }}>{row.style}</div><div style={{ fontSize:11, color:'#6b7280' }}>{row.po}</div></td>
      if (activeTab === 'pending' && c.key === 'qty') return <td key={c.key} style={{...td,textAlign:'right',fontFamily:'monospace'}}><div style={{ fontWeight:900 }}>{fmtNum(row.qty)}</div><div style={{ color:'#2563eb' }}>Ship {fmtNum(row.shipped)}</div><div>Bal {fmtNum(row.balance)}</div></td>
      if (activeTab === 'pending' && c.key === 'action') return <td key={c.key} style={{...td,textAlign:'center'}}><button style={btn} onClick={onShipment}><Plus size={13}/> Shipment</button></td>
      if (activeTab === 'shipped' && c.key === 'shipment') return <td key={c.key} style={td}><div style={{ fontWeight:900, fontFamily:'monospace' }}>{row.shipment}</div><div style={{ fontSize:11, color:'#6b7280' }}>{row.container || 'No container'} · {row.booking || 'No booking'}</div></td>
      if (activeTab === 'shipped' && c.key === 'buyer_style') return <td key={c.key} style={td}><div style={{ fontWeight:800 }}>{row.buyer}</div><div style={{ fontSize:11, color:'#6b7280' }}>{row.style} · {row.po}</div></td>
      if (activeTab === 'shipped' && c.key === 'eta') { const b=daysBadge(daysLeft(row.eta)); return <td key={c.key} style={td}><div style={{ fontWeight:800 }}>{fmtDate(row.eta)}</div><span style={{ display:'inline-block', marginTop:4, fontSize:10, fontWeight:900, borderRadius:999, padding:'3px 7px', background:b.bg, color:b.color }}>{b.text}</span></td> }
      if (activeTab === 'shipped' && c.key === 'tracking') return <td key={c.key} style={td}>{row.tracking ? <button title="Open tracking link" onClick={()=>window.open(row.tracking,'_blank','noopener,noreferrer')} style={{ width:30, height:30, display:'inline-flex', alignItems:'center', justifyContent:'center', border:'1px solid #e5e7eb', borderRadius:8, background:'#fff', color:'#6b7280', cursor:'pointer' }}><LinkIcon size={15}/></button> : <span style={{ color:'#d1d5db' }}>—</span>}</td>
      if (c.key === 'buyer') return <td key={c.key} style={td}><div style={{ fontWeight:800 }}>{row.buyer}</div></td>
      if (['factory_ref','merchandiser','split_rule','job','currency'].includes(c.key)) return <td key={c.key} style={td}>{getCell(row,c)}</td>
      if (['ship_date','delivery_date'].includes(c.key)) return <td key={c.key} style={td}>{getCell(row,c)}</td>
      if (c.key === 'unit_price') return <td key={c.key} style={{...td,textAlign:'right',fontFamily:'monospace',fontWeight:800}}>{getCell(row,c)}</td>
      if (c.key === 'queue_qty') return <td key={c.key} style={{...td,textAlign:'right',fontFamily:'monospace',fontWeight:800}}>{getCell(row,c)}</td>
      if (c.key === 'value') return <td key={c.key} style={{...td,textAlign:'right',fontFamily:'monospace',fontWeight:900}}>{money(row.value,row.currency)}</td>
      if (c.key === 'ports') return <td key={c.key} style={td}><div>{row.pol}</div><div style={{ fontSize:11, color:'#6b7280' }}>{row.pod}</div></td>
      if (['qty','cartons','cbm'].includes(c.key)) return <td key={c.key} style={{...td,textAlign:'right',fontFamily:'monospace',fontWeight:c.key==='qty'?900:600}}>{getCell(row,c)}</td>
      if (c.key === 'source') return <td key={c.key} style={td}><span style={{ fontSize:10, fontWeight:900, borderRadius:999, padding:'4px 8px', background:row.source==='Backfill'?'#fffbeb':'#eff6ff', color:row.source==='Backfill'?'#92400e':'#1d4ed8' }}>{row.source}</span></td>
      return <td key={c.key} style={td}>{getCell(row,c)}</td>
    })}
  </tr>
}
