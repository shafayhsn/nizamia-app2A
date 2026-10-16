import React, { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAppDialogs } from '../components/ui/AppDialogs'
import { formatDate } from '../lib/utils'
import { loadSamplingStore, getSampleComments, updateSampleMeta, addSampleComment, sendSampleToParcelPool } from '../lib/samplingStore'
import { ClipboardCheck, MessageSquarePlus, PackagePlus, Printer, RefreshCw, Search, ChevronDown } from 'lucide-react'
import { statusBadgeStyle } from '../lib/statusColors'

const STAGES = ['Not Started', 'Pattern', 'Cutting', 'Stitching', 'Washing', 'Finishing', 'Ready']
const COMMENT_TYPES = ['Approval', 'Revision', 'Rejection']

const card = { background:'#fff', border:'1px solid #ececec', borderRadius:12, boxShadow:'0 1px 2px rgba(0,0,0,.03)' }
const inp = { height:34, padding:'0 10px', border:'1px solid #e5e7eb', borderRadius:8, fontSize:12, width:'100%', boxSizing:'border-box', outline:'none' }
const btn = { height:32, padding:'0 12px', border:'1px solid #e5e7eb', borderRadius:8, background:'#fff', fontSize:12, fontWeight:600, cursor:'pointer' }


const SETTINGS_KEY = 'nizamia:sampling:table-settings:v1'
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
  const root=React.useRef(null)
  useEffect(()=>{
    if(!open)return
    const close=e=>{if(!root.current?.contains(e.target))setOpen(false)}
    document.addEventListener('pointerdown',close)
    return()=>document.removeEventListener('pointerdown',close)
  },[open])
  const label=value.length===0?`All ${title}`:value.length===1?value[0]:`${title} (${value.length})`
  return <div ref={root} style={{position:'relative',minWidth:0}}>
    <button type="button" onClick={()=>setOpen(o=>!o)} style={{...inp,display:'flex',justifyContent:'space-between',alignItems:'center',background:'#fff',cursor:'pointer',textAlign:'left',whiteSpace:'nowrap',overflow:'hidden'}} title={label}><span style={{overflow:'hidden',textOverflow:'ellipsis'}}>{label}</span><ChevronDown size={13}/></button>
    {open&&<div style={{position:'absolute',zIndex:80,top:'calc(100% + 4px)',right:0,minWidth:200,maxHeight:265,overflowY:'auto',background:'#fff',border:'1px solid #d1d5db',boxShadow:'0 8px 22px #0002',borderRadius:8,padding:7}}>
      <button type="button" onClick={()=>onChange([])} style={{...btn,width:'100%',marginBottom:5,textAlign:'left'}}>All / Clear selection</button>
      {options.map(x=><label key={x} style={{display:'flex',gap:8,alignItems:'center',padding:'6px 4px',fontSize:12,cursor:'pointer'}}><input type="checkbox" checked={value.includes(x)} onChange={e=>onChange(e.target.checked?[...value,x]:value.filter(v=>v!==x))}/><span>{x}</span></label>)}
    </div>}
  </div>
}

function statusPill(bg, color, text) {
  return <span style={statusBadgeStyle(text)}>{text}</span>
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
    .program-head{display:flex;justify-content:space-between;align-items:center;border-bottom:2px solid #111;padding:5px 0 9px}
    .company{font-size:12px;font-weight:800;letter-spacing:.4px}.program h1{font-size:19px;margin-top:3px}.sam{font-size:21px;font-weight:800}
    .info{display:grid;grid-template-columns:1fr 110px;gap:12px;margin-top:12px}.fields{display:grid;grid-template-columns:1fr 1fr;gap:8px 12px}
    .fields>div{display:grid;grid-template-columns:100px 1fr;gap:5px;border-bottom:1px solid #ddd;padding-bottom:4px}.fields b{font-size:10px}.fields span{font-size:11px}
    .picture-box{border:1px solid #111;min-height:112px;display:flex;align-items:center;justify-content:center}.picture{max-width:100%;max-height:112px;object-fit:contain;filter:grayscale(1)}.picture-empty{font-size:10px}
    .timeline,.specs{display:grid;grid-template-columns:repeat(4,1fr);border:1px solid #111;margin-top:13px}.timeline>div,.specs>div{display:flex;flex-direction:column;align-items:center;text-align:center;padding:9px 4px;gap:5px;border-right:1px solid #777}.timeline>div:last-child,.specs>div:last-child{border-right:0}.timeline b,.specs b{font-size:10px}.timeline strong,.specs strong{font-size:12px}
    .program h2{font-size:13px;text-align:center;margin:14px 0 5px}.bom{margin-top:0}.bom th,.bom td{padding:5px 6px;font-size:10px;background:#fff}.bom .important{font-weight:800}.history{border-bottom:1px solid #888;padding:7px 2px;break-inside:avoid}.history p{margin:4px 0}.program footer{border-top:1px solid #111;text-align:right;margin-top:16px;padding-top:6px;font-size:10px}.warning{border:1px solid #111;padding:5px;margin-top:6px;font-weight:700}
    @page{size:A4 portrait;margin:12mm}
    @media print { body{padding:0}.program{max-width:none} }

  </style></head><body>${html}</body></html>`)
  w.document.close()
  w.focus()
  setTimeout(() => w.print(), 350)
  return null
}

function DispatchChecklistModal({ sample, onClose, onDone }) {
  const { Dialogs } = useAppDialogs()
  const [checks, setChecks] = useState({ checked:false, standard:false, qr:false })
  const all = checks.checked && checks.standard && checks.qr
  return (
    <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,.35)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:400 }}>
      <div style={{ ...card, width:420, padding:18 }}>
        <div style={{ fontSize:16, fontWeight:700, marginBottom:4 }}>Send to Parcels</div>
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

function CommentModal({ sample, onClose, onSaved }) {
  const { Dialogs } = useAppDialogs()
  const [type, setType] = useState('Revision')
  const [date, setDate] = useState(new Date().toISOString().slice(0,10))
  const [by, setBy] = useState('')
  const [text, setText] = useState('')
  const valid = type && date && by.trim() && text.trim()
  return (
    <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,.35)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:400 }}>
      <div style={{ ...card, width:560, padding:18 }}>
        <div style={{ fontSize:16, fontWeight:700, marginBottom:4 }}>Record Comment</div>
        <div style={{ fontSize:12, color:'#6b7280', marginBottom:14 }}>{sample.sample_number} · Copy-paste buyer comments here</div>
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:10, marginBottom:10 }}>
          <select style={inp} value={type} onChange={e=>setType(e.target.value)}>{COMMENT_TYPES.map(x => <option key={x}>{x}</option>)}</select>
          <input style={inp} type="date" value={date} onChange={e=>setDate(e.target.value)} />
          <input style={inp} placeholder="Comment by" value={by} onChange={e=>setBy(e.target.value)} />
        </div>
        <textarea style={{ ...inp, height:140, padding:'10px' }} placeholder="Paste comments here..." value={text} onChange={e=>setText(e.target.value)} />
        <div style={{ display:'flex', justifyContent:'flex-end', gap:8, marginTop:12 }}>
          <button style={btn} onClick={onClose}>Cancel</button>
          <button style={{ ...btn, background:valid?'#111827':'#e5e7eb', color:valid?'#fff':'#9ca3af', borderColor:valid?'#111827':'#e5e7eb' }} disabled={!valid} onClick={() => onSaved({ type, date, by, text })}>Save Comment</button>
        </div>
      </div>
      <Dialogs />
    </div>
  )
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
  const [query, setQuery] = useState('')
  const [selectedIds, setSelectedIds] = useState([])
  const [groupBy, setGroupBy] = useState(() => readSettings().groupBy || 'none')
  const [filterBuyer, setFilterBuyer] = useState(() => readSettings().filterBuyer || [])
  const [filterType, setFilterType] = useState(() => readSettings().filterType || [])
  const [filterStage, setFilterStage] = useState(() => readSettings().filterStage || [])
  const [filterApproval, setFilterApproval] = useState(() => readSettings().filterApproval || [])
  const [sortBy, setSortBy] = useState(() => readSettings().sortBy || 'due-asc')
  const [viewTab, setViewTab] = useState('active')

  useEffect(() => { load() }, [refreshKey])
  useEffect(() => {
    try { localStorage.setItem(SETTINGS_KEY,JSON.stringify({groupBy,sortBy,filterBuyer,filterType,filterStage,filterApproval})) } catch {}
  },[groupBy,sortBy,filterBuyer,filterType,filterStage,filterApproval])

  async function load() {
    const [{ data: s }, { data: o }, { data: b }, {data: bom}, {data: blocks}, {data: comments}, {data: parcels}] = await Promise.all([
      supabase.from('samples').select('*').order('created_at', { ascending:false }),
      supabase.from('orders').select('id,buyer_id,buyer_name,job_number,style_number,description,merchandiser_name,style_image_url,style_image_base64').order('created_at', { ascending:false }),
      supabase.from('buyers').select('*').order('name'),
      supabase.from('bom_items').select('*').order('sort_order'),
      supabase.from('fitting_blocks').select('*').order('sort_order'),
      supabase.from('sample_comments').select('*').order('comment_date'),
      supabase.from('parcels').select('id,items,custom_items,dispatch_date,dispatched_at'),
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
    const sampleMeta = loadSamplingStore().sampleMeta || {}
    return samples.map(s => {
    const order = orderMap[s.order_id] || {}
    const buyer = buyerMap[order.buyer_id] || {}
    const meta = sampleMeta[s.id] || {}
    const comments = getSampleComments(s.id)
    const latest = comments[comments.length - 1]
    return { ...s, order, buyer, meta, comments, latest, version: s.version_label || meta.version || `V${s.version_no || 1}`, stage: s.stage || meta.stage || 'Not Started', dispatchStatus: s.dispatch_status || meta.dispatchStatus || 'In Development', approvalStatus: s.approval_status || meta.approvalStatus || 'Pending', dueDate: s.due_date || meta.dueDate || null, qty: s.req_pcs || s.qty || 0, latestCommentText: latest?.text || '' }
    })
  }, [samples, orderMap, buyerMap, refreshKey])

  const isCompleted = r => r.approvalStatus === 'Approved' || ['complete','completed'].includes(String(r.status || '').toLowerCase())
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
    const meta = loadSamplingStore().sampleMeta[sampleId] || {}
    const stageDates = { ...(meta.stageDates || {}) }
    stageDates[stage] = new Date().toISOString().slice(0,10)
    updateSampleMeta(sampleId, { stage, stageDates })
    setRefreshKey(x => x + 1)
  }

  async function saveComment(sample, payload) {
    addSampleComment(sample.id, payload)
    const patch = payload.type === 'Approval'
      ? { approvalStatus:'Approved', dispatchStatus:'Comments Received', latestCommentType: payload.type, latestCommentDate: payload.date, latestCommentBy: payload.by }
      : payload.type === 'Revision'
      ? { approvalStatus:'Revision Required', dispatchStatus:'Comments Received', latestCommentType: payload.type, latestCommentDate: payload.date, latestCommentBy: payload.by }
      : { approvalStatus:'Rejected', dispatchStatus:'Comments Received', latestCommentType: payload.type, latestCommentDate: payload.date, latestCommentBy: payload.by }
    updateSampleMeta(sample.id, patch)
    setCommenting(null)
    setRefreshKey(x => x + 1)
  }

  async function createRevision(sample) {
    const prev = getSampleComments(sample.id).filter(c => ['Revision','Rejection'].includes(c.type)).slice(-1)
    const meta = loadSamplingStore().sampleMeta[sample.id] || {}
    const num = sample.sample_number
    const nextVersion = Math.max(1, Number(sample.version_no) || parseInt(String(sample.version_label || 'V1').replace('V','')) || 1) + 1
    // Only insert actual database fields, not UI-enriched order/buyer/meta objects.
    const fields = ['order_id','sample_type','color','size','requested_date','due_date',
      'size_group_id','size_group_name','colours','sizes','base_size',
      'bom_snapshot','wash_snapshot','emb_snapshot','req_pcs']
    const payload = {
      ...Object.fromEntries(fields.map(k => [k, sample[k]]).filter(([,v]) => v !== undefined)),
      sample_number: num,
      parent_sample_id: sample.id,
      root_sample_id: sample.root_sample_id || sample.id,
      version_no: nextVersion,
      version_label: `V${nextVersion}`,
      comments: null,
      status: 'Pending',
      received_date: null,
    }
    const { data: inserted, error } = await supabase.from('samples').insert([payload]).select().single()
    if (error || !inserted) {
      alert(error?.message || 'Could not create revision sample', { title:'Revision Failed' })
      return
    }
    updateSampleMeta(inserted.id, {
      version: `V${nextVersion}`,
      stage: 'Pattern',
      dispatchStatus: 'In Development',
      approvalStatus: 'Pending',
      parentSampleId: sample.id,
      carryForwardComments: prev,
    })
    setRefreshKey(x => x + 1)
  }

  const selectedRows = rows.filter(r => selectedIds.includes(r.id))
  const selectedRow = selectedRows.length === 1 ? selectedRows[0] : null
  const canSingle = !!selectedRow
  const canSend = !!selectedRow && selectedRow.stage === 'Ready' && selectedRow.dispatchStatus !== 'Dispatched'

  function printSampleProgram(row) {
    const qty = Number(row.qty) || 0
    const orderBOM = bomItems.filter(item=>item.order_id===row.order_id)
    const priority = item => {
      const text = `${item.category || ''} ${item.name || ''}`.toLowerCase()
      if (/fabric|denim|canvas|twill/.test(text)) return 0
      if (/thread/.test(text)) return 1
      if (/zipper|zip\b/.test(text)) return 2
      return 3
    }
    const sortedBOM=[...orderBOM].sort((a,b)=>priority(a)-priority(b)||(a.sort_order||0)-(b.sort_order||0))
    const bomRows=sortedBOM.map(item=>{
      const consumption=Number(item.base_qty)
      const valid=Number.isFinite(consumption) && item.base_qty != null
      const required=valid?(consumption*qty).toLocaleString('en-US',{maximumFractionDigits:4}):'—'
      const important=priority(item)<3
      const unit=safeText(item.unit || '')
      return `<tr class="${important?'important':''}"><td>${safeText(item.name||'—')}</td><td>${safeText(item.category||'—')}</td><td>${safeText(item.detail||item.specification||'—')}</td><td>${valid?consumption.toLocaleString('en-US',{maximumFractionDigits:4}):'—'} ${unit}</td><td>${required} ${unit}</td></tr>`
    }).join('') || '<tr><td colspan="5">No BOM items configured for this order</td></tr>'
    const spec=[...fittingBlocks].filter(b=>b.order_id===row.order_id).map(b=>b.spec_code).filter(Boolean).join(', ') || '—'
    const root=row.root_sample_id || row.parent_sample_id || row.id
    const family=allRows.filter(s=>s.id===root || s.root_sample_id===root || (s.sample_number===row.sample_number && s.order_id===row.order_id))
    const earlier=family.filter(s=>s.id!==row.id && Number(s.version_no||1)<Number(row.version_no||1)).sort((a,b)=>Number(a.version_no||1)-Number(b.version_no||1))
    const histories=earlier.map(s=>{
      const comments=sampleComments.filter(c=>c.sample_id===s.id || (c.sam_number===s.sample_number && c.version_label===s.version_label))
      const parcel=parcelItems.find(p=>[...(Array.isArray(p.items)?p.items:[]),...(Array.isArray(p.custom_items)?p.custom_items:[])].some(x=>x?.sample_id===s.id))
      return `<div class="history"><b>${safeText(s.version_label||'V1')}</b> — Sample: ${dayString(s.created_at)||'—'} | Parcel: ${dayString(parcel?.dispatch_date||parcel?.dispatched_at)||'—'}<div>${comments.length?comments.map(c=>`<p><b>${dayString(c.comment_date)||'—'}:</b> ${safeText(c.comment_text||'')}</p>`).join(''):'No recorded comments'}</div></div>`
    }).join('') || '<div class="history">No previous versions</div>'
    const start=row.requested_date||row.created_at
    const ready=row.dueDate
    const milestones=[['Start Date',dayString(start)],['Pattern Ready',shiftDate(start,1)],['Send to Wash',shiftDate(ready,-2)],['Sample Ready',dayString(ready)]]
    const timelineConflict=!!(start&&ready&&new Date(String(start).slice(0,10))>new Date(String(ready).slice(0,10)))
    const image=row.order.style_image_url || row.order.style_image_base64 || ''
    const picture=image?`<img class="picture" src="${safeText(image)}" alt="Style image"/>`:'<div class="picture-empty">No image</div>'
    const html=`<div class="program">
      <div class="program-head"><div><div class="company">NIZAMIA APPARELS</div><h1>Sampling Program</h1></div><div class="sam">${safeText(row.sample_number)}</div></div>
      <div class="info"><div class="fields"><div><b>Job Number</b><span>${safeText(row.order.job_number||'—')}</span></div><div><b>Date Created</b><span>${dayString(row.created_at)||'—'}</span></div><div><b>Buyer</b><span>${safeText(row.order.buyer_name||row.buyer.name||'—')}</span></div><div><b>Merchandiser</b><span>${safeText(row.order.merchandiser_name||'—')}</span></div><div><b>Description</b><span>${safeText(row.order.description||'—')}</span></div><div><b>Sample Nature</b><span>${safeText(row.sample_type||'—')}</span></div><div><b>Wash / Colour</b><span>${safeText(washColour(row))}</span></div><div><b>Sample Version</b><span>${safeText(row.version)}</span></div></div><div class="picture-box">${picture}</div></div>
      <div class="timeline">${milestones.map(([label,date])=>`<div><b>${label}</b><strong>${date||'—'}</strong></div>`).join('')}</div>
      ${timelineConflict?'<div class="warning">Check schedule: sample due date precedes its start date.</div>':''}
      <div class="specs"><div><b>Style Number</b><strong>${safeText(row.order.style_number||'—')}</strong></div><div><b>Spec Chart to Use</b><strong>${safeText(spec)}</strong></div><div><b>Sample Size</b><strong>${safeText(sampleSize(row))}</strong></div><div><b>Sample Qty</b><strong>${qty} pcs</strong></div></div>
      <h2>Style BOM Details</h2><table class="bom"><thead><tr><th>Item</th><th>Type</th><th>Detail</th><th>Consumption / pc</th><th>Required</th></tr></thead><tbody>${bomRows}</tbody></table>
      <h2>Previous Versions of This Sample</h2>${histories}
      <footer>Printed on: ${dayString(new Date().toISOString().slice(0,10))} | User: ${safeText(localStorage.getItem('nizamia_user_name')||'Logged-in user')}</footer>
    </div>`
    PrintWindow({html,title:`${row.sample_number} Sampling Program`})
  }

  const washColour = r => {
    const snapshot = Array.isArray(r.wash_snapshot) ? r.wash_snapshot : []
    const names = [...new Set(snapshot.map(w => w?.color_name || w?.colour_name || w?.wash_color || w?.wash_colour).filter(Boolean))]
    return names.join(', ') || (Array.isArray(r.colours) ? r.colours.join(', ') : '') || '—'
  }
  const sampleSize = r => r.base_size || (Array.isArray(r.sizes) ? r.sizes.join(', ') : '') || r.size || '—'
  const renderRow = r => (

    <tr key={r.id}>
      <td><input type="checkbox" checked={selectedIds.includes(r.id)} onChange={e => setSelectedIds(v => e.target.checked ? [...new Set([...v,r.id])] : v.filter(x=>x!==r.id))}/></td>
      <td><div style={{fontFamily:'monospace',fontWeight:700,whiteSpace:'nowrap'}}>{r.sample_number}</div><div style={{fontSize:11,marginTop:3,fontWeight:600,color:'#374151'}}>{r.approvalStatus}</div></td>
      <td><div style={{fontWeight:600}}>{r.order.buyer_name || r.buyer.name || '—'}</div></td>
      <td><div style={{fontFamily:'monospace',fontWeight:600}}>{r.order.job_number || '—'}</div></td>
      <td><div style={{fontWeight:700}}>{r.order.style_number || '—'}</div><div style={{fontSize:10,color:'#9ca3af'}}>{r.order.description || ''}</div></td>
      <td><div>{r.sample_type || '—'}</div><div style={{fontSize:10,color:'#6b7280'}}>{r.version}</div></td>
      <td style={{maxWidth:130,overflowWrap:'anywhere'}}>{washColour(r)}</td><td style={{fontWeight:600,whiteSpace:'nowrap'}}>{sampleSize(r)}</td><td style={{fontWeight:600}}>{r.qty || '—'}</td>
      <td>{r.dispatchStatus === 'Dispatched' ? <div>{statusPill('#dcfce7','#166534','Dispatched')}<div style={{fontSize:10,color:'#9ca3af',marginTop:4}}>{formatDate(r.meta.dispatchDate || r.meta.sentToParcelsAt)}</div></div> : <div><select style={{...inp,height:30,minWidth:130}} value={r.stage} onChange={e=>saveStage(r.id,e.target.value)}>{STAGES.map(x=><option key={x}>{x}</option>)}</select><div style={{fontSize:10,color:'#9ca3af',marginTop:4}}>{r.meta.stageDates?.[r.stage] ? formatDate(r.meta.stageDates[r.stage]) : '—'}</div></div>}</td>
      <td><div style={{fontWeight:600}}>{r.dueDate ? formatDate(r.dueDate) : '—'}</div>{r.dueDate && <div style={{fontSize:10,color:new Date(r.dueDate)<new Date()&&!isCompleted(r)?'#dc2626':'#9ca3af',marginTop:3}}>{Math.ceil((new Date(r.dueDate)-new Date())/86400000) >= 0 ? `${Math.ceil((new Date(r.dueDate)-new Date())/86400000)}d` : `${Math.abs(Math.ceil((new Date(r.dueDate)-new Date())/86400000))}d overdue`}</div>}</td>
    </tr>
  )

  return (
    <div style={{display:'flex',flexDirection:'column',height:'100%',background:'#fff'}}>
      <div style={{height:48,borderBottom:'1px solid #e5e7eb',display:'flex',alignItems:'flex-end',padding:'0 24px',gap:28,flexShrink:0}}>
        <button onClick={()=>{setViewTab('active');setSelectedIds([])}} style={{height:48,border:'none',borderBottom:viewTab==='active'?'2px solid #111':'2px solid transparent',background:'transparent',fontSize:13,fontWeight:viewTab==='active'?700:500,color:viewTab==='active'?'#111':'#9ca3af',cursor:'pointer'}}>Sampling & Approvals</button>
        <button onClick={()=>{setViewTab('completed');setSelectedIds([])}} style={{height:48,border:'none',borderBottom:viewTab==='completed'?'2px solid #111':'2px solid transparent',background:'transparent',fontSize:13,fontWeight:viewTab==='completed'?700:500,color:viewTab==='completed'?'#111':'#9ca3af',cursor:'pointer'}}>Completed Samples <span style={{fontSize:10,color:'#9ca3af'}}>({completedCount})</span></button>
      </div>
      <div style={{padding:'10px 24px',borderBottom:'1px solid #f3f4f6',display:'flex',alignItems:'center',gap:14,flexShrink:0}}>
        <div style={{flexShrink:0}}><div className="app-page-title">{viewTab === 'active' ? 'Sampling & Approvals' : 'Completed Samples'}</div></div>
        <div style={{display:'flex',gap:8}}>{[
          ['Total Samples',allRows.length,false],['Pending Approval',pendingCount,pendingCount>0],['In Progress',inProgressCount,false],['Overdue',overdueCount,overdueCount>0]
        ].map(([label,value,amber])=><div key={label} style={{padding:'6px 12px',border:'1px solid var(--border)',borderRadius:8,background:'#fff',minWidth:100}}><div style={{fontSize:9,fontWeight:600,color:'var(--text-light)',textTransform:'uppercase',letterSpacing:'0.5px',marginBottom:2}}>{label}</div><div style={{fontSize:18,fontWeight:700,lineHeight:1,color:amber?'#d97706':'#0d0d0d'}}>{value}</div></div>)}</div>
        <div style={{marginLeft:'auto',display:'flex',gap:8}}>
          <button className="btn btn-secondary" disabled={!canSingle} onClick={()=>selectedRow&&setCommenting(selectedRow)}><MessageSquarePlus size={13}/> Add Comment</button>
          <button className="btn btn-secondary" disabled={!canSingle} onClick={()=>selectedRow&&createRevision(selectedRow)}><ClipboardCheck size={13}/> Create V+</button>
          <button className="btn btn-secondary" disabled={!canSend} onClick={()=>selectedRow&&setDispatching(selectedRow)}><PackagePlus size={13}/> Send to Parcels</button>
          <button className="btn btn-secondary" disabled={!canSingle} onClick={()=>selectedRow&&printSampleProgram(selectedRow)}><Printer size={13}/> Program</button>
        </div>
      </div>

      <div style={{padding:'8px 24px',borderBottom:'1px solid #f3f4f6',display:'grid',gridTemplateColumns:'minmax(210px,1.65fr) minmax(135px,1fr) minmax(140px,1fr) minmax(125px,.9fr) minmax(105px,.78fr) minmax(110px,.82fr) minmax(120px,.88fr) auto',alignItems:'center',gap:8,flexShrink:0,width:'100%',boxSizing:'border-box'}}>
        <div style={{position:'relative',minWidth:0}}><Search size={13} style={{position:'absolute',left:9,top:'50%',transform:'translateY(-50%)',color:'#9ca3af'}}/><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Search SAM#, job, style, buyer..." style={{width:'100%',boxSizing:'border-box',paddingLeft:28,paddingRight:10,height:32,border:'1px solid var(--border)',borderRadius:7,fontSize:12,outline:'none',background:'#fafafa'}}/></div>
        <select value={groupBy} onChange={e=>setGroupBy(e.target.value)} style={{...inp,width:'100%',minWidth:0}}><option value="none">☰ No Grouping</option><option value="customer">☰ By Customer</option><option value="job">☰ By Job #</option><option value="style">☰ By Style #</option><option value="type">☰ By Sample Type</option><option value="stage">☰ By Stage</option><option value="approval">☰ By Approval</option></select>
        <select value={sortBy} onChange={e=>setSortBy(e.target.value)} style={{...inp,width:'100%',minWidth:0}}><option value="due-asc">⇅ Due Date (Asc)</option><option value="due-desc">⇅ Due Date (Desc)</option><option value="sam-new">⇅ SAM # (Newest)</option><option value="sam-old">⇅ SAM # (Oldest)</option><option value="customer">⇅ Customer (A–Z)</option><option value="style">⇅ Style # (A–Z)</option><option value="qty-desc">⇅ Qty (High–Low)</option></select>
        <MultiFilter title="Customers" options={buyerOptions} value={filterBuyer} onChange={setFilterBuyer}/>
        <MultiFilter title="Types" options={typeOptions} value={filterType} onChange={setFilterType}/>
        <MultiFilter title="Stages" options={STAGES} value={filterStage} onChange={setFilterStage}/>
        <MultiFilter title="Approvals" options={approvalOptions} value={filterApproval} onChange={setFilterApproval}/>
        <button className="btn btn-secondary" style={{whiteSpace:'nowrap',justifySelf:'end'}} onClick={()=>setRefreshKey(x=>x+1)}><RefreshCw size={14}/> Refresh</button>
      </div>

      <div style={{flex:1,minHeight:0,overflow:'auto',padding:'0 24px'}} className="table-wrap">
        <table style={{width:'100%'}}><thead><tr><th style={{width:36}}><input type="checkbox" checked={rows.length>0&&selectedIds.length===rows.length} onChange={e=>setSelectedIds(e.target.checked?rows.map(r=>r.id):[])}/></th><th>SAM # / Approval</th><th>Customer</th><th>Job #</th><th>Style #</th><th>Type / Ver.</th><th>Wash Colour</th><th>Sample Size</th><th>Qty</th><th>Stage</th><th>Due Date</th></tr></thead>
          <tbody>{groupedRows ? Object.entries(groupedRows).flatMap(([group,items]) => [<tr key={`g-${group}`}><td colSpan={11} style={{background:'#dceefa',fontWeight:700,padding:'8px 12px'}}>{group} <span style={{color:'#6b7280',fontWeight:500}}>— {items.length} sample{items.length===1?'':'s'}</span></td></tr>, ...items.map(renderRow)]) : rows.map(renderRow)}{rows.length===0&&<tr><td colSpan={11} style={{textAlign:'center',padding:28,color:'#9ca3af'}}>No sample requests found.</td></tr>}</tbody>
        </table>
      </div>
      <div style={{height:34,borderTop:'1px solid #e5e7eb',display:'flex',alignItems:'center',padding:'0 24px',fontSize:11,color:'#6b7280',flexShrink:0}}><strong style={{color:'#374151'}}>{rows.length} {viewTab === 'completed' ? 'COMPLETED SAMPLES' : 'SAMPLES'}</strong><span style={{marginLeft:'auto'}}>{selectedIds.length ? `${selectedIds.length} selected` : (viewTab === 'completed' ? `${completedCount} completed` : `${pendingCount} pending approval`)}</span></div>
      {dispatching&&<DispatchChecklistModal sample={dispatching} onClose={()=>setDispatching(null)} onDone={checks=>{sendSampleToParcelPool(dispatching.id,checks);setDispatching(null);setRefreshKey(x=>x+1)}}/>}
      {commenting&&<CommentModal sample={commenting} onClose={()=>setCommenting(null)} onSaved={payload=>saveComment(commenting,payload)}/>}<Dialogs/>
    </div>
  )
}
