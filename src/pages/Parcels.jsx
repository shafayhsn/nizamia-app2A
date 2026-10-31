import { createPortal } from 'react-dom'
import useManagedPopup from '../components/ui/useManagedPopup'
import React, { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import { statusBadgeStyle, statusDisplay } from '../lib/statusColors'
import { loadSamplingStore } from '../lib/samplingStore'
import { FileText, Plus, RefreshCw, Truck, Pencil, Trash2, CheckCheck, ExternalLink, ArrowDownUp, Layers, Settings2, ListFilter } from 'lucide-react'
import { useAppDialogs } from '../components/ui/AppDialogs'
import { formatDate } from '../lib/utils'

const card = { background:'#fff', border:'1px solid #ececec', borderRadius:12, boxShadow:'0 1px 2px rgba(0,0,0,.03)' }
const inp = { height:34, padding:'0 10px', border:'1px solid #e5e7eb', borderRadius:8, fontSize:12, width:'100%', boxSizing:'border-box', outline:'none' }
const btn = { height:32, padding:'0 12px', border:'1px solid #e5e7eb', borderRadius:8, background:'#fff', fontSize:12, fontWeight:600, cursor:'pointer' }

// Match the source fields used in Sampling & Approvals. Older browser metadata is fallback only.
const sampleWashColour = (sample, meta = {}) => {
  const snapshot = Array.isArray(sample.wash_snapshot) ? sample.wash_snapshot : []
  const names = [...new Set(snapshot.map(w => w?.color_name || w?.colour_name || w?.wash_color || w?.wash_colour).filter(Boolean))]
  const colours = Array.isArray(sample.colours) ? sample.colours.filter(Boolean).join(', ') : ''
  return names.join(', ') || colours || sample.wash_color || sample.wash_colour || meta.washColor || meta.washColour || '—'
}
const sampleSizeLabel = (sample, meta = {}) =>
  sample.base_size || (Array.isArray(sample.sizes) ? sample.sizes.filter(Boolean).join(', ') : '') || sample.size || meta.sampleSize || '—'


const TRACKING_STATUSES=['Dispatched','In-Transit','On Hold','Returned','Out for Delivery','Delivered']
const STATUS_STYLES={
 'Draft':{background:'#f3f4f6',color:'#4b5563'},
 'Dispatched':{background:'#dbeafe',color:'#1d4ed8'},
 'In-Transit':{background:'#ede9fe',color:'#6d28d9'},
 'On Hold':{background:'#fef3c7',color:'#92400e'},
 'Returned':{background:'#fee2e2',color:'#b91c1c'},
 'Out for Delivery':{background:'#e0f2fe',color:'#0369a1'},
 'Delivered':{background:'#dcfce7',color:'#166534'}
}
const statusPill=s=><span style={{...STATUS_STYLES[s],padding:'4px 9px',borderRadius:20,fontSize:11,fontWeight:700,whiteSpace:'nowrap'}}>{s}</span>
const fromDb=p=>({...p,trackingNo:p.tracking_no||'',trackingUrl:p.tracking_url||'',dispatchDate:p.dispatch_date||'',customItems:p.custom_items||[],items:p.items||[],deliveredAt:p.delivered_at})
const toDb=p=>({id:p.id,status:p.status||'Draft',courier:p.courier||'',tracking_no:p.trackingNo||'',tracking_url:p.trackingUrl||'',dispatch_date:p.dispatchDate||null,notes:p.notes||'',items:p.items||[],custom_items:p.customItems||[]})
const validTrackingUrl=value=>{try{const u=new URL(value);return ['https:','http:'].includes(u.protocol)?u.href:null}catch{return null}}
const PREF_KEY='app2a.parcels.view.v1'
const readPrefs=()=>{try{return JSON.parse(sessionStorage.getItem(PREF_KEY)||'{}')}catch{return {}}}

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


function ParcelEditModal({parcel,samples,orders,parcels,onClose,onSave,onDispatch}){
 const [form,setForm]=useState({courier:parcel.courier||'',trackingNo:parcel.trackingNo||'',trackingUrl:parcel.trackingUrl||'',dispatchDate:parcel.dispatchDate||'',notes:parcel.notes||'',items:(parcel.items||[]).map(x=>({...x})),customItems:(parcel.customItems||[]).map(x=>({...x}))})
 const [working,setWorking]=useState(false)
 const set=(key,value)=>setForm(v=>({...v,[key]:value}))
 const setCustom=(i,key,value)=>setForm(v=>({...v,customItems:v.customItems.map((x,j)=>i===j?{...x,[key]:value}:x)}))
 const taken=new Set(parcels.filter(p=>p.id!==parcel.id).flatMap(p=>(p.items||[]).map(it=>it.sampleId)))
 const choices=samples.filter(x=>!taken.has(x.id))
 const orderMap=Object.fromEntries(orders.map(o=>[o.id,o]))
 const submit=async(dispatch=false)=>{
   if(form.trackingUrl&&!validTrackingUrl(form.trackingUrl)){window.alert('Enter a valid http(s) tracking URL.');return}
   if(dispatch&&(!form.courier||!form.trackingNo||!form.dispatchDate)){window.alert('Courier, tracking number and dispatch date are required.');return}
   if(!form.items.length&&!form.customItems.some(x=>x.description?.trim())){window.alert('A parcel needs at least one sample or custom item.');return}
   setWorking(true)
   try{await (dispatch?onDispatch: onSave)({...form,customItems:form.customItems.filter(x=>x.description?.trim())})}finally{setWorking(false)}
 }
 return <div style={{position:'fixed',inset:0,zIndex:500,background:'#0006',display:'flex',alignItems:'center',justifyContent:'center'}}>
  <div role="dialog" aria-modal="true" aria-label="Edit parcel" style={{...card,padding:20,width:700,maxWidth:'95vw',maxHeight:'90vh',overflowY:'auto'}}>
   <div style={{display:'flex',justifyContent:'space-between',marginBottom:14}}><strong>Edit Parcel · {parcel.id}</strong><button style={btn} onClick={onClose}>×</button></div>
   <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:10}}>
   {[['courier','Courier'],['trackingNo','Tracking Number'],['trackingUrl','Tracking URL'],['dispatchDate','Dispatch Date']].map(([key,label])=><label key={key} style={{display:'block',fontSize:12,marginBottom:10}}>{label}<input style={{...inp,marginTop:4}} type={key==='dispatchDate'?'date':'text'} value={form[key]} onChange={e=>set(key,e.target.value)} placeholder={key==='trackingUrl'?'https://courier.example/track/...':''}/></label>)}</div>
   <label style={{display:'block',fontSize:12,marginBottom:12}}>Notes<textarea style={{...inp,height:60,padding:8,marginTop:4}} value={form.notes} onChange={e=>set('notes',e.target.value)}/></label>
   <strong>Samples in Parcel</strong><div style={{border:'1px solid #eee',borderRadius:8,padding:10,maxHeight:200,overflowY:'auto',margin:'8px 0 14px'}}>
   {choices.map(sample=><label key={sample.id} style={{display:'flex',alignItems:'center',gap:10,padding:'6px 0',fontSize:12}}>
   <input type="checkbox" checked={form.items.some(it=>it.sampleId===sample.id)} onChange={e=>set('items',e.target.checked?[...form.items,{sampleId:sample.id}]:form.items.filter(it=>it.sampleId!==sample.id))}/>
   <strong>{sample.sample_number||sample.id}</strong><span>{orderMap[sample.order_id]?.style_number||'—'}</span><span>{sample.sample_type||''}</span></label>)}
   {!choices.length&&<span>No available samples</span>}</div>
   <strong>Custom Contents</strong><div style={{display:'grid',gap:7,margin:'8px 0'}}>
   {form.customItems.map((it,i)=><div key={i} style={{display:'grid',gridTemplateColumns:'1fr 75px 85px 35px',gap:7}}>
    <input style={inp} aria-label="Item description" placeholder="Description" value={it.description||''} onChange={e=>setCustom(i,'description',e.target.value)}/>
    <input style={inp} aria-label="Quantity" type="number" min="1" value={it.qty??1} onChange={e=>setCustom(i,'qty',Number(e.target.value))}/>
    <input style={inp} aria-label="Unit value" type="number" min="0" step="0.01" value={it.unitValue??1} onChange={e=>setCustom(i,'unitValue',Number(e.target.value))}/>
    <button style={btn} aria-label="Remove custom item" onClick={()=>set('customItems',form.customItems.filter((_,j)=>j!==i))}>×</button></div>)}
   <button style={btn} onClick={()=>set('customItems',[...form.customItems,{description:'',qty:1,unitValue:1}])}><Plus size={13}/> Add Item</button></div>
   <div style={{display:'flex',justifyContent:'flex-end',gap:8,marginTop:14}}><button style={btn} onClick={onClose}>Cancel</button><button style={btn} disabled={working} onClick={()=>submit(false)}>Save Changes</button>{parcel.status==='Draft'&&<button style={{...btn,background:'#111827',color:'#fff'}} disabled={working} onClick={()=>submit(true)}><Truck size={13}/> Dispatch</button>}</div>
  </div>
 </div>
}

export default function Parcels() {
  const { alert, Dialogs } = useAppDialogs()
  const [samples, setSamples] = useState([])
  const [orders, setOrders] = useState([])
  const [buyers, setBuyers] = useState([])
  const [store, setStore] = useState(loadSamplingStore())
  const [parcels,setParcels]=useState([])
  const [selectedParcels,setSelectedParcels]=useState([])
  const [editing,setEditing]=useState(null)
  const [history,setHistory]=useState([])
  const [busy,setBusy]=useState(false)
  const [statusMenu,setStatusMenu]=useState(false)
  const [statusMenuPos,setStatusMenuPos]=useState({top:0,right:0})
  const [sortBy,setSortBy]=useState(()=>readPrefs().sortBy||'date-desc')
  const [groupBy,setGroupBy]=useState(()=>readPrefs().groupBy||'none')
  const [statusFilter,setStatusFilter]=useState(()=>readPrefs().statusFilter||'All')
  const [customerFilter,setCustomerFilter]=useState(()=>readPrefs().customerFilter||'All')
  const [periodFilter,setPeriodFilter]=useState(()=>readPrefs().periodFilter||'All')
  const [creating, setCreating] = useState(false)
  const [active, setActive] = useState(null)
  const [tab, setTab] = useState('ready')
  const [search, setSearch] = useState('')
  const [selectedSamples, setSelectedSamples] = useState([])

  useEffect(() => { load() }, [])
  useEffect(()=>{try{sessionStorage.setItem(PREF_KEY,JSON.stringify({sortBy,groupBy,statusFilter,customerFilter,periodFilter}))}catch{}},[sortBy,groupBy,statusFilter,customerFilter,periodFilter])

  async function load() {
    const [{ data: s }, { data: o }, { data: b }, { data: dbParcels,error:parcelError }] = await Promise.all([
      supabase.from('samples').select('*').order('created_at', { ascending:false }),
      supabase.from('orders').select('*').order('created_at', { ascending:false }),
      supabase.from('buyers').select('*').order('name'),
      supabase.from('parcels').select('*').order('created_at',{ascending:false}),
    ])
    setSamples(s || [])
    setOrders(o || [])
    setBuyers(b || [])
    if(parcelError){alert(parcelError.message,{title:'Parcel Loading Failed'});return}
    // Import browser-only legacy parcels without overwriting existing Supabase records.
    const legacy=loadSamplingStore()
    const migrationKey='nzm_parcels_migrated_to_supabase_v1'
    const migrationDone=localStorage.getItem(migrationKey)==='true'
    const remoteIds=new Set((dbParcels||[]).map(p=>p.id))
    const missing=migrationDone?[]:(legacy.parcels||[]).filter(p=>p.id&&!remoteIds.has(p.id))
    // Ignore concurrent duplicate inserts, never overwrite a parcel already on Supabase.
    // This also handles multiple browser tabs and overlapping refreshes safely.
    let imported=false
    if(missing.length){
      const {error:importError}=await supabase.from('parcels').upsert(missing.map(toDb),{onConflict:'id',ignoreDuplicates:true})
      if(importError) alert('Legacy parcel import failed: '+importError.message,{title:'Migration Warning'})
      else imported=true
    } else imported=true
    if(imported&&!migrationDone)localStorage.setItem(migrationKey,'true')
    const {data:updated,error:reloadError}=missing.length?await supabase.from('parcels').select('*').order('created_at',{ascending:false}):{data:dbParcels}
    if(reloadError) alert(reloadError.message,{title:'Parcel Loading Failed'})
    setParcels((updated||dbParcels||[]).map(fromDb))
    setStore(legacy)
  }

  const sampleMap = useMemo(() => Object.fromEntries(samples.map(s => [s.id, s])), [samples])
  const orderMap = useMemo(() => Object.fromEntries(orders.map(o => [o.id, o])), [orders])
  const buyerMap = useMemo(() => Object.fromEntries(buyers.map(b => [b.id, b])), [buyers])

  const poolRows = useMemo(() => (store.parcelPool || []).map(p => ({ ...p, sample: sampleMap[p.sampleId] || {}, order: orderMap[(sampleMap[p.sampleId] || {}).order_id] || {} })).filter(x => x.sample.id), [store, sampleMap, orderMap])

  const readySamples = useMemo(() => samples.filter(s => {
    const stage = store.sampleMeta?.[s.id]?.stage || s.stage || ''
    return stage === 'Ready'
  }).map(s => ({ sampleId:s.id, sample:s, order:orderMap[s.order_id] || {}, meta:store.sampleMeta?.[s.id] || {} })), [samples,store,orderMap])
  const availableSamples = useMemo(() => {
    const inParcels = new Set(parcels.flatMap(p => (p.items || []).map(it => it.sampleId)))
    return [...new Map([...readySamples,...poolRows].map(r=>[r.sampleId,r])).values()].filter(r=>!inParcels.has(r.sampleId))
  },[readySamples,poolRows,parcels])
  const parcelCustomers=useMemo(()=>p=>{
    const names=(p.items||[]).map(it=>{
      const sample=sampleMap[it.sampleId]||{}
      const order=orderMap[sample.order_id]||{}
      return order.buyer_name||buyerMap[order.buyer_id]?.name||''
    }).filter(Boolean)
    return [...new Set(names)].join(', ')||p.customer||p.customer_name||'—'
  },[sampleMap,orderMap,buyerMap])
  const customerOptions=useMemo(()=>[...new Set(parcels.map(parcelCustomers).filter(x=>x!=='—'))].sort(),[parcels,parcelCustomers])
  const shownParcels=useMemo(()=>{
    const now=new Date()
    const monthKey=now.getFullYear()+'-'+String(now.getMonth()+1).padStart(2,'0')
    const lastMonth=new Date(now.getFullYear(),now.getMonth()-1,1)
    const lastKey=lastMonth.getFullYear()+'-'+String(lastMonth.getMonth()+1).padStart(2,'0')
    const query=search.toLocaleLowerCase().trim()
    const rows=parcels.filter(p=>{
      const date=p.dispatchDate||''
      const contents=(p.items||[]).flatMap(it=>{
        const sample=sampleMap[it.sampleId]||{}
        const order=orderMap[sample.order_id]||{}
        return [it.sampleId,sample.sample_number,sample.sample_type,order.style_number,order.job_number,order.po_number,order.buyer_name]
      })
      const custom=(p.customItems||[]).flatMap(it=>[it.description,it.qty])
      const searchable=[p.id,p.courier,p.trackingNo,p.trackingUrl,p.status,p.notes,parcelCustomers(p),...contents,...custom].join(' ').toLocaleLowerCase()
      const periodMatch=periodFilter==='All'||(periodFilter==='This Month'&&date.startsWith(monthKey))||(periodFilter==='Last Month'&&date.startsWith(lastKey))||(periodFilter==='This Year'&&date.startsWith(String(now.getFullYear())))
      return (tab==='dispatched'?p.status!=='Draft':p.status==='Draft')&&(statusFilter==='All'||p.status===statusFilter)&&(customerFilter==='All'||parcelCustomers(p)===customerFilter)&&periodMatch&&(!query||query.split(/\s+/).every(term=>searchable.includes(term)))
    })
    return [...rows].sort((a,b)=>{
      if(sortBy==='id-asc')return a.id.localeCompare(b.id)
      if(sortBy==='id-desc')return b.id.localeCompare(a.id)
      if(sortBy==='courier')return (a.courier||'').localeCompare(b.courier||'')
      if(sortBy==='status')return a.status.localeCompare(b.status)
      const d=(a.dispatchDate||a.created_at||'').localeCompare(b.dispatchDate||b.created_at||'')
      return sortBy==='date-asc'?d:-d
    })
  },[parcels,tab,statusFilter,customerFilter,periodFilter,search,sortBy,parcelCustomers,sampleMap,orderMap])
  const groupedParcels=useMemo(()=>{
    if(groupBy==='none')return [['',shownParcels]]
    const groups=new Map()
    for(const p of shownParcels){
      const key=groupBy==='status'?p.status:groupBy==='courier'?(p.courier||'Unassigned'):groupBy==='month'?(p.dispatchDate||'Undated').slice(0,7):parcelCustomers(p)
      if(!groups.has(key))groups.set(key,[])
      groups.get(key).push(p)
    }
    return [...groups.entries()]
  },[shownParcels,groupBy,parcelCustomers])
  const shownSamples = availableSamples.filter(r => !search || [r.sample.sample_number,r.order.buyer_name,r.order.job_number,r.order.style_number,r.sample.sample_type].some(v=>String(v||'').toLowerCase().includes(search.toLowerCase())))

  async function patchParcel(parcelId,patch) {
    const old=parcels.find(p=>p.id===parcelId)
    if(!old)return false
    setBusy(true)
    const changed={...old,...patch}
    const db=toDb(changed)
    const {error}=await supabase.from('parcels').update({...db,updated_at:new Date().toISOString()}).eq('id',parcelId)
    if(error){alert(error.message,{title:'Parcel Update Failed'});setBusy(false);return false}
    if(patch.status&&patch.status!==old.status){
      const {error:historyError}=await supabase.from('parcel_status_history').insert({parcel_id:parcelId,old_status:old.status,new_status:patch.status})
      if(historyError)alert('Status updated, but history could not be saved: '+historyError.message,{title:'History Warning'})
    }
    setParcels(v=>v.map(p=>p.id===parcelId?changed:p))
    setBusy(false)
    return true
  }
  async function createNewParcel(payload){
    setBusy(true)
    const year=String(new Date().getFullYear()).slice(-2)
    const id='PAR-'+year+'-'+(globalThis.crypto?.randomUUID?.()||Math.random().toString(36).slice(2)).slice(0,8).toUpperCase()
    const {error}=await supabase.from('parcels').insert(toDb({id,...payload,status:'Draft'}))
    if(error)alert(error.message,{title:'Create Parcel Failed'})
    else{setCreating(false);await load()}
    setBusy(false)
  }
  async function doDispatch(parcel){
    if(!parcel.courier||!parcel.trackingNo||!parcel.dispatchDate){
      alert('Courier, tracking number and dispatch date are required.',{title:'Missing Dispatch Details'});return
    }
    const ok=await patchParcel(parcel.id,{status:'Dispatched'})
    if(ok){
      await supabase.from('parcels').update({dispatched_at:new Date().toISOString()}).eq('id',parcel.id)
      for(const it of parcel.items||[]){
        await supabase.from('samples').update({dispatch_status:'Dispatched'}).eq('id',it.sampleId)
      }
      await load()
    }
  }
  async function changeStatus(id,status){
    if(status==='Delivered'||status==='Draft')return
    await patchParcel(id,{status})
  }
  async function bulkChangeStatus(status){
    if(!selectedParcels.length||status==='Delivered')return
    setStatusMenu(false)
    for(const id of selectedParcels){const p=parcels.find(x=>x.id===id);if(p&&p.status!=='Draft'&&p.status!=='Delivered')await patchParcel(id,{status})}
    setSelectedParcels([])
    await load()
  }
  async function markDelivered(){
    const targets=parcels.filter(p=>selectedParcels.includes(p.id)&&p.status!=='Delivered'&&p.status!=='Draft')
    if(!targets.length)return
    if(!window.confirm('Mark '+targets.length+' selected parcel(s) as delivered?'))return
    for(const p of targets){
      const ok=await patchParcel(p.id,{status:'Delivered'})
      if(ok){
        const deliveredAt=new Date().toISOString()
        const {error:dateError}=await supabase.from('parcels').update({delivered_at:deliveredAt}).eq('id',p.id)
        if(dateError)alert(dateError.message,{title:'Delivery Date Error'})
        const ids=(p.items||[]).map(it=>it.sampleId).filter(Boolean)
        if(ids.length){const {error:sampleError}=await supabase.from('samples').update({dispatch_status:'Delivered'}).in('id',ids)
          if(sampleError)alert(sampleError.message,{title:'Sample Status Update Failed'})}
      }
    }
    setSelectedParcels([])
    await load()
  }
  async function deleteSelected(){
    if(!selectedParcels.length||!window.confirm('Delete '+selectedParcels.length+' parcel(s)? This cannot be undone.'))return
    setBusy(true)
    const {error}=await supabase.from('parcels').delete().in('id',selectedParcels)
    if(error)alert(error.message,{title:'Delete Failed'})
    else{setSelectedParcels([]);await load()}
    setBusy(false)
  }
  async function openHistory(id){
    const {data,error}=await supabase.from('parcel_status_history').select('*').eq('parcel_id',id).order('changed_at',{ascending:false})
    if(error)alert(error.message,{title:'History Error'})
    setHistory(data||[])
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
        <div style={{border:'1px solid #e5e7eb',borderRadius:8,padding:'6px 12px',fontSize:12}}>DISPATCHED <strong>{parcels.filter(p=>p.status!=='Draft').length}</strong></div>
        <div style={{marginLeft:'auto',display:'flex',gap:8}}><button className="btn btn-secondary" onClick={load}><RefreshCw size={14}/> Refresh</button><button className="btn btn-primary" onClick={()=>setCreating(true)}><Plus size={14}/> Create Parcel</button></div>
      </div>
      <div style={{padding:'8px 24px',borderBottom:'1px solid #f3f4f6',display:'flex',alignItems:'center',gap:7,flexShrink:0,whiteSpace:'nowrap',overflowX:'auto'}}>
        <input style={{...inp,maxWidth:240,minWidth:140,flex:'1 1 170px'}} placeholder="Search parcels, styles, samples..." value={search} onChange={e=>setSearch(e.target.value)}/>
        <select aria-label="Filter parcel status" style={{...inp,width:140}} value={statusFilter} onChange={e=>setStatusFilter(e.target.value)}>{['All','Draft',...TRACKING_STATUSES].map(v=><option key={v}>{v}</option>)}</select>
        <select aria-label="Filter customer" style={{...inp,width:145}} value={customerFilter} onChange={e=>setCustomerFilter(e.target.value)}><option value="All">All Customers</option>{customerOptions.map(x=><option key={x} value={x}>{x}</option>)}</select>
        <select aria-label="Filter dispatch period" style={{...inp,width:140}} value={periodFilter} onChange={e=>setPeriodFilter(e.target.value)}>{['All','This Month','Last Month','This Year'].map(x=><option key={x} value={x}>{x==='All'?'All Dates':x}</option>)}</select>
        <select aria-label="Sort parcels" style={{...inp,width:150}} value={sortBy} onChange={e=>setSortBy(e.target.value)}><option value="date-desc">Newest Dispatch</option><option value="date-asc">Oldest Dispatch</option><option value="id-asc">Parcel # Asc</option><option value="id-desc">Parcel # Desc</option><option value="courier">Courier</option><option value="status">Status</option></select>
        <select aria-label="Group parcels" style={{...inp,width:140}} value={groupBy} onChange={e=>setGroupBy(e.target.value)}><option value="none">No Grouping</option><option value="status">By Status</option><option value="courier">By Courier</option><option value="month">By Month</option><option value="customer">By Customer</option></select>
        <div style={{marginLeft:'auto',display:'flex',gap:5,alignItems:'center'}}>
          <button style={btn} title="Edit selected parcel" disabled={busy||selectedParcels.length!==1} onClick={()=>setEditing(parcels.find(p=>p.id===selectedParcels[0]))}><Pencil size={15}/></button>
          <button style={btn} title="Delete selected parcels" disabled={busy||!selectedParcels.length} onClick={deleteSelected}><Trash2 size={15} color="#dc2626"/></button>
          <div><button style={btn} title="Change Status" aria-label="Change Status" disabled={busy||!selectedParcels.some(id=>parcels.some(p=>p.id===id&&p.status!=='Draft'&&p.status!=='Delivered'))} onClick={e=>{const rect=e.currentTarget.getBoundingClientRect();setStatusMenuPos({top:rect.bottom+6,right:Math.max(8,window.innerWidth-rect.right)});setStatusMenu(v=>!v)}}><ListFilter size={15}/></button>{statusMenu&&createPortal(<><div style={{position:'fixed',inset:0,zIndex:9998}} onClick={()=>setStatusMenu(false)}/><div role="menu" aria-label="Change parcel status" style={{position:'fixed',right:statusMenuPos.right,top:statusMenuPos.top,zIndex:9999,background:'#fff',border:'1px solid #ddd',borderRadius:8,boxShadow:'0 6px 20px #0002',padding:5,minWidth:175}}>{TRACKING_STATUSES.filter(x=>x!=='Delivered').map(x=><button key={x} role="menuitem" onClick={()=>bulkChangeStatus(x)} style={{...btn,display:'block',width:'100%',textAlign:'left',border:0}}>{statusPill(x)}</button>)}</div></>,document.body)}</div>
          <button style={{...btn,background:'#dcfce7',color:'#166534',borderColor:'#bbf7d0',display:'flex',gap:5,alignItems:'center'}} disabled={busy||!selectedParcels.some(id=>parcels.some(p=>p.id===id&&p.status!=='Delivered'&&p.status!=='Draft'))} onClick={markDelivered}><CheckCheck size={15}/> Mark Delivered</button>
        </div>
      </div>
      <div className="table-wrap" style={{flex:1,minHeight:0,overflow:'auto',padding:'0 24px'}}>
        {tab==='ready' && <>
          <table style={{width:'100%'}}><thead><tr><th style={{width:34}}><input type="checkbox" checked={shownSamples.length>0&&shownSamples.every(r=>selectedSamples.includes(r.sampleId))} onChange={e=>setSelectedSamples(e.target.checked?shownSamples.map(r=>r.sampleId):[])}/></th><th>SAM # / Ref</th><th>Customer</th><th>Job #</th><th>Style #</th><th>Type / Ver.</th><th>Wash Colour</th><th>Sample Size</th><th>Qty</th><th>Ready Date</th></tr></thead><tbody>
            {shownSamples.map(r=><tr key={r.sampleId}><td><input type="checkbox" checked={selectedSamples.includes(r.sampleId)} onChange={e=>setSelectedSamples(v=>e.target.checked?[...v,r.sampleId]:v.filter(x=>x!==r.sampleId))}/></td><td style={{fontWeight:700}}>{r.sample.sample_number||'—'}</td><td>{r.order.buyer_name||'—'}</td><td>{r.order.job_number||'—'}</td><td>{r.order.style_number||'—'}</td><td>{r.sample.sample_type||'—'} / {r.meta.version||'V1'}</td><td>{sampleWashColour(r.sample,r.meta)}</td><td>{sampleSizeLabel(r.sample,r.meta)}</td><td>{r.sample.req_pcs||0}</td><td>{formatDate(r.sample.stage_dates?.Ready||r.meta.stageDates?.Ready||r.sample.ready_at||r.meta.readyAt)||'—'}</td></tr>)}
            {!shownSamples.length&&<tr><td colSpan={10} style={{textAlign:'center',padding:28,color:'#9ca3af'}}>No samples ready for dispatch. You can still create a parcel with custom items.</td></tr>}
          </tbody></table>
          {parcels.some(p=>p.status==='Draft')&&<div style={{fontWeight:700,fontSize:13,margin:'18px 0 8px'}}>Parcels Awaiting Dispatch</div>}
        </>}
        {(tab==='dispatched'||parcels.some(p=>p.status==='Draft'))&&<table style={{width:'100%',borderCollapse:'collapse'}}><thead><tr>
          <th><input type="checkbox" aria-label="Select visible parcels" checked={shownParcels.length>0&&shownParcels.every(p=>selectedParcels.includes(p.id))} onChange={e=>setSelectedParcels(e.target.checked?shownParcels.map(p=>p.id):[])}/></th>
          <th>Parcel #</th><th>Customer</th><th>Contents</th><th>Courier</th><th>Tracking #</th><th>Tracking</th><th>Dispatch Date</th><th>Delivered On</th><th>Actions</th>
        </tr></thead><tbody>
          {groupedParcels.map(([group,rows])=><React.Fragment key={group||'all'}>
            {groupBy!=='none'&&<tr><td colSpan={10} style={{background:'#eef6fd',fontWeight:700,padding:'9px 12px'}}>{group} — {rows.length} parcels</td></tr>}
            {rows.map(p=><React.Fragment key={p.id}><tr style={{cursor:'pointer',background:selectedParcels.includes(p.id)?'#f0f7ff':undefined}} onClick={()=>setSelectedParcels(v=>v.includes(p.id)?v.filter(id=>id!==p.id):[...v,p.id])}>
              <td onClick={e=>e.stopPropagation()}><input type="checkbox" aria-label={'Select '+p.id} checked={selectedParcels.includes(p.id)} onChange={e=>setSelectedParcels(v=>e.target.checked?[...new Set([...v,p.id])]:v.filter(id=>id!==p.id))}/></td>
              <td style={{fontWeight:700}}><div>{p.id}</div><div style={{marginTop:5}}>{statusPill(p.status)}</div></td>
              <td>{parcelCustomers(p)}</td>
              <td>{p.items?.length||0} SAM# + {p.customItems?.length||0} custom</td>
              <td>{p.courier||'—'}</td>
              <td>{p.trackingNo||'—'}</td>
              <td onClick={e=>e.stopPropagation()}>{validTrackingUrl(p.trackingUrl)?<a href={validTrackingUrl(p.trackingUrl)} target="_blank" rel="noopener noreferrer" title="Open courier tracking"><ExternalLink size={16}/></a>:<span style={{color:'#9ca3af'}}>—</span>}</td>
              <td>{formatDate(p.dispatchDate)||'—'}</td>
              <td>{p.deliveredAt?<><div>{formatDate(p.deliveredAt)}</div><div style={{fontSize:11,color:'#16a34a',marginTop:3}}>{p.dispatchDate?Math.max(0,Math.round((new Date(p.deliveredAt.slice(0,10)+'T12:00:00Z')-new Date(p.dispatchDate.slice(0,10)+'T12:00:00Z'))/86400000))+' Days Transit':'—'}</div></>:'—'}</td>
              <td onClick={e=>e.stopPropagation()}><div style={{display:'flex',gap:5,whiteSpace:'nowrap'}}><button style={btn} onClick={()=>{setActive(active===p.id?null:p.id);openHistory(p.id)}}>View</button><button style={btn} onClick={()=>printInvoice(p)}><FileText size={13}/> Invoice</button>{p.status==='Draft'&&<button style={btn} onClick={()=>setEditing(p)}><Pencil size={13}/> Edit / Dispatch</button>}</div></td>
            </tr>
            {active===p.id&&<tr><td colSpan={9} style={{background:'#f9fafb',padding:14}}><strong>Parcel Contents · {p.id}</strong>{(p.items||[]).map((it,i)=><div key={i}>{sampleMap[it.sampleId]?.sample_number||it.sampleId} · {orderMap[sampleMap[it.sampleId]?.order_id]?.style_number||'—'}</div>)}{(p.customItems||[]).map((it,i)=><div key={'c'+i}>{it.description} · {it.qty} pcs</div>)}<div style={{marginTop:10,fontWeight:700}}>Status History</div>{history.length?history.map(h=><div key={h.id} style={{fontSize:12,marginTop:5}}>{new Date(h.changed_at).toLocaleString('en-GB')} · {h.old_status||'New'} → {h.new_status}</div>):<div style={{color:'#9ca3af',fontSize:12}}>No status changes recorded yet.</div>}</td></tr>}
            </React.Fragment>)}
          </React.Fragment>)}
          {!shownParcels.length&&<tr><td colSpan={9} style={{textAlign:'center',padding:28,color:'#9ca3af'}}>No parcels in this tab.</td></tr>}
        </tbody></table>}
      </div>
      <div style={{height:34,borderTop:'1px solid #e5e7eb',padding:'8px 24px',fontSize:11,color:'#6b7280',flexShrink:0}}>{tab==='ready'?`${shownSamples.length} READY SAMPLES · ${shownParcels.length} PARCELS AWAITING DISPATCH`:`${shownParcels.length} DISPATCHED PARCELS`}</div>
      {editing&&<ParcelEditModal parcel={editing} samples={samples} orders={orders} parcels={parcels} onClose={()=>setEditing(null)} onSave={async patch=>{const ok=await patchParcel(editing.id,patch);if(ok)setEditing(null)}} onDispatch={async patch=>{const ok=await patchParcel(editing.id,patch);if(ok){await doDispatch({...editing,...patch});setEditing(null)}}}/>}
      {creating && <ParcelBuilderModal poolRows={selectedSamples.length?availableSamples.filter(r=>selectedSamples.includes(r.sampleId)):availableSamples} onClose={() => setCreating(false)} onCreated={createNewParcel} />}
      <Dialogs />
    </div>
  )
}
