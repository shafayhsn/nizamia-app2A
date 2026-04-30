import React, { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import { Plus, X, Search, Settings, Filter, ArrowUpDown, Grid3x3, Download, Printer } from 'lucide-react'
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
  if (days < 0) return `${Math.abs(days)}d overdue`
  if (days === 0) return 'Today'
  return `${days}d`
}

function calcDaysTo(date) {
  if (!date) return null
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const target = new Date(date)
  target.setHours(0, 0, 0, 0)
  return Math.floor((target - today) / (1000 * 60 * 60 * 24))
}

function KPICard({ label, value, trend }) {
  return (
    <div style={{ background:'#fff', border:'1px solid #e8e8e6', borderRadius:10, padding:16 }}>
      <div style={{ fontSize:10, color:'#9ca3af', textTransform:'uppercase', fontWeight:700, marginBottom:8 }}>{label}</div>
      <div style={{ fontSize:24, fontWeight:900, color:'#111827' }}>{value}</div>
      {trend && <div style={{ fontSize:11, color:trend.color, marginTop:6 }}>{trend.text}</div>}
    </div>
  )
}

function SelectionPanel({ tab, selected, queues, orders, onCreateShipment, onCancel }) {
  const [formData, setFormData] = useState({
    shipment_no: `SHP-${String(Math.random()).slice(2, 6).padStart(4, '0')}`,
    shipment_date: new Date().toISOString().slice(0, 10),
    port_loading: '',
    port_destination: '',
    cartons_total: '',
    cbm_total: '',
    etd: '',
    eta: '',
    notes: '',
  })

  const selectedQueues = queues.filter(q => selected[q.id])
  const orderMap = Object.fromEntries((orders || []).map(o => [o.id, o]))
  const totalQty = selectedQueues.reduce((sum, q) => sum + (q.qty || 0), 0)

  const handleCreate = async () => {
    if (!formData.shipment_no || !formData.shipment_date || selectedQueues.length === 0) {
      alert('Please fill required fields and select queues')
      return
    }
    await onCreateShipment(formData, selectedQueues)
  }

  return (
    <div style={{ ...card, marginTop: 16, padding: 18 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
        <div>
          <div style={{ fontSize: 14, fontWeight: 800 }}>Create Shipment ({selectedQueues.length} queues)</div>
          <div style={{ fontSize: 11, color: '#6b7280', marginTop: 4 }}>Total Qty: {totalQty.toLocaleString()} pcs</div>
        </div>
        <button onClick={onCancel} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#9ca3af' }}>
          <X size={16} />
        </button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 16 }}>
        <div>
          <label style={{ fontSize: 11, fontWeight: 700, color: '#6b7280', display: 'block', marginBottom: 6 }}>Shipment No</label>
          <input style={inp} value={formData.shipment_no} onChange={e => setFormData(f => ({ ...f, shipment_no: e.target.value }))} />
        </div>
        <div>
          <label style={{ fontSize: 11, fontWeight: 700, color: '#6b7280', display: 'block', marginBottom: 6 }}>Shipment Date</label>
          <input style={inp} type="date" value={formData.shipment_date} onChange={e => setFormData(f => ({ ...f, shipment_date: e.target.value }))} />
        </div>
        <div>
          <label style={{ fontSize: 11, fontWeight: 700, color: '#6b7280', display: 'block', marginBottom: 6 }}>Port of Loading</label>
          <input style={inp} value={formData.port_loading} onChange={e => setFormData(f => ({ ...f, port_loading: e.target.value }))} placeholder="Karachi" />
        </div>
        <div>
          <label style={{ fontSize: 11, fontWeight: 700, color: '#6b7280', display: 'block', marginBottom: 6 }}>Destination Port</label>
          <input style={inp} value={formData.port_destination} onChange={e => setFormData(f => ({ ...f, port_destination: e.target.value }))} placeholder="Los Angeles" />
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 12, marginBottom: 16 }}>
        <div>
          <label style={{ fontSize: 11, fontWeight: 700, color: '#6b7280', display: 'block', marginBottom: 6 }}>ETD</label>
          <input style={inp} type="date" value={formData.etd} onChange={e => setFormData(f => ({ ...f, etd: e.target.value }))} />
        </div>
        <div>
          <label style={{ fontSize: 11, fontWeight: 700, color: '#6b7280', display: 'block', marginBottom: 6 }}>ETA</label>
          <input style={inp} type="date" value={formData.eta} onChange={e => setFormData(f => ({ ...f, eta: e.target.value }))} />
        </div>
        <div>
          <label style={{ fontSize: 11, fontWeight: 700, color: '#6b7280', display: 'block', marginBottom: 6 }}>Cartons</label>
          <input style={inp} type="number" value={formData.cartons_total} onChange={e => setFormData(f => ({ ...f, cartons_total: e.target.value }))} />
        </div>
        <div>
          <label style={{ fontSize: 11, fontWeight: 700, color: '#6b7280', display: 'block', marginBottom: 6 }}>CBM</label>
          <input style={inp} type="number" step="0.1" value={formData.cbm_total} onChange={e => setFormData(f => ({ ...f, cbm_total: e.target.value }))} />
        </div>
        <div colSpan={2}>
          <label style={{ fontSize: 11, fontWeight: 700, color: '#6b7280', display: 'block', marginBottom: 6 }}>Notes</label>
          <input style={inp} value={formData.notes} onChange={e => setFormData(f => ({ ...f, notes: e.target.value }))} placeholder="Special handling..." />
        </div>
      </div>

      <div style={{ borderTop: '1px solid #e8e8e6', paddingTop: 12, marginTop: 12, display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
        <button
          onClick={onCancel}
          style={{ padding: '8px 14px', background: '#fff', border: '1px solid #e5e7eb', borderRadius: 7, cursor: 'pointer', fontSize: 12, fontWeight: 600 }}
        >
          Cancel
        </button>
        <button
          onClick={handleCreate}
          style={{ padding: '8px 14px', background: '#2383e2', color: '#fff', border: 'none', borderRadius: 7, cursor: 'pointer', fontSize: 12, fontWeight: 600 }}
        >
          Create Shipment
        </button>
      </div>
    </div>
  )
}

export default function Shipping() {
  const [activeTab, setActiveTab] = useState('create')
  const [columnSettingsOpen, setColumnSettingsOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [search, setSearch] = useState('')
  const [sortBy, setSortBy] = useState('created')
  const [filterStatus, setFilterStatus] = useState('all')
  const [groupBy, setGroupBy] = useState('none')
  const [selected, setSelected] = useState({})
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
      supabase.from('order_queues').select('*').order('created_at', { ascending: false }),
      supabase.from('orders').select('*'),
      supabase.from('shipments').select('*').order('shipment_date', { ascending: false }),
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

  // KPI Cards for Create Shipments
  const createKPIs = useMemo(() => {
    const active = queues.filter(q => q.status === 'Active')
    const totalBalance = queues.reduce((sum, q) => sum + (q.qty || 0), 0)
    return {
      totalQueues: queues.length,
      activeQueues: active.length,
      totalBalance: totalBalance.toLocaleString(),
      selectedCount: Object.keys(selected).length,
    }
  }, [queues, selected])

  // KPI Cards for Shipped Goods
  const shippedKPIs = useMemo(() => {
    const created = shipments.filter(s => s.status === 'Created')
    const inTransit = shipments.filter(s => s.status === 'In Transit')
    const totalShipped = shipmentLines.reduce((sum, l) => sum + (l.ship_qty || 0), 0)
    return {
      totalShipments: shipments.length,
      createdCount: created.length,
      inTransitCount: inTransit.length,
      totalShipped: totalShipped.toLocaleString(),
    }
  }, [shipments, shipmentLines])

  // Filtered & sorted queues for Create Shipments tab
  const filteredQueues = useMemo(() => {
    let filtered = queues.filter(q => {
      const ord = orderMap[q.order_id] || {}
      const hay = `${q.q_number} ${q.label || ''} ${ord.style_number || ''} ${ord.buyer_name || ''} ${ord.po_number || ''}`.toLowerCase()
      return hay.includes(search.toLowerCase())
    })

    if (filterStatus !== 'all') {
      filtered = filtered.filter(q => q.status === filterStatus)
    }

    // Sort
    if (sortBy === 'qty-desc') {
      filtered.sort((a, b) => (b.qty || 0) - (a.qty || 0))
    } else if (sortBy === 'buyer') {
      filtered.sort((a, b) => {
        const aB = orderMap[a.order_id]?.buyer_name || ''
        const bB = orderMap[b.order_id]?.buyer_name || ''
        return aB.localeCompare(bB)
      })
    }

    return filtered
  }, [queues, search, sortBy, filterStatus, orderMap])

  // Filtered & sorted shipments for Shipped Goods tab
  const filteredShipments = useMemo(() => {
    let filtered = shipments.filter(s => {
      const hay = `${s.shipment_no || ''} ${s.port_loading || ''} ${s.port_destination || ''}`.toLowerCase()
      return hay.includes(search.toLowerCase())
    })

    if (filterStatus !== 'all') {
      filtered = filtered.filter(s => s.status === filterStatus)
    }

    if (sortBy === 'etd-asc') {
      filtered.sort((a, b) => new Date(a.etd || 0) - new Date(b.etd || 0))
    } else if (sortBy === 'created-desc') {
      filtered.sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0))
    }

    return filtered
  }, [shipments, search, sortBy, filterStatus])

  const handleCreateShipment = async (formData, selectedQueues) => {
    const { data: sh, error } = await supabase.from('shipments').insert([{
      shipment_no: formData.shipment_no,
      shipment_date: formData.shipment_date,
      port_loading: formData.port_loading || null,
      port_destination: formData.port_destination || null,
      cartons_total: parseFloat(formData.cartons_total) || null,
      cbm_total: parseFloat(formData.cbm_total) || null,
      etd: formData.etd || null,
      eta: formData.eta || null,
      notes: formData.notes || null,
      status: 'Created',
    }]).select().single()

    if (error || !sh) {
      alert(error?.message || 'Failed to create shipment')
      return
    }

    const lines = selectedQueues.map(q => ({
      shipment_id: sh.id,
      queue_id: q.id,
      order_id: q.order_id,
      ship_qty: q.qty,
    }))

    if (lines.length) {
      const { error: le } = await supabase.from('shipment_lines').insert(lines)
      if (le) {
        alert(le.message || 'Failed to save shipment lines')
        return
      }
    }

    setSelected({})
    load()
  }

  const toggleQueueSelect = (qId) => {
    setSelected(prev => {
      const next = { ...prev }
      if (next[qId]) delete next[qId]
      else next[qId] = true
      return next
    })
  }

  const toggleAllQueues = (checked) => {
    if (checked) {
      setSelected(Object.fromEntries(filteredQueues.map(q => [q.id, true])))
    } else {
      setSelected({})
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: '#f7f7f5', overflowY: 'auto' }}>
      {/* Header */}
      <div style={{ padding: '28px 28px 0', borderBottom: '1px solid #eef0f4' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 20 }}>
          <div>
            <h1 style={{ fontSize: 22, fontWeight: 900, margin: 0, color: '#111827' }}>Shipping</h1>
            <div style={{ fontSize: 12, color: '#6b7280', marginTop: 5 }}>Create and track shipments. Manage port details, ETD/ETA, and carton information.</div>
          </div>
          <button style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 16px', background: '#111827', color: '#fff', border: 'none', borderRadius: 9, cursor: 'pointer', fontSize: 13, fontWeight: 700 }}>
            <Plus size={16} /> New Shipment
          </button>
        </div>

        {/* Tabs */}
        <div style={{ display: 'flex', gap: 20, borderBottom: '2px solid #eef0f4' }}>
          <button
            onClick={() => { setActiveTab('create'); setSelected({}) }}
            style={{
              padding: '12px 0',
              border: 'none',
              background: 'none',
              fontSize: 13,
              fontWeight: 700,
              color: activeTab === 'create' ? '#111827' : '#9ca3af',
              borderBottom: activeTab === 'create' ? '2px solid #2383e2' : 'none',
              cursor: 'pointer',
              marginBottom: '-2px',
            }}
          >
            Create Shipments
          </button>
          <button
            onClick={() => { setActiveTab('shipped'); setSelected({}) }}
            style={{
              padding: '12px 0',
              border: 'none',
              background: 'none',
              fontSize: 13,
              fontWeight: 700,
              color: activeTab === 'shipped' ? '#111827' : '#9ca3af',
              borderBottom: activeTab === 'shipped' ? '2px solid #2383e2' : 'none',
              cursor: 'pointer',
              marginBottom: '-2px',
            }}
          >
            Shipped Goods
          </button>
        </div>
      </div>

      {/* KPI Cards */}
      <div style={{ padding: '20px 28px', background: '#f7f7f5' }}>
        <div style={{ display: 'grid', gridTemplateColumns: activeTab === 'create' ? 'repeat(4, 1fr)' : 'repeat(4, 1fr)', gap: 12 }}>
          {activeTab === 'create' ? (
            <>
              <KPICard label="Total Queues" value={createKPIs.totalQueues} />
              <KPICard label="Active Queues" value={createKPIs.activeQueues} />
              <KPICard label="Total Balance" value={createKPIs.totalBalance} />
              <KPICard label="Selected" value={createKPIs.selectedCount} trend={{ color: '#2383e2', text: 'Ready to create' }} />
            </>
          ) : (
            <>
              <KPICard label="Total Shipments" value={shippedKPIs.totalShipments} />
              <KPICard label="Created" value={shippedKPIs.createdCount} />
              <KPICard label="In Transit" value={shippedKPIs.inTransitCount} />
              <KPICard label="Total Shipped" value={shippedKPIs.totalShipped} />
            </>
          )}
        </div>
      </div>

      {/* Toolbar */}
      <div style={{ padding: '16px 28px', background: '#f7f7f5', borderBottom: '1px solid #eef0f4', display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
        <div style={{ position: 'relative', flex: '0 0 260px' }}>
          <Search size={13} style={{ position: 'absolute', left: 9, top: '50%', transform: 'translateY(-50%)', color: '#9ca3af' }} />
          <input style={{ ...inp, paddingLeft: 28 }} value={search} onChange={e => setSearch(e.target.value)} placeholder="Search..." />
        </div>

        <button style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 12px', background: '#fff', border: '1px solid #e5e7eb', borderRadius: 7, cursor: 'pointer', fontSize: 12, fontWeight: 600 }}>
          <Filter size={14} /> Status
        </button>

        <button style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 12px', background: '#fff', border: '1px solid #e5e7eb', borderRadius: 7, cursor: 'pointer', fontSize: 12, fontWeight: 600 }}>
          <ArrowUpDown size={14} /> Sort
        </button>

        <button style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 12px', background: '#fff', border: '1px solid #e5e7eb', borderRadius: 7, cursor: 'pointer', fontSize: 12, fontWeight: 600 }}>
          <Grid3x3 size={14} /> Group
        </button>

        <button
          onClick={() => setColumnSettingsOpen(true)}
          style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 12px', background: '#fff', border: '1px solid #e5e7eb', borderRadius: 7, cursor: 'pointer', fontSize: 12, fontWeight: 600 }}
        >
          <Settings size={14} /> Columns
        </button>

        <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
          <button style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 12px', background: '#fff', border: '1px solid #e5e7eb', borderRadius: 7, cursor: 'pointer', fontSize: 12, fontWeight: 600 }}>
            <Printer size={14} /> Print
          </button>
          <button style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 12px', background: '#fff', border: '1px solid #e5e7eb', borderRadius: 7, cursor: 'pointer', fontSize: 12, fontWeight: 600 }}>
            <Download size={14} /> Export
          </button>
        </div>
      </div>

      {/* Content */}
      <div style={{ flex: 1, overflow: 'auto', padding: '20px 28px' }}>
        {loading ? (
          <div style={{ padding: 40, textAlign: 'center', color: '#9ca3af' }}>Loading...</div>
        ) : activeTab === 'create' ? (
          <>
            <div style={card}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ background: '#fafafa' }}>
                    <th style={{ textAlign: 'left', padding: '9px 12px', fontSize: 10, color: '#9ca3af', textTransform: 'uppercase', width: 40 }}>
                      <input type="checkbox" onChange={e => toggleAllQueues(e.target.checked)} checked={filteredQueues.length > 0 && filteredQueues.every(q => selected[q.id])} />
                    </th>
                    <th style={{ textAlign: 'left', padding: '9px 12px', fontSize: 10, color: '#9ca3af', textTransform: 'uppercase' }}>Q#</th>
                    <th style={{ textAlign: 'left', padding: '9px 12px', fontSize: 10, color: '#9ca3af', textTransform: 'uppercase' }}>Style / PO</th>
                    <th style={{ textAlign: 'left', padding: '9px 12px', fontSize: 10, color: '#9ca3af', textTransform: 'uppercase' }}>Buyer</th>
                    <th style={{ textAlign: 'right', padding: '9px 12px', fontSize: 10, color: '#9ca3af', textTransform: 'uppercase' }}>Balance</th>
                    <th style={{ textAlign: 'left', padding: '9px 12px', fontSize: 10, color: '#9ca3af', textTransform: 'uppercase' }}>Status</th>
                    <th style={{ textAlign: 'left', padding: '9px 12px', fontSize: 10, color: '#9ca3af', textTransform: 'uppercase' }}>Port Loading</th>
                    <th style={{ textAlign: 'left', padding: '9px 12px', fontSize: 10, color: '#9ca3af', textTransform: 'uppercase' }}>Destination</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredQueues.map(q => {
                    const ord = orderMap[q.order_id] || {}
                    return (
                      <tr key={q.id} style={{ background: selected[q.id] ? '#f0f7ff' : '#fff' }}>
                        <td style={{ padding: '10px 12px', borderBottom: '1px solid #f5f5f3', textAlign: 'center' }}>
                          <input type="checkbox" checked={selected[q.id] || false} onChange={() => toggleQueueSelect(q.id)} />
                        </td>
                        <td style={{ padding: '10px 12px', borderBottom: '1px solid #f5f5f3', fontWeight: 700 }}>{q.q_number || '—'}</td>
                        <td style={{ padding: '10px 12px', borderBottom: '1px solid #f5f5f3' }}>
                          <div style={{ fontWeight: 700 }}>{ord.style_number || '—'}</div>
                          <div style={{ fontSize: 11, color: '#6b7280' }}>{ord.po_number || '—'}</div>
                        </td>
                        <td style={{ padding: '10px 12px', borderBottom: '1px solid #f5f5f3' }}>{ord.buyer_name || '—'}</td>
                        <td style={{ padding: '10px 12px', borderBottom: '1px solid #f5f5f3', textAlign: 'right', fontFamily: 'monospace', fontWeight: 700 }}>{(q.qty || 0).toLocaleString()}</td>
                        <td style={{ padding: '10px 12px', borderBottom: '1px solid #f5f5f3' }}>
                          <span style={{ background: q.status === 'Active' ? '#dcfce7' : '#f3f4f6', color: q.status === 'Active' ? '#166534' : '#374151', padding: '2px 8px', borderRadius: 4, fontSize: 10, fontWeight: 700 }}>
                            {q.status || 'Draft'}
                          </span>
                        </td>
                        <td style={{ padding: '10px 12px', borderBottom: '1px solid #f5f5f3', fontSize: 12 }}>{ord.port_of_loading || '—'}</td>
                        <td style={{ padding: '10px 12px', borderBottom: '1px solid #f5f5f3', fontSize: 12 }}>{ord.destination_port || '—'}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>

            {Object.keys(selected).length > 0 && (
              <SelectionPanel
                tab="create"
                selected={selected}
                queues={filteredQueues}
                orders={orders}
                onCreateShipment={handleCreateShipment}
                onCancel={() => setSelected({})}
              />
            )}
          </>
        ) : (
          <div style={card}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ background: '#fafafa' }}>
                  <th style={{ textAlign: 'left', padding: '9px 12px', fontSize: 10, color: '#9ca3af', textTransform: 'uppercase' }}>Shipment #</th>
                  <th style={{ textAlign: 'left', padding: '9px 12px', fontSize: 10, color: '#9ca3af', textTransform: 'uppercase' }}>Style / PO</th>
                  <th style={{ textAlign: 'left', padding: '9px 12px', fontSize: 10, color: '#9ca3af', textTransform: 'uppercase' }}>Buyer</th>
                  <th style={{ textAlign: 'right', padding: '9px 12px', fontSize: 10, color: '#9ca3af', textTransform: 'uppercase' }}>Qty</th>
                  <th style={{ textAlign: 'left', padding: '9px 12px', fontSize: 10, color: '#9ca3af', textTransform: 'uppercase' }}>Ports</th>
                  <th style={{ textAlign: 'left', padding: '9px 12px', fontSize: 10, color: '#9ca3af', textTransform: 'uppercase' }}>ETD</th>
                  <th style={{ textAlign: 'center', padding: '9px 12px', fontSize: 10, color: '#9ca3af', textTransform: 'uppercase' }}>Days</th>
                  <th style={{ textAlign: 'left', padding: '9px 12px', fontSize: 10, color: '#9ca3af', textTransform: 'uppercase' }}>ETA</th>
                  <th style={{ textAlign: 'left', padding: '9px 12px', fontSize: 10, color: '#9ca3af', textTransform: 'uppercase' }}>Status</th>
                  <th style={{ textAlign: 'left', padding: '9px 12px', fontSize: 10, color: '#9ca3af', textTransform: 'uppercase' }}>Action</th>
                </tr>
              </thead>
              <tbody>
                {filteredShipments.map(s => {
                  const lines = shipmentLines.filter(l => l.shipment_id === s.id)
                  const orderId = lines[0]?.order_id
                  const ord = orderMap[orderId] || {}
                  const totalQty = lines.reduce((sum, l) => sum + (l.ship_qty || 0), 0)
                  const daysToEtd = calcDaysTo(s.etd)

                  return (
                    <tr key={s.id}>
                      <td style={{ padding: '10px 12px', borderBottom: '1px solid #f5f5f3', fontFamily: 'monospace', fontWeight: 800 }}>{s.shipment_no}</td>
                      <td style={{ padding: '10px 12px', borderBottom: '1px solid #f5f5f3' }}>
                        <div style={{ fontWeight: 700 }}>{ord.style_number || '—'}</div>
                        <div style={{ fontSize: 11, color: '#6b7280' }}>{ord.po_number || '—'}</div>
                      </td>
                      <td style={{ padding: '10px 12px', borderBottom: '1px solid #f5f5f3' }}>{ord.buyer_name || '—'}</td>
                      <td style={{ padding: '10px 12px', borderBottom: '1px solid #f5f5f3', textAlign: 'right', fontFamily: 'monospace', fontWeight: 700 }}>{totalQty.toLocaleString()}</td>
                      <td style={{ padding: '10px 12px', borderBottom: '1px solid #f5f5f3', fontSize: 12 }}>
                        <div>{s.port_loading || '—'}</div>
                        <div style={{ color: '#6b7280' }}>→ {s.port_destination || '—'}</div>
                      </td>
                      <td style={{ padding: '10px 12px', borderBottom: '1px solid #f5f5f3' }}>{fmtDate(s.etd)}</td>
                      <td style={{ padding: '10px 12px', borderBottom: '1px solid #f5f5f3', textAlign: 'center', fontWeight: 700, color: getDaysToColor(daysToEtd) }}>
                        {getDaysLabel(daysToEtd)}
                      </td>
                      <td style={{ padding: '10px 12px', borderBottom: '1px solid #f5f5f3' }}>{fmtDate(s.eta)}</td>
                      <td style={{ padding: '10px 12px', borderBottom: '1px solid #f5f5f3' }}>
                        <span style={{ background: s.status === 'Created' ? '#dbeafe' : s.status === 'In Transit' ? '#fef08a' : '#dcfce7', color: s.status === 'Created' ? '#0c4a6e' : s.status === 'In Transit' ? '#713f12' : '#166534', padding: '2px 8px', borderRadius: 4, fontSize: 10, fontWeight: 700 }}>
                          {s.status || 'Created'}
                        </span>
                      </td>
                      <td style={{ padding: '10px 12px', borderBottom: '1px solid #f5f5f3', display: 'flex', gap: 6 }}>
                        <button style={{ padding: '4px 8px', background: '#fff', border: '1px solid #e5e7eb', borderRadius: 5, cursor: 'pointer', fontSize: 10, fontWeight: 600 }}>
                          <Printer size={12} />
                        </button>
                        <button style={{ padding: '4px 8px', background: '#fff', border: '1px solid #e5e7eb', borderRadius: 5, cursor: 'pointer', fontSize: 10, fontWeight: 600 }}>
                          ⋯
                        </button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

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
