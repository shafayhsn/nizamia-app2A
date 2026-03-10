import React, { useState, useEffect } from 'react'
import { supabase } from '../../../lib/supabase'
import { formatDate, formatCurrency } from '../../../lib/utils'
import { CheckCircle, AlertCircle, Edit2 } from 'lucide-react'

export default function Step10Finalize({ orderId, orderData, onSaved }) {
  const [order, setOrder] = useState(orderData || {})
  const [sizeGroups, setSizeGroups] = useState([])
  const [bomItems, setBomItems] = useState([])
  const [processes, setProcesses] = useState([])
  const [confirming, setConfirming] = useState(false)

  useEffect(() => { if (orderId) loadAll() }, [orderId])

  async function loadAll() {
    const [ord, sg, bom, proc] = await Promise.all([
      supabase.from('orders').select('*').eq('id', orderId).single(),
      supabase.from('size_groups').select('*').eq('order_id', orderId),
      supabase.from('bom_items').select('*').eq('order_id', orderId),
      supabase.from('order_processes').select('*').eq('order_id', orderId),
    ])
    if (ord.data) setOrder(ord.data)
    setSizeGroups(sg.data || [])
    setBomItems(bom.data || [])
    setProcesses(proc.data || [])
  }

  const steps = [
    { label: 'General Info', done: !!order.style_number, key: 1 },
    { label: 'PO Matrix', done: !!order.step_po_matrix, key: 2 },
    { label: 'BOM', done: !!order.step_bom, key: 3 },
    { label: 'Fitting', done: !!order.step_fitting, optional: true, key: 4 },
    { label: 'Sampling', done: !!order.step_sampling, optional: true, key: 5 },
    { label: 'Washing', done: !!order.step_washing, optional: true, key: 6 },
    { label: 'Embellishment', done: !!order.step_embellishment, optional: true, key: 7 },
    { label: 'Finishing', done: !!order.step_finishing, optional: true, key: 8 },
    { label: 'Processes', done: !!order.step_processes, optional: true, key: 9 },
  ]

  const requiredDone = steps.filter(s => !s.optional).every(s => s.done)

  const handleConfirm = async () => {
    setConfirming(true)
    await supabase.from('orders').update({ status: 'Confirmed' }).eq('id', orderId)
    setOrder(o => ({ ...o, status: 'Confirmed' }))
    onSaved(orderId, { status: 'Confirmed' })
    setConfirming(false)
  }

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 280px', gap: 24 }}>
      {/* Main summary */}
      <div>
        <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 16 }}>Order Summary</div>

        {/* Order info */}
        <div className="card card-pad" style={{ marginBottom: 16 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, fontSize: 12 }}>
            <div><span style={{ color: 'var(--text-light)' }}>Job:</span> <strong>{order.job_number || '—'}</strong></div>
            <div><span style={{ color: 'var(--text-light)' }}>Buyer:</span> <strong>{order.buyer_name || '—'}</strong></div>
            <div><span style={{ color: 'var(--text-light)' }}>Style:</span> <strong>{order.style_number || '—'}</strong></div>
            <div><span style={{ color: 'var(--text-light)' }}>Season:</span> <strong>{order.season || '—'}</strong></div>
            <div><span style={{ color: 'var(--text-light)' }}>PO No:</span> <strong>{order.po_number || '—'}</strong></div>
            <div><span style={{ color: 'var(--text-light)' }}>Ex-Factory:</span> <strong>{formatDate(order.ship_date)}</strong></div>
            <div><span style={{ color: 'var(--text-light)' }}>Ship Mode:</span> <strong>{order.ship_mode || '—'}</strong></div>
            <div><span style={{ color: 'var(--text-light)' }}>Incoterms:</span> <strong>{order.incoterms || '—'}</strong></div>
          </div>
        </div>

        {/* BOM summary */}
        {bomItems.length > 0 && (
          <div className="card" style={{ marginBottom: 16 }}>
            <div style={{ padding: '10px 14px', borderBottom: '1px solid var(--border)', fontSize: 12, fontWeight: 600 }}>BOM — {bomItems.length} items</div>
            <div style={{ padding: '8px 14px' }}>
              {['Fabric','Stitching Trim','Packing Trim'].map(cat => {
                const catItems = bomItems.filter(i => i.category === cat)
                if (!catItems.length) return null
                return (
                  <div key={cat} style={{ marginBottom: 8 }}>
                    <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-light)', textTransform: 'uppercase', letterSpacing: '0.8px', marginBottom: 4 }}>{cat}</div>
                    {catItems.map(i => (
                      <div key={i.id} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, padding: '2px 0' }}>
                        <span>{i.name}</span>
                        <span style={{ color: 'var(--text-mid)', fontFamily: 'monospace', fontSize: 11 }}>
                          {i.base_qty ? `${i.base_qty} ${i.unit} (+${i.wastage}%)` : i.unit}
                        </span>
                      </div>
                    ))}
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* Processes summary */}
        {processes.length > 0 && (
          <div className="card card-pad" style={{ marginBottom: 16 }}>
            <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 8 }}>Processes ({processes.length})</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
              {processes.map(p => (
                <span key={p.id} className="tag" style={{ background: p.is_custom ? '#fffbeb' : undefined }}>{p.process_name}</span>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Right panel - steps + confirm */}
      <div>
        <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 12 }}>Completion Status</div>
        <div className="card card-pad" style={{ marginBottom: 16 }}>
          {steps.map(s => (
            <div key={s.key} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 0', borderBottom: '1px solid #f5f5f3' }}>
              {s.done
                ? <CheckCircle size={14} color="var(--green)" strokeWidth={2} />
                : <AlertCircle size={14} color={s.optional ? 'var(--text-light)' : 'var(--amber)'} strokeWidth={2} />
              }
              <span style={{ flex: 1, fontSize: 12, color: s.done ? 'var(--text)' : s.optional ? 'var(--text-light)' : 'var(--amber)' }}>
                {s.label}
              </span>
              {s.optional && !s.done && <span style={{ fontSize: 10, color: 'var(--text-light)' }}>optional</span>}
            </div>
          ))}
        </div>

        {order.status === 'Confirmed' ? (
          <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 8, padding: '12px 14px', textAlign: 'center' }}>
            <CheckCircle size={20} color="var(--green)" style={{ marginBottom: 6 }} />
            <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--green)' }}>Order Confirmed</div>
          </div>
        ) : (
          <button
            className="btn btn-accent btn-lg"
            style={{ width: '100%' }}
            onClick={handleConfirm}
            disabled={!requiredDone || confirming}
          >
            {confirming ? 'Confirming...' : 'Confirm Order'}
          </button>
        )}
        {!requiredDone && (
          <div style={{ fontSize: 11, color: 'var(--amber)', marginTop: 8, textAlign: 'center' }}>
            Complete required steps to confirm
          </div>
        )}
      </div>
    </div>
  )
}
