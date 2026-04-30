import React, { useState, useEffect, useMemo } from 'react'
import { supabase } from '../lib/supabase'
import { Search, Plus, X, AlertCircle, Settings, GripVertical, Printer, Download } from 'lucide-react'
import { useAppDialogs } from '../components/ui/AppDialogs'

const DEFAULT_SHIPMENT_VISIBLE_COLUMNS = {
  shipment_no: true,
  style_po: true,
  buyer: true,
  qty: true,
  cartons: true,
  cbm: true,
  port_loading: true,
  port_destination: true,
  etd: true,
  eta: true,
  days_to_etd: true,
  status: true,
}

const DEFAULT_SHIPMENT_COLUMN_ORDER = [
  'shipment_no', 'style_po', 'buyer', 'qty', 'cartons', 'cbm',
  'port_loading', 'port_destination', 'etd', 'eta', 'days_to_etd', 'status',
]

const SHIPMENT_COLUMN_LABELS = {
  shipment_no: 'Shipment #',
  style_po: 'Style / PO',
  buyer: 'Buyer',
  qty: 'Qty',
  cartons: 'Cartons',
  cbm: 'CBM',
  port_loading: 'Port Loading',
  port_destination: 'Destination',
  etd: 'ETD',
  eta: 'ETA',
  days_to_etd: 'Days to ETD',
  status: 'Status',
}

const statusColor = { Created: '#3B82F6', 'In Transit': '#F59E0B', Delivered: '#10B981', Partial: '#8B5CF6' }
const statusBg = { Created: '#EFF6FF', 'In Transit': '#FFFBEB', Delivered: '#ECFDF5', Partial: '#F5F3FF' }

function fmtDate(d) {
  if (!d) return '—'
  return new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
}

function calcDaysTo(date) {
  if (!date) return null
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const target = new Date(date)
  target.setHours(0, 0, 0, 0)
  return Math.floor((target - today) / (1000 * 60 * 60 * 24))
}

function getDaysColor(days) {
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

function CreateShipmentModal({ queues, orders, onClose, onDone }) {
  const { confirm } = useAppDialogs()
  const [selected, setSelected] = useState({})
  const [formData, setFormData] = useState({
    port_loading: '',
    port_destination: '',
    cartons_total: '',
    cbm_total: '',
    etd: '',
    eta: '',
    notes: '',
  })
  const [saving, setSaving] = useState(false)

  const orderMap = useMemo(() => Object.fromEntries((orders || []).map(o => [o.id, o])), [orders])
  const selectedQueues = queues.filter(q => selected[q.id])
  const totalQty = selectedQueues.reduce((s, q) => s + (q.qty || 0), 0)

  const handleCreate = async () => {
    if (selectedQueues.length === 0) {
      alert('Select at least 1 queue')
      return
    }
    if (!formData.port_loading || !formData.port_destination) {
      alert('Port of Loading and Destination required')
      return
    }

    setSaving(true)
    try {
      const shipmentNo = `SHP-${Date.now().toString().slice(-6)}`
      const { data: sh, error: se } = await supabase.from('shipments').insert([{
        shipment_no: shipmentNo,
        shipment_date: new Date().toISOString().slice(0, 10),
        port_loading: formData.port_loading,
        port_destination: formData.port_destination,
        cartons_total: parseFloat(formData.cartons_total) || null,
        cbm_total: parseFloat(formData.cbm_total) || null,
        etd: formData.etd || null,
        eta: formData.eta || null,
        notes: formData.notes || null,
        status: 'Created',
      }]).select().single()

      if (se) throw new Error(se.message)

      const lines = selectedQueues.map(q => ({
        shipment_id: sh.id,
        queue_id: q.id,
        order_id: q.order_id,
        ship_qty: q.qty,
      }))

      if (lines.length > 0) {
        const { error: le } = await supabase.from('shipment_lines').insert(lines)
        if (le) throw new Error(le.message)
      }

      onDone()
    } catch (e) {
      alert('Error: ' + e.message)
    }
    setSaving(false)
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 300, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
      <div style={{ background: '#fff', borderRadius: 10, width: 'min(900px, 95vw)', maxHeight: '85vh', overflow: 'hidden', display: 'flex', flexDirection: 'column', boxShadow: '0 20px 60px rgba(0,0,0,0.3)' }}>
        <div style={{ padding: '18px 24px', borderBottom: '1px solid #e5e7eb', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <div style={{ fontSize: 16, fontWeight: 800 }}>Create Shipment</div>
            <div style={{ fontSize: 12, color: '#6b7280', marginTop: 3 }}>Select queues and configure shipping details</div>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer' }}>
            <X size={18} color="#9ca3af" />
          </button>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', flex: 1, overflow: 'hidden' }}>
          {/* Queue selector */}
          <div style={{ overflow: 'auto', borderRight: '1px solid #e5e7eb', padding: 16 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: '#6b7280', marginBottom: 12, textTransform: 'uppercase' }}>Queues ({selectedQueues.length})</div>
            <div style={{ display: 'grid', gap: 8 }}>
              {queues.map(q => {
                const ord = orderMap[q.order_id] || {}
                return (
                  <label key={q.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: 10, border: '1px solid #e5e7eb', borderRadius: 7, cursor: 'pointer', background: selected[q.id] ? '#f0f7ff' : '#fff' }}>
                    <input type="checkbox" checked={selected[q.id] || false} onChange={e => setSelected(p => ({ ...p, [q.id]: e.target.checked ? true : undefined }))} style={{ cursor: 'pointer' }} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 12, fontWeight: 700 }}>Q#{q.q_number} • {ord.style_number || '—'}</div>
                      <div style={{ fontSize: 11, color: '#6b7280', marginTop: 2 }}>{ord.buyer_name || '—'} • {q.qty || 0} pcs</div>
                    </div>
                  </label>
                )
              })}
            </div>
          </div>

          {/* Form */}
          <div style={{ overflow: 'auto', padding: 16, background: '#fafafa' }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: '#6b7280', marginBottom: 12, textTransform: 'uppercase' }}>Shipment Details</div>
            <div style={{ display: 'grid', gap: 12 }}>
              <div>
                <label style={{ fontSize: 11, fontWeight: 700, color: '#6b7280', display: 'block', marginBottom: 4 }}>Port of Loading</label>
                <input style={{ width: '100%', height: 32, padding: '0 10px', border: '1px solid #e5e7eb', borderRadius: 7, fontSize: 12, fontFamily: 'var(--font)', outline: 'none' }} value={formData.port_loading} onChange={e => setFormData(f => ({ ...f, port_loading: e.target.value }))} placeholder="Karachi" />
              </div>
              <div>
                <label style={{ fontSize: 11, fontWeight: 700, color: '#6b7280', display: 'block', marginBottom: 4 }}>Destination Port</label>
                <input style={{ width: '100%', height: 32, padding: '0 10px', border: '1px solid #e5e7eb', borderRadius: 7, fontSize: 12, fontFamily: 'var(--font)', outline: 'none' }} value={formData.port_destination} onChange={e => setFormData(f => ({ ...f, port_destination: e.target.value }))} placeholder="Los Angeles" />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <div>
                  <label style={{ fontSize: 11, fontWeight: 700, color: '#6b7280', display: 'block', marginBottom: 4 }}>ETD</label>
                  <input style={{ width: '100%', height: 32, padding: '0 10px', border: '1px solid #e5e7eb', borderRadius: 7, fontSize: 12, fontFamily: 'var(--font)', outline: 'none' }} type="date" value={formData.etd} onChange={e => setFormData(f => ({ ...f, etd: e.target.value }))} />
                </div>
                <div>
                  <label style={{ fontSize: 11, fontWeight: 700, color: '#6b7280', display: 'block', marginBottom: 4 }}>ETA</label>
                  <input style={{ width: '100%', height: 32, padding: '0 10px', border: '1px solid #e5e7eb', borderRadius: 7, fontSize: 12, fontFamily: 'var(--font)', outline: 'none' }} type="date" value={formData.eta} onChange={e => setFormData(f => ({ ...f, eta: e.target.value }))} />
                </div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <div>
                  <label style={{ fontSize: 11, fontWeight: 700, color: '#6b7280', display: 'block', marginBottom: 4 }}>Cartons</label>
                  <input style={{ width: '100%', height: 32, padding: '0 10px', border: '1px solid #e5e7eb', borderRadius: 7, fontSize: 12, fontFamily: 'var(--font)', outline: 'none' }} type="number" value={formData.cartons_total} onChange={e => setFormData(f => ({ ...f, cartons_total: e.target.value }))} />
                </div>
                <div>
                  <label style={{ fontSize: 11, fontWeight: 700, color: '#6b7280', display: 'block', marginBottom: 4 }}>CBM</label>
                  <input style={{ width: '100%', height: 32, padding: '0 10px', border: '1px solid #e5e7eb', borderRadius: 7, fontSize: 12, fontFamily: 'var(--font)', outline: 'none' }} type="number" step="0.1" value={formData.cbm_total} onChange={e => setFormData(f => ({ ...f, cbm_total: e.target.value }))} />
                </div>
              </div>
              <div>
                <label style={{ fontSize: 11, fontWeight: 700, color: '#6b7280', display: 'block', marginBottom: 4 }}>Notes</label>
                <textarea style={{ width: '100%', height: 60, padding: '8px 10px', border: '1px solid #e5e7eb', borderRadius: 7, fontSize: 12, fontFamily: 'var(--font)', outline: 'none', resize: 'vertical' }} value={formData.notes} onChange={e => setFormData(f => ({ ...f, notes: e.target.value }))} />
              </div>

              <div style={{ borderTop: '1px solid #e5e7eb', paddingTop: 12, marginTop: 12, display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                <button onClick={onClose} style={{ padding: '8px 14px', background: '#fff', border: '1px solid #e5e7eb', borderRadius: 7, cursor: 'pointer', fontSize: 12, fontWeight: 600 }}>Cancel</button>
                <button onClick={handleCreate} disabled={saving || selectedQueues.length === 0} style={{ padding: '8px 14px', background: selectedQueues.length > 0 ? '#2383e2' : '#d1d5db', color: '#fff', border: 'none', borderRadius: 7, cursor: selectedQueues.length > 0 ? 'pointer' : 'default', fontSize: 12, fontWeight: 600 }}>
                  {saving ? 'Creating...' : 'Create Shipment'}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export default function Shipping() {
  const { confirm } = useAppDialogs()
  const [loading, setLoading] = useState(false)
  const [search, setSearch] = useState('')
  const [queues, setQueues] = useState([])
  const [orders, setOrders] = useState([])
  const [shipments, setShipments] = useState([])
  const [shipmentLines, setShipmentLines] = useState([])
  const [visibleColumns, setVisibleColumns] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem('app2a.shipping.columns') || JSON.stringify(DEFAULT_SHIPMENT_VISIBLE_COLUMNS))
    } catch {
      return DEFAULT_SHIPMENT_VISIBLE_COLUMNS
    }
  })
  const [columnOrder, setColumnOrder] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem('app2a.shipping.columnOrder') || JSON.stringify(DEFAULT_SHIPMENT_COLUMN_ORDER))
    } catch {
      return DEFAULT_SHIPMENT_COLUMN_ORDER
    }
  })
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [showColumnSettings, setShowColumnSettings] = useState(false)
  const [draggedCol, setDraggedCol] = useState(null)

  useEffect(() => { load() }, [])

  async function load() {
    setLoading(true)
    const [{ data: qs }, { data: ors }, { data: sh }, { data: sl }] = await Promise.all([
      supabase.from('order_queues').select('*').order('created_at', { ascending: false }),
      supabase.from('orders').select('*'),
      supabase.from('shipments').select('*').order('created_at', { ascending: false }),
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

  // KPI metrics
  const kpis = useMemo(() => ({
    totalQueues: queues.length,
    totalBalance: queues.reduce((s, q) => s + (q.qty || 0), 0),
    totalShipments: shipments.length,
    totalShipped: shipmentLines.reduce((s, l) => s + (l.ship_qty || 0), 0),
  }), [queues, shipments, shipmentLines])

  // Filtered shipments
  const filtered = useMemo(() => {
    return shipments.filter(s => {
      const lines = shipmentLines.filter(l => l.shipment_id === s.id)
      const ord = orderMap[lines[0]?.order_id] || {}
      const hay = `${s.shipment_no} ${ord.style_number} ${ord.buyer_name} ${s.port_loading} ${s.port_destination}`.toLowerCase()
      return hay.includes(search.toLowerCase())
    })
  }, [shipments, search, orderMap, shipmentLines])

  // Build table rows
  const tableRows = useMemo(() => {
    return filtered.map(s => {
      const lines = shipmentLines.filter(l => l.shipment_id === s.id)
      const orderId = lines[0]?.order_id
      const ord = orderMap[orderId] || {}
      const totalQty = lines.reduce((sum, l) => sum + (l.ship_qty || 0), 0)
      const daysToEtd = calcDaysTo(s.etd)

      return {
        id: s.id,
        shipment_no: s.shipment_no,
        style_po: `${ord.style_number || '—'} / ${ord.po_number || '—'}`,
        buyer: ord.buyer_name || '—',
        qty: totalQty,
        cartons: s.cartons_total ? String(s.cartons_total) : '—',
        cbm: s.cbm_total ? String(s.cbm_total) : '—',
        port_loading: s.port_loading || '—',
        port_destination: s.port_destination || '—',
        etd: fmtDate(s.etd),
        eta: fmtDate(s.eta),
        days_to_etd: daysToEtd,
        status: s.status,
        raw: s,
      }
    })
  }, [filtered, orderMap, shipmentLines])

  const visibleCols = columnOrder.filter(c => visibleColumns[c])

  const saveColumns = () => {
    localStorage.setItem('app2a.shipping.columns', JSON.stringify(visibleColumns))
    localStorage.setItem('app2a.shipping.columnOrder', JSON.stringify(columnOrder))
    setShowColumnSettings(false)
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: '#f7f7f5' }}>
      {/* Header + KPIs inline */}
      <div style={{ padding: '28px 28px 0', background: '#fff', borderBottom: '1px solid #eef0f4' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
          <div>
            <h1 style={{ fontSize: 22, fontWeight: 900, margin: 0, color: '#111827' }}>Shipping</h1>
            <p style={{ fontSize: 12, color: '#6b7280', marginTop: 4, margin: 0 }}>Create and track shipments. Manage ports, ETD/ETA, and carton details.</p>
          </div>
          <button onClick={() => setShowCreateModal(true)} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 16px', background: '#111827', color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer', fontSize: 13, fontWeight: 700 }}>
            <Plus size={16} /> New Shipment
          </button>
        </div>

        {/* KPIs inline */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 20 }}>
          <div style={{ padding: 12, background: '#f9fafb', borderRadius: 8 }}>
            <div style={{ fontSize: 10, color: '#9ca3af', textTransform: 'uppercase', fontWeight: 700 }}>Total Queues</div>
            <div style={{ fontSize: 20, fontWeight: 900, marginTop: 4, color: '#111827' }}>{kpis.totalQueues}</div>
          </div>
          <div style={{ padding: 12, background: '#f9fafb', borderRadius: 8 }}>
            <div style={{ fontSize: 10, color: '#9ca3af', textTransform: 'uppercase', fontWeight: 700 }}>Total Balance</div>
            <div style={{ fontSize: 20, fontWeight: 900, marginTop: 4, color: '#111827' }}>{kpis.totalBalance.toLocaleString()}</div>
          </div>
          <div style={{ padding: 12, background: '#f9fafb', borderRadius: 8 }}>
            <div style={{ fontSize: 10, color: '#9ca3af', textTransform: 'uppercase', fontWeight: 700 }}>Shipments Created</div>
            <div style={{ fontSize: 20, fontWeight: 900, marginTop: 4, color: '#111827' }}>{kpis.totalShipments}</div>
          </div>
          <div style={{ padding: 12, background: '#f9fafb', borderRadius: 8 }}>
            <div style={{ fontSize: 10, color: '#9ca3af', textTransform: 'uppercase', fontWeight: 700 }}>Total Shipped</div>
            <div style={{ fontSize: 20, fontWeight: 900, marginTop: 4, color: '#111827' }}>{kpis.totalShipped.toLocaleString()}</div>
          </div>
        </div>
      </div>

      {/* Toolbar */}
      <div style={{ padding: '14px 28px', background: '#f7f7f5', borderBottom: '1px solid #eef0f4', display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
        <div style={{ position: 'relative', flex: '0 0 260px' }}>
          <Search size={13} style={{ position: 'absolute', left: 9, top: '50%', transform: 'translateY(-50%)', color: '#9ca3af' }} />
          <input style={{ width: '100%', height: 32, paddingLeft: 28, border: '1px solid #e5e7eb', borderRadius: 7, fontSize: 12, outline: 'none', boxSizing: 'border-box', fontFamily: 'var(--font)' }} value={search} onChange={e => setSearch(e.target.value)} placeholder="Search shipment..." />
        </div>
        <button onClick={() => setShowColumnSettings(true)} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 12px', background: '#fff', border: '1px solid #e5e7eb', borderRadius: 7, cursor: 'pointer', fontSize: 12, fontWeight: 600, color: '#374151' }}>
          <Settings size={14} /> Columns
        </button>
        <button style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 12px', background: '#fff', border: '1px solid #e5e7eb', borderRadius: 7, cursor: 'pointer', fontSize: 12, fontWeight: 600, color: '#374151' }}>
          <Printer size={14} /> Print
        </button>
        <button style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 12px', background: '#fff', border: '1px solid #e5e7eb', borderRadius: 7, cursor: 'pointer', fontSize: 12, fontWeight: 600, color: '#374151' }}>
          <Download size={14} /> Export
        </button>
      </div>

      {/* Table */}
      <div style={{ flex: 1, overflow: 'auto', padding: '20px 28px', background: '#f7f7f5' }}>
        {loading ? (
          <div style={{ padding: 40, textAlign: 'center', color: '#9ca3af' }}>Loading...</div>
        ) : (
          <div style={{ background: '#fff', borderRadius: 10, overflow: 'hidden', border: '1px solid #e8e8e6' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ background: '#fafafa' }}>
                  {visibleCols.map(colId => (
                    <th key={colId} style={{ textAlign: 'left', padding: '9px 12px', fontSize: 10, color: '#9ca3af', textTransform: 'uppercase', fontWeight: 700, cursor: 'grab' }}>
                      {SHIPMENT_COLUMN_LABELS[colId] || colId}
                    </th>
                  ))}
                  <th style={{ textAlign: 'center', padding: '9px 12px', fontSize: 10, color: '#9ca3af', textTransform: 'uppercase', fontWeight: 700 }}>Action</th>
                </tr>
              </thead>
              <tbody>
                {tableRows.length === 0 ? (
                  <tr>
                    <td colSpan={visibleCols.length + 1} style={{ padding: 24, textAlign: 'center', color: '#9ca3af', fontSize: 12 }}>
                      No shipments yet.
                    </td>
                  </tr>
                ) : (
                  tableRows.map((row, idx) => (
                    <tr key={row.id} style={{ borderBottom: idx < tableRows.length - 1 ? '1px solid #f5f5f3' : 'none' }}>
                      {visibleCols.map(colId => {
                        let val = row[colId]
                        if (colId === 'qty') val = val ? val.toLocaleString() : 0
                        if (colId === 'days_to_etd') {
                          const days = val
                          return (
                            <td key={colId} style={{ padding: '10px 12px', fontSize: 12, color: getDaysColor(days), fontWeight: 700 }}>
                              {getDaysLabel(days)}
                            </td>
                          )
                        }
                        if (colId === 'status') {
                          return (
                            <td key={colId} style={{ padding: '10px 12px', fontSize: 12 }}>
                              <span style={{ background: statusBg[val] || '#f3f4f6', color: statusColor[val] || '#6b7280', padding: '2px 8px', borderRadius: 4, fontSize: 10, fontWeight: 700 }}>
                                {val || 'Created'}
                              </span>
                            </td>
                          )
                        }
                        return <td key={colId} style={{ padding: '10px 12px', fontSize: 12 }}>{val || '—'}</td>
                      })}
                      <td style={{ padding: '10px 12px', textAlign: 'center', display: 'flex', gap: 4, justifyContent: 'center' }}>
                        <button style={{ padding: '4px 6px', background: 'none', border: '1px solid #e5e7eb', borderRadius: 4, cursor: 'pointer', fontSize: 10 }}>
                          <Printer size={12} />
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Create Shipment Modal */}
      {showCreateModal && <CreateShipmentModal queues={queues} orders={orders} onClose={() => setShowCreateModal(false)} onDone={() => { setShowCreateModal(false); load() }} />}

      {/* Column Settings Modal */}
      {showColumnSettings && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 99, display: 'grid', placeItems: 'center' }}>
          <div style={{ background: '#fff', borderRadius: 12, width: 'min(480px, 90vw)', padding: 24, boxShadow: '0 20px 60px rgba(0,0,0,0.3)' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
              <div style={{ fontSize: 16, fontWeight: 800 }}>Column Settings</div>
              <button onClick={() => setShowColumnSettings(false)} style={{ background: 'none', border: 'none', cursor: 'pointer' }}>
                <X size={18} />
              </button>
            </div>

            <div style={{ display: 'grid', gap: 8, marginBottom: 20 }}>
              {DEFAULT_SHIPMENT_COLUMN_ORDER.map(colId => (
                <label key={colId} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0', cursor: 'pointer' }}>
                  <input type="checkbox" checked={visibleColumns[colId] || false} onChange={e => setVisibleColumns(v => ({ ...v, [colId]: e.target.checked }))} style={{ cursor: 'pointer' }} />
                  <span style={{ fontSize: 13, color: '#374151' }}>{SHIPMENT_COLUMN_LABELS[colId]}</span>
                </label>
              ))}
            </div>

            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', borderTop: '1px solid #e5e7eb', paddingTop: 16 }}>
              <button onClick={() => setShowColumnSettings(false)} style={{ padding: '8px 14px', background: '#fff', border: '1px solid #e5e7eb', borderRadius: 7, cursor: 'pointer', fontSize: 12, fontWeight: 600 }}>Close</button>
              <button onClick={saveColumns} style={{ padding: '8px 14px', background: '#2383e2', color: '#fff', border: 'none', borderRadius: 7, cursor: 'pointer', fontSize: 12, fontWeight: 600 }}>Save</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
