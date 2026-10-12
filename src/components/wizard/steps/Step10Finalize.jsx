import React, { useState, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { supabase } from '../../../lib/supabase'
import { CheckCircle, AlertCircle, Clock, Printer, ChevronRight, Copy, X } from 'lucide-react'

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
  const [copyOpen, setCopyOpen] = useState(false)
  const [dependencies, setDependencies] = useState([])
  const [selectedOrders, setSelectedOrders] = useState(new Set())
  const [copySections, setCopySections] = useState(new Set(['bom','fitting','sampling','washing','embellishment','finishing','processes']))
  const [existingByOrder, setExistingByOrder] = useState({})
  const [overwriteExisting, setOverwriteExisting] = useState(false)
  const [copying, setCopying] = useState(false)
  const [copyMessage, setCopyMessage] = useState('')

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

  const SECTION_META = [
    ['bom','BOM','bom_items','step_bom'],
    ['fitting','Fitting','fitting_blocks','step_fitting'],
    ['sampling','Sampling','samples','step_sampling'],
    ['washing','Washing','washing','step_washing'],
    ['embellishment','Embellishment','embellishments','step_embellishment'],
    ['finishing','Finishing','finishing','step_finishing'],
    ['processes','Processes','order_processes','step_processes'],
  ]

  const cleanRow = (row, extraDrop = []) => {
    const drop = new Set(['id','order_id','created_at','updated_at', ...extraDrop])
    return Object.fromEntries(Object.entries(row || {}).filter(([k]) => !drop.has(k)))
  }

  const openCopyToStyle = async () => {
    setCopyMessage('')
    if (!order?.buyer_id || !order?.style_number) return
    const { data, error } = await supabase.from('orders')
      .select('id,store_name,po_number,factory_ref,total_qty,buyer_name,style_number')
      .eq('buyer_id', order.buyer_id).eq('style_number', order.style_number).neq('id', orderId)
      .order('store_name')
    if (error) { setCopyMessage(error.message); return }
    const deps = data || []
    setDependencies(deps)
    setSelectedOrders(new Set(deps.map(x => x.id)))
    const state = {}
    await Promise.all(deps.map(async d => {
      const checks = await Promise.all(SECTION_META.map(async ([key,,table]) => {
        const q = table === 'finishing'
          ? supabase.from(table).select('id', { count:'exact', head:true }).eq('order_id', d.id)
          : supabase.from(table).select('id', { count:'exact', head:true }).eq('order_id', d.id)
        const { count } = await q
        return [key, (count || 0) > 0]
      }))
      state[d.id] = Object.fromEntries(checks)
    }))
    setExistingByOrder(state); setOverwriteExisting(false); setCopyOpen(true)
  }

  const replaceSimpleSection = async (table, sourceOrderId, targetOrderId, extraDrop=[]) => {
    const { data: src, error: readErr } = await supabase.from(table).select('*').eq('order_id', sourceOrderId)
    if (readErr) throw readErr
    const { error: delErr } = await supabase.from(table).delete().eq('order_id', targetOrderId)
    if (delErr) throw delErr
    if (src?.length) {
      const rows = src.map(r => ({ ...cleanRow(r, extraDrop), order_id: targetOrderId }))
      const { error } = await supabase.from(table).insert(rows)
      if (error) throw error
    }
  }

  const copyFinishing = async (targetOrderId) => {
    const { data: src, error } = await supabase.from('finishing').select('*').eq('order_id', orderId).maybeSingle()
    if (error) throw error
    const { data: old } = await supabase.from('finishing').select('id').eq('order_id', targetOrderId).maybeSingle()
    if (old?.id) {
      await supabase.from('finishing_packs').delete().eq('finishing_id', old.id)
      await supabase.from('finishing').delete().eq('id', old.id)
    }
    if (!src) return
    const { data: created, error: insErr } = await supabase.from('finishing').insert([{...cleanRow(src), order_id:targetOrderId}]).select().single()
    if (insErr) throw insErr
    const { data: packs } = await supabase.from('finishing_packs').select('*').eq('finishing_id', src.id).order('sort_order')
    if (packs?.length) {
      const rows = packs.map(x => ({...cleanRow(x,['finishing_id']), finishing_id:created.id, order_id:targetOrderId}))
      const { error: packErr } = await supabase.from('finishing_packs').insert(rows)
      if (packErr) throw packErr
    }
  }

  const executeCopy = async () => {
    if (!selectedOrders.size || !copySections.size) return
    const hasConflicts = [...selectedOrders].some(id => [...copySections].some(sec => existingByOrder[id]?.[sec]))
    if (hasConflicts && !overwriteExisting) {
      setCopyMessage('Some selected orders already contain data in the selected sections. Tick “Replace existing data” to continue.')
      return
    }
    setCopying(true); setCopyMessage('')
    try {
      for (const targetId of selectedOrders) {
        const flags = {}
        for (const sec of copySections) {
          if (sec === 'bom') await replaceSimpleSection('bom_items', orderId, targetId)
          if (sec === 'fitting') await replaceSimpleSection('fitting_blocks', orderId, targetId)
          if (sec === 'sampling') await replaceSimpleSection('samples', orderId, targetId, ['parent_sample_id','root_sample_id','size_group_id','last_comment_at','last_comment_by'])
          if (sec === 'washing') await replaceSimpleSection('washing', orderId, targetId)
          if (sec === 'embellishment') await replaceSimpleSection('embellishments', orderId, targetId)
          if (sec === 'finishing') await copyFinishing(targetId)
          if (sec === 'processes') await replaceSimpleSection('order_processes', orderId, targetId)
          const meta = SECTION_META.find(x => x[0] === sec); if (meta) flags[meta[3]] = true
        }
        if (Object.keys(flags).length) {
          const { error } = await supabase.from('orders').update(flags).eq('id', targetId)
          if (error) throw error
        }
      }
      setCopyMessage(`Copied selected style data to ${selectedOrders.size} order${selectedOrders.size===1?'':'s'}.`)
      setTimeout(()=>setCopyOpen(false), 900)
    } catch (e) { setCopyMessage(e.message || 'Copy failed') }
    finally { setCopying(false) }
  }

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

          <button className="btn btn-secondary" style={{ width:'100%', marginBottom:10, display:'flex', alignItems:'center', justifyContent:'center', gap:6 }} onClick={openCopyToStyle} disabled={!order?.buyer_id || !order?.style_number}>
            <Copy size={13}/> Copy to Style Orders
          </button>

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

      {copyOpen && createPortal(<div style={{position:'fixed',inset:0,zIndex:2000,background:'rgba(15,23,42,.48)',display:'flex',alignItems:'center',justifyContent:'center',padding:24}} onMouseDown={e=>{if(e.target===e.currentTarget)setCopyOpen(false)}}><div style={{width:760,maxWidth:'94vw',maxHeight:'86vh',background:'#fff',borderRadius:12,boxShadow:'0 24px 70px rgba(0,0,0,.28)',display:'flex',flexDirection:'column',overflow:'hidden'}}>
        <div className="modal-header" style={{display:'flex',alignItems:'center',justifyContent:'space-between',padding:'16px 18px',borderBottom:'1px solid #e5e7eb',flexShrink:0}}><div><h3 style={{margin:0}}>Copy Style Data to Other Orders</h3><div style={{fontSize:11,color:'#9ca3af',marginTop:3}}>Source: {order.style_number} · {order.store_name || 'No store'} · PO {order.po_number || '—'}</div></div><button className="btn btn-ghost" onClick={()=>setCopyOpen(false)}><X size={16}/></button></div>
        <div className="modal-body" style={{overflowY:'auto',padding:18,flex:1,minHeight:0}}>
          <div style={{fontSize:11,fontWeight:700,color:'#6b7280',marginBottom:7}}>STYLE ORDERS</div>
          {!dependencies.length ? <div style={{padding:'18px 0',color:'#9ca3af',fontSize:12}}>No other orders found for this Buyer + Style Number.</div> : <div style={{border:'1px solid #e5e7eb',borderRadius:7,overflow:'hidden',marginBottom:18}}>{dependencies.map(d=><label key={d.id} style={{display:'grid',gridTemplateColumns:'24px 1.1fr 1fr 1fr 90px',gap:8,alignItems:'center',padding:'8px 10px',borderBottom:'1px solid #f3f4f6',fontSize:12,cursor:'pointer'}}><input type="checkbox" checked={selectedOrders.has(d.id)} onChange={()=>setSelectedOrders(prev=>{const n=new Set(prev);n.has(d.id)?n.delete(d.id):n.add(d.id);return n})}/><b>{d.store_name||'No store'}</b><span>PO {d.po_number||'—'}</span><span>{d.factory_ref||'—'}</span><span style={{textAlign:'right'}}>{Number(d.total_qty||0).toLocaleString()} pcs</span></label>)}</div>}
          <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:7}}><div style={{fontSize:11,fontWeight:700,color:'#6b7280'}}>WHAT TO COPY</div><button className="btn btn-ghost btn-sm" onClick={()=>setCopySections(new Set(SECTION_META.map(x=>x[0])))}>Select All</button></div>
          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:7,marginBottom:16}}>{SECTION_META.map(([key,label])=><label key={key} style={{display:'flex',gap:8,alignItems:'center',border:'1px solid #e5e7eb',borderRadius:6,padding:'8px 10px',fontSize:12}}><input type="checkbox" checked={copySections.has(key)} onChange={()=>setCopySections(prev=>{const n=new Set(prev);n.has(key)?n.delete(key):n.add(key);return n})}/><span style={{fontWeight:600}}>{label}</span></label>)}</div>
          {[...selectedOrders].some(id=>[...copySections].some(sec=>existingByOrder[id]?.[sec])) && <div style={{background:'#fffbeb',border:'1px solid #fde68a',borderRadius:7,padding:10,marginBottom:12,fontSize:11,color:'#92400e'}}><b>Existing data detected.</b> At least one selected destination already contains one of the selected sections. Existing data will never be overwritten unless you explicitly allow it below.</div>}
          <label style={{display:'flex',gap:8,alignItems:'center',fontSize:12,fontWeight:600}}><input type="checkbox" checked={overwriteExisting} onChange={e=>setOverwriteExisting(e.target.checked)}/> Replace existing data in selected sections where necessary</label>
          {copyMessage && <div style={{marginTop:12,fontSize:12,color:copyMessage.startsWith('Copied')?'#15803d':'#b45309',fontWeight:600}}>{copyMessage}</div>}
        </div>
        <div className="modal-footer" style={{display:'flex',justifyContent:'flex-end',gap:8,padding:'12px 18px',borderTop:'1px solid #e5e7eb',background:'#fff',flexShrink:0}}><button className="btn btn-secondary" onClick={()=>setCopyOpen(false)}>Cancel</button><button className="btn btn-primary" disabled={copying||!selectedOrders.size||!copySections.size} onClick={executeCopy}>{copying?'Copying…':`Copy to ${selectedOrders.size} Order${selectedOrders.size===1?'':'s'}`}</button></div>
      </div></div>, document.body)}
    </div>
  )
}
