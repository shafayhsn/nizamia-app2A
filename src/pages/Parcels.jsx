import useManagedPopup from '../components/ui/useManagedPopup'
import React, { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import { statusBadgeStyle } from '../lib/statusColors'
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

export function ParcelBuilderModal({ poolRows, onClose, onCreated }) {
  const { Dialogs } = useAppDialogs()
  const [selected, setSelected] = useState(poolRows.map(r => r.sampleId))
  const [customItems, setCustomItems] = useState([{ description:'', qty:1, unitValue:1 }])
  const allRows = poolRows.filter(r => selected.includes(r.sampleId))
  const canCreate = allRows.length > 0 || customItems.some(x => x.description?.trim())

  const setCustom = (idx, key, value) => setCustomItems(arr => arr.map((x, i) => i === idx ? { ...x, [key]: value } : x))
  const addCustom = () => setCustomItems(arr => [...arr, { description:'', qty:1, unitValue:1 }])

  const popup = useManagedPopup('Create Parcel', onClose)
  return (
    <div style={{ display:popup.minimized?'none':'flex', position:'fixed', inset:0, background:'rgba(0,0,0,.35)', alignItems:'center', justifyContent:'center', zIndex:400 }}>
      <div style={{ ...card, width:760, padding:18, maxHeight:'88vh', overflow:'auto' }}>
        <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:12}}><div style={{fontSize:16,fontWeight:700}}>Create Parcel</div><div style={{display:'flex',gap:10}}><button type="button" title="Minimize" onClick={popup.minimize} style={{border:0,background:'none',cursor:'pointer',fontSize:20}}>−</button><button type="button" title="Close" onClick={popup.close} style={{border:0,background:'none',cursor:'pointer',fontSize:20}}>×</button></div></div>
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
  const [tab, setTab] = useState('ready')
  const [search, setSearch] = useState('')
  const [selectedSamples, setSelectedSamples] = useState([])

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
  const readySamples = useMemo(() => samples.filter(s => {
    const stage = store.sampleMeta?.[s.id]?.stage || s.stage || ''
    return stage === 'Ready'
  }).map(s => ({ sampleId:s.id, sample:s, order:orderMap[s.order_id] || {}, meta:store.sampleMeta?.[s.id] || {} })), [samples,store,orderMap])
  const availableSamples = useMemo(() => {
    const inParcels = new Set(parcels.flatMap(p => (p.items || []).map(it => it.sampleId)))
    return [...new Map([...readySamples,...poolRows].map(r=>[r.sampleId,r])).values()].filter(r=>!inParcels.has(r.sampleId))
  },[readySamples,poolRows,parcels])
  const shownParcels = parcels.filter(p => (tab === 'dispatched' ? p.status === 'Dispatched' : p.status !== 'Dispatched') && (!search || [p.id,p.courier,p.trackingNo].some(v=>String(v||'').toLowerCase().includes(search.toLowerCase()))))
  const shownSamples = availableSamples.filter(r => !search || [r.sample.sample_number,r.order.buyer_name,r.order.job_number,r.order.style_number,r.sample.sample_type].some(v=>String(v||'').toLowerCase().includes(search.toLowerCase())))

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
    <div style={{display:'flex',flexDirection:'column',height:'100%',background:'#fff'}}>
      <div style={{height:48,borderBottom:'1px solid #e5e7eb',display:'flex',alignItems:'flex-end',padding:'0 24px',gap:28,flexShrink:0}}>
        {[['ready','Ready for Dispatch'],['dispatched','Dispatched Parcels']].map(([key,title])=><button key={key} onClick={()=>{setTab(key);setSelectedSamples([]);setActive(null)}} style={{height:48,border:0,borderBottom:tab===key?'2px solid #111':'2px solid transparent',background:'transparent',fontSize:13,fontWeight:tab===key?700:500,color:tab===key?'#111':'#9ca3af',cursor:'pointer'}}>{title}</button>)}
      </div>
      <div style={{padding:'10px 24px',borderBottom:'1px solid #f3f4f6',display:'flex',alignItems:'center',gap:14,flexShrink:0}}>
        <div className="app-page-title">Parcels</div>
        <div style={{border:'1px solid #e5e7eb',borderRadius:8,padding:'6px 12px',fontSize:12}}>READY <strong>{availableSamples.length}</strong></div>
        <div style={{border:'1px solid #e5e7eb',borderRadius:8,padding:'6px 12px',fontSize:12}}>DISPATCHED <strong>{parcels.filter(p=>p.status==='Dispatched').length}</strong></div>
        <div style={{marginLeft:'auto',display:'flex',gap:8}}><button className="btn btn-secondary" onClick={load}><RefreshCw size={14}/> Refresh</button><button className="btn btn-primary" onClick={()=>setCreating(true)}><Plus size={14}/> Create Parcel</button></div>
      </div>
      <div style={{padding:'8px 24px',borderBottom:'1px solid #f3f4f6',display:'flex',alignItems:'center',gap:8,flexShrink:0}}><input style={{...inp,maxWidth:300}} placeholder="Search Parcels" value={search} onChange={e=>setSearch(e.target.value)}/></div>
      <div className="table-wrap" style={{flex:1,minHeight:0,overflow:'auto',padding:'0 24px'}}>
        {tab==='ready' && <>
          <table style={{width:'100%'}}><thead><tr><th style={{width:34}}><input type="checkbox" checked={shownSamples.length>0&&shownSamples.every(r=>selectedSamples.includes(r.sampleId))} onChange={e=>setSelectedSamples(e.target.checked?shownSamples.map(r=>r.sampleId):[])}/></th><th>SAM # / Ref</th><th>Customer</th><th>Job #</th><th>Style #</th><th>Type / Ver.</th><th>Wash Colour</th><th>Sample Size</th><th>Qty</th><th>Ready Date</th></tr></thead><tbody>
            {shownSamples.map(r=><tr key={r.sampleId}><td><input type="checkbox" checked={selectedSamples.includes(r.sampleId)} onChange={e=>setSelectedSamples(v=>e.target.checked?[...v,r.sampleId]:v.filter(x=>x!==r.sampleId))}/></td><td style={{fontWeight:700}}>{r.sample.sample_number||'—'}</td><td>{r.order.buyer_name||'—'}</td><td>{r.order.job_number||'—'}</td><td>{r.order.style_number||'—'}</td><td>{r.sample.sample_type||'—'} / {r.meta.version||'V1'}</td><td>{r.meta.washColor||r.meta.washColour||'—'}</td><td>{r.meta.sampleSize||'—'}</td><td>{r.sample.req_pcs||0}</td><td>{formatDate(r.sample.stage_dates?.Ready||r.meta.stageDates?.Ready||r.sample.ready_at||r.meta.readyAt)||'—'}</td></tr>)}
            {!shownSamples.length&&<tr><td colSpan={10} style={{textAlign:'center',padding:28,color:'#9ca3af'}}>No samples ready for dispatch. You can still create a parcel with custom items.</td></tr>}
          </tbody></table>
          {parcels.some(p=>p.status!=='Dispatched')&&<div style={{fontWeight:700,fontSize:13,margin:'18px 0 8px'}}>Parcels Awaiting Dispatch</div>}
        </>}
        {(tab==='dispatched'||parcels.some(p=>p.status!=='Dispatched'))&&<table style={{width:'100%'}}><thead><tr><th>Parcel #</th><th>Contents</th><th>Status</th><th>Courier</th><th>Tracking #</th><th>Dispatch Date</th><th>Actions</th></tr></thead><tbody>
          {shownParcels.map(p=><React.Fragment key={p.id}><tr><td style={{fontWeight:700}}>{p.id}</td><td>{p.items?.length||0} SAM# + {p.customItems?.length||0} custom</td><td><span style={statusBadgeStyle(p.status)}>{p.status}</span></td><td>{tab==='ready'?<input style={{...inp,minWidth:110}} value={p.courier||''} onChange={e=>patchParcel(p.id,{courier:e.target.value})}/>:p.courier||'—'}</td><td>{tab==='ready'?<input style={{...inp,minWidth:110}} value={p.trackingNo||''} onChange={e=>patchParcel(p.id,{trackingNo:e.target.value})}/>:p.trackingNo||'—'}</td><td>{tab==='ready'?<input style={{...inp,minWidth:125}} type="date" value={p.dispatchDate||''} onChange={e=>patchParcel(p.id,{dispatchDate:e.target.value})}/>:formatDate(p.dispatchDate)}</td><td><div style={{display:'flex',gap:5,whiteSpace:'nowrap'}}><button style={btn} onClick={()=>setActive(active===p.id?null:p.id)}>View</button><button style={btn} onClick={()=>printInvoice(p)}><FileText size={13}/> Invoice</button>{tab==='ready'&&<button style={btn} onClick={()=>doDispatch(p)}><Truck size={13}/> Dispatch</button>}</div></td></tr>
            {active===p.id&&<tr><td colSpan={7} style={{background:'#f9fafb',padding:14}}><strong>Parcel Contents · {p.id}</strong>{(p.items||[]).map((it,i)=><div key={i}>{sampleMap[it.sampleId]?.sample_number||it.sampleId} · {orderMap[sampleMap[it.sampleId]?.order_id]?.style_number||'—'}</div>)}{(p.customItems||[]).map((it,i)=><div key={'c'+i}>{it.description} · {it.qty} pcs</div>)}</td></tr>}</React.Fragment>)}
          {!shownParcels.length&&<tr><td colSpan={7} style={{textAlign:'center',padding:28,color:'#9ca3af'}}>No parcels in this tab.</td></tr>}
        </tbody></table>}
      </div>
      <div style={{height:34,borderTop:'1px solid #e5e7eb',padding:'8px 24px',fontSize:11,color:'#6b7280',flexShrink:0}}>{tab==='ready'?`${shownSamples.length} READY SAMPLES · ${shownParcels.length} PARCELS AWAITING DISPATCH`:`${shownParcels.length} DISPATCHED PARCELS`}</div>
      {creating && <ParcelBuilderModal poolRows={selectedSamples.length?availableSamples.filter(r=>selectedSamples.includes(r.sampleId)):availableSamples} onClose={() => setCreating(false)} onCreated={(payload) => { createParcel(payload); setCreating(false); setStore(loadSamplingStore()) }} />}
      <Dialogs />
    </div>
  )
}
