import React, { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { supabase } from '../lib/supabase'
import { useAppDialogs } from '../components/ui/AppDialogs'
import { formatDate } from '../lib/utils'
import { usageObject, usageNumber } from '../lib/usageMath'
import {buildSampleProgramHTML} from '../lib/sampleProgramPrint'
import { loadSamplingStore, getSampleComments, updateSampleMeta, addSampleComment, sendSampleToParcelPool } from '../lib/samplingStore'
import { ClipboardCheck, MessageSquarePlus, PackagePlus, Printer, RefreshCw, Search, ChevronDown } from 'lucide-react'
import { statusBadgeStyle, statusDisplay } from '../lib/statusColors'
import { useWindowManager } from '../components/ui/WindowManager'
import { Minus, X } from 'lucide-react'

const STAGES = ['Not Started', 'Pattern', 'Cutting', 'Stitching', 'Washing', 'Finishing', 'Ready']
const COMMENT_TYPES = ['Approval', 'Revision', 'Rejection']
const REVISION_REASONS = ['Workmanship', 'Spec', 'Wash', 'Fitting', 'Printing / Embroidery', 'Buyer updated Spec or Fit', 'Packaging', 'Presentation']

const card = { background:'#fff', border:'1px solid #ececec', borderRadius:12, boxShadow:'0 1px 2px rgba(0,0,0,.03)' }
const inp = { height:34, padding:'0 10px', border:'1px solid #e5e7eb', borderRadius:8, fontSize:12, width:'100%', boxSizing:'border-box', outline:'none' }
const btn = { height:32, padding:'0 12px', border:'1px solid #e5e7eb', borderRadius:8, background:'#fff', fontSize:12, fontWeight:600, cursor:'pointer' }


const SETTINGS_KEY = 'nizamia:sampling:table-settings:v2'
const TAB_DEFAULTS = {groupBy:'none',sortBy:'due-asc',filterBuyer:[],filterType:[],filterStage:[],filterApproval:[],query:''}
function readSettings() {
  try { return JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}') } catch { return {} }
}
const safeText = v => String(v == null ? '' : v).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))
const dayString = value => {
  if (!value) return ''
  const d = new Date(String(value).slice(0,10) + 'T12:00:00')
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString('en-GB',{day:'2-digit',month:'short',year:'2-digit'}).replace(/ /g,'-')
}
function shiftDate(value, days) {
  if (!value) return ''
  const d = new Date(String(value).slice(0,10) + 'T12:00:00')
  if (Number.isNaN(d.getTime())) return ''
  d.setDate(d.getDate()+days)
  return dayString(d.toISOString().slice(0,10))
}
function MultiFilter({title,options,value,onChange}) {
  const [open,setOpen]=useState(false)
  const [position,setPosition]=useState(null)
  const root=React.useRef(null)
  const menu=React.useRef(null)
  const updatePosition=React.useCallback(()=>{
    if (!root.current) return
    const rect=root.current.getBoundingClientRect()
    const width=Math.max(200,rect.width)
    const left=Math.max(8,Math.min(window.innerWidth-width-8,rect.right-width))
    const spaceBelow=window.innerHeight-rect.bottom-8
    const height=Math.min(265,Math.max(100,window.innerHeight-24))
    const above=spaceBelow<Math.min(170,height) && rect.top>spaceBelow
    setPosition({left,top:above?Math.max(8,rect.top-height-4):rect.bottom+4,width,maxHeight:above?Math.min(height,rect.top-12):Math.min(height,Math.max(100,spaceBelow))})
  },[])
  useEffect(()=>{
    if(!open)return
    updatePosition()
    const close=e=>{
      if(!root.current?.contains(e.target) && !menu.current?.contains(e.target)) setOpen(false)
    }
    const reposition=()=>updatePosition()
    document.addEventListener('pointerdown',close)
    window.addEventListener('resize',reposition)
    // Close when an ancestor scrolls, avoiding detached floating menus.
    const scroll=e=>{if(!menu.current?.contains(e.target))setOpen(false)}
    window.addEventListener('scroll',scroll,true)
    return()=>{
      document.removeEventListener('pointerdown',close)
      window.removeEventListener('resize',reposition)
      window.removeEventListener('scroll',scroll,true)
    }
  },[open,updatePosition])
  const label=value.length===0?`All ${title}`:value.length===1?value[0]:`${title} (${value.length})`
  return <div ref={root} style={{position:'relative',minWidth:0}}>
    <button type="button" aria-expanded={open} onClick={()=>setOpen(o=>!o)} style={{...inp,display:'flex',justifyContent:'space-between',alignItems:'center',background:'#fff',cursor:'pointer',textAlign:'left',whiteSpace:'nowrap',overflow:'hidden'}} title={label}><span style={{overflow:'hidden',textOverflow:'ellipsis'}}>{label}</span><ChevronDown size={13}/></button>
    {open&&position&&createPortal(<div ref={menu} style={{position:'fixed',zIndex:10000,left:position.left,top:position.top,width:position.width,maxHeight:position.maxHeight,overflowY:'auto',background:'#fff',border:'1px solid #d1d5db',boxShadow:'0 8px 22px #0002',borderRadius:8,padding:7,boxSizing:'border-box'}}>
      <button type="button" onClick={()=>onChange([])} style={{...btn,width:'100%',marginBottom:5,textAlign:'left'}}>All / Clear selection</button>
      {options.map(x=><label key={x} style={{display:'flex',gap:8,alignItems:'center',padding:'6px 4px',fontSize:12,cursor:'pointer'}}><input type="checkbox" checked={value.includes(x)} onChange={e=>onChange(e.target.checked?[...value,x]:value.filter(v=>v!==x))}/><span>{x}</span></label>)}
    </div>,document.body)}
  </div>
}

function statusPill(bg, color, text) {
  return <span style={statusBadgeStyle(text,{},'samples')}>{statusDisplay(text,'samples')}</span>
}

function PrintWindow({ html, title }) {
  const w = window.open('', '_blank', 'width=1000,height=800')
  if (!w) { alert('Please allow popups to print this document.'); return }
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
    .grid td,.grid th{text-align:center}
    .small{font-size:11px}
    .page-break{page-break-before:always}
    .program{font-size:11px;max-width:190mm;margin:auto}
    .program-head{display:flex;justify-content:space-between;align-items:flex-end;border-bottom:2px solid #111;padding:4px 0 7px;break-inside:avoid}
    .company{font-size:12px;font-weight:800;letter-spacing:.4px}.program h1{font-size:19px;margin-top:3px}.program .sample-kind{font-size:17px;font-weight:800;margin-top:4px}.sam{font-size:21px;font-weight:800;white-space:nowrap}
    .info{display:grid;grid-template-columns:1fr 110px;gap:12px;margin-top:12px}.fields{display:grid;grid-template-columns:1fr 1fr;gap:8px 12px}
    .fields>div{display:grid;grid-template-columns:100px 1fr;gap:5px;border-bottom:1px solid #ddd;padding-bottom:4px}.fields b{font-size:10px}.fields span{font-size:11px}
    .picture-box{border:1px solid #111;min-height:112px;display:flex;align-items:center;justify-content:center}.picture{max-width:100%;max-height:112px;object-fit:contain;filter:grayscale(1)}.picture-empty{font-size:10px}
    .timeline{display:grid;grid-template-columns:repeat(4,1fr);margin:10px 0 11px;position:relative;gap:5px;break-inside:avoid}
    .timeline>div{display:flex;flex-direction:column;align-items:center;text-align:center;gap:4px;position:relative;padding:3px 2px}
    .timeline>div:before{content:"";height:7px;width:7px;background:#111;border-radius:50%;display:block;margin-bottom:3px}
    .timeline:before{content:"";position:absolute;top:6px;left:12%;right:12%;border-top:1px solid #555}
    .timeline b{font-size:9px;font-weight:600}.timeline strong{font-size:11px}
    .specs{display:grid;grid-template-columns:repeat(4,1fr);border:2px solid #111;margin-top:12px;break-inside:avoid}
    .specs>div{display:flex;flex-direction:column;align-items:center;text-align:center;padding:11px 4px;gap:6px;border-right:1px solid #111}
    .specs>div:last-child{border-right:0}.specs b{font-size:10px}.specs strong{font-size:14px;font-weight:800}
    .bom th:nth-child(1){width:16%}.bom th:nth-child(2){width:22%}.bom th:nth-child(3){width:34%}.bom th:nth-child(4){width:14%}.bom th:nth-child(5){width:14%}
    .program h2{font-size:13px;text-align:center;margin:12px 0 5px}.bom{margin-top:0}.bom th,.bom td{padding:5px 6px;font-size:10px;background:#fff}.bom .important{font-weight:800}.bom .last-essential td{border-bottom:2px solid #111}.history{border-bottom:1px solid #888;padding:7px 2px;break-inside:avoid}.history p{margin:4px 0}.program footer{border-top:1px solid #111;text-align:right;margin-top:16px;padding-top:6px;font-size:10px}.warning{border:1px solid #111;padding:5px;margin-top:6px;font-weight:700}
    .bom thead{display:table-header-group}.bom tr{break-inside:avoid;page-break-inside:avoid}
    /* A4 print box: 297mm high minus 6mm top and bottom margins.
       Use document flow rather than position:fixed, which Chrome was
       treating as an additional fragment and pushing to page two. */
    @page{size:A4 portrait;margin:6mm 7mm 6mm 7mm}
    @media print {
      html,body{margin:0!important;padding:0!important}
      .program{max-width:none;min-height:280mm;box-sizing:border-box;display:flex;flex-direction:column}
      .program footer{position:static!important;left:auto!important;right:auto!important;bottom:auto!important;flex-shrink:0;margin-top:auto!important;padding-top:2mm;background:#fff;border-top:1px solid #111;font-size:10px}
      .bom tr,.history{break-inside:avoid;page-break-inside:avoid}
    }

  </style></head><body>${html}</body></html>`)
  w.document.close()
  w.focus()
  setTimeout(() => w.print(), 350)
  return null
}

function useSamplingWindow(id, title, onClose) {
  const manager = useWindowManager()
  const [minimized, setMinimized] = useState(false)
  const closeRef = React.useRef(onClose)
  const restoreRef = React.useRef(() => setMinimized(false))
  closeRef.current = onClose
  useEffect(() => {
    if (!manager) return
    manager.register(id, title, () => restoreRef.current(), () => closeRef.current())
    return () => manager.unregister(id)
  }, [manager?.register, manager?.unregister, id, title])
  useEffect(() => {
    if (!manager) return
    if (minimized) manager.minimize(id)
    else manager.restore(id)
  }, [manager?.minimize, manager?.restore, id, minimized])
  return { minimized, setMinimized }
}
function SamplingWindowControls({ onMinimize, onClose }) {
  return <div style={{display:'flex',gap:6,marginLeft:'auto'}}>
    <button type="button" title="Minimize" aria-label="Minimize" onClick={onMinimize} style={btn}><Minus size={15}/></button>
    <button type="button" title="Close" aria-label="Close" onClick={onClose} style={btn}><X size={15}/></button>
  </div>
}

function DispatchChecklistModal({ sample, onClose, onDone }) {
  const { Dialogs } = useAppDialogs()
  const [checks, setChecks] = useState({ checked:false, standard:false, qr:false })
  const { minimized, setMinimized } = useSamplingWindow(`sampling:dispatch:${sample.id}`, `Send to Parcels · ${sample.sample_number}`, onClose)
  const all = checks.checked && checks.standard && checks.qr
  return (
    <div style={{ position:'fixed', inset:0, background:minimized?'transparent':'rgba(0,0,0,.35)', display:minimized?'none':'flex', alignItems:'center', justifyContent:'center', zIndex:400 }}>
      <div style={{ ...card, width:420, padding:18 }}>
        <div style={{display:'flex',alignItems:'center',marginBottom:4}}><div style={{ fontSize:16, fontWeight:700 }}>Send to Parcels</div><SamplingWindowControls onMinimize={()=>setMinimized(true)} onClose={onClose}/></div>
        <div style={{ fontSize:12, color:'#6b7280', marginBottom:14 }}>{sample.sample_number} · All checks must be completed before dispatch handover.</div>
        {[
          ['checked','Final sample checked'],
          ['standard','As per required standard'],
          ['qr','Quality report attached'],
        ].map(([k, label]) => (
          <label key={k} style={{ display:'flex', gap:10, alignItems:'center', padding:'10px 0', fontSize:13, fontWeight:600 }}>
            <input type="checkbox" checked={checks[k]} onChange={e => setChecks(s => ({ ...s, [k]: e.target.checked }))} />
            {label}
          </label>
        ))}
        <div style={{ display:'flex', justifyContent:'flex-end', gap:8, marginTop:10 }}>
          <button style={btn} onClick={onClose}>Cancel</button>
          <button style={{ ...btn, background:all?'#111827':'#e5e7eb', color:all?'#fff':'#9ca3af', borderColor:all?'#111827':'#e5e7eb' }} disabled={!all} onClick={() => onDone(checks)}>Send to Parcels</button>
        </div>
      </div>
      <Dialogs />
    </div>
  )
}

const legacySampleComments = sample => {
  if (!sample) return []
  const raw = sample.comments
  if (!raw) return []
  let parsed = raw
  if (typeof raw === 'string') {
    try { parsed = JSON.parse(raw) } catch { parsed = [{ text:raw }] }
  }
  return (Array.isArray(parsed) ? parsed : [parsed]).filter(Boolean).map(c =>
    typeof c === 'string' ? {comment_text:c,comment_type:'Revision'} : {
      comment_text:c.text||c.comment_text||c.comment||'',
      comment_type:c.type||c.comment_type||'Revision',
      comment_by:c.by||c.comment_by||'',
      comment_date:c.date||c.comment_date||null,
      meta:{revision_reasons:c.reasons||c.meta?.revision_reasons||[]}
    }).filter(c=>c.comment_text)
}
const latestEditableComment = (sample, records) => {
  if (!sample) return null
  const db = records.filter(c=>c.sample_id===sample.id&&!c.is_internal).sort((a,b)=>String(b.created_at||b.comment_date).localeCompare(String(a.created_at||a.comment_date)))[0]
  if (db) return db
  const local = getSampleComments(sample.id).filter(c=>c.text).map(c=>({comment_text:c.text,comment_type:c.type||'Revision',comment_by:c.by||'',comment_date:c.date||null,meta:{revision_reasons:c.reasons||[]}}))
  return local.at(-1) || legacySampleComments(sample).at(-1) || null
}

function CommentModal({ sample, existingComment, onClose, onSaved }) {
  const { Dialogs } = useAppDialogs()
  const [type, setType] = useState(existingComment?.comment_type || 'Revision')
  const [date, setDate] = useState(existingComment?.comment_date?.slice(0,10) || new Date().toISOString().slice(0,10))
  const [by, setBy] = useState(existingComment?.comment_by || '')
  const [text, setText] = useState(existingComment?.comment_text || '')
  const [reasons, setReasons] = useState(existingComment?.meta?.revision_reasons || [])
  const [reasonsOpen, setReasonsOpen] = useState(false)
  const { minimized, setMinimized } = useSamplingWindow(`sampling:comment:${sample.id}`, `Sample Comment · ${sample.sample_number}`, () => { if (!text.trim() || window.confirm('Discard unsaved comment?')) onClose() })
  const valid = type && date && by.trim() && text.trim()
  return (
    <div style={{ position:'fixed', inset:0, background:minimized?'transparent':'rgba(0,0,0,.35)', display:minimized?'none':'flex', alignItems:'center', justifyContent:'center', zIndex:400 }}>
      <div style={{ ...card, width:560, padding:18 }}>
        <div style={{display:'flex',alignItems:'center',marginBottom:4}}><div style={{ fontSize:16, fontWeight:700 }}>{existingComment?'Edit Comment':'Record Comment'}</div><SamplingWindowControls onMinimize={()=>setMinimized(true)} onClose={()=>{if (!text.trim() || window.confirm('Discard unsaved comment?')) onClose()}}/></div>
        <div style={{ fontSize:12, color:'#6b7280', marginBottom:14 }}>{sample.sample_number} · Copy-paste buyer comments here</div>
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:10, marginBottom:10 }}>
          <select style={inp} value={type} onChange={e=>setType(e.target.value)}>{COMMENT_TYPES.map(x => <option key={x}>{x}</option>)}</select>
          <input style={inp} type="date" value={date} onChange={e=>setDate(e.target.value)} />
          <input style={inp} placeholder="Comment by" value={by} onChange={e=>setBy(e.target.value)} />
        </div>
        <div style={{position:'relative',marginBottom:10}}>
          <div style={{fontSize:12,fontWeight:600,marginBottom:5}}>{type === 'Approval' ? 'Approved for' : 'Rejected/Revision on'}</div>
          <button type="button" style={{...inp,textAlign:'left',background:'#fff',cursor:'pointer',height:'auto',minHeight:36,padding:'8px 10px'}} onClick={()=>setReasonsOpen(v=>!v)} aria-expanded={reasonsOpen}>
            {reasons.length?reasons.join(', '):'Select reasons (multiple)'} <span style={{float:'right'}}>⌄</span>
          </button>
          {reasonsOpen && <div style={{position:'absolute',top:'100%',left:0,right:0,zIndex:450,background:'#fff',border:'1px solid #e5e7eb',borderRadius:8,boxShadow:'0 8px 20px rgba(0,0,0,.12)',padding:8,maxHeight:230,overflowY:'auto'}}>
            {REVISION_REASONS.map(reason=><label key={reason} style={{display:'flex',gap:8,alignItems:'center',padding:'6px 8px',fontSize:12,cursor:'pointer'}}>
              <input type="checkbox" checked={reasons.includes(reason)} onChange={e=>setReasons(old=>e.target.checked?[...old,reason]:old.filter(x=>x!==reason))}/>{reason}
            </label>)}
            <button type="button" style={{...btn,marginTop:6,width:'100%'}} onClick={()=>setReasonsOpen(false)}>Done</button>
          </div>}
        </div>
        <textarea style={{ ...inp, height:140, padding:'10px' }} placeholder="Paste comments here..." value={text} onChange={e=>setText(e.target.value)} />
        <div style={{ display:'flex', justifyContent:'flex-end', gap:8, marginTop:12 }}>
          <button style={btn} onClick={onClose}>Cancel</button>
          <button style={{ ...btn, background:valid?'#111827':'#e5e7eb', color:valid?'#fff':'#9ca3af', borderColor:valid?'#111827':'#e5e7eb' }} disabled={!valid} onClick={() => onSaved({ type, date, by, text, reasons })}>{existingComment?'Update Comment':'Save Comment'}</button>
        </div>
      </div>
      <Dialogs />
    </div>
  )
}


function SampleMetadata({sample,allSamples,parcels,comments,onClose}){
 const [tab,setTab]=useState('Timeline')
 const [history,setHistory]=useState([])
 const [loading,setLoading]=useState(true)
 const root=sample.root_sample_id||sample.id
 const versions=allSamples.filter(x=>x.id===root||x.root_sample_id===root||x.parent_sample_id===sample.id||x.id===sample.id).sort((a,b)=>(a.version_no||1)-(b.version_no||1))
 const familyIds=new Set(versions.map(v=>v.id))
 const linkedParcels=parcels.filter(p=>(p.items||[]).some(i=>familyIds.has(i.sampleId)))
 const relatedComments=comments.filter(c=>familyIds.has(c.sample_id)||c.root_sample_id===root||c.sam_number===sample.sample_number)
 const stored=loadSamplingStore()
 const localComments=versions.flatMap(v=>(stored.comments?.[v.id]||[]).filter(c=>!relatedComments.some(d=>d.sample_id===v.id&&d.comment_text===c.text&&d.comment_type===c.type&&String(d.comment_date||'').slice(0,10)===String(c.date||'').slice(0,10))).map(c=>({...c,sample_id:v.id,comment_type:c.type,comment_text:c.text,comment_by:c.by,comment_date:c.date,source:'Browser legacy'})))
 useEffect(()=>{
   let active=true
   const ids=linkedParcels.map(p=>p.id)
   if(!ids.length){setHistory([]);setLoading(false);return}
   setLoading(true)
   supabase.from('parcel_status_history').select('*').in('parcel_id',ids).order('changed_at',{ascending:true}).then(({data,error})=>{
     if(active){setHistory(data||[]);setLoading(false);if(error)console.error('Parcel history:',error)}
   })
   return()=>{active=false}
 },[sample.id,parcels])
 const events=[]
 const push=(date,label,detail,source,user)=>{if(date)events.push({date,label,detail,source,user:user||null})}
 versions.forEach(v=>{
   push(v.created_at||v.requested_date,'Sample requirement created',v.sample_number+' · '+(v.version_label||'V1'),'Sampling')
   if(v.parent_sample_id)push(v.created_at,'New sample version',v.version_label||'Revision','Versions')
   if(v.received_date)push(v.received_date,'Sample received',v.version_label||'','Sampling')
   if(v.last_comment_at&&v.approval_status&&!relatedComments.some(c=>c.sample_id===v.id&&String(c.comment_date||'').slice(0,10)===String(v.last_comment_at).slice(0,10)))push(v.last_comment_at,v.approval_status,v.version_label||'','Approval',v.last_comment_by)
   const meta=stored.sampleMeta?.[v.id]||{}
   Object.entries(meta.stageDates||{}).forEach(([stage,date])=>push(date,stage,v.version_label||'','Sampling · legacy'))
 })
 ;[...relatedComments,...localComments].forEach(c=>push(c.comment_date||c.created_at,c.comment_type||'Comment',c.comment_text||'',c.source||'Comments',c.comment_by))
 linkedParcels.forEach(p=>{
   push(p.created_at,'Added to parcel',p.id,'Parcels')
   push(p.dispatch_date||p.dispatched_at,'Parcel dispatched',[p.id,p.courier,p.tracking_no].filter(Boolean).join(' · '),'Parcels',p.dispatched_by)
   if(p.delivered_at)push(p.delivered_at,'Delivered',p.id+(p.received_by?' · Received by '+p.received_by:''),'Parcels')
 })
 history.forEach(h=>push(h.changed_at,h.new_status,h.parcel_id+(h.note?' · '+h.note:''),'Parcel status',h.changed_by))
 events.sort((a,b)=>new Date(b.date)-new Date(a.date))
 const fmt=d=>d?new Date(d).toLocaleString('en-GB',{day:'2-digit',month:'short',year:'numeric',hour: d.includes('T')?'2-digit':undefined,minute:d.includes('T')?'2-digit':undefined}):'—'
 const cell=(label,value)=><div style={{padding:'9px 0',borderBottom:'1px solid #f1f5f9'}}><div style={{fontSize:10,color:'#94a3b8'}}>{label}</div><div style={{fontSize:12,fontWeight:600,marginTop:3}}>{value||'—'}</div></div>
 return createPortal(<div style={{position:'fixed',inset:0,zIndex:11000,background:'#0f172a88',display:'flex',justifyContent:'center',alignItems:'center',padding:20}} onMouseDown={e=>{if(e.target===e.currentTarget)onClose()}}>
  <section role="dialog" aria-modal="true" aria-label={'Sample metadata '+sample.sample_number} style={{background:'#fff',borderRadius:14,width:860,maxWidth:'96vw',maxHeight:'92vh',display:'flex',flexDirection:'column',boxShadow:'0 18px 60px #0003',overflow:'hidden'}}>
   <header style={{padding:'18px 22px 12px',borderBottom:'1px solid #e5e7eb',flexShrink:0}}>
    <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',gap:12}}><div><div style={{fontSize:20,fontWeight:750}}>{sample.sample_number} <span style={{fontSize:12,color:'#64748b',fontWeight:400}}>· {sample.version}</span></div><div style={{fontSize:12,color:'#64748b',marginTop:5}}>{sample.order.style_number||'—'} · {sample.order.job_number||'—'} · {sample.order.buyer_name||sample.buyer.name||'—'}</div></div><div style={{display:'flex',alignItems:'center',gap:12}}>{statusPill('','',sample.currentStatus?.label||sample.stage)}<button style={btn} onClick={onClose} aria-label="Close sample metadata"><X size={17}/></button></div></div>
    <div style={{display:'flex',gap:6,marginTop:16,flexWrap:'wrap'}}>{['Timeline','Details','Versions','Comments','Parcels'].map(x=><button key={x} onClick={()=>setTab(x)} style={{...btn,background:tab===x?'#111827':'#fff',color:tab===x?'#fff':'#374151'}}>{x}{x==='Versions'?' ('+versions.length+')':x==='Comments'?' ('+(relatedComments.length+localComments.length)+')':''}</button>)}</div>
   </header>
   <main style={{padding:'14px 24px 24px',overflowY:'auto',minHeight:180}}>
    {tab==='Timeline'&&<>{loading&&<div style={{padding:10,color:'#64748b',fontSize:12}}>Loading parcel history…</div>}{events.length?events.map((e,i)=><div key={i} style={{display:'grid',gridTemplateColumns:'112px minmax(0,1fr) 125px',gap:12,alignItems:'start',padding:'10px 6px',borderBottom:'1px solid #e5e7eb',fontSize:12}}><span style={{color:'#64748b',fontVariantNumeric:'tabular-nums'}}>{fmt(e.date)}</span><span style={{whiteSpace:'pre-wrap',overflowWrap:'anywhere',lineHeight:1.45}}><strong>{e.label}</strong>{e.detail?' | '+e.detail:''}</span><span style={{color:'#64748b',textAlign:'right',overflowWrap:'anywhere'}}>User: {e.user||'—'}</span></div>):<div style={{padding:16}}>No dated history is available for this sample.</div>}</>}
    {tab==='Details'&&<div style={{display:'grid',gridTemplateColumns:'1fr 1fr',columnGap:22}}>{cell('SAM #',sample.sample_number)}{cell('Sample Type',sample.sample_type)}{cell('Version',sample.version)}{cell('Approval',sample.approvalStatus)}{cell('Sampling Stage',sample.stage)}{cell('Parcel Status',sample.dispatchStatus)}{cell('Requested Date',fmt(sample.requested_date||sample.created_at))}{cell('Due Date',fmt(sample.dueDate))}{cell('Quantity',sample.qty)}{cell('Size',sample.base_size||sample.size)}{cell('Colour',sample.color||sample.colours?.join(', '))}{cell('Root Sample',root)}</div>}
    {tab==='Versions'&&versions.map(v=><div key={v.id} style={{padding:12,borderBottom:'1px solid #e5e7eb'}}><strong>{v.version_label||'V1'}</strong> · {v.sample_number} <span style={{color:'#64748b',fontSize:11}}>Created {fmt(v.created_at)}</span><div style={{fontSize:12,marginTop:5}}>Stage: {v.stage||'—'} · Approval: {v.approval_status||'Pending'} · Parent: {v.parent_sample_id?'Linked':'Original'}</div></div>)}
    {tab==='Comments'&&([...relatedComments,...localComments].sort((a,b)=>new Date(a.comment_date||a.created_at)-new Date(b.comment_date||b.created_at)).map((c,i)=><div key={c.id||i} style={{padding:'12px 0',borderBottom:'1px solid #e5e7eb'}}><strong>{c.comment_type||'Comment'}</strong><span style={{color:'#64748b',fontSize:11}}> · {fmt(c.comment_date||c.created_at)} · {c.comment_by||'Unknown author'} · {c.version_label||''}</span><div style={{whiteSpace:'pre-wrap',fontSize:12,marginTop:7}}>{c.comment_text||'—'}</div></div>))}
    {tab==='Parcels'&&(linkedParcels.length?linkedParcels.map(p=><div key={p.id} style={{padding:12,borderBottom:'1px solid #e5e7eb'}}><strong>{p.id}</strong> · {p.status||'—'}<div style={{fontSize:12,marginTop:5}}>Courier: {p.courier||'—'} · Tracking: {p.tracking_no||'—'}</div><div style={{fontSize:12,marginTop:5}}>Dispatched: {fmt(p.dispatch_date)} · Delivered: {fmt(p.delivered_at)}</div>{p.received_by&&<div style={{fontSize:12}}>Received by: {p.received_by}</div>}</div>):<div>No linked parcel records.</div>)}
   </main>
   <footer style={{borderTop:'1px solid #e5e7eb',padding:'9px 22px',fontSize:11,color:'#64748b'}}>History uses saved Supabase records and labelled legacy browser entries. Missing historical timestamps are not invented.</footer>
  </section>
 </div>,document.body)
}

export default function SamplingApprovals() {
  const { alert, Dialogs } = useAppDialogs()
  const [samples, setSamples] = useState([])
  const [orders, setOrders] = useState([])
  const [buyers, setBuyers] = useState([])
  const [bomItems, setBomItems] = useState([])
  const [fittingBlocks, setFittingBlocks] = useState([])
  const [sampleComments, setSampleComments] = useState([])
  const [parcelItems, setParcelItems] = useState([])
  const [refreshKey, setRefreshKey] = useState(0)
  const [dispatching, setDispatching] = useState(null)
  const [commenting, setCommenting] = useState(null)
  const [revisionRequest,setRevisionRequest] = useState(null)
  const [revisionDue,setRevisionDue] = useState('')
  const [revisionSaving,setRevisionSaving] = useState(false)
  const [metadataSample,setMetadataSample]=useState(null)
  const [query, setQuery] = useState('')
  const [selectedIds, setSelectedIds] = useState([])
  const [groupBy, setGroupBy] = useState(() => TAB_DEFAULTS.groupBy)
  const [filterBuyer, setFilterBuyer] = useState(() => [])
  const [filterType, setFilterType] = useState(() => [])
  const [filterStage, setFilterStage] = useState(() => [])
  const [filterApproval, setFilterApproval] = useState(() => [])
  const [sortBy, setSortBy] = useState(() => TAB_DEFAULTS.sortBy)
  const [viewTab, setViewTab] = useState('active')
  const [tabSettings,setTabSettings] = useState(()=>{try{return JSON.parse(sessionStorage.getItem(SETTINGS_KEY)||'{}')}catch{return {}}})
  const switchTab = next => {
    if(next===viewTab)return
    const current={groupBy,sortBy,filterBuyer,filterType,filterStage,filterApproval,query}
    const saved={...tabSettings,[viewTab]:current}
    const target={...TAB_DEFAULTS,...saved[next]}
    setTabSettings(saved)
    try{sessionStorage.setItem(SETTINGS_KEY,JSON.stringify(saved))}catch{}
    setGroupBy(target.groupBy);setSortBy(target.sortBy);setFilterBuyer(target.filterBuyer);setFilterType(target.filterType);setFilterStage(target.filterStage);setFilterApproval(target.filterApproval);setQuery(target.query)
    setSelectedIds([]);setViewTab(next)
  }

  useEffect(() => { load() }, [refreshKey])
  useEffect(() => {
    try { sessionStorage.setItem(SETTINGS_KEY,JSON.stringify({...tabSettings,[viewTab]:{groupBy,sortBy,filterBuyer,filterType,filterStage,filterApproval,query}})) } catch {}
  },[groupBy,sortBy,filterBuyer,filterType,filterStage,filterApproval,query,viewTab])

  async function load() {
    const [{ data: s }, { data: o }, { data: b }, {data: bom}, {data: blocks}, {data: comments}, {data: parcels}] = await Promise.all([
      supabase.from('samples').select('*').order('created_at', { ascending:false }),
      supabase.from('orders').select('id,buyer_id,buyer_name,job_number,style_number,description,factory_ref,merchandiser_name,style_image_url').order('created_at', { ascending:false }),
      supabase.from('buyers').select('*').order('name'),
      supabase.from('bom_items').select('*').order('sort_order'),
      supabase.from('fitting_blocks').select('*').order('sort_order'),
      supabase.from('sample_comments').select('*').order('comment_date'),
      supabase.from('parcels').select('id,items,custom_items,status,courier,tracking_no,created_at,dispatch_date,dispatched_at,delivered_at,received_by'),
    ])
    setSamples(s || [])
    setOrders(o || [])
    setBuyers(b || [])
    setBomItems(bom || [])
    setFittingBlocks(blocks || [])
    setSampleComments(comments || [])
    setParcelItems(parcels || [])
  }

  const orderMap = useMemo(() => Object.fromEntries(orders.map(o => [o.id, o])), [orders])
  const buyerMap = useMemo(() => Object.fromEntries(buyers.map(b => [b.id, b])), [buyers])

  const allRows = useMemo(() => {
    const localStore = loadSamplingStore()
    const sampleMeta = localStore.sampleMeta || {}
    const localComments = localStore.comments || {}
    return samples.map(s => {
    const order = orderMap[s.order_id] || {}
    const buyer = buyerMap[order.buyer_id] || {}
    const meta = sampleMeta[s.id] || {}
    const dbComments=sampleComments.filter(c=>c.sample_id===s.id).map(c=>({type:c.comment_type,text:c.comment_text,by:c.comment_by,date:c.comment_date}))
    const comments=[...dbComments,...(localComments[s.id]||[]).filter(c=>!dbComments.some(d=>d.text===c.text&&d.type===c.type&&String(d.date||'').slice(0,10)===String(c.date||'').slice(0,10)))]
    const latest = comments[comments.length - 1]
    const relatedParcel=parcelItems.filter(p=>(p.items||[]).some(it=>it.sampleId===s.id)).sort((a,b)=>String(b.delivered_at||b.dispatch_date||b.created_at||'').localeCompare(String(a.delivered_at||a.dispatch_date||a.created_at||'')))[0]
    const candidates=[{label:s.stage||meta.stage||'Not Started',date:meta.stageDates?.[s.stage||meta.stage]||s.created_at,source:'Sampling',rank:1}]
    if(relatedParcel){
      if(relatedParcel.dispatch_date||relatedParcel.dispatched_at)candidates.push({label:'Dispatched',date:relatedParcel.dispatch_date||relatedParcel.dispatched_at,source:'Parcels',rank:2})
      if(relatedParcel.delivered_at)candidates.push({label:'Delivered',date:relatedParcel.delivered_at,source:'Parcels',rank:2})
      else if(relatedParcel.status&&relatedParcel.status!=='Dispatched')candidates.push({label:relatedParcel.status,date:relatedParcel.updated_at||relatedParcel.dispatch_date,source:'Parcels',rank:2})
    }
    const approvalLabels={Approval:'Approved',Rejection:'Rejected',Revision:'Revision Required'}
    const approvalEvents=comments.filter(c=>approvalLabels[c.type]||['Approved','Rejected','Revision Required'].includes(c.type))
    approvalEvents.forEach(c=>candidates.push({label:approvalLabels[c.type]||c.type,date:c.date,source:'Approval',rank:3}))
    if(s.last_comment_at&&s.approval_status&&!['Pending','Pending Approval'].includes(s.approval_status))candidates.push({label:s.approval_status,date:s.last_comment_at,source:'Approval',rank:3})
    // Workflow phase precedence: a sampling Ready date must not override parcel delivery.
    // Approval decisions supersede logistics only when recorded after the parcel event.
    const valid=candidates.filter(x=>x.date&&!Number.isNaN(new Date(x.date).getTime()))
    const newest=items=>items.sort((a,b)=>new Date(b.date)-new Date(a.date))[0]
    const parcelEvent=newest(valid.filter(x=>x.rank===2))
    const approvalEvent=newest(valid.filter(x=>x.rank===3))
    const samplingEvent=newest(valid.filter(x=>x.rank===1))
    const currentStatus=approvalEvent&&(!parcelEvent||new Date(approvalEvent.date)>=new Date(parcelEvent.date))
      ? approvalEvent : parcelEvent||samplingEvent||candidates[0]
    return { ...s, order, buyer, meta, comments, latest, currentStatus, version: s.version_label || meta.version || `V${s.version_no || 1}`, stage: s.stage || meta.stage || 'Not Started', dispatchStatus: s.dispatch_status === 'Delivered' ? 'Delivered' : s.dispatch_status || meta.dispatchStatus || 'In Development', approvalStatus: s.approval_status || meta.approvalStatus || 'Pending', dueDate: s.due_date || meta.dueDate || null, qty: s.req_pcs || s.qty || 0, latestCommentText: latest?.text || '' }
    })
  }, [samples, orderMap, buyerMap, refreshKey, sampleComments, parcelItems])

  const isCompleted = r => r.stage === 'Ready' || r.approvalStatus === 'Approved' || ['complete','completed'].includes(String(r.status || '').toLowerCase())
  const rows = useMemo(() => {
    const filtered = allRows.filter(r => {
      if (viewTab === 'completed' ? !isCompleted(r) : isCompleted(r)) return false
      const customer = r.order.buyer_name || r.buyer.name || ''
      const hay = `${r.sample_number} ${r.order.job_number || ''} ${r.order.style_number || ''} ${customer} ${r.sample_type || ''}`.toLowerCase()
      if (!hay.includes(query.toLowerCase())) return false
      if (filterBuyer.length && !filterBuyer.includes(customer)) return false
      if (filterType.length && !filterType.includes((r.sample_type || ''))) return false
      if (filterStage.length && !filterStage.includes(r.stage)) return false
      if (filterApproval.length && !filterApproval.includes(r.approvalStatus)) return false
      return true
    })
    const samNum = r => Number(String(r.sample_number || '').match(/(\d+)(?!.*\d)/)?.[1] || 0)
    return [...filtered].sort((a,b) => {
      if (sortBy === 'due-asc' || sortBy === 'due-desc') {
        const av = a.dueDate ? new Date(a.dueDate).getTime() : Number.MAX_SAFE_INTEGER
        const bv = b.dueDate ? new Date(b.dueDate).getTime() : Number.MAX_SAFE_INTEGER
        return sortBy === 'due-asc' ? av-bv : bv-av
      }
      if (sortBy === 'sam-new') return samNum(b)-samNum(a)
      if (sortBy === 'sam-old') return samNum(a)-samNum(b)
      if (sortBy === 'customer') return (a.order.buyer_name || a.buyer.name || '').localeCompare(b.order.buyer_name || b.buyer.name || '')
      if (sortBy === 'style') return (a.order.style_number || '').localeCompare(b.order.style_number || '')
      if (sortBy === 'qty-desc') return (b.qty || 0)-(a.qty || 0)
      return 0
    })
  }, [allRows, viewTab, query, filterBuyer, filterType, filterStage, filterApproval, sortBy])

  const buyerOptions = [...new Set(allRows.map(r => r.order.buyer_name || r.buyer.name).filter(Boolean))].sort()
  const typeOptions = [...new Set(allRows.map(r => r.sample_type).filter(Boolean))].sort()
  const approvalOptions = ['Pending','Approved','Revision Required','Rejected']
  const groupLabel = r => groupBy === 'customer' ? (r.order.buyer_name || r.buyer.name || 'No Customer') : groupBy === 'job' ? (r.order.job_number || 'No Job #') : groupBy === 'style' ? (r.order.style_number || 'No Style #') : groupBy === 'type' ? (r.sample_type || 'No Type') : groupBy === 'stage' ? r.stage : groupBy === 'approval' ? r.approvalStatus : ''
  const groupedRows = groupBy === 'none' ? null : rows.reduce((acc,r) => { const k=groupLabel(r); (acc[k] ||= []).push(r); return acc }, {})
  const pendingCount = allRows.filter(r => r.approvalStatus === 'Pending').length
  const inProgressCount = allRows.filter(r => !['Not Started','Ready'].includes(r.stage) && r.dispatchStatus !== 'Dispatched').length
  const overdueCount = allRows.filter(r => r.dueDate && new Date(r.dueDate) < new Date() && !isCompleted(r)).length
  const completedCount = allRows.filter(isCompleted).length


  async function saveStage(sampleId, stage) {
    const sample=samples.find(x=>x.id===sampleId)
    if(!sample)return
    const previous=sample.stage||'Not Started'
    const {error:stageError}=await supabase.from('samples').update({stage}).eq('id',sampleId)
    if(stageError){alert(stageError.message,{title:'Stage Save Failed'});return}
    const {error:logError}=await supabase.from('sample_comments').insert({sample_id:sampleId,root_sample_id:sample.root_sample_id||sampleId,sam_number:sample.sample_number,version_label:sample.version_label||'V1',comment_type:'Stage',comment_text:previous+' → '+stage,comment_date:new Date().toISOString(),is_internal:true})
    if(logError)alert('Stage saved, but history log failed: '+logError.message,{title:'History Warning'})
    setSamples(v=>v.map(x=>x.id===sampleId?{...x,stage}:x))
    const meta = loadSamplingStore().sampleMeta[sampleId] || {}
    const stageDates = { ...(meta.stageDates || {}) }
    stageDates[stage] = new Date().toISOString().slice(0,10)
    updateSampleMeta(sampleId, { stage, stageDates })
    setRefreshKey(x => x + 1)
  }

  async function saveComment(sample, payload) {
    const existing=sampleComments.filter(c=>c.sample_id===sample.id&&!c.is_internal).sort((a,b)=>String(b.created_at||b.comment_date).localeCompare(String(a.created_at||a.comment_date)))[0]
    const legacy=existing?null:latestEditableComment(sample,sampleComments)
    const fields={comment_type:payload.type,comment_text:payload.text,comment_by:payload.by,comment_date:payload.date+'T12:00:00Z'}
    const previous=existing?{type:existing.comment_type,text:existing.comment_text,by:existing.comment_by,date:existing.comment_date,reasons:existing.meta?.revision_reasons||[]}:null
    const meta={...(existing?.meta||{}),revision_reasons:payload.reasons||[],...((existing||legacy)?{edit_history:[...(existing?.meta?.edit_history||[]),{previous:previous||{type:legacy.comment_type,text:legacy.comment_text,by:legacy.comment_by,date:legacy.comment_date,reasons:legacy.meta?.revision_reasons||[]},edited_at:new Date().toISOString()}]}:{})}
    const query=existing?supabase.from('sample_comments').update({...fields,meta}).eq('id',existing.id):supabase.from('sample_comments').insert({sample_id:sample.id,root_sample_id:sample.root_sample_id||sample.id,sam_number:sample.sample_number,version_label:sample.version,...fields,is_internal:false,meta})
    const {error:commentError}=await query
    if(commentError){alert('Comment was not saved to Supabase: '+commentError.message,{title:'Save Failed'});return}
    if(existing){setSampleComments(v=>v.map(c=>c.id===existing.id?{...c,...fields,meta}:c))}else{if(!legacy)addSampleComment(sample.id, payload)}
    const patch = payload.type === 'Approval'
      ? { approvalStatus:'Approved', dispatchStatus:'Comments Received', latestCommentType: payload.type, latestCommentDate: payload.date, latestCommentBy: payload.by }
      : payload.type === 'Revision'
      ? { approvalStatus:'Revision Required', dispatchStatus:'Comments Received', latestCommentType: payload.type, latestCommentDate: payload.date, latestCommentBy: payload.by }
      : { approvalStatus:'Rejected', dispatchStatus:'Comments Received', latestCommentType: payload.type, latestCommentDate: payload.date, latestCommentBy: payload.by }
    updateSampleMeta(sample.id, patch)
    setCommenting(null)
    setRefreshKey(x => x + 1)
  }

  async function createRevision(sample, dueDate) {
    const rootId = sample.root_sample_id || sample.id
    const family = samples.filter(x => x.id === rootId || x.root_sample_id === rootId)
    const rootSample = family.find(x => x.id === rootId) || sample
    const baseNumber = String(rootSample.sample_number).replace(/-V\\d+$/i, '')
    const maxVersion = Math.max(1, ...family.map(x => Number(x.version_no) || Number(String(x.version_label || '').replace(/^V/i,'')) || 1))
    const nextVersion = maxVersion + 1
    const nextNumber = baseNumber + '-V' + nextVersion
    const prev = getSampleComments(sample.id).filter(c => ['Revision','Rejection'].includes(c.type)).slice(-1)
    const fields = ['order_id','sample_type','color','size','requested_date','due_date',
      'size_group_id','size_group_name','colours','sizes','base_size',
      'bom_snapshot','wash_snapshot','emb_snapshot','req_pcs']
    const payload = {
      ...Object.fromEntries(fields.map(k => [k, sample[k]]).filter(([,v]) => v !== undefined)),
      sample_number: nextNumber,
      parent_sample_id: sample.id,
      root_sample_id: rootId,
      version_no: nextVersion,
      version_label: 'V' + nextVersion,
      comments: null,
      status: 'Pending',
      stage: 'Pattern',
      approval_status: 'Pending',
      dispatch_status: 'In Development',
      received_date: null,
      due_date: dueDate,
      requested_date: new Date().toISOString().slice(0,10),
    }
    const { data: inserted, error } = await supabase.from('samples').insert([payload]).select().single()
    if (error || !inserted) {
      alert(error?.message || 'Could not create revision sample', { title:'Revision Failed' })
      return false
    }
    updateSampleMeta(inserted.id, {
      version: 'V' + nextVersion,
      stage: 'Pattern',
      dispatchStatus: 'In Development',
      approvalStatus: 'Pending',
      parentSampleId: sample.id,
      carryForwardComments: prev,
    })
    setSelectedIds([])
    setRefreshKey(x => x + 1)
    return true
  }

  const selectedRows = rows.filter(r => selectedIds.includes(r.id))
  const selectedRow = selectedRows.length === 1 ? selectedRows[0] : null
  const canSingle = !!selectedRow
  const selectedHasComments = !!latestEditableComment(selectedRow, sampleComments)
  const canSend = !!selectedRow && selectedRow.stage === 'Ready' && selectedRow.dispatchStatus !== 'Dispatched'

  async function printSampleProgram(row) {
    const html=await buildSampleProgramHTML(row,{bomItems,fittingBlocks,allRows,sampleComments,parcelItems})
    PrintWindow({html,title:`${row.sample_number} Sampling Program`})
  }

  const washColour = r => {
    const snapshot = Array.isArray(r.wash_snapshot) ? r.wash_snapshot : []
    const names = [...new Set(snapshot.map(w => w?.color_name || w?.colour_name || w?.wash_color || w?.wash_colour).filter(Boolean))]
    return names.join(', ') || (Array.isArray(r.colours) ? r.colours.join(', ') : '') || '—'
  }
  const sampleSize = r => r.base_size || (Array.isArray(r.sizes) ? r.sizes.join(', ') : '') || r.size || '—'
  const renderRow = r => {
    const versionNumber = Number(r.version_no) || Number(String(r.version_label || r.version || 'V1').match(/V?([0-9]+)/i)?.[1]) || 1
    const versionTag = 'V' + versionNumber
    const versionStyle = versionNumber===1 ? {background:'#dcfce7',color:'#166534'} : versionNumber===2 ? {background:'#ffedd5',color:'#c2410c'} : {background:'#dc2626',color:'#ffffff'}
    const factoryReference = r.meta?.reference || r.meta?.ref || r.meta?.factoryRef || r.order?.factory_ref || ''
    const child = samples.filter(x=>x.parent_sample_id===r.id).sort((a,b)=>new Date(b.created_at)-new Date(a.created_at))[0]
    return (

    <tr key={r.id} onDoubleClick={()=>setMetadataSample(r)} title="Double-click for sample history" style={{cursor:'pointer'}}>
      <td onClick={e=>e.stopPropagation()}><input type="checkbox" checked={selectedIds.includes(r.id)} onChange={e => setSelectedIds(v => e.target.checked ? [...new Set([...v,r.id])] : v.filter(x=>x!==r.id))}/></td>
      <td><div style={{fontFamily:'monospace',fontWeight:700,whiteSpace:'nowrap'}}>{r.sample_number}</div><div style={{fontSize:11,marginTop:3,fontWeight:600,color:'#374151'}}>{factoryReference || '—'}</div></td>
      <td><div style={{fontWeight:600}}>{r.order.buyer_name || r.buyer.name || '—'}</div></td>
      <td><div style={{fontFamily:'monospace',fontWeight:600}}>{r.order.job_number || '—'}</div></td>
      <td><div style={{fontWeight:700}}>{r.order.style_number || '—'}</div><div style={{fontSize:10,color:'#9ca3af'}}>{r.order.description || ''}</div></td>
      <td><div style={{display:'flex',alignItems:'center',gap:5,whiteSpace:'nowrap'}}><span style={{...versionStyle,fontSize:10,fontWeight:700,padding:'2px 5px',borderRadius:3,lineHeight:1.35}}>{versionTag}</span><span>{r.sample_type || '—'}</span></div></td>
      <td style={{maxWidth:130,overflowWrap:'anywhere'}}>{washColour(r)}</td><td style={{fontWeight:600,whiteSpace:'nowrap'}}>{sampleSize(r)}</td><td style={{fontWeight:600}}>{r.qty || '—'}</td>
      <td>{viewTab==='completed'?<div>{statusPill('','',r.currentStatus.label)}<div style={{fontSize:10,color:'#9ca3af',marginTop:4}}>{r.currentStatus.date?formatDate(r.currentStatus.date):'—'}</div>{child&&<div style={{fontSize:10,color:'#475569',marginTop:4,fontWeight:600}}>{child.version_label||'V'+child.version_no} Requested on {formatDate(child.created_at||child.requested_date)}</div>}</div>:['Dispatched','Delivered'].includes(r.dispatchStatus) ? <div>{statusPill('#dcfce7','#166534',r.dispatchStatus)}<div style={{fontSize:10,color:'#9ca3af',marginTop:4}}>{formatDate(r.meta.dispatchDate || r.meta.sentToParcelsAt)}</div></div> : <div><select style={{...inp,height:30,minWidth:130}} value={r.stage} onChange={e=>saveStage(r.id,e.target.value)}>{STAGES.map(x=><option key={x}>{x}</option>)}</select><div style={{fontSize:10,color:'#9ca3af',marginTop:4}}>{r.meta.stageDates?.[r.stage] ? formatDate(r.meta.stageDates[r.stage]) : '—'}</div></div>}</td>
      {viewTab!=='completed'&&<td><div style={{fontWeight:600}}>{r.dueDate ? formatDate(r.dueDate) : '—'}</div>{r.dueDate && <div style={{fontSize:10,color:new Date(r.dueDate)<new Date()&&!isCompleted(r)?'#dc2626':'#9ca3af',marginTop:3}}>{Math.ceil((new Date(r.dueDate)-new Date())/86400000) >= 0 ? `${Math.ceil((new Date(r.dueDate)-new Date())/86400000)}d` : `${Math.abs(Math.ceil((new Date(r.dueDate)-new Date())/86400000))}d overdue`}</div>}</td>}
    </tr>
  )
  }

  return (
    <div style={{display:'flex',flexDirection:'column',height:'100%',width:'100%',minWidth:0,background:'#fff'}}>
      <div style={{height:48,borderBottom:'1px solid #e5e7eb',display:'flex',alignItems:'flex-end',padding:'0 24px',gap:28,flexShrink:0}}>
        <button onClick={()=>{switchTab('active')}} style={{height:48,border:'none',borderBottom:viewTab==='active'?'2px solid #111':'2px solid transparent',background:'transparent',fontSize:13,fontWeight:viewTab==='active'?700:500,color:viewTab==='active'?'#111':'#9ca3af',cursor:'pointer'}}>Sampling & Approvals</button>
        <button onClick={()=>{switchTab('completed')}} style={{height:48,border:'none',borderBottom:viewTab==='completed'?'2px solid #111':'2px solid transparent',background:'transparent',fontSize:13,fontWeight:viewTab==='completed'?700:500,color:viewTab==='completed'?'#111':'#9ca3af',cursor:'pointer'}}>Completed Samples <span style={{fontSize:10,color:'#9ca3af'}}>({completedCount})</span></button>
      </div>
      <div style={{padding:'10px 24px',borderBottom:'1px solid #f3f4f6',display:'flex',alignItems:'center',gap:14,flexShrink:0,overflowX:'auto'}}>
        <div style={{flexShrink:0}}><div className="app-page-title">{viewTab === 'active' ? 'Sampling & Approvals' : 'Completed Samples'}</div></div>
        <div style={{display:'flex',gap:8}}>{[
          ...(viewTab==='active' ? [['Total Samples',allRows.length,false],...STAGES.map(stage=>[stage,allRows.filter(r=>!isCompleted(r)&&(r.stage||'Not Started')===stage).length,stage==='Not Started']),['Overdue',overdueCount,true]] : [['Total Samples',allRows.length,false],['Pending Approval',pendingCount,pendingCount>0],['In Progress',inProgressCount,false],['Overdue',overdueCount,overdueCount>0]])
        ].map(([label,value,amber])=><div key={label} style={{padding:'6px 12px',border:'1px solid var(--border)',borderRadius:8,background:'#fff',minWidth:100}}><div style={{fontSize:9,fontWeight:600,color:'var(--text-light)',textTransform:'uppercase',letterSpacing:'0.5px',marginBottom:2}}>{label}</div><div style={{fontSize:18,fontWeight:700,lineHeight:1,color:amber?'#d97706':'#0d0d0d'}}>{value}</div></div>)}</div>
        <div style={{marginLeft:'auto',display:'flex',gap:8}}>
          {viewTab === 'completed' && <button className="btn btn-secondary" disabled={!canSingle} onClick={()=>selectedRow&&setCommenting(selectedRow)}><MessageSquarePlus size={13}/> {selectedHasComments ? 'Edit Comment' : 'Add Comment'}</button>}
          {viewTab === 'completed' && <button className="btn btn-secondary" disabled={!canSingle} onClick={()=>{if(selectedRow){setRevisionRequest(selectedRow);setRevisionDue('')}}}><ClipboardCheck size={13}/> Create V+</button>}
          {viewTab === 'completed' && <button className="btn btn-secondary" disabled={!canSend} onClick={()=>selectedRow&&setDispatching(selectedRow)}><PackagePlus size={13}/> Send to Parcels</button>}
          <button className="btn" style={{background:canSingle?'#6d28d9':'#e5e7eb',color:canSingle?'#fff':'#9ca3af',border:'1px solid '+(canSingle?'#5b21b6':'#d1d5db'),fontWeight:700}} disabled={!canSingle} onClick={()=>selectedRow&&printSampleProgram(selectedRow)}><Printer size={13}/> Program</button>
        </div>
      </div>

      <div style={{padding:'8px 24px',borderBottom:'1px solid #f3f4f6',display:'grid',gridTemplateColumns:'minmax(210px,1.65fr) minmax(135px,1fr) minmax(140px,1fr) minmax(125px,.9fr) minmax(105px,.78fr) minmax(110px,.82fr) minmax(120px,.88fr) auto',alignItems:'center',gap:8,flexShrink:0,width:'100%',boxSizing:'border-box',overflowX:'auto'}}>
        <div style={{position:'relative',minWidth:0}}><Search size={13} style={{position:'absolute',left:9,top:'50%',transform:'translateY(-50%)',color:'#9ca3af'}}/><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Search SAM#, job, style, buyer..." style={{width:'100%',boxSizing:'border-box',paddingLeft:28,paddingRight:10,height:32,border:'1px solid var(--border)',borderRadius:7,fontSize:12,outline:'none',background:'#fafafa'}}/></div>
        <select value={groupBy} onChange={e=>setGroupBy(e.target.value)} style={{...inp,width:'100%',minWidth:0}}><option value="none">☰ No Grouping</option><option value="customer">☰ By Customer</option><option value="job">☰ By Job #</option><option value="style">☰ By Style #</option><option value="type">☰ By Sample Type</option><option value="stage">☰ By Stage</option><option value="approval">☰ By Approval</option></select>
        <select value={sortBy} onChange={e=>setSortBy(e.target.value)} style={{...inp,width:'100%',minWidth:0}}><option value="due-asc">⇅ Due Date (Asc)</option><option value="due-desc">⇅ Due Date (Desc)</option><option value="sam-new">⇅ SAM # (Newest)</option><option value="sam-old">⇅ SAM # (Oldest)</option><option value="customer">⇅ Customer (A–Z)</option><option value="style">⇅ Style # (A–Z)</option><option value="qty-desc">⇅ Qty (High–Low)</option></select>
        <MultiFilter title="Customers" options={buyerOptions} value={filterBuyer} onChange={setFilterBuyer}/>
        <MultiFilter title="Types" options={typeOptions} value={filterType} onChange={setFilterType}/>
        <MultiFilter title="Stages" options={STAGES} value={filterStage} onChange={setFilterStage}/>
        <MultiFilter title="Approvals" options={approvalOptions} value={filterApproval} onChange={setFilterApproval}/>
        <button className="btn btn-secondary" style={{whiteSpace:'nowrap',justifySelf:'end'}} onClick={()=>setRefreshKey(x=>x+1)}><RefreshCw size={14}/> Refresh</button>
      </div>

      <div style={{flex:1,minHeight:0,overflowX:'auto',overflowY:'auto',width:'100%',minWidth:0,boxSizing:'border-box',padding:'0 12px'}} className="table-wrap">
        <table style={{width:'100%',minWidth:1150,tableLayout:'auto'}}><thead><tr><th style={{width:36}}><input type="checkbox" checked={rows.length>0&&selectedIds.length===rows.length} onChange={e=>setSelectedIds(e.target.checked?rows.map(r=>r.id):[])}/></th><th>SAM # / Factory Ref #</th><th>Customer</th><th>Job #</th><th>Style #</th><th>Type / Ver.</th><th>Wash Colour</th><th>Sample Size</th><th>Qty</th><th>Status</th>{viewTab!=='completed'&&<th>Due Date</th>}</tr></thead>
          <tbody>{groupedRows ? Object.entries(groupedRows).flatMap(([group,items]) => [<tr key={`g-${group}`}><td colSpan={viewTab==='completed'?10:11} style={{background:'#dceefa',fontWeight:700,padding:'8px 12px'}}>{group} <span style={{color:'#6b7280',fontWeight:500}}>— {items.length} sample{items.length===1?'':'s'}</span></td></tr>, ...items.map(renderRow)]) : rows.map(renderRow)}{rows.length===0&&<tr><td colSpan={11} style={{textAlign:'center',padding:28,color:'#9ca3af'}}>No sample requests found.</td></tr>}</tbody>
        </table>
      </div>
      <div style={{height:34,borderTop:'1px solid #e5e7eb',display:'flex',alignItems:'center',padding:'0 24px',fontSize:11,color:'#6b7280',flexShrink:0}}><strong style={{color:'#374151'}}>{rows.length} {viewTab === 'completed' ? 'COMPLETED SAMPLES' : 'SAMPLES'}</strong><span style={{marginLeft:'auto'}}>{selectedIds.length ? `${selectedIds.length} selected` : (viewTab === 'completed' ? `${completedCount} completed` : `${pendingCount} pending approval`)}</span></div>
      {revisionRequest&&<div style={{position:'fixed',inset:0,background:'rgba(15,23,42,.35)',zIndex:10000,display:'flex',alignItems:'center',justifyContent:'center'}} onClick={()=>!revisionSaving&&setRevisionRequest(null)}><form onClick={e=>e.stopPropagation()} onSubmit={async e=>{e.preventDefault();if(!revisionDue||revisionSaving)return;setRevisionSaving(true);try{if(await createRevision(revisionRequest,revisionDue))setRevisionRequest(null)}finally{setRevisionSaving(false)}}} style={{background:'#fff',borderRadius:12,padding:24,width:360,maxWidth:'90vw',boxShadow:'0 18px 45px #0002'}}><h3 style={{margin:'0 0 8px'}}>Create Sample Revision</h3><div style={{fontSize:12,color:'#64748b',marginBottom:18}}>{revisionRequest.sample_number} · {revisionRequest.version_label||'V1'} → New Version</div><label style={{display:'block',fontSize:12,fontWeight:600,marginBottom:6}}>Revision due date *</label><input type="date" required value={revisionDue} onChange={e=>setRevisionDue(e.target.value)} style={{...inp,width:'100%',boxSizing:'border-box'}}/><div style={{fontSize:11,color:'#64748b',marginTop:12}}>The original sample and its history remain unchanged.</div><div style={{display:'flex',justifyContent:'flex-end',gap:8,marginTop:20}}><button type="button" className="btn btn-secondary" disabled={revisionSaving} onClick={()=>setRevisionRequest(null)}>Cancel</button><button type="submit" className="btn" disabled={!revisionDue||revisionSaving} style={{background:'#111827',color:'white'}}>{revisionSaving?'Creating…':'Create V+'}</button></div></form></div>}
      {metadataSample&&<SampleMetadata sample={metadataSample} allSamples={samples} parcels={parcelItems} comments={sampleComments} onClose={()=>setMetadataSample(null)}/>}
      {dispatching&&<DispatchChecklistModal sample={dispatching} onClose={()=>setDispatching(null)} onDone={checks=>{sendSampleToParcelPool(dispatching.id,checks);setDispatching(null);setRefreshKey(x=>x+1)}}/>}
      {commenting&&<CommentModal sample={commenting} existingComment={latestEditableComment(commenting,sampleComments)} onClose={()=>setCommenting(null)} onSaved={payload=>saveComment(commenting,payload)}/>}<Dialogs/>
    </div>
  )
}
