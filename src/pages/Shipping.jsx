import React, { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import { Plus, X, Check, Search } from 'lucide-react'

const card = { background:'#fff', border:'1px solid #e8e8e6', borderRadius:10, overflow:'hidden' }
const inp = { width:'100%', height:32, padding:'0 10px', border:'1px solid #e5e7eb', borderRadius:7, fontSize:12, outline:'none', boxSizing:'border-box', fontFamily:'var(--font)' }

function fmtDate(d) {
  if (!d) return '—'
  try { return new Date(d).toLocaleDateString('en-GB', { day:'2-digit', month:'short', year:'numeric' }) } catch { return d }
}

function CreateShipmentModal({ existingShipments, onClose, onDone }) {
  const [queues, setQueues] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState({})
  const [saving, setSaving] = useState(false)
  const [header, setHeader] = useState({
    shipment_no: '',
    shipment_date: new Date().toISOString().slice(0,10),
    container_no: '',
    booking_ref: '',
    etd: '',
    eta: '',
    notes: '',
  })

  useEffect(() => {
    const nums = (existingShipments || []).map(s => parseInt(String(s.shipment_no || '').replace(/\D/g,''))).filter(n => Number.isFinite(n))
    const next = Math.max(0, ...nums) + 1
    setHeader(h => ({ ...h, shipment_no: `SHP-${String(next).padStart(4,'0')}` }))
    load()
  }, [])

  async function load() {
    setLoading(true)
    const [{ data: qs }, { data: ors }, { data: lines }] = await Promise.all([
      supabase.from('order_queues').select('*').order('created_at', { ascending:true }),
      supabase.from('orders').select('id,buyer_name,style_number,po_number'),
      supabase.from('shipment_lines').select('queue_id,shipped_qty'),
    ])
    const shippedByQ = {}
    ;(lines || []).forEach(l => { shippedByQ[l.queue_id] = (shippedByQ[l.queue_id] || 0) + (parseFloat(l.shipped_qty) || 0) })
    const orderMap = Object.fromEntries((ors || []).map(o => [o.id, o]))
    const ready = (qs || []).filter(q => String(q.q_number || '').trim()).map(q => {
      const total = parseFloat(q.qty) || 0
      const shipped = shippedByQ[q.id] || 0
      const balance = Math.max(0, total - shipped)
      const ord = orderMap[q.order_id] || {}
      return { ...q, order: ord, shipped_qty: shipped, balance_qty: balance }
    }).filter(q => q.balance_qty > 0)
    setQueues(ready)
    setLoading(false)
  }

  const visible = useMemo(() => queues.filter(q => {
    const hay = `${q.q_number} ${q.label || ''} ${q.order?.style_number || ''} ${q.order?.buyer_name || ''} ${q.order?.po_number || ''}`.toLowerCase()
    return hay.includes(search.toLowerCase())
  }), [queues, search])

  function toggleQueue(q) {
    setSelected(prev => {
      const next = { ...prev }
      if (next[q.id]) delete next[q.id]
      else next[q.id] = String(q.balance_qty)
      return next
    })
  }

  const selectedRows = visible.filter(q => selected[q.id] != null)
  const totalQty = Object.values(selected).reduce((s, v) => s + (parseFloat(v) || 0), 0)
  const valid = header.shipment_no && header.shipment_date && totalQty > 0

  async function handleSave() {
    if (!valid) return
    setSaving(true)
    const { data: sh, error } = await supabase.from('shipments').insert([{
      shipment_no: header.shipment_no,
      shipment_date: header.shipment_date,
      container_no: header.container_no || null,
      booking_ref: header.booking_ref || null,
      etd: header.etd || null,
      eta: header.eta || null,
      notes: header.notes || null,
      status: 'Open',
    }]).select().single()
    if (error || !sh) { window.alert(error?.message || 'Could not create shipment'); setSaving(false); return }

    const rows = queues.filter(q => selected[q.id] != null).map(q => ({
      shipment_id: sh.id,
      order_id: q.order_id,
      queue_id: q.id,
      shipped_qty: Math.min(q.balance_qty, Math.max(0, parseFloat(selected[q.id]) || 0)),
    })).filter(r => r.shipped_qty > 0)

    if (rows.length) {
      const { error: le } = await supabase.from('shipment_lines').insert(rows)
      if (le) { window.alert(le.message || 'Could not save shipment lines'); setSaving(false); return }
    }
    setSaving(false)
    onDone()
  }

  return (
    <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.4)', zIndex:300, display:'flex', alignItems:'center', justifyContent:'center', padding:20 }}>
      <div style={{ ...card, width:'min(1100px, 96vw)', maxHeight:'90vh', display:'flex', flexDirection:'column' }}>
        <div style={{ padding:'16px 20px', borderBottom:'1px solid #eef2f7', display:'flex', alignItems:'center', justifyContent:'space-between' }}>
          <div>
            <div style={{ fontSize:16, fontWeight:800 }}>Create Shipment</div>
            <div style={{ fontSize:12, color:'#6b7280', marginTop:3 }}>Select activated Qs and adjust shipped quantity where needed.</div>
          </div>
          <button onClick={onClose} style={{ background:'none', border:'none', cursor:'pointer', color:'#9ca3af' }}><X size={16} /></button>
        </div>
        <div style={{ display:'grid', gridTemplateColumns:'320px 1fr', minHeight:520, overflow:'hidden' }}>
          <div style={{ padding:18, borderRight:'1px solid #eef2f7', overflow:'auto' }}>
            <div style={{ display:'grid', gap:10 }}>
              <div><div style={{ fontSize:11, fontWeight:700, color:'#6b7280', marginBottom:4 }}>Shipment No</div><input style={inp} value={header.shipment_no} onChange={e => setHeader(h => ({ ...h, shipment_no:e.target.value }))} /></div>
              <div><div style={{ fontSize:11, fontWeight:700, color:'#6b7280', marginBottom:4 }}>Shipment Date</div><input style={inp} type="date" value={header.shipment_date} onChange={e => setHeader(h => ({ ...h, shipment_date:e.target.value }))} /></div>
              <div><div style={{ fontSize:11, fontWeight:700, color:'#6b7280', marginBottom:4 }}>Container No</div><input style={inp} value={header.container_no} onChange={e => setHeader(h => ({ ...h, container_no:e.target.value }))} /></div>
              <div><div style={{ fontSize:11, fontWeight:700, color:'#6b7280', marginBottom:4 }}>Booking Ref</div><input style={inp} value={header.booking_ref} onChange={e => setHeader(h => ({ ...h, booking_ref:e.target.value }))} /></div>
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10 }}>
                <div><div style={{ fontSize:11, fontWeight:700, color:'#6b7280', marginBottom:4 }}>ETD</div><input style={inp} type="date" value={header.etd} onChange={e => setHeader(h => ({ ...h, etd:e.target.value }))} /></div>
                <div><div style={{ fontSize:11, fontWeight:700, color:'#6b7280', marginBottom:4 }}>ETA</div><input style={inp} type="date" value={header.eta} onChange={e => setHeader(h => ({ ...h, eta:e.target.value }))} /></div>
              </div>
              <div><div style={{ fontSize:11, fontWeight:700, color:'#6b7280', marginBottom:4 }}>Notes</div><textarea style={{ ...inp, height:84, padding:'8px 10px' }} value={header.notes} onChange={e => setHeader(h => ({ ...h, notes:e.target.value }))} /></div>
            </div>
            <div style={{ marginTop:16, padding:12, background:'#fafaf8', border:'1px solid #ececec', borderRadius:8 }}>
              <div style={{ fontSize:11, color:'#6b7280', marginBottom:6, textTransform:'uppercase', fontWeight:700 }}>Selected Summary</div>
              <div style={{ fontSize:14, fontWeight:800 }}>{totalQty.toLocaleString()} pcs</div>
              <div style={{ fontSize:11, color:'#9ca3af', marginTop:3 }}>{Object.keys(selected).length} Qs selected</div>
            </div>
          </div>
          <div style={{ padding:18, overflow:'auto' }}>
            <div style={{ position:'relative', width:320, marginBottom:12 }}>
              <Search size={13} style={{ position:'absolute', left:9, top:'50%', transform:'translateY(-50%)', color:'#9ca3af' }} />
              <input style={{ ...inp, paddingLeft:28 }} value={search} onChange={e => setSearch(e.target.value)} placeholder="Search Q#, style, buyer, PO..." />
            </div>
            {loading ? <div style={{ fontSize:12, color:'#9ca3af' }}>Loading available Qs...</div> : visible.length === 0 ? <div style={{ fontSize:12, color:'#9ca3af' }}>No activated queues with balance available.</div> : (
              <table style={{ width:'100%', borderCollapse:'collapse' }}>
                <thead>
                  <tr style={{ background:'#fafafa' }}>
                    <th style={{ textAlign:'left', padding:'8px 10px', fontSize:10, color:'#9ca3af', textTransform:'uppercase' }}></th>
                    <th style={{ textAlign:'left', padding:'8px 10px', fontSize:10, color:'#9ca3af', textTransform:'uppercase' }}>Q#</th>
                    <th style={{ textAlign:'left', padding:'8px 10px', fontSize:10, color:'#9ca3af', textTransform:'uppercase' }}>Order</th>
                    <th style={{ textAlign:'right', padding:'8px 10px', fontSize:10, color:'#9ca3af', textTransform:'uppercase' }}>Total</th>
                    <th style={{ textAlign:'right', padding:'8px 10px', fontSize:10, color:'#9ca3af', textTransform:'uppercase' }}>Shipped</th>
                    <th style={{ textAlign:'right', padding:'8px 10px', fontSize:10, color:'#9ca3af', textTransform:'uppercase' }}>Balance</th>
                    <th style={{ textAlign:'right', padding:'8px 10px', fontSize:10, color:'#9ca3af', textTransform:'uppercase' }}>Ship Qty</th>
                  </tr>
                </thead>
                <tbody>
                  {visible.map(q => {
                    const isOn = selected[q.id] != null
                    return (
                      <tr key={q.id} style={{ background:isOn ? '#f0f9ff' : '' }}>
                        <td style={{ padding:'8px 10px', borderBottom:'1px solid #f0f0ee' }}><input type="checkbox" checked={isOn} onChange={() => toggleQueue(q)} /></td>
                        <td style={{ padding:'8px 10px', borderBottom:'1px solid #f0f0ee', fontFamily:'monospace', fontWeight:700 }}>{q.q_number}</td>
                        <td style={{ padding:'8px 10px', borderBottom:'1px solid #f0f0ee' }}><div style={{ fontWeight:700, fontSize:12 }}>{q.order?.style_number || '—'}</div><div style={{ fontSize:11, color:'#6b7280' }}>{q.order?.buyer_name || '—'} · {q.label || '—'}</div></td>
                        <td style={{ padding:'8px 10px', borderBottom:'1px solid #f0f0ee', textAlign:'right', fontFamily:'monospace' }}>{(q.qty || 0).toLocaleString()}</td>
                        <td style={{ padding:'8px 10px', borderBottom:'1px solid #f0f0ee', textAlign:'right', fontFamily:'monospace' }}>{(q.shipped_qty || 0).toLocaleString()}</td>
                        <td style={{ padding:'8px 10px', borderBottom:'1px solid #f0f0ee', textAlign:'right', fontFamily:'monospace', fontWeight:700 }}>{(q.balance_qty || 0).toLocaleString()}</td>
                        <td style={{ padding:'8px 10px', borderBottom:'1px solid #f0f0ee', textAlign:'right' }}>
                          <input disabled={!isOn} style={{ ...inp, width:110, textAlign:'right', marginLeft:'auto', opacity:isOn?1:0.55 }} type="number" min="0" max={q.balance_qty} value={selected[q.id] ?? ''} onChange={e => setSelected(prev => ({ ...prev, [q.id]: e.target.value }))} />
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            )}
          </div>
        </div>
        <div style={{ padding:'12px 20px', borderTop:'1px solid #eef2f7', display:'flex', justifyContent:'flex-end', gap:8 }}>
          <button className="btn btn-secondary" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" onClick={handleSave} disabled={!valid || saving}>{saving ? 'Saving...' : 'Create Shipment'}</button>
        </div>
      </div>
    </div>
  )
}

export default function Shipping() {
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
      supabase.from('orders').select('id,buyer_name,style_number,po_number,total_qty,status'),
      supabase.from('order_queues').select('id,q_number,label,qty'),
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
    ;(lines || []).forEach(l => { m[l.order_id] = (m[l.order_id] || 0) + (parseFloat(l.shipped_qty) || 0) })
    return m
  }, [lines])

  const openOrders = useMemo(() => orders.map(o => ({
    ...o,
    shipped_qty: shippedByOrder[o.id] || 0,
    balance_qty: Math.max(0, (parseFloat(o.total_qty) || 0) - (shippedByOrder[o.id] || 0))
  })).filter(o => o.balance_qty > 0 && o.status !== 'Cancelled'), [orders, shippedByOrder])

  const visibleShipments = useMemo(() => shipments.filter(s => {
    const hay = `${s.shipment_no || ''} ${s.container_no || ''} ${s.booking_ref || ''}`.toLowerCase()
    return hay.includes(search.toLowerCase())
  }), [shipments, search])

  return (
    <div className="page-content" style={{ display:'flex', flexDirection:'column', gap:14, padding:'16px 24px', overflowY:'auto', height:'100%' }}>
      <div className="section-header" style={{ display:'flex', justifyContent:'space-between', alignItems:'center', gap:12 }}>
        <div>
          <div style={{ fontSize:22, fontWeight:800, color:'#111827' }}>Booking & Shipping</div>
          <div style={{ fontSize:13, color:'#6b7280', marginTop:2 }}>Create shipments from activated Qs and track shipped balance against orders.</div>
        </div>
        <button className="btn btn-primary" onClick={() => setShowCreate(true)}><Plus size={14} /> New Shipment</button>
      </div>

      <div style={{ display:'grid', gridTemplateColumns:'repeat(4, 1fr)', gap:12 }}>
        <div style={{ ...card, padding:14 }}><div style={{ fontSize:10, color:'#9ca3af', textTransform:'uppercase', fontWeight:700 }}>Open Orders</div><div style={{ fontSize:22, fontWeight:800, marginTop:6 }}>{openOrders.length}</div></div>
        <div style={{ ...card, padding:14 }}><div style={{ fontSize:10, color:'#9ca3af', textTransform:'uppercase', fontWeight:700 }}>Open Balance Qty</div><div style={{ fontSize:22, fontWeight:800, marginTop:6 }}>{openOrders.reduce((s,o)=>s+o.balance_qty,0).toLocaleString()}</div></div>
        <div style={{ ...card, padding:14 }}><div style={{ fontSize:10, color:'#9ca3af', textTransform:'uppercase', fontWeight:700 }}>Shipments</div><div style={{ fontSize:22, fontWeight:800, marginTop:6 }}>{shipments.length}</div></div>
        <div style={{ ...card, padding:14 }}><div style={{ fontSize:10, color:'#9ca3af', textTransform:'uppercase', fontWeight:700 }}>Shipped Qty</div><div style={{ fontSize:22, fontWeight:800, marginTop:6 }}>{lines.reduce((s,l)=>s+(parseFloat(l.shipped_qty)||0),0).toLocaleString()}</div></div>
      </div>

      <div style={{ ...card }}>
        <div style={{ padding:'12px 16px', borderBottom:'1px solid #eef2f7', display:'flex', alignItems:'center', justifyContent:'space-between' }}>
          <div style={{ fontSize:13, fontWeight:800 }}>Shipments</div>
          <div style={{ position:'relative', width:260 }}>
            <Search size={13} style={{ position:'absolute', left:9, top:'50%', transform:'translateY(-50%)', color:'#9ca3af' }} />
            <input style={{ ...inp, paddingLeft:28 }} value={search} onChange={e => setSearch(e.target.value)} placeholder="Search shipment..." />
          </div>
        </div>
        {loading ? <div style={{ padding:24, fontSize:12, color:'#9ca3af' }}>Loading...</div> : visibleShipments.length === 0 ? <div style={{ padding:24, fontSize:12, color:'#9ca3af' }}>No shipments yet.</div> : (
          <table style={{ width:'100%', borderCollapse:'collapse' }}>
            <thead>
              <tr style={{ background:'#fafafa' }}>
                <th style={{ textAlign:'left', padding:'9px 12px', fontSize:10, color:'#9ca3af', textTransform:'uppercase' }}>Shipment</th>
                <th style={{ textAlign:'left', padding:'9px 12px', fontSize:10, color:'#9ca3af', textTransform:'uppercase' }}>Date</th>
                <th style={{ textAlign:'left', padding:'9px 12px', fontSize:10, color:'#9ca3af', textTransform:'uppercase' }}>Container / Booking</th>
                <th style={{ textAlign:'right', padding:'9px 12px', fontSize:10, color:'#9ca3af', textTransform:'uppercase' }}>Qty</th>
                <th style={{ textAlign:'left', padding:'9px 12px', fontSize:10, color:'#9ca3af', textTransform:'uppercase' }}>Queues</th>
              </tr>
            </thead>
            <tbody>
              {visibleShipments.map(s => {
                const rows = lines.filter(l => l.shipment_id === s.id)
                const qty = rows.reduce((sum, r) => sum + (parseFloat(r.shipped_qty) || 0), 0)
                return (
                  <tr key={s.id}>
                    <td style={{ padding:'10px 12px', borderBottom:'1px solid #f5f5f3' }}><div style={{ fontFamily:'monospace', fontWeight:800 }}>{s.shipment_no}</div><div style={{ fontSize:11, color:'#6b7280' }}>{s.status || 'Open'}</div></td>
                    <td style={{ padding:'10px 12px', borderBottom:'1px solid #f5f5f3' }}>{fmtDate(s.shipment_date)}</td>
                    <td style={{ padding:'10px 12px', borderBottom:'1px solid #f5f5f3' }}><div>{s.container_no || '—'}</div><div style={{ fontSize:11, color:'#6b7280' }}>{s.booking_ref || '—'}</div></td>
                    <td style={{ padding:'10px 12px', borderBottom:'1px solid #f5f5f3', textAlign:'right', fontFamily:'monospace', fontWeight:700 }}>{qty.toLocaleString()}</td>
                    <td style={{ padding:'10px 12px', borderBottom:'1px solid #f5f5f3', fontSize:12 }}>{rows.map(r => queueMap[r.queue_id]?.q_number || '—').join(', ') || '—'}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>

      <div style={{ ...card }}>
        <div style={{ padding:'12px 16px', borderBottom:'1px solid #eef2f7', fontSize:13, fontWeight:800 }}>Order Balances</div>
        <table style={{ width:'100%', borderCollapse:'collapse' }}>
          <thead>
            <tr style={{ background:'#fafafa' }}>
              <th style={{ textAlign:'left', padding:'9px 12px', fontSize:10, color:'#9ca3af', textTransform:'uppercase' }}>Buyer</th>
              <th style={{ textAlign:'left', padding:'9px 12px', fontSize:10, color:'#9ca3af', textTransform:'uppercase' }}>Style / PO</th>
              <th style={{ textAlign:'right', padding:'9px 12px', fontSize:10, color:'#9ca3af', textTransform:'uppercase' }}>Order Qty</th>
              <th style={{ textAlign:'right', padding:'9px 12px', fontSize:10, color:'#9ca3af', textTransform:'uppercase' }}>Shipped</th>
              <th style={{ textAlign:'right', padding:'9px 12px', fontSize:10, color:'#9ca3af', textTransform:'uppercase' }}>Balance</th>
            </tr>
          </thead>
          <tbody>
            {openOrders.map(o => (
              <tr key={o.id}>
                <td style={{ padding:'10px 12px', borderBottom:'1px solid #f5f5f3' }}>{o.buyer_name || '—'}</td>
                <td style={{ padding:'10px 12px', borderBottom:'1px solid #f5f5f3' }}><div style={{ fontWeight:700 }}>{o.style_number || '—'}</div><div style={{ fontSize:11, color:'#6b7280' }}>{o.po_number || '—'}</div></td>
                <td style={{ padding:'10px 12px', borderBottom:'1px solid #f5f5f3', textAlign:'right', fontFamily:'monospace' }}>{(o.total_qty || 0).toLocaleString()}</td>
                <td style={{ padding:'10px 12px', borderBottom:'1px solid #f5f5f3', textAlign:'right', fontFamily:'monospace', color:'#2563eb' }}>{(o.shipped_qty || 0).toLocaleString()}</td>
                <td style={{ padding:'10px 12px', borderBottom:'1px solid #f5f5f3', textAlign:'right', fontFamily:'monospace', fontWeight:800 }}>{(o.balance_qty || 0).toLocaleString()}</td>
              </tr>
            ))}
            {openOrders.length === 0 && <tr><td colSpan={5} style={{ padding:18, textAlign:'center', color:'#9ca3af', fontSize:12 }}>No open balances.</td></tr>}
          </tbody>
        </table>
      </div>

      {showCreate && <CreateShipmentModal existingShipments={shipments} onClose={() => setShowCreate(false)} onDone={() => { setShowCreate(false); load() }} />}
    </div>
  )
}
