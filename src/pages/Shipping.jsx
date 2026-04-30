import React, { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import { Plus, X, Search, Settings } from 'lucide-react'
import { getShippingViewPrefs, CREATE_SHIPMENTS_COLUMNS, SHIPPED_GOODS_COLUMNS } from '../lib/shippingViewPrefs'
import ColumnSettingsPanel from '../components/ColumnSettingsPanel'

const card = { background:'#fff', border:'1px solid #e8e8e6', borderRadius:10, overflow:'hidden' }
const inp = { width:'100%', height:32, padding:'0 10px', border:'1px solid #e5e7eb', borderRadius:7, fontSize:12, outline:'none', boxSizing:'border-box', fontFamily:'var(--font)' }

function fmtDate(d) {
  if (!d) return '—'
  try { return new Date(d).toLocaleDateString('en-GB', { day:'2-digit', month:'short', year:'numeric' }) } catch { return d }
}

function getDaysToColor(days) {
  if (typeof days !== 'number') return '#6b7280'
  if (days < 0) return '#dc2626'
  if (days <= 5) return '#f59e0b'
  return '#16a34a'
}

function getDaysLabel(days) {
  if (typeof days !== 'number') return '—'
  if (days < 0) return `${Math.abs(days)} days overdue`
  if (days === 0) return 'Today'
  return `${days} days`
}

function calcDaysTo(date) {
  if (!date) return null
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const target = new Date(date)
  target.setHours(0, 0, 0, 0)
  return Math.floor((target - today) / (1000 * 60 * 60 * 24))
}

function CreateShipmentModal({ existingShipments, onClose, onDone }) {
  const [queues, setQueues] = useState([])
  const [orders, setOrders] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState({})
  const [saving, setSaving] = useState(false)
  const [header, setHeader] = useState({
    shipment_no: '',
    shipment_date: new Date().toISOString().slice(0,10),
    port_loading: '',
    port_destination: '',
    cartons_total: '',
    cbm_total: '',
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
    const [{ data: qs }, { data: ors }] = await Promise.all([
      supabase.from('order_queues').select('*').order('created_at', { ascending:true }),
      supabase.from('orders').select('id,buyer_name,style_number,po_number,port_of_loading,destination_port,store_name,brand_name,factory_ref').eq('status', 'Active'),
    ])
    setQueues(qs || [])
    setOrders(ors || [])
    setLoading(false)
  }

  const visible = useMemo(() => queues.filter(q => {
    const ord = orders.find(o => o.id === q.order_id) || {}
    const hay = `${q.q_number} ${q.label || ''} ${ord.style_number || ''} ${ord.buyer_name || ''} ${ord.po_number || ''}`.toLowerCase()
    return hay.includes(search.toLowerCase())
  }), [queues, search, orders])

  function toggleQueue(qId) {
    setSelected(prev => {
      const next = { ...prev }
      if (next[qId] != null) delete next[qId]
      else next[qId] = { qty: '', override: false }
      return next
    })
  }

  const selectedQueues = visible.filter(q => selected[q.id] != null)
  const valid = header.shipment_no && header.shipment_date && selectedQueues.length > 0

  async function handleSave() {
    if (!valid) return
    setSaving(true)
    const { data: sh, error } = await supabase.from('shipments').insert([{
      shipment_no: header.shipment_no,
      shipment_date: header.shipment_date,
      port_loading: header.port_loading || null,
      port_destination: header.port_destination || null,
      cartons_total: parseFloat(header.cartons_total) || null,
      cbm_total: parseFloat(header.cbm_total) || null,
      etd: header.etd || null,
      eta: header.eta || null,
      notes: header.notes || null,
      status: 'Created',
    }]).select().single()

    if (error || !sh) { alert(error?.message || 'Could not create shipment'); setSaving(false); return }

    const lines = selectedQueues.map(q => ({
      shipment_id: sh.id,
      queue_id: q.id,
      order_id: q.order_id,
      ship_qty: parseFloat(selected[q.id]?.qty) || q.qty,
      override_admin: selected[q.id]?.override || false,
    }))

    if (lines.length) {
      const { error: le } = await supabase.from('shipment_lines').insert(lines)
      if (le) { alert(le.message || 'Could not save shipment lines'); setSaving(false); return }
    }

    setSaving(false)
    onDone()
  }

  const orderMap = useMemo(() => Object.fromEntries((orders || []).map(o => [o.id, o])), [orders])

  return (
    <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.4)', zIndex:300, display:'flex', alignItems:'center', justifyContent:'center', padding:20 }}>
      <div style={{ ...card, width:'min(1200px, 96vw)', maxHeight:'90vh', display:'flex', flexDirection:'column' }}>
        <div style={{ padding:'16px 20px', borderBottom:'1px solid #eef2f7', display:'flex', alignItems:'center', justifyContent:'space-between' }}>
          <div>
            <div style={{ fontSize:16, fontWeight:800 }}>Create Shipment</div>
            <div style={{ fontSize:12, color:'#6b7280', marginTop:3 }}>Select queues and configure shipment details.</div>
          </div>
          <button onClick={onClose} style={{ background:'none', border:'none', cursor:'pointer', color:'#9ca3af' }}><X size={16} /></button>
        </div>

        <div style={{ display:'grid', gridTemplateColumns:'350px 1fr', minHeight:500, overflow:'hidden' }}>
          {/* Left: Form */}
          <div style={{ padding:18, borderRight:'1px solid #eef2f7', overflow:'auto', background:'#fafafa' }}>
            <div style={{ display:'grid', gap:12 }}>
              <div><label style={{ fontSize:11, fontWeight:700, color:'#6b7280', marginBottom:4, display:'block' }}>Shipment No</label><input style={inp} value={header.shipment_no} onChange={e => setHeader(h => ({ ...h, shipment_no:e.target.value }))} /></div>
              <div><label style={{ fontSize:11, fontWeight:700, color:'#6b7280', marginBottom:4, display:'block' }}>Shipment Date</label><input style={inp} type="date" value={header.shipment_date} onChange={e => setHeader(h => ({ ...h, shipment_date:e.target.value }))} /></div>
              <div style={{ borderTop:'1px solid #e5e7eb', paddingTop:12, marginTop:4 }}><div style={{ fontSize:10, fontWeight:800, color:'#9ca3af', textTransform:'uppercase', marginBottom:8 }}>Ports & Transit</div>
                <div style={{ display:'grid', gap:10 }}>
                  <div><label style={{ fontSize:11, fontWeight:700, color:'#6b7280', marginBottom:4, display:'block' }}>Port of Loading</label><input style={inp} value={header.port_loading} onChange={e => setHeader(h => ({ ...h, port_loading:e.target.value }))} placeholder="e.g., Karachi" /></div>
                  <div><label style={{ fontSize:11, fontWeight:700, color:'#6b7280', marginBottom:4, display:'block' }}>Destination Port</label><input style={inp} value={header.port_destination} onChange={e => setHeader(h => ({ ...h, port_destination:e.target.value }))} placeholder="e.g., Los Angeles" /></div>
                  <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8 }}>
                    <div><label style={{ fontSize:11, fontWeight:700, color:'#6b7280', marginBottom:4, display:'block' }}>ETD</label><input style={inp} type="date" value={header.etd} onChange={e => setHeader(h => ({ ...h, etd:e.target.value }))} /></div>
                    <div><label style={{ fontSize:11, fontWeight:700, color:'#6b7280', marginBottom:4, display:'block' }}>ETA</label><input style={inp} type="date" value={header.eta} onChange={e => setHeader(h => ({ ...h, eta:e.target.value }))} /></div>
                  </div>
                </div>
              </div>
              <div style={{ borderTop:'1px solid #e5e7eb', paddingTop:12, marginTop:4 }}><div style={{ fontSize:10, fontWeight:800, color:'#9ca3af', textTransform:'uppercase', marginBottom:8 }}>Shipment Details</div>
                <div style={{ display:'grid', gap:10 }}>
                  <div><label style={{ fontSize:11, fontWeight:700, color:'#6b7280', marginBottom:4, display:'block' }}>Total Cartons</label><input style={inp} type="number" value={header.cartons_total} onChange={e => setHeader(h => ({ ...h, cartons_total:e.target.value }))} /></div>
                  <div><label style={{ fontSize:11, fontWeight:700, color:'#6b7280', marginBottom:4, display:'block' }}>Total CBM</label><input style={inp} type="number" step="0.1" value={header.cbm_total} onChange={e => setHeader(h => ({ ...h, cbm_total:e.target.value }))} /></div>
                  <div><label style={{ fontSize:11, fontWeight:700, color:'#6b7280', marginBottom:4, display:'block' }}>Notes</label><textarea style={{ ...inp, height:60, resize:'vertical', padding:8 }} value={header.notes} onChange={e => setHeader(h => ({ ...h, notes:e.target.value }))} /></div>
                </div>
              </div>
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8, marginTop:12 }}>
                <button onClick={onClose} style={{ padding:'8px 12px', border:'1px solid #e5e7eb', background:'#fff', borderRadius:7, cursor:'pointer', fontSize:12, fontWeight:600 }}>Cancel</button>
                <button onClick={handleSave} disabled={!valid || saving} style={{ padding:'8px 12px', background:valid ? '#2383e2' : '#d1d5db', color:'#fff', border:'none', borderRadius:7, cursor:valid?'pointer':'default', fontSize:12, fontWeight:600 }}>
                  {saving ? 'Creating...' : 'Create Shipment'}
                </button>
              </div>
            </div>
          </div>

          {/* Right: Queue list */}
          <div style={{ padding:'16px', overflow:'auto' }}>
            <div style={{ marginBottom:12 }}>
              <div style={{ position:'relative' }}>
                <Search size={13} style={{ position:'absolute', left:9, top:'50%', transform:'translateY(-50%)', color:'#9ca3af' }} />
                <input style={{ ...inp, paddingLeft:28 }} value={search} onChange={e => setSearch(e.target.value)} placeholder="Search queues..." />
              </div>
            </div>
            {loading ? <div style={{ color:'#9ca3af', fontSize:12 }}>Loading queues...</div> : visible.length === 0 ? <div style={{ color:'#9ca3af', fontSize:12 }}>No queues found.</div> : (
              <div style={{ display:'grid', gap:8 }}>
                {visible.map(q => {
                  const ord = orderMap[q.order_id] || {}
                  const sel = selected[q.id]
                  return (
                    <div key={q.id} style={{ border:'1px solid #e5e7eb', borderRadius:8, padding:10, background:sel?'#f0f7ff':'#fff' }}>
                      <div style={{ display:'flex', gap:10, alignItems:'flex-start', marginBottom:8 }}>
                        <input type="checkbox" checked={sel != null} onChange={() => toggleQueue(q.id)} style={{ marginTop:4, cursor:'pointer' }} />
                        <div style={{ flex:1, minWidth:0 }}>
                          <div style={{ fontWeight:700, fontSize:12 }}>{ord.style_number || '—'} / {ord.po_number || '—'}</div>
                          <div style={{ fontSize:11, color:'#6b7280', marginTop:2 }}>Q#{q.q_number} • {ord.buyer_name || '—'} • {q.qty} pcs</div>
                        </div>
                      </div>
                      {sel != null && (
                        <div style={{ display:'grid', gap:6, paddingTop:8, borderTop:'1px solid #e5e7eb' }}>
                          <div><label style={{ fontSize:10, fontWeight:700, color:'#6b7280', display:'block', marginBottom:3 }}>Ship Qty</label><input style={inp} type="number" value={sel.qty} onChange={e => setSelected(p => ({ ...p, [q.id]: { ...p[q.id], qty:e.target.value } }))} placeholder={q.qty} /></div>
                          <label style={{ fontSize:10, fontWeight:700, color:'#6b7280', display:'flex', alignItems:'center', gap:6, cursor:'pointer' }}>
                            <input type="checkbox" checked={sel.override} onChange={e => setSelected(p => ({ ...p, [q.id]: { ...p[q.id], override:e.target.checked } }))} />
                            Override Active restriction
                          </label>
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

function ShippingDataTable({ data, columns, visibleCols }) {
  if (!data || data.length === 0) {
    return <div style={{ padding:24, fontSize:12, color:'#9ca3af', textAlign:'center' }}>No data to display.</div>
  }

  const cols = columns.filter(c => visibleCols.includes(c.id))
  const totalWidth = cols.reduce((s, c) => s + (c.width || 80), 0)

  return (
    <div style={{ overflowX:'auto', overflowY:'hidden' }}>
      <table style={{ width:'100%', borderCollapse:'collapse', minWidth:`${totalWidth}px` }}>
        <thead>
          <tr style={{ background:'#fafafa' }}>
            {cols.map(col => (
              <th key={col.id} style={{ textAlign:'left', padding:'9px 12px', fontSize:10, color:'#9ca3af', textTransform:'uppercase', width:col.width, minWidth:col.width }}>
                {col.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.map((row, idx) => (
            <tr key={row.id || idx}>
              {cols.map(col => (
                <td key={`${row.id}-${col.id}`} style={{ padding:'10px 12px', borderBottom:'1px solid #f5f5f3', fontSize:12, width:col.width, minWidth:col.width, overflow:'hidden', textOverflow:'ellipsis' }}>
                  {row[col.id] || '—'}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export default function Shipping() {
  const [activeTab, setActiveTab] = useState('create')
  const [showCreate, setShowCreate] = useState(false)
  const [columnSettingsOpen, setColumnSettingsOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [search, setSearch] = useState('')
  const [queues, setQueues] = useState([])
  const [orders, setOrders] = useState([])
  const [shipments, setShipments] = useState([])
  const [shipmentLines, setShipmentLines] = useState([])

  const createShipmentsPrefs = getShippingViewPrefs('createShipments')
  const shippedGoodsPrefs = getShippingViewPrefs('shippedGoods')

  useEffect(() => { load() }, [])

  async function load() {
    setLoading(true)
    const [{ data: qs }, { data: ors }, { data: sh }, { data: sl }] = await Promise.all([
      supabase.from('order_queues').select('*').order('created_at', { ascending:false }),
      supabase.from('orders').select('*'),
      supabase.from('shipments').select('*').order('shipment_date', { ascending:false }),
      supabase.from('shipment_lines').select('*'),
    ])
    setQueues(qs || [])
    setOrders(ors || [])
    setShipments(sh || [])
    setShipmentLines(sl || [])
    setLoading(false)
  }

  const orderMap = useMemo(() => Object.fromEntries((orders || []).map(o => [o.id, o])), [orders])
  const queueMap = useMemo(() => Object.fromEntries((queues || []).map(q => [q.id, q])), [queues])

  // Build Create Shipments table data
  const createShipmentsData = useMemo(() => {
    return queues.filter(q => {
      const ord = orderMap[q.order_id] || {}
      const hay = `${q.q_number} ${q.label || ''} ${ord.style_number || ''} ${ord.buyer_name || ''} ${ord.po_number || ''}`.toLowerCase()
      return hay.includes(search.toLowerCase())
    }).map(q => {
      const ord = orderMap[q.order_id] || {}
      return {
        id: q.id,
        checkbox: '',
        qNumber: q.q_number || '—',
        stylePo: `${ord.style_number || '—'} / ${ord.po_number || '—'}`,
        buyer: ord.buyer_name || '—',
        balance: (q.qty || 0).toLocaleString(),
        status: q.status || 'Draft',
        splitRule: q.split_rule || '—',
        storeId: ord.store_name || '—',
        brandName: ord.brand_name || '—',
        factoryRef: ord.factory_ref || '—',
        portOfLoading: ord.port_of_loading || '—',
        portDestination: ord.destination_port || '—',
        exFactoryDate: fmtDate(ord.planned_ex_factory),
        shipDate: fmtDate(ord.planned_ship_date),
        etd: '—',
        eta: '—',
        daysToEta: '—',
        cartons: '—',
        cbm: '—',
        notes: '—',
        createdDate: fmtDate(q.created_at),
      }
    })
  }, [queues, orderMap, search])

  // Build Shipped Goods table data
  const shippedGoodsData = useMemo(() => {
    return shipments.filter(s => {
      const hay = `${s.shipment_no || ''} ${s.port_loading || ''} ${s.port_destination || ''}`.toLowerCase()
      return hay.includes(search.toLowerCase())
    }).map(s => {
      const lines = shipmentLines.filter(l => l.shipment_id === s.id)
      const queueId = lines[0]?.queue_id
      const orderId = lines[0]?.order_id
      const q = queueMap[queueId] || {}
      const o = orderMap[orderId] || {}
      const totalQty = lines.reduce((sum, l) => sum + (parseFloat(l.ship_qty) || 0), 0)
      const daysToEtd = calcDaysTo(s.etd)
      const daysToEta = calcDaysTo(s.eta)

      return {
        id: s.id,
        checkbox: '',
        shipmentNumber: s.shipment_no || '—',
        stylePo: `${o.style_number || '—'} / ${o.po_number || '—'}`,
        buyer: o.buyer_name || '—',
        qNumber: q.q_number || '—',
        shipQty: totalQty.toLocaleString(),
        cartons: s.cartons_total ? String(s.cartons_total) : '—',
        cbm: s.cbm_total ? String(s.cbm_total) : '—',
        portOfLoading: s.port_loading || '—',
        portDestination: s.port_destination || '—',
        etd: fmtDate(s.etd),
        daysToEtd: <span style={{ color: getDaysToColor(daysToEtd), fontWeight: 700 }}>{getDaysLabel(daysToEtd)}</span>,
        eta: fmtDate(s.eta),
        daysToEta: <span style={{ color: getDaysToColor(daysToEta), fontWeight: 700 }}>{getDaysLabel(daysToEta)}</span>,
        status: s.status || 'Created',
        isOverride: s.override_admin ? '✓' : '—',
        createdDate: fmtDate(s.created_at),
        createdBy: s.created_by || 'System',
        lastUpdated: fmtDate(s.updated_at),
        deliveredDate: fmtDate(s.delivered_at),
        notes: s.notes || '—',
      }
    })
  }, [shipments, shipmentLines, queueMap, orderMap, search])

  return (
    <div style={{ display:'flex', flexDirection:'column', height:'100%', background:'#f7f7f5', overflowY:'auto' }}>
      {/* Header */}
      <div style={{ padding:'28px 28px 0', borderBottom:'1px solid #eef0f4' }}>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-end', marginBottom:20 }}>
          <div>
            <h1 style={{ fontSize:22, fontWeight:900, margin:0, color:'#111827' }}>Shipping</h1>
            <div style={{ fontSize:12, color:'#6b7280', marginTop:5 }}>Create and track shipments. Manage port details, ETD/ETA, and carton information.</div>
          </div>
          <button onClick={() => setShowCreate(true)} style={{ display:'flex', alignItems:'center', gap:8, padding:'10px 16px', background:'#111827', color:'#fff', border:'none', borderRadius:9, cursor:'pointer', fontSize:13, fontWeight:700 }}>
            <Plus size={16} /> New Shipment
          </button>
        </div>

        {/* Tabs */}
        <div style={{ display:'flex', gap:20, borderBottom:'2px solid #eef0f4' }}>
          <button
            onClick={() => setActiveTab('create')}
            style={{
              padding:'12px 0',
              border:'none',
              background:'none',
              fontSize:13,
              fontWeight:700,
              color:activeTab==='create'?'#111827':'#9ca3af',
              borderBottom:activeTab==='create'?'2px solid #2383e2':'none',
              cursor:'pointer',
              marginBottom:'-2px',
            }}
          >
            Create Shipments
          </button>
          <button
            onClick={() => setActiveTab('shipped')}
            style={{
              padding:'12px 0',
              border:'none',
              background:'none',
              fontSize:13,
              fontWeight:700,
              color:activeTab==='shipped'?'#111827':'#9ca3af',
              borderBottom:activeTab==='shipped'?'2px solid #2383e2':'none',
              cursor:'pointer',
              marginBottom:'-2px',
            }}
          >
            Shipped Goods
          </button>
        </div>
      </div>

      {/* Toolbar */}
      <div style={{ padding:'12px 28px', background:'#f7f7f5', borderBottom:'1px solid #eef0f4', display:'flex', gap:12, alignItems:'center' }}>
        <div style={{ position:'relative', flex:1, maxWidth:300 }}>
          <Search size={13} style={{ position:'absolute', left:9, top:'50%', transform:'translateY(-50%)', color:'#9ca3af' }} />
          <input style={{ ...inp, paddingLeft:28 }} value={search} onChange={e => setSearch(e.target.value)} placeholder="Search..." />
        </div>
        <button
          onClick={() => setColumnSettingsOpen(true)}
          style={{
            display:'flex',
            alignItems:'center',
            gap:6,
            padding:'8px 12px',
            background:'#fff',
            border:'1px solid #e5e7eb',
            borderRadius:7,
            cursor:'pointer',
            fontSize:12,
            fontWeight:600,
            color:'#374151',
          }}
        >
          <Settings size={14} /> Columns
        </button>
      </div>

      {/* Content */}
      <div style={{ flex:1, overflow:'auto', padding:'20px 28px' }}>
        {loading ? (
          <div style={{ padding:40, textAlign:'center', color:'#9ca3af' }}>Loading...</div>
        ) : activeTab === 'create' ? (
          <div style={card}>
            <ShippingDataTable data={createShipmentsData} columns={CREATE_SHIPMENTS_COLUMNS} visibleCols={createShipmentsPrefs.visibleColumns} />
          </div>
        ) : (
          <div style={card}>
            <ShippingDataTable data={shippedGoodsData} columns={SHIPPED_GOODS_COLUMNS} visibleCols={shippedGoodsPrefs.visibleColumns} />
          </div>
        )}
      </div>

      {/* Modals */}
      {showCreate && <CreateShipmentModal existingShipments={shipments} onClose={() => setShowCreate(false)} onDone={() => { setShowCreate(false); load() }} />}
      {columnSettingsOpen && (
        <ColumnSettingsPanel
          tab={activeTab === 'create' ? 'createShipments' : 'shippedGoods'}
          allColumns={activeTab === 'create' ? CREATE_SHIPMENTS_COLUMNS : SHIPPED_GOODS_COLUMNS}
          onSave={() => load()}
          onClose={() => setColumnSettingsOpen(false)}
        />
      )}
    </div>
  )
}
