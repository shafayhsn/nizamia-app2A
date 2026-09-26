import React, { useState, useEffect } from 'react'
import { supabase } from '../../../lib/supabase'
import { CheckCircle, AlertCircle, Clock, Printer, ChevronRight } from 'lucide-react'

function formatDate(d) {
  if (!d) return '—'
  return new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
}

function SectionCard({ title, status, stepNum, onEdit, children }) {
  const color = status === 'done' ? '#16a34a' : status === 'warn' ? '#f59e0b' : '#e5e7eb'
  const Icon  = status === 'done' ? CheckCircle : status === 'warn' ? AlertCircle : Clock
  return (
    <div style={{ background: '#fff', border: '1px solid #e8e8e6', borderRadius: 8, marginBottom: 12, overflow: 'hidden' }}>
      <div style={{ display: 'flex', alignItems: 'center', padding: '10px 14px', borderBottom: status === 'done' ? 'none' : '1px solid #f5f5f3', background: status === 'done' ? '#f0fdf4' : status === 'warn' ? '#fffbeb' : '#fafaf8' }}>
        <Icon size={14} color={color} strokeWidth={2} style={{ flexShrink: 0 }} />
        <span style={{ fontSize: 12, fontWeight: 700, marginLeft: 8, flex: 1, color: status === 'done' ? '#15803d' : status === 'warn' ? '#92400e' : '#9ca3af' }}>
          {title}
        </span>
        {onEdit && (
          <button onClick={onEdit} style={{ fontSize: 11, color: '#2563eb', background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 3, padding: '2px 6px', borderRadius: 4 }}
            onMouseEnter={e => e.currentTarget.style.background='#eff6ff'}
            onMouseLeave={e => e.currentTarget.style.background='none'}
          >
            Edit <ChevronRight size={11} />
          </button>
        )}
      </div>
      {children && (
        <div style={{ padding: '10px 14px' }}>
          {children}
        </div>
      )}
    </div>
  )
}

function KV({ label, value }) {
  return (
    <div style={{ display: 'flex', gap: 8, marginBottom: 5, fontSize: 12 }}>
      <span style={{ color: '#9ca3af', minWidth: 110, flexShrink: 0 }}>{label}</span>
      <span style={{ fontWeight: 600, color: '#1a1a2e' }}>{value || '—'}</span>
    </div>
  )
}

export default function Step10Finalize({ orderId, orderData, onSaved, setStep }) {
  const [order,      setOrder]      = useState(orderData || {})
  const [sizeGroups, setSizeGroups] = useState([])
  const [bomItems,   setBomItems]   = useState([])
  const [processes,  setProcesses]  = useState([])
  const [samples,    setSamples]    = useState([])
  const [confirming, setConfirming] = useState(false)

  useEffect(() => { if (orderId) loadAll() }, [orderId])

  async function loadAll() {
    const [ord, sg, bom, proc, samp] = await Promise.all([
      supabase.from('orders').select('*').eq('id', orderId).single(),
      supabase.from('size_groups').select('*').eq('order_id', orderId).order('sort_order'),
      supabase.from('bom_items').select('*').eq('order_id', orderId).order('sort_order'),
      supabase.from('order_processes').select('*').eq('order_id', orderId).order('sort_order'),
      supabase.from('samples').select('*').eq('order_id', orderId).order('created_at'),
    ])
    if (ord.data) setOrder(ord.data)
    setSizeGroups(sg.data || [])
    setBomItems(bom.data || [])
    setProcesses(proc.data || [])
    setSamples(samp.data || [])
  }

  const totalQty = sizeGroups.reduce((s, g) => {
    // approximate from groups — real total requires breakdown sum
    return s
  }, 0)

  const steps = [
    { num: 1, label: 'General Info',  done: !!order.style_number && !!order.buyer_name, required: true },
    { num: 2, label: 'PO Matrix',     done: !!order.step_po_matrix, required: true },
    { num: 3, label: 'BOM',           done: !!order.step_bom, required: true },
    { num: 4, label: 'Fitting',       done: !!order.step_fitting, required: false },
    { num: 5, label: 'Sampling',      done: !!order.step_sampling, required: false },
    { num: 6, label: 'Washing',       done: !!order.step_washing, required: false },
    { num: 7, label: 'Embellishment', done: !!order.step_embellishment, required: false },
    { num: 8, label: 'Finishing',     done: !!order.step_finishing, required: false },
    { num: 9, label: 'Processes',     done: !!order.step_processes, required: false },
  ]

  const requiredDone  = steps.filter(s => s.required).every(s => s.done)
  const isConfirmed   = order.status === 'Confirmed'
  const bomFabrics    = bomItems.filter(i => i.category === 'Fabric')
  const bomStitching  = bomItems.filter(i => i.category === 'Stitching Trim')
  const bomPacking    = bomItems.filter(i => i.category === 'Packing Trim')

  const handleConfirm = async () => {
    if (!requiredDone) return
    setConfirming(true)
    await supabase.from('orders').update({ status: 'Confirmed' }).eq('id', orderId)
    setOrder(o => ({ ...o, status: 'Confirmed' }))
    onSaved(orderId, { status: 'Confirmed' })
    setConfirming(false)
  }

  const row = { fontSize: 12, display: 'flex', justifyContent: 'space-between', padding: '3px 0', borderBottom: '1px solid #f5f5f3' }
  const tag = { display: 'inline-block', fontSize: 10, fontWeight: 600, padding: '2px 7px', borderRadius: 4, background: '#f0f0ee', color: '#374151', margin: '2px 3px 2px 0' }

  return (
    <div>
      {/* Warning bar */}
      {!requiredDone && !isConfirmed && (
        <div style={{ background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 7, padding: '10px 16px', marginBottom: 20, display: 'flex', alignItems: 'center', gap: 10 }}>
          <AlertCircle size={14} color="#d97706" />
          <span style={{ fontSize: 12, color: '#92400e', fontWeight: 500 }}>
            Complete all required steps before confirming this order.
          </span>
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 280px', gap: 24, alignItems: 'start' }}>

        {/* ── Left: order detail cards ── */}
        <div>

          {/* General Info */}
          <SectionCard title="General Info" status={steps[0].done ? 'done' : 'warn'} onEdit={() => setStep?.(1)}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 16px' }}>
              <KV label="Job Number"   value={order.job_number} />
              <KV label="Buyer"        value={order.buyer_name} />
              <KV label="Style"        value={order.style_number} />
              <KV label="Season"       value={order.season} />
              <KV label="Description" value={order.description} />
              <KV label="PO Number"   value={order.po_number} />
              <KV label="PO Date"     value={formatDate(order.po_date)} />
              <KV label="Merchandiser" value={order.merchandiser_name} />
              <KV label="Ex-Factory"  value={formatDate(order.ship_date)} />
              <KV label="In-Store"    value={formatDate(order.in_store_date)} />
              <KV label="Ship Mode"   value={order.ship_mode} />
              <KV label="Incoterms"   value={order.incoterms} />
              <KV label="Port of Loading"   value={order.port_of_loading} />
              <KV label="Port of Discharge" value={order.port_of_discharge} />
            </div>
            {order.style_image_base64 && (
              <div style={{ marginTop: 10 }}>
                <img src={order.style_image_base64} alt="Style" style={{ height: 80, borderRadius: 6, border: '1px solid #e5e7eb' }} />
              </div>
            )}
          </SectionCard>

          {/* PO Matrix */}
          <SectionCard title="PO Matrix" status={steps[1].done ? 'done' : 'warn'} onEdit={() => setStep?.(2)}>
            {sizeGroups.length === 0 ? (
              <span style={{ fontSize: 12, color: '#9ca3af' }}>No size groups saved yet.</span>
            ) : sizeGroups.map(g => (
              <div key={g.id} style={{ marginBottom: 8 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 3 }}>
                  {g.group_name} — {g.currency} {g.unit_price || '—'}/pc
                </div>
                <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                  {(g.sizes || []).map(sz => (
                    <span key={sz} style={{ ...tag, background: sz === g.base_size ? '#1a1a2e' : '#f0f0ee', color: sz === g.base_size ? '#fff' : '#374151' }}>
                      {sz}{sz === g.base_size ? ' ★' : ''}
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </SectionCard>

          {/* BOM */}
          <SectionCard title={`BOM — ${bomItems.length} item${bomItems.length !== 1 ? 's' : ''}`} status={steps[2].done ? 'done' : 'warn'} onEdit={() => setStep?.(3)}>
            {[['Fabrics', bomFabrics], ['Stitching Trims', bomStitching], ['Packing Trims', bomPacking]].map(([label, list]) => (
              list.length > 0 && (
                <div key={label} style={{ marginBottom: 10 }}>
                  <div style={{ fontSize: 10, fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.6px', marginBottom: 4 }}>{label}</div>
                  {list.map(i => (
                    <div key={i.id} style={row}>
                      <span style={{ color: '#374151' }}>{i.name}{i.specification ? ` · ${i.specification}` : ''}</span>
                      <span style={{ color: '#9ca3af', fontFamily: 'monospace', fontSize: 11 }}>
                        {i.base_qty ? `${i.base_qty} ${i.unit} +${i.wastage}%` : i.unit}
                      </span>
                    </div>
                  ))}
                </div>
              )
            ))}
          </SectionCard>

          {/* Optional steps summary row */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>

            {/* Processes */}
            <SectionCard title={`Processes${processes.length ? ` (${processes.length})` : ''}`} status={processes.length > 0 ? 'done' : 'idle'} onEdit={() => setStep?.(9)}>
              {processes.length > 0 ? (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 3 }}>
                  {processes.map(p => (
                    <span key={p.id} style={{ ...tag, background: p.is_custom ? '#fffbeb' : '#f0f0ee', color: p.is_custom ? '#92400e' : '#374151' }}>
                      {p.process_name}
                    </span>
                  ))}
                </div>
              ) : <span style={{ fontSize: 12, color: '#9ca3af' }}>None added</span>}
            </SectionCard>

            {/* Samples */}
            <SectionCard title={`Samples${samples.length ? ` (${samples.length})` : ''}`} status={samples.length > 0 ? 'done' : 'idle'} onEdit={() => setStep?.(5)}>
              {samples.length > 0 ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  {samples.slice(0, 4).map(s => (
                    <div key={s.id} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11 }}>
                      <span style={{ fontFamily: 'monospace', fontWeight: 600 }}>{s.sample_number}</span>
                      <span style={{ color: '#9ca3af' }}>{s.sample_type} · {s.status}</span>
                    </div>
                  ))}
                  {samples.length > 4 && <span style={{ fontSize: 10, color: '#9ca3af' }}>+{samples.length - 4} more</span>}
                </div>
              ) : <span style={{ fontSize: 12, color: '#9ca3af' }}>No samples requested</span>}
            </SectionCard>

          </div>

          {/* Notes */}
          {order.notes && (
            <div style={{ background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 8, padding: '10px 14px', marginTop: 12 }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: '#92400e', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 4 }}>Order Notes</div>
              <div style={{ fontSize: 12, color: '#374151' }}>{order.notes}</div>
            </div>
          )}
        </div>

        {/* ── Right: completion status + confirm ── */}
        <div style={{ position: 'sticky', top: 0 }}>
          <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 12 }}>Completion Status</div>
          <div style={{ background: '#fff', border: '1px solid #e8e8e6', borderRadius: 8, overflow: 'hidden', marginBottom: 16 }}>
            {steps.map((s, idx) => (
              <div key={s.num} style={{
                display: 'flex', alignItems: 'center', gap: 8, padding: '9px 14px',
                borderBottom: idx < steps.length - 1 ? '1px solid #f5f5f3' : 'none',
              }}>
                {s.done
                  ? <CheckCircle size={13} color="#16a34a" strokeWidth={2} />
                  : s.required
                    ? <AlertCircle size={13} color="#f59e0b" strokeWidth={2} />
                    : <Clock size={13} color="#d1d5db" strokeWidth={2} />
                }
                <span style={{ flex: 1, fontSize: 12, color: s.done ? '#15803d' : s.required ? '#92400e' : '#9ca3af', fontWeight: s.done ? 600 : 400 }}>
                  {s.label}
                </span>
                {!s.required && !s.done && (
                  <span style={{ fontSize: 9, color: '#d1d5db', fontWeight: 600, textTransform: 'uppercase' }}>opt</span>
                )}
              </div>
            ))}
          </div>

          {isConfirmed ? (
            <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 8, padding: '16px', textAlign: 'center' }}>
              <CheckCircle size={22} color="#16a34a" style={{ marginBottom: 8 }} />
              <div style={{ fontSize: 13, fontWeight: 700, color: '#15803d' }}>Order Confirmed</div>
              <div style={{ fontSize: 11, color: '#16a34a', marginTop: 4 }}>This order is locked</div>
            </div>
          ) : (
            <button
              style={{
                width: '100%', height: 42, borderRadius: 8, border: 'none',
                background: requiredDone ? '#1a1a2e' : '#e5e7eb',
                color: requiredDone ? '#fff' : '#9ca3af',
                fontSize: 13, fontWeight: 700, fontFamily: 'Inter,sans-serif',
                cursor: requiredDone ? 'pointer' : 'not-allowed',
                transition: 'background 0.15s',
              }}
              onClick={handleConfirm}
              disabled={!requiredDone || confirming}
            >
              {confirming ? 'Confirming...' : 'Confirm Order'}
            </button>
          )}

          {!requiredDone && (
            <div style={{ fontSize: 11, color: '#f59e0b', marginTop: 8, textAlign: 'center' }}>
              Complete required steps to confirm
            </div>
          )}

          {/* Print button */}
          {isConfirmed && (
            <button className="btn btn-secondary" style={{ width: '100%', marginTop: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
              <Printer size={13} /> Print Order Sheet
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
