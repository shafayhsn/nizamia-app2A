import React, { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import { createParcel, dispatchParcel, loadSamplingStore, updateParcel } from '../lib/samplingStore'
import { FileText, PackageOpen, Plus, Printer, RefreshCw, Truck } from 'lucide-react'
import { useAppDialogs } from '../components/ui/AppDialogs'
import { formatDate } from '../lib/utils'

const card = { background:'#fff', border:'1px solid #ececec', borderRadius:12, boxShadow:'0 1px 2px rgba(0,0,0,.03)' }
const inp = { height:34, padding:'0 10px', border:'1px solid #e5e7eb', borderRadius:8, fontSize:12, width:'100%', boxSizing:'border-box', outline:'none' }
const btn = { height:32, padding:'0 12px', border:'1px solid #e5e7eb', borderRadius:8, background:'#fff', fontSize:12, fontWeight:600, cursor:'pointer' }

function openPrint(html, title, onBlocked) {
  const w = window.open('', '_blank', 'width=1000,height=800')
  if (!w) { onBlocked?.(); return }
  w.document.write(`<!doctype html><html><head><title>${title}</title><style>
    body{font-family:Arial,sans-serif;color:#111;padding:18px}
    h1,h2,h3{margin:0}
    .head{display:flex;justify-content:space-between;align-items:flex-start;border-bottom:2px solid #111;padding-bottom:12px;margin-bottom:14px}
    .muted{color:#666;font-size:12px}
    table{width:100%;border-collapse:collapse;margin-top:10px}
    th,td{border:1px solid #222;padding:6px 7px;font-size:12px;vertical-align:top}
    th{background:#f3f4f6;text-align:left}
    .two{display:grid;grid-template-columns:1fr 1fr;gap:14px}
    .box{border:1px solid #222;padding:10px}
    .section{margin-top:14px}
    .right{text-align:right}
  </style></head><body>${html}</body></html>`)
  w.document.close(); w.focus(); setTimeout(()=>w.print(), 350)
}

function ParcelBuilderModal({ poolRows, onClose, onCreated }) {
  const [selected, setSelected] = useState(poolRows.map(r => r.sampleId))
  const [customItems, setCustomItems] = useState([{ description:'', qty:1, unitValue:1 }])
  const allRows = poolRows.filter(r => selected.includes(r.sampleId))
  const canCreate = allRows.length > 0

  const setCustom = (idx, key, value) => setCustomItems(arr => arr.map((x, i) => i === idx ? { ...x, [key]: value } : x))
  const addCustom = () => setCustomItems(arr => [...arr, { description:'', qty:1, unitValue:1 }])

  return (
    <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,.35)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:400 }}>
      <div style={{ ...card, width:760, padding:18, maxHeight:'88vh', overflow:'auto' }}>
        <div style={{ fontSize:16, fontWeight:800, marginBottom:12 }}>Create Parcel</div>
        <div style={{ fontSize:12, color:'#6b7280', marginBottom:12 }}>A parcel can include multiple SAM# plus custom items like trim cards, wash legs, lab dips or documents.</div>
        <div style={{ fontWeight:700, marginBottom:8 }}>Samples in Parcel</div>
        <div style={{ display:'grid', gap:8 }}>
          {poolRows.map(r => (
            <label key={r.sampleId} style={{ display:'grid', gridTemplateColumns:'20px 1.2fr .9fr .8fr .8fr', gap:10, alignItems:'center', border:'1px solid #ececec', borderRadius:8, padding:'8px 10px' }}>
              <input type="checkbox" checked={selected.includes(r.sampleId)} onChange={e => setSelected(s => e.target.checked ? [...s, r.sampleId] : s.filter(x => x !== r.sampleId))} />
              <div><div style={{ fontWeight:700, fontFamily:'monospace' }}>{r.sample.sample_number}</div><div style={{ fontSize:11, color:'#6b7280' }}>{r.order.style_number || '—'} · {r.order.description || '—'}</div></div>
              <div>{r.sample.sample_type || '—'}</div>
              <div>{r.sample.req_pcs || 0} pcs</div>
              <div>{r.order.buyer_name || '—'}</div>
            </label>
          ))}
        </div>

        <div style={{ fontWeight:700, margin:'14px 0 8px' }}>Custom Items</div>
        <div style={{ display:'grid', gap:8 }}>
          {customItems.map((item, idx) => (
            <div key={idx} style={{ display:'grid', gridTemplateColumns:'1.4fr 90px 110px', gap:8 }}>
              <input style={inp} placeholder="Trim card / wash leg / lab dip / documents..." value={item.description} onChange={e => setCustom(idx, 'description', e.target.value)} />
              <input style={inp} type="number" min="1" value={item.qty} onChange={e => setCustom(idx, 'qty', parseInt(e.target.value || '1'))} />
              <input style={inp} type="number" min="0" step="0.01" value={item.unitValue} onChange={e => setCustom(idx, 'unitValue', parseFloat(e.target.value || '0'))} />
            </div>
          ))}
          <div><button style={btn} onClick={addCustom}><Plus size={13} /> Add Custom Item</button></div>
        </div>

        <div style={{ display:'flex', justifyContent:'flex-end', gap:8, marginTop:14 }}>
          <button style={btn} onClick={onClose}>Cancel</button>
          <button style={{ ...btn, background:canCreate?'#111827':'#e5e7eb', color:canCreate?'#fff':'#9ca3af', borderColor:canCreate?'#111827':'#e5e7eb' }} disabled={!canCreate} onClick={() => onCreated({ items: allRows.map(r => ({ sampleId: r.sampleId })), customItems: customItems.filter(x => x.description?.trim()) })}>Create Parcel</button>
        </div>
      </div>
      <Dialogs />
    </div>
  )
}

export default function Parcels() {
  const { alert, Dialogs } = useAppDialogs()
  const [samples, setSamples] = useState([])
  const [orders, setOrders] = useState([])
  const [buyers, setBuyers] = useState([])
  const [store, setStore] = useState(loadSamplingStore())
  const [creating, setCreating] = useState(false)
  const [active, setActive] = useState(null)

  useEffect(() => { load() }, [])

  async function load() {
    const [{ data: s }, { data: o }, { data: b }] = await Promise.all([
      supabase.from('samples').select('*').order('created_at', { ascending:false }),
      supabase.from('orders').select('*').order('created_at', { ascending:false }),
      supabase.from('buyers').select('*').order('name'),
    ])
    setSamples(s || [])
    setOrders(o || [])
    setBuyers(b || [])
    setStore(loadSamplingStore())
  }

  const sampleMap = useMemo(() => Object.fromEntries(samples.map(s => [s.id, s])), [samples])
  const orderMap = useMemo(() => Object.fromEntries(orders.map(o => [o.id, o])), [orders])
  const buyerMap = useMemo(() => Object.fromEntries(buyers.map(b => [b.id, b])), [buyers])

  const poolRows = useMemo(() => (store.parcelPool || []).map(p => ({ ...p, sample: sampleMap[p.sampleId] || {}, order: orderMap[(sampleMap[p.sampleId] || {}).order_id] || {} })).filter(x => x.sample.id), [store, sampleMap, orderMap])
  const parcels = store.parcels || []

  function patchParcel(parcelId, patch) {
    updateParcel(parcelId, patch)
    setStore(loadSamplingStore())
  }

  function doDispatch(parcel) {
    if (!parcel.courier || !parcel.trackingNo || !parcel.dispatchDate) {
      alert('Courier, tracking no and dispatch date are required.', { title:'Missing Dispatch Details' })
      return
    }
    dispatchParcel(parcel.id)
    setStore(loadSamplingStore())
  }

  function printInvoice(parcel) {
    const firstItem = parcel.items?.[0]
    const firstSample = sampleMap[firstItem?.sampleId] || {}
    const firstOrder = orderMap[firstSample.order_id] || {}
    const buyer = buyerMap[firstOrder.buyer_id] || {}
    const lines = [
      ...(parcel.items || []).map((it, idx) => {
        const s = sampleMap[it.sampleId] || {}
        const o = orderMap[s.order_id] || {}
        return { no: idx + 1, description: `Sample - ${o.style_number || '—'} (${s.sample_type || 'Sample'})`, qty: Number(s.req_pcs || 0), unitValue: 1 }
      }),
      ...(parcel.customItems || []).map((it, idx) => ({ no: (parcel.items?.length || 0) + idx + 1, description: it.description, qty: Number(it.qty || 0), unitValue: Number(it.unitValue || 1) })),
    ]
    const totalQty = lines.reduce((a, x) => a + x.qty, 0)
    const totalValue = lines.reduce((a, x) => a + (x.qty * x.unitValue), 0)
    const html = `
      <div class="head"><div><h1>NON-COMMERCIAL INVOICE</h1><div class="muted">FOR CUSTOM PURPOSE ONLY</div></div><div class="muted">Parcel ${parcel.id}</div></div>
      <div class="two">
        <div class="box"><h3>Shipper</h3><div>Nizamia Apparels</div><div class="muted">Karachi, Pakistan</div></div>
        <div class="box"><h3>Consignee</h3><div>${firstOrder.buyer_name || '—'}</div><div>${buyer.address || buyer.country || '—'}</div><div>${buyer.contact_person || '—'}</div><div>${buyer.phone || '—'}</div></div>
      </div>
      <div class="section"><table><tr><th>Parcel ID</th><td>${parcel.id}</td><th>Courier</th><td>${parcel.courier || '—'}</td></tr><tr><th>Dispatch Date</th><td>${parcel.dispatchDate || '—'}</td><th>Tracking #</th><td>${parcel.trackingNo || '—'}</td></tr></table></div>
      <div class="section"><table><thead><tr><th>#</th><th>Description</th><th>Qty</th><th>Unit Value</th><th>Total</th></tr></thead><tbody>${lines.map(x => `<tr><td>${x.no}</td><td>${x.description}</td><td>${x.qty}</td><td class="right">$${x.unitValue.toFixed(2)}</td><td class="right">$${(x.qty * x.unitValue).toFixed(2)}</td></tr>`).join('')}</tbody><tfoot><tr><th colspan="2" class="right">Total</th><th>${totalQty}</th><th></th><th class="right">$${totalValue.toFixed(2)}</th></tr></tfoot></table></div>
      <div class="section box"><strong>Declaration</strong><div style="margin-top:6px">We hereby declare that the goods described are samples of no commercial value and are being sent for development and approval purposes only.</div></div>
      <div class="section" style="margin-top:28px;display:grid;grid-template-columns:1fr 1fr;gap:32px"><div><div style="border-top:1px solid #111;padding-top:6px">Authorized Signatory</div></div><div><div style="border-top:1px solid #111;padding-top:6px">Courier Acknowledgement</div></div></div>
    `
    openPrint(html, `${parcel.id} Non-Commercial Invoice`, () => alert('Please allow popups to print this document.', { title:'Popup Blocked' }))
  }

  return (
    <div className="page-content" style={{ display:'flex', flexDirection:'column', gap:14 }}>
      <div className="section-header">
        <div>
          <div style={{ fontSize:22, fontWeight:800, color:'#111827' }}>Parcels</div>
          <div style={{ fontSize:13, color:'#6b7280', marginTop:2 }}>Group multiple SAM# together, add custom items, dispatch with courier details and print a non-commercial invoice.</div>
        </div>
        <div style={{ display:'flex', gap:8 }}>
          <button className="btn btn-secondary" onClick={load}><RefreshCw size={14} /> Refresh</button>
          <button className="btn btn-primary" onClick={() => setCreating(true)} disabled={!poolRows.length}><Plus size={14} /> Create Parcel</button>
        </div>
      </div>

      <div style={{ ...card, padding:14 }}>
        <div style={{ fontWeight:800, marginBottom:8 }}>Pending for Parcel</div>
        {poolRows.length === 0 ? <div style={{ color:'#9ca3af', fontSize:12 }}>No SAM# waiting in Parcels.</div> :
          <div style={{ display:'grid', gap:8 }}>{poolRows.map(r => <div key={r.sampleId} style={{ display:'grid', gridTemplateColumns:'1fr 1fr .7fr .7fr', gap:8, border:'1px solid #ececec', borderRadius:8, padding:'8px 10px' }}><div><div style={{ fontWeight:700, fontFamily:'monospace' }}>{r.sample.sample_number}</div><div style={{ fontSize:11, color:'#6b7280' }}>{r.order.style_number || '—'} · {r.order.description || '—'}</div></div><div>{r.order.buyer_name || '—'}</div><div>{r.sample.sample_type || '—'}</div><div>{r.sample.req_pcs || 0} pcs</div></div>)}</div>}
      </div>

      <div style={{ ...card, overflow:'hidden' }}>
        <div className="table-wrap">
          <table>
            <thead><tr><th>Parcel</th><th>Items</th><th>Status</th><th>Courier</th><th>Tracking #</th><th>Dispatch Date</th><th style={{ textAlign:'right' }}>Actions</th></tr></thead>
            <tbody>
              {parcels.map(p => (
                <tr key={p.id}>
                  <td><div style={{ fontWeight:700 }}>{p.id}</div><div style={{ fontSize:11, color:'#9ca3af' }}>{formatDate(p.createdAt)}</div></td>
                  <td>{(p.items?.length || 0)} SAM# + {(p.customItems?.length || 0)} custom</td>
                  <td><span style={{ background:p.status === 'Dispatched' ? '#dcfce7' : '#f3f4f6', color:p.status === 'Dispatched' ? '#166534' : '#4b5563', padding:'4px 8px', borderRadius:999, fontSize:11, fontWeight:700 }}>{p.status}</span></td>
                  <td><input style={{ ...inp, height:30, minWidth:120 }} value={p.courier || ''} onChange={e => patchParcel(p.id, { courier:e.target.value })} placeholder="Courier" /></td>
                  <td><input style={{ ...inp, height:30, minWidth:130 }} value={p.trackingNo || ''} onChange={e => patchParcel(p.id, { trackingNo:e.target.value })} placeholder="Tracking" /></td>
                  <td><input style={{ ...inp, height:30, minWidth:130 }} type="date" value={p.dispatchDate || ''} onChange={e => patchParcel(p.id, { dispatchDate:e.target.value })} /></td>
                  <td>
                    <div style={{ display:'flex', gap:6, justifyContent:'flex-end', flexWrap:'wrap' }}>
                      <button style={btn} onClick={() => setActive(active === p.id ? null : p.id)}><PackageOpen size={13} /> {active === p.id ? 'Hide' : 'View'}</button>
                      <button style={btn} onClick={() => printInvoice(p)}><FileText size={13} /> Parcel Invoice</button>
                      <button style={{ ...btn, background:p.status === 'Dispatched' ? '#e5e7eb' : '#111827', color:p.status === 'Dispatched' ? '#9ca3af' : '#fff', borderColor:p.status === 'Dispatched' ? '#e5e7eb' : '#111827' }} disabled={p.status === 'Dispatched'} onClick={() => doDispatch(p)}><Truck size={13} /> Dispatch</button>
                    </div>
                  </td>
                </tr>
              ))}
              {parcels.length === 0 && <tr><td colSpan={7} style={{ textAlign:'center', padding:'28px 12px', color:'#9ca3af' }}>No parcels created yet.</td></tr>}
            </tbody>
          </table>
        </div>
        {active && (() => {
          const p = parcels.find(x => x.id === active)
          if (!p) return null
          return <div style={{ borderTop:'1px solid #ececec', padding:14, background:'#fafafa' }}>
            <div style={{ fontWeight:800, marginBottom:8 }}>Parcel Contents · {p.id}</div>
            <div style={{ display:'grid', gap:8 }}>
              {(p.items || []).map((it, idx) => {
                const s = sampleMap[it.sampleId] || {}
                const o = orderMap[s.order_id] || {}
                return <div key={idx} style={{ display:'grid', gridTemplateColumns:'1fr 1fr .7fr .7fr', gap:8, border:'1px solid #ececec', background:'#fff', borderRadius:8, padding:'8px 10px' }}><div><div style={{ fontWeight:700, fontFamily:'monospace' }}>{s.sample_number}</div><div style={{ fontSize:11, color:'#6b7280' }}>{o.style_number || '—'} · {o.description || '—'}</div></div><div>{o.buyer_name || '—'}</div><div>{s.sample_type || '—'}</div><div>{s.req_pcs || 0} pcs</div></div>
              })}
              {(p.customItems || []).map((it, idx) => <div key={`c_${idx}`} style={{ display:'grid', gridTemplateColumns:'1fr .7fr .7fr', gap:8, border:'1px dashed #d1d5db', background:'#fff', borderRadius:8, padding:'8px 10px' }}><div>{it.description}</div><div>{it.qty}</div><div>${Number(it.unitValue || 0).toFixed(2)}</div></div>)}
            </div>
          </div>
        })()}
      </div>

      {creating && <ParcelBuilderModal poolRows={poolRows} onClose={() => setCreating(false)} onCreated={(payload) => { createParcel(payload); setCreating(false); setStore(loadSamplingStore()) }} />}
      <Dialogs />
    </div>
  )
}
