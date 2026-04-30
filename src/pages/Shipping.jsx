import React, { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import { Plus, X, Search, Settings, Download, Printer, Filter, Link as LinkIcon } from 'lucide-react'
import { useAuth } from '../lib/authContext'

const card = { background:'#fff', border:'1px solid #e8e8e6', borderRadius:10, overflow:'hidden' }
const inp = { width:'100%', height:32, padding:'0 10px', border:'1px solid #e5e7eb', borderRadius:7, fontSize:12, outline:'none', boxSizing:'border-box', fontFamily:'var(--font)' }
const th = { textAlign:'left', padding:'9px 12px', fontSize:10, color:'#9ca3af', textTransform:'uppercase', letterSpacing:'.04em', whiteSpace:'nowrap' }
const td = { padding:'10px 12px', borderBottom:'1px solid #f5f5f3', fontSize:12, verticalAlign:'top' }

function fmtDate(d) {
  if (!d) return '—'
  try { return new Date(d).toLocaleDateString('en-GB', { day:'2-digit', month:'short', year:'numeric' }) } catch { return d }
}
function num(v) { return Number.isFinite(parseFloat(v)) ? parseFloat(v) : 0 }
function money(v, currency='USD') {
  const n = num(v)
  if (!n) return '—'
  return `${currency || 'USD'} ${n.toLocaleString(undefined, { maximumFractionDigits:2 })}`
}
function getOrderPortLoading(o={}) { return o.port_of_loading || o.port_loading || o.pol || '—' }
function getOrderPortDestination(o={}) { return o.port_of_destination || o.port_of_discharge || o.port_destination || o.pod || '—' }
function addDays(date, days) {
  if (!date || !days) return ''
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

function CreateShipmentModal({ existingShipments, allOrders = [], onClose, onDone, user }) {
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
  const [header, setHeader] = useState({
    shipment_no: '',
    shipment_date: new Date().toISOString().slice(0,10),
    container_no: '',
    booking_ref: '',
    notes: '',
    tracking_link: '',
  })

  useEffect(() => {
    const nums = (existingShipments || []).map(s => parseInt(String(s.shipment_no || '').replace(/\D/g,''))).filter(n => Number.isFinite(n))
    const next = Math.max(0, ...nums) + 1
    setHeader(h => ({ ...h, shipment_no: `SHP-${String(next).padStart(4,'0')}` }))
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
    const shippedByQ = {}
    ;(lines || []).forEach(l => { if (l.queue_id) shippedByQ[l.queue_id] = (shippedByQ[l.queue_id] || 0) + num(l.shipped_qty) })
    const orderMap = Object.fromEntries((ors || []).map(o => [o.id, o]))
    const pMap = {}
    ;(sgs || []).forEach(sg => {
      if (sg.id) pMap[`sg:${sg.id}`] = { unit_price:num(sg.unit_price), currency:sg.currency || 'USD' }
      if (sg.order_id && pMap[`order:${sg.order_id}`] == null && sg.unit_price != null) pMap[`order:${sg.order_id}`] = { unit_price:num(sg.unit_price), currency:sg.currency || 'USD' }
    })
    setPriceMap(pMap)
    setOrders(ors || [])
    const ready = (qs || [])
      .filter(q => String(q.q_number || '').trim() && String(q.status || '').toLowerCase() !== 'closed')
      .map(q => {
        const total = num(q.qty)
        const shipped = shippedByQ[q.id] || 0
        const balance = Math.max(0, total - shipped)
        const ord = orderMap[q.order_id] || {}
        const price = pMap[`sg:${q.size_group_id}`] || pMap[`order:${q.order_id}`] || { unit_price:num(ord.unit_price), currency:ord.currency || 'USD' }
        return { ...q, order: ord, shipped_qty: shipped, balance_qty: balance, isBackfill:false, unit_price:price.unit_price, currency:price.currency }
      })
      .filter(q => q.balance_qty > 0)
    setQueues(ready)
    setLoading(false)
  }

  const queueRows = useMemo(() => queues.filter(q => {
    const hay = `${q.q_number} ${q.label || ''} ${q.order?.style_number || ''} ${q.order?.buyer_name || ''} ${q.order?.po_number || ''} ${q.order?.job_number || ''}`.toLowerCase()
    return hay.includes(search.toLowerCase())
  }), [queues, search])

  const backfillRows = useMemo(() => (orders || []).filter(o => {
    const hay = `${o.buyer_name || ''} ${o.style_number || ''} ${o.po_number || ''} ${o.job_number || ''}`.toLowerCase()
    return hay.includes(search.toLowerCase())
  }).map(o => {
    const price = priceMap[`order:${o.id}`] || { unit_price:num(o.unit_price), currency:o.currency || 'USD' }
    return {
      id: `order-${o.id}`,
      order_id: o.id,
      q_number: 'Backfill',
      label: o.po_number || o.style_number || 'Historical shipment',
      qty: num(o.total_qty),
      shipped_qty: 0,
      balance_qty: num(o.total_qty),
      order: o,
      isBackfill: true,
      unit_price: price.unit_price,
      currency: price.currency,
    }
  }), [orders, search, priceMap])

  const tableRows = backfillMode ? backfillRows : queueRows

  function defaultMeta(q) {
    const unit = num(q.unit_price)
    const shipQty = num(q.balance_qty || q.qty)
    const eta = addDays(header.shipment_date, 0)
    return { ship_qty: String(shipQty || ''), cartons:'', cbm:'', unit_price:String(unit || ''), override_value:false, shipment_value: String(unit && shipQty ? unit * shipQty : ''), transit_days:'', eta, override_ports:false, port_loading:getOrderPortLoading(q.order), port_destination:getOrderPortDestination(q.order) }
  }
  function toggleQueue(q) {
    setSelected(prev => {
      const next = { ...prev }
      if (next[q.id]) {
        delete next[q.id]
        setCloseSelected(c => { const copy = { ...c }; delete copy[q.id]; return copy })
        setLineMeta(m => { const copy = { ...m }; delete copy[q.id]; return copy })
      } else {
        next[q.id] = true
        setLineMeta(m => ({ ...m, [q.id]: defaultMeta(q) }))
      }
      return next
    })
  }
  function updateMeta(id, patch) {
    setLineMeta(prev => {
      const old = prev[id] || {}
      let next = { ...old, ...patch }
      if ('ship_qty' in patch || 'unit_price' in patch || 'override_value' in patch) {
        if (!next.override_value) next.shipment_value = String(num(next.ship_qty) * num(next.unit_price) || '')
      }
      if ('transit_days' in patch || 'shipment_date' in patch) {
        next.eta = addDays(header.shipment_date, num(next.transit_days))
      }
      return { ...prev, [id]: next }
    })
  }
  useEffect(() => {
    setLineMeta(prev => {
      const copy = { ...prev }
      Object.keys(copy).forEach(id => { copy[id] = { ...copy[id], eta:addDays(header.shipment_date, num(copy[id].transit_days)) } })
      return copy
    })
  }, [header.shipment_date])

  const pickedRows = tableRows.filter(q => selected[q.id])
  const totalQty = pickedRows.reduce((s, q) => s + num(lineMeta[q.id]?.ship_qty), 0)
  const totalValue = pickedRows.reduce((s, q) => s + num(lineMeta[q.id]?.shipment_value), 0)
  const valid = header.shipment_no && header.shipment_date && totalQty > 0

  async function insertShipmentLines(rows) {
    const richRows = rows.map(r => ({
      shipment_id: r.shipment_id,
      order_id: r.order_id,
      queue_id: r.queue_id,
      shipped_qty: r.shipped_qty,
      total_cartons: r.total_cartons,
      cbm: r.cbm,
      unit_price: r.unit_price,
      currency: r.currency,
      shipment_value: r.shipment_value,
      port_of_loading: r.port_of_loading,
      port_of_destination: r.port_of_destination,
      transit_days: r.transit_days,
      eta_destination_port: r.eta_destination_port,
    }))
    const { error } = await supabase.from('shipment_lines').insert(richRows)
    if (!error) return null
    const fallbackRows = rows.map(r => ({ shipment_id:r.shipment_id, order_id:r.order_id, queue_id:r.queue_id, shipped_qty:r.shipped_qty }))
    const { error: fallbackError } = await supabase.from('shipment_lines').insert(fallbackRows)
    if (!fallbackError) return 'Shipment saved, but logistics/commercial line fields were skipped because DB migration is missing.'
    return fallbackError.message || error.message || 'Could not save shipment lines'
  }

  async function handleSave() {
    if (!valid) return
    setSaving(true)
    const shipmentPayload = {
      shipment_no: header.shipment_no,
      shipment_date: header.shipment_date,
      container_no: header.container_no || null,
      booking_ref: header.booking_ref || null,
      tracking_link: header.tracking_link || null,
      notes: header.notes || null,
      status: 'Open',
      source: backfillMode ? 'backfill' : 'queue',
    }
    let { data: sh, error } = await supabase.from('shipments').insert([shipmentPayload]).select().single()
    if (error && String(error.message || '').toLowerCase().includes('tracking_link')) {
      const { tracking_link, ...fallbackPayload } = shipmentPayload
      const retry = await supabase.from('shipments').insert([fallbackPayload]).select().single()
      sh = retry.data
      error = retry.error
      if (!error) window.alert('Shipment saved, but tracking link was skipped because DB migration is missing.')
    }
    if (error || !sh) { window.alert(error?.message || 'Could not create shipment'); setSaving(false); return }

    const rows = pickedRows.map(q => {
      const m = lineMeta[q.id] || {}
      return {
        shipment_id: sh.id,
        order_id: q.order_id,
        queue_id: backfillMode ? null : q.id,
        shipped_qty: Math.max(0, num(m.ship_qty)),
        total_cartons: num(m.cartons) || null,
        cbm: num(m.cbm) || null,
        unit_price: num(m.unit_price) || null,
        currency: q.currency || q.order?.currency || 'USD',
        shipment_value: num(m.shipment_value) || null,
        port_of_loading: m.port_loading || null,
        port_of_destination: m.port_destination || null,
        transit_days: num(m.transit_days) || null,
        eta_destination_port: m.eta || null,
      }
    }).filter(r => r.shipped_qty > 0)

    if (rows.length) {
      const lineError = await insertShipmentLines(rows)
      if (lineError) window.alert(lineError)
    }

    if (!backfillMode) {
      for (const q of pickedRows) {
        const shippedNow = Math.max(0, num(lineMeta[q.id]?.ship_qty))
        const remaining = Math.round((num(q.balance_qty) - shippedNow) * 1000) / 1000
        const closedBy = user?.username || user?.email || 'system'
        if (remaining === 0) {
          await supabase.from('order_queues').update({ status:'closed', closure_type:'exact', remaining_qty:0, closed_by:closedBy, closed_at:new Date().toISOString() }).eq('id', q.id)
        } else if (closeSelected[q.id]) {
          const ok = window.confirm(`Close ${q.q_number || 'queue'} with remaining ${remaining.toLocaleString()} pcs?`)
          if (ok) await supabase.from('order_queues').update({ status:'closed', closure_type:'manual', remaining_qty:remaining, closed_by:closedBy, closed_at:new Date().toISOString() }).eq('id', q.id)
        }
      }
    }
    setSaving(false)
    onDone()
  }

  return (
    <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.4)', zIndex:300, display:'flex', alignItems:'center', justifyContent:'center', padding:20 }}>
      <div style={{ ...card, width:'min(1320px, 97vw)', height:'min(860px, 92vh)', maxHeight:'92vh', display:'flex', flexDirection:'column' }}>
        <div style={{ padding:'16px 20px', borderBottom:'1px solid #eef2f7', display:'flex', alignItems:'center', justifyContent:'space-between' }}>
          <div>
            <div style={{ fontSize:16, fontWeight:800 }}>Create Shipment</div>
            <div style={{ fontSize:12, color:'#6b7280', marginTop:3 }}>{backfillMode ? 'Backfill Mode: ship historical data without queue activation or Q# impact.' : 'Select activated Qs and enter logistics + commercial shipment details.'}</div>
          </div>
          <div style={{ display:'flex', alignItems:'center', gap:12 }}>
            {isAdmin && <label style={{ display:'flex', alignItems:'center', gap:6, fontSize:12, fontWeight:800, color:backfillMode ? '#b45309' : '#6b7280' }} title="Admin only: ship historical data without queue/Q# impact"><input type="checkbox" checked={backfillMode} onChange={e => { setBackfillMode(e.target.checked); setSelected({}); setLineMeta({}); setCloseSelected({}); }} /> Backfill Mode</label>}
            {backfillMode && <span style={{ fontSize:10, fontWeight:900, color:'#92400e', background:'#fffbeb', border:'1px solid #fde68a', borderRadius:999, padding:'4px 8px' }}>BACKFILL MODE</span>}
            <button onClick={onClose} style={{ background:'none', border:'none', cursor:'pointer', color:'#9ca3af' }}><X size={16} /></button>
          </div>
        </div>
        <div style={{ display:'grid', gridTemplateColumns:'300px 1fr', flex:1, minHeight:0, overflow:'hidden' }}>
          <div style={{ padding:18, borderRight:'1px solid #eef2f7', overflow:'auto' }}>
            <div style={{ display:'grid', gap:10 }}>
              <div><div style={{ fontSize:11, fontWeight:700, color:'#6b7280', marginBottom:4 }}>Shipment No</div><input style={inp} value={header.shipment_no} onChange={e => setHeader(h => ({ ...h, shipment_no:e.target.value }))} /></div>
              <div><div style={{ fontSize:11, fontWeight:700, color:'#6b7280', marginBottom:4 }}>Shipment Date</div><input style={inp} type="date" value={header.shipment_date} onChange={e => setHeader(h => ({ ...h, shipment_date:e.target.value }))} /></div>
              <div><div style={{ fontSize:11, fontWeight:700, color:'#6b7280', marginBottom:4 }}>Container No</div><input style={inp} value={header.container_no} onChange={e => setHeader(h => ({ ...h, container_no:e.target.value }))} /></div>
              <div><div style={{ fontSize:11, fontWeight:700, color:'#6b7280', marginBottom:4 }}>Booking Ref</div><input style={inp} value={header.booking_ref} onChange={e => setHeader(h => ({ ...h, booking_ref:e.target.value }))} /></div>
              <div><div style={{ fontSize:11, fontWeight:700, color:"#6b7280", marginBottom:4 }}>Tracking Link <span style={{ color:"#9ca3af", fontWeight:500 }}>(optional)</span></div><input style={inp} value={header.tracking_link} onChange={e => setHeader(h => ({ ...h, tracking_link:e.target.value }))} placeholder="https://..." /></div>
              <div><div style={{ fontSize:11, fontWeight:700, color:'#6b7280', marginBottom:4 }}>Notes</div><textarea style={{ ...inp, height:82, padding:'8px 10px' }} value={header.notes} onChange={e => setHeader(h => ({ ...h, notes:e.target.value }))} /></div>
            </div>
            <div style={{ marginTop:16, padding:12, background:'#fafaf8', border:'1px solid #ececec', borderRadius:8 }}>
              <div style={{ fontSize:11, color:'#6b7280', marginBottom:6, textTransform:'uppercase', fontWeight:700 }}>Selected Summary</div>
              <div style={{ display:'grid', gap:4 }}>
                <div style={{ fontSize:14, fontWeight:800 }}>{totalQty.toLocaleString()} pcs</div>
                <div style={{ fontSize:12, fontWeight:800 }}>{money(totalValue, pickedRows[0]?.currency || 'USD')}</div>
                <div style={{ fontSize:11, color:'#9ca3af' }}>{Object.keys(selected).length} {backfillMode ? 'orders' : 'Qs'} selected</div>
              </div>
            </div>
          </div>
          <div style={{ padding:18, overflow:'auto' }}>
            <div style={{ position:'relative', width:320, marginBottom:12 }}>
              <Search size={13} style={{ position:'absolute', left:9, top:'50%', transform:'translateY(-50%)', color:'#9ca3af' }} />
              <input style={{ ...inp, paddingLeft:28 }} value={search} onChange={e => setSearch(e.target.value)} placeholder={backfillMode ? 'Search buyer, style, PO...' : 'Search Q#, style, buyer, PO...'} />
            </div>
            {loading ? <div style={{ fontSize:12, color:'#9ca3af' }}>Loading available Qs...</div> : tableRows.length === 0 ? <div style={{ fontSize:12, color:'#9ca3af' }}>{backfillMode ? 'No orders found for backfill.' : 'No activated queues with balance available.'}</div> : (
              <table style={{ width:'100%', borderCollapse:'collapse', minWidth:1180 }}>
                <thead><tr style={{ background:'#fafafa' }}>
                  <th style={th}></th><th style={th}>{backfillMode ? 'Mode' : 'Q#'}</th><th style={th}>Order</th><th style={{...th, textAlign:'right'}}>Balance</th><th style={{...th, textAlign:'right'}}>Ship Qty</th><th style={{...th, textAlign:'right'}}>Cartons</th><th style={{...th, textAlign:'right'}}>CBM</th><th style={{...th, textAlign:'right'}}>Unit Price</th><th style={{...th, textAlign:'right'}}>Value</th><th style={th}>POL / POD</th><th style={{...th, textAlign:'right'}}>Transit</th><th style={th}>ETA</th>{!backfillMode && <th style={{...th, textAlign:'center'}}>Close</th>}
                </tr></thead>
                <tbody>
                  {tableRows.map(q => {
                    const isOn = !!selected[q.id]
                    const m = lineMeta[q.id] || defaultMeta(q)
                    const remaining = num(q.balance_qty) - num(m.ship_qty)
                    return <tr key={q.id} style={{ background:isOn ? '#f0f9ff' : '' }}>
                      <td style={td}><input type="checkbox" checked={isOn} onChange={() => toggleQueue(q)} /></td>
                      <td style={{...td, fontFamily:'monospace', fontWeight:800}}>{q.q_number || 'Queued'}</td>
                      <td style={td}><div style={{ fontWeight:700 }}>{q.order?.style_number || '—'}</div><div style={{ fontSize:11, color:'#6b7280' }}>{q.order?.buyer_name || '—'} · {q.order?.po_number || q.order?.job_number || '—'}</div></td>
                      <td style={{...td, textAlign:'right', fontFamily:'monospace', fontWeight:700}}>{num(q.balance_qty).toLocaleString()}</td>
                      <td style={{...td, textAlign:'right'}}><input style={{ ...inp, textAlign:'right', width:86, opacity:isOn?1:0.55 }} type="number" min="0" disabled={!isOn} value={isOn ? m.ship_qty : ''} onChange={e => updateMeta(q.id, { ship_qty:e.target.value })} /></td>
                      <td style={{...td, textAlign:'right'}}><input style={{ ...inp, textAlign:'right', width:74, opacity:isOn?1:0.55 }} type="number" min="0" disabled={!isOn} value={isOn ? m.cartons : ''} onChange={e => updateMeta(q.id, { cartons:e.target.value })} /></td>
                      <td style={{...td, textAlign:'right'}}><input style={{ ...inp, textAlign:'right', width:74, opacity:isOn?1:0.55 }} type="number" min="0" step="0.01" disabled={!isOn} value={isOn ? m.cbm : ''} onChange={e => updateMeta(q.id, { cbm:e.target.value })} /></td>
                      <td style={{...td, textAlign:'right'}}><input style={{ ...inp, textAlign:'right', width:80, opacity:isOn?1:0.55 }} type="number" min="0" step="0.01" disabled={!isOn} value={isOn ? m.unit_price : ''} onChange={e => updateMeta(q.id, { unit_price:e.target.value })} title="Pulled from order matrix. Override if needed." /></td>
                      <td style={{...td, textAlign:'right'}}><input style={{ ...inp, textAlign:'right', width:94, opacity:isOn?1:0.55 }} type="number" min="0" step="0.01" disabled={!isOn} value={isOn ? m.shipment_value : ''} onChange={e => updateMeta(q.id, { shipment_value:e.target.value, override_value:true })} title="Auto = Ship Qty × Unit Price. Edit to override." /></td>
                      <td style={td}><div style={{ display:'grid', gap:4, minWidth:150 }}><input style={{...inp, height:28, opacity:isOn?1:0.55}} disabled={!isOn} value={isOn ? m.port_loading : ''} onChange={e => updateMeta(q.id, { port_loading:e.target.value })} title="Pulled from order general info" /><input style={{...inp, height:28, opacity:isOn?1:0.55}} disabled={!isOn} value={isOn ? m.port_destination : ''} onChange={e => updateMeta(q.id, { port_destination:e.target.value })} title="Pulled from order general info" /></div></td>
                      <td style={{...td, textAlign:'right'}}><input style={{ ...inp, textAlign:'right', width:68, opacity:isOn?1:0.55 }} type="number" min="0" disabled={!isOn} value={isOn ? m.transit_days : ''} onChange={e => updateMeta(q.id, { transit_days:e.target.value })} /></td>
                      <td style={td}><div style={{ fontSize:12, fontWeight:700 }}>{fmtDate(m.eta)}</div><div style={{ marginTop:4, display:'inline-block', fontSize:10, fontWeight:800, borderRadius:999, padding:'3px 7px', background:daysBadge(daysLeft(m.eta)).bg, color:daysBadge(daysLeft(m.eta)).color }}>{daysBadge(daysLeft(m.eta)).text}</div></td>
                      {!backfillMode && <td style={{...td, textAlign:'center'}}><input type="checkbox" disabled={!isOn || remaining === 0} checked={!!closeSelected[q.id]} title="Manual close after shipment" onChange={e => setCloseSelected(prev => ({ ...prev, [q.id]: e.target.checked }))} /></td>}
                    </tr>
                  })}
                </tbody>
              </table>
            )}
          </div>
        </div>
        <div style={{ padding:'14px 20px', borderTop:'1px solid #eef2f7', display:'flex', alignItems:'center', justifyContent:'space-between', gap:12, background:'#fff', position:'sticky', bottom:0, zIndex:5 }}>
          <div style={{ fontSize:12, color:'#6b7280' }}>{valid ? `${Object.keys(selected).length} line(s) ready · ${totalQty.toLocaleString()} pcs` : 'Select at least one line and enter shipment quantity to create shipment.'}</div>
          <div style={{ display:'flex', gap:8 }}>
            <button className="btn btn-secondary" onClick={onClose}>Cancel</button>
            <button className="btn btn-primary" onClick={handleSave} disabled={!valid || saving} style={{ minWidth:180 }}>{saving ? 'Saving...' : (backfillMode ? 'Create Backfill Shipment' : 'Create Shipment')}</button>
          </div>
        </div>
      </div>
    </div>
  )
}

export default function Shipping() {
  const { user } = useAuth()
  const [shipments, setShipments] = useState([])
  const [lines, setLines] = useState([])
  const [orders, setOrders] = useState([])
  const [queues, setQueues] = useState([])
  const [showCreate, setShowCreate] = useState(false)
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => { load() }, [])

  async function load() {
    setLoading(true)
    const [{ data: sh }, { data: sl }, { data: ors }, { data: qs }] = await Promise.all([
      supabase.from('shipments').select('*').order('shipment_date', { ascending:false }),
      supabase.from('shipment_lines').select('*'),
      supabase.from('orders').select('*'),
      supabase.from('order_queues').select('id,q_number,label,qty,status,closure_type,remaining_qty,closed_by,closed_at'),
    ])
    setShipments(sh || [])
    setLines(sl || [])
    setOrders(ors || [])
    setQueues(qs || [])
    setLoading(false)
  }

  const orderMap = useMemo(() => Object.fromEntries(orders.map(o => [o.id, o])), [orders])
  const queueMap = useMemo(() => Object.fromEntries(queues.map(q => [q.id, q])), [queues])

  const shippedByOrder = useMemo(() => {
    const m = {}
    ;(lines || []).forEach(l => { m[l.order_id] = (m[l.order_id] || 0) + num(l.shipped_qty) })
    return m
  }, [lines])

  const openOrders = useMemo(() => orders.map(o => ({
    ...o,
    shipped_qty: shippedByOrder[o.id] || 0,
    balance_qty: Math.max(0, num(o.total_qty) - (shippedByOrder[o.id] || 0))
  })).filter(o => o.balance_qty > 0 && o.status !== 'Cancelled'), [orders, shippedByOrder])

  const visibleShipments = useMemo(() => shipments.filter(s => {
    const rows = lines.filter(l => l.shipment_id === s.id)
    const orderText = rows.map(r => {
      const o = orderMap[r.order_id] || {}
      return `${o.buyer_name || ''} ${o.style_number || ''} ${o.po_number || ''} ${o.job_number || ''}`
    }).join(' ')
    const hay = `${s.shipment_no || ''} ${s.container_no || ''} ${s.booking_ref || ''} ${s.source || ''} ${orderText}`.toLowerCase()
    return hay.includes(search.toLowerCase())
  }), [shipments, search, lines, orderMap])

  function exportShipments() {
    const csvRows = [['Shipment','Date','Buyer','Style','Job/PO','Ship Qty','Cartons','CBM','Unit Price','Shipment Value','POL','POD','ETA','Days Left','Source','Tracking Link']]
    visibleShipments.forEach(s => {
      const rows = lines.filter(l => l.shipment_id === s.id)
      rows.forEach(l => {
        const o = orderMap[l.order_id] || {}
        const eta = l.eta_destination_port || s.eta || ''
        csvRows.push([s.shipment_no, s.shipment_date, o.buyer_name || '', o.style_number || '', o.po_number || o.job_number || '', l.shipped_qty || '', l.total_cartons || '', l.cbm || '', l.unit_price || '', l.shipment_value || '', l.port_of_loading || getOrderPortLoading(o), l.port_of_destination || getOrderPortDestination(o), eta, daysLeft(eta) ?? '', s.source || 'queue', s.tracking_link || ''])
      })
    })
    const csv = csvRows.map(r => r.map(v => `"${String(v ?? '').replace(/"/g,'""')}"`).join(',')).join('\n')
    const blob = new Blob([csv], { type:'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a'); a.href = url; a.download = `shipments-${new Date().toISOString().slice(0,10)}.csv`; a.click(); URL.revokeObjectURL(url)
  }

  return (
    <div className="page-content" style={{ display:'flex', flexDirection:'column', gap:14, padding:'16px 24px', overflowY:'auto', height:'100%' }}>
      <div className="section-header" style={{ display:'flex', justifyContent:'space-between', alignItems:'center', gap:12 }}>
        <div>
          <div style={{ fontSize:22, fontWeight:800, color:'#111827' }}>Booking & Shipping</div>
          <div style={{ fontSize:13, color:'#6b7280', marginTop:2 }}>Create and manage shipments from queues or admin backfill mode.</div>
        </div>
        <button className="btn btn-primary" onClick={() => setShowCreate(true)}><Plus size={14} /> New Shipment</button>
      </div>

      <div style={{ display:'grid', gridTemplateColumns:'repeat(4, 1fr)', gap:12 }}>
        <div style={{ ...card, padding:14 }}><div style={{ fontSize:10, color:'#9ca3af', textTransform:'uppercase', fontWeight:700 }}>Open Orders</div><div style={{ fontSize:22, fontWeight:800, marginTop:6 }}>{openOrders.length}</div></div>
        <div style={{ ...card, padding:14 }}><div style={{ fontSize:10, color:'#9ca3af', textTransform:'uppercase', fontWeight:700 }}>Open Balance Qty</div><div style={{ fontSize:22, fontWeight:800, marginTop:6 }}>{openOrders.reduce((s,o)=>s+o.balance_qty,0).toLocaleString()}</div></div>
        <div style={{ ...card, padding:14 }}><div style={{ fontSize:10, color:'#9ca3af', textTransform:'uppercase', fontWeight:700 }}>Shipments</div><div style={{ fontSize:22, fontWeight:800, marginTop:6 }}>{shipments.length}</div></div>
        <div style={{ ...card, padding:14 }}><div style={{ fontSize:10, color:'#9ca3af', textTransform:'uppercase', fontWeight:700 }}>Shipped Qty</div><div style={{ fontSize:22, fontWeight:800, marginTop:6 }}>{lines.reduce((s,l)=>s+num(l.shipped_qty),0).toLocaleString()}</div></div>
      </div>

      <div style={{ ...card }}>
        <div style={{ padding:'12px 16px', borderBottom:'1px solid #eef2f7', display:'flex', alignItems:'center', justifyContent:'space-between', gap:10 }}>
          <div>
            <div style={{ fontSize:13, fontWeight:800 }}>Available to Ship</div>
            <div style={{ fontSize:11, color:'#9ca3af', marginTop:2 }}>Order balances with ports inherited from order general info.</div>
          </div>
          <div style={{ display:'flex', alignItems:'center', gap:8 }}>
            <div style={{ position:'relative', width:330 }}><Search size={13} style={{ position:'absolute', left:9, top:'50%', transform:'translateY(-50%)', color:'#9ca3af' }} /><input style={{ ...inp, paddingLeft:28 }} value={search} onChange={e => setSearch(e.target.value)} placeholder="Search buyer, style, PO, port..." /></div>
            <button className="btn btn-secondary" title="Filters"><Filter size={14} /></button>
            <button className="btn btn-secondary" title="Columns"><Settings size={14} /></button>
            <button className="btn btn-secondary" onClick={exportShipments}><Download size={14} /> Export</button>
            <button className="btn btn-secondary" onClick={() => window.print()}><Printer size={14} /> Print</button>
          </div>
        </div>
        <table style={{ width:'100%', borderCollapse:'collapse', minWidth:1080 }}>
          <thead><tr style={{ background:'#fafafa' }}><th style={th}>Job / Status</th><th style={th}>Buyer</th><th style={th}>Style / PO</th><th style={{...th, textAlign:'right'}}>Qty / Ship / Balance</th><th style={{...th, textAlign:'right'}}>Value</th><th style={th}>POL / POD</th><th style={th}>Action</th></tr></thead>
          <tbody>
            {openOrders.map(o => {
              const value = num(o.balance_qty) * num(o.unit_price)
              return <tr key={o.id}>
                <td style={td}><div style={{ fontWeight:800, fontFamily:'monospace' }}>{o.job_number || '—'}</div><span style={{ marginTop:6, display:'inline-flex', alignItems:'center', gap:5, fontSize:10, fontWeight:900, borderRadius:999, padding:'4px 8px', background:'#ecfdf5', color:'#047857' }}>Open Balance</span></td>
                <td style={td}><div style={{ fontWeight:700 }}>{o.buyer_name || '—'}</div></td>
                <td style={td}><div style={{ fontWeight:800 }}>{o.style_number || '—'}</div><div style={{ fontSize:11, color:'#6b7280' }}>{o.po_number || '—'}</div></td>
                <td style={{...td, textAlign:'right', fontFamily:'monospace'}}><div style={{ fontWeight:800 }}>{num(o.total_qty).toLocaleString()}</div><div style={{ color:'#2563eb' }}>Ship {num(o.shipped_qty).toLocaleString()}</div><div>Bal {num(o.balance_qty).toLocaleString()}</div></td>
                <td style={{...td, textAlign:'right', fontFamily:'monospace', fontWeight:800}}>{value ? money(value, o.currency || 'USD') : '—'}</td>
                <td style={td}><div>{getOrderPortLoading(o)}</div><div style={{ fontSize:11, color:'#6b7280' }}>{getOrderPortDestination(o)}</div></td>
                <td style={td}><button className="btn btn-secondary" onClick={() => setShowCreate(true)}><Plus size={13} /> Shipment</button></td>
              </tr>
            })}
            {openOrders.length === 0 && <tr><td colSpan={7} style={{ padding:18, textAlign:'center', color:'#9ca3af', fontSize:12 }}>No open balances.</td></tr>}
          </tbody>
        </table>
      </div>

      <div style={{ ...card }}>
        <div style={{ padding:'12px 16px', borderBottom:'1px solid #eef2f7' }}>
          <div style={{ fontSize:13, fontWeight:800 }}>Shipment History</div>
          <div style={{ fontSize:11, color:'#9ca3af', marginTop:2 }}>Created shipments with logistics, value, ETA and tracking.</div>
        </div>
        {loading ? <div style={{ padding:24, fontSize:12, color:'#9ca3af' }}>Loading...</div> : visibleShipments.length === 0 ? <div style={{ padding:24, fontSize:12, color:'#9ca3af' }}>No shipments yet.</div> : (
          <table style={{ width:'100%', borderCollapse:'collapse', minWidth:1120 }}>
            <thead><tr style={{ background:'#fafafa' }}>
              <th style={th}>Shipment</th><th style={th}>Date</th><th style={th}>Buyer / Style</th><th style={{...th, textAlign:'right'}}>Qty</th><th style={{...th, textAlign:'right'}}>Cartons</th><th style={{...th, textAlign:'right'}}>CBM</th><th style={{...th, textAlign:'right'}}>Value</th><th style={th}>POL / POD</th><th style={th}>ETA</th><th style={th}>Track</th><th style={th}>Source</th>
            </tr></thead>
            <tbody>
              {visibleShipments.map(s => {
                const rows = lines.filter(l => l.shipment_id === s.id)
                const qty = rows.reduce((sum, r) => sum + num(r.shipped_qty), 0)
                const cartons = rows.reduce((sum, r) => sum + num(r.total_cartons), 0)
                const cbm = rows.reduce((sum, r) => sum + num(r.cbm), 0)
                const value = rows.reduce((sum, r) => sum + num(r.shipment_value), 0)
                const firstLine = rows[0] || {}
                const firstOrder = orderMap[firstLine.order_id] || {}
                const eta = firstLine.eta_destination_port || s.eta || ''
                const badge = daysBadge(daysLeft(eta))
                return <tr key={s.id}>
                  <td style={td}><div style={{ fontFamily:'monospace', fontWeight:800 }}>{s.shipment_no}</div><div style={{ fontSize:11, color:'#6b7280' }}>{s.container_no || 'No container'} · {s.booking_ref || 'No booking'}</div></td>
                  <td style={td}>{fmtDate(s.shipment_date)}</td>
                  <td style={td}><div style={{ fontWeight:700 }}>{firstOrder.buyer_name || '—'}</div><div style={{ fontSize:11, color:'#6b7280' }}>{firstOrder.style_number || '—'} · {firstOrder.po_number || firstOrder.job_number || '—'}</div></td>
                  <td style={{...td, textAlign:'right', fontFamily:'monospace', fontWeight:700}}>{qty.toLocaleString()}</td>
                  <td style={{...td, textAlign:'right', fontFamily:'monospace'}}>{cartons ? cartons.toLocaleString() : '—'}</td>
                  <td style={{...td, textAlign:'right', fontFamily:'monospace'}}>{cbm ? cbm.toLocaleString(undefined,{maximumFractionDigits:2}) : '—'}</td>
                  <td style={{...td, textAlign:'right', fontFamily:'monospace', fontWeight:700}}>{money(value, firstLine.currency || firstOrder.currency || 'USD')}</td>
                  <td style={td}><div>{firstLine.port_of_loading || getOrderPortLoading(firstOrder)}</div><div style={{ fontSize:11, color:'#6b7280' }}>{firstLine.port_of_destination || getOrderPortDestination(firstOrder)}</div></td>
                  <td style={td}><div style={{ fontWeight:700 }}>{fmtDate(eta)}</div><div style={{ marginTop:4, display:'inline-block', fontSize:10, fontWeight:800, borderRadius:999, padding:'3px 7px', background:badge.bg, color:badge.color }}>{badge.text}</div></td>
                  <td style={td}>{s.tracking_link ? <button title="Open tracking link" onClick={() => window.open(s.tracking_link, "_blank", "noopener,noreferrer")} style={{ width:30, height:30, display:"inline-flex", alignItems:"center", justifyContent:"center", border:"1px solid #e5e7eb", borderRadius:8, background:"#fff", color:"#6b7280", cursor:"pointer" }}><LinkIcon size={15} /></button> : <span style={{ color:"#d1d5db" }}>—</span>}</td>
                  <td style={td}><span style={{ fontSize:10, fontWeight:900, borderRadius:999, padding:'4px 8px', background:s.source === 'backfill' ? '#fffbeb' : '#eff6ff', color:s.source === 'backfill' ? '#92400e' : '#1d4ed8' }}>{s.source === 'backfill' ? 'Backfill' : 'Queue'}</span></td>
                </tr>
              })}
            </tbody>
          </table>
        )}
      </div>


      {showCreate && <CreateShipmentModal existingShipments={shipments} allOrders={orders} user={user} onClose={() => setShowCreate(false)} onDone={() => { setShowCreate(false); load() }} />}
    </div>
  )
}
