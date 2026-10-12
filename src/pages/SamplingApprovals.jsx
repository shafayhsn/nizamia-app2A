import React, { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAppDialogs } from '../components/ui/AppDialogs'
import { formatDate, generateSampleNumber } from '../lib/utils'
import { loadSamplingStore, getSampleComments, updateSampleMeta, addSampleComment, sendSampleToParcelPool } from '../lib/samplingStore'
import { ClipboardCheck, MessageSquarePlus, PackagePlus, Printer, RefreshCw, Search } from 'lucide-react'
import { statusBadgeStyle } from '../lib/statusColors'

const STAGES = ['Not Started', 'Pattern', 'Cutting', 'Stitching', 'Washing', 'Finishing', 'Ready']
const COMMENT_TYPES = ['Approval', 'Revision', 'Rejection']

const card = { background:'#fff', border:'1px solid #ececec', borderRadius:12, boxShadow:'0 1px 2px rgba(0,0,0,.03)' }
const inp = { height:34, padding:'0 10px', border:'1px solid #e5e7eb', borderRadius:8, fontSize:12, width:'100%', boxSizing:'border-box', outline:'none' }
const btn = { height:32, padding:'0 12px', border:'1px solid #e5e7eb', borderRadius:8, background:'#fff', fontSize:12, fontWeight:600, cursor:'pointer' }

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
    @media print { body{padding:8mm} }
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
  const [refreshKey, setRefreshKey] = useState(0)
  const [dispatching, setDispatching] = useState(null)
  const [commenting, setCommenting] = useState(null)
  const [query, setQuery] = useState('')
  const [selectedIds, setSelectedIds] = useState([])
  const [groupBy, setGroupBy] = useState('none')
  const [filterBuyer, setFilterBuyer] = useState('')
  const [filterType, setFilterType] = useState('')
  const [filterStage, setFilterStage] = useState('')
  const [filterApproval, setFilterApproval] = useState('')
  const [sortBy, setSortBy] = useState('due-asc')
  const [viewTab, setViewTab] = useState('active')

  useEffect(() => { load() }, [refreshKey])

  async function load() {
    const [{ data: s }, { data: o }, { data: b }] = await Promise.all([
      supabase.from('samples').select('*').order('created_at', { ascending:false }),
      supabase.from('orders').select('*').order('created_at', { ascending:false }),
      supabase.from('buyers').select('*').order('name'),
    ])
    setSamples(s || [])
    setOrders(o || [])
    setBuyers(b || [])
  }

  const orderMap = useMemo(() => Object.fromEntries(orders.map(o => [o.id, o])), [orders])
  const buyerMap = useMemo(() => Object.fromEntries(buyers.map(b => [b.id, b])), [buyers])

  const allRows = useMemo(() => samples.map(s => {
    const order = orderMap[s.order_id] || {}
    const buyer = buyerMap[order.buyer_id] || {}
    const meta = loadSamplingStore().sampleMeta[s.id] || {}
    const comments = getSampleComments(s.id)
    const latest = comments[comments.length - 1]
    return { ...s, order, buyer, meta, comments, latest, version: meta.version || 'V1', stage: s.stage || meta.stage || 'Not Started', dispatchStatus: s.dispatch_status || meta.dispatchStatus || 'In Development', approvalStatus: s.approval_status || meta.approvalStatus || 'Pending', dueDate: s.due_date || meta.dueDate || null, qty: s.req_pcs || s.qty || 0, latestCommentText: latest?.text || '' }
  }), [samples, orderMap, buyerMap, refreshKey])

  const isCompleted = r => r.approvalStatus === 'Approved' || ['complete','completed'].includes(String(r.status || '').toLowerCase())
  const rows = useMemo(() => {
    const filtered = allRows.filter(r => {
      if (viewTab === 'completed' ? !isCompleted(r) : isCompleted(r)) return false
      const customer = r.order.buyer_name || r.buyer.name || ''
      const hay = `${r.sample_number} ${r.order.job_number || ''} ${r.order.style_number || ''} ${customer} ${r.sample_type || ''}`.toLowerCase()
      if (!hay.includes(query.toLowerCase())) return false
      if (filterBuyer && customer !== filterBuyer) return false
      if (filterType && (r.sample_type || '') !== filterType) return false
      if (filterStage && r.stage !== filterStage) return false
      if (filterApproval && r.approvalStatus !== filterApproval) return false
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
    const num = await generateSampleNumber()
    const payload = {
      ...sample,
      id: undefined,
      sample_number: num,
      comments: null,
      status: 'Pending',
      received_date: null,
      created_at: undefined,
    }
    const { data: inserted, error } = await supabase.from('samples').insert([payload]).select().single()
    if (error || !inserted) {
      alert(error?.message || 'Could not create revision sample', { title:'Revision Failed' })
      return
    }
    updateSampleMeta(inserted.id, {
      version: `V${(parseInt((meta.version || 'V1').replace('V','')) || 1) + 1}`,
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
    const carry = row.meta.carryForwardComments || []
    const sizes = Array.isArray(row.sizes) ? row.sizes : (row.size ? [row.size] : [])
    const html = `
      <div class="head">
        <div>
          <h1>Sampling Program</h1>
          <div class="muted">${row.sample_number} · ${row.version}</div>
        </div>
        <div class="muted">Generated ${new Date().toLocaleDateString('en-GB')}</div>
      </div>
      <div class="two">
        <div class="box">
          <table>
            <tr><th>SAM#</th><td>${row.sample_number}</td></tr>
            <tr><th>Job</th><td>${row.order.job_number || '—'}</td></tr>
            <tr><th>Buyer</th><td>${row.order.buyer_name || '—'}</td></tr>
            <tr><th>Style</th><td>${row.order.style_number || '—'}</td></tr>
            <tr><th>Type</th><td>${row.sample_type || '—'}</td></tr>
            <tr><th>Version</th><td>${row.version}</td></tr>
          </table>
        </div>
        <div class="box">
          <table>
            <tr><th>Qty</th><td>${row.qty || '—'} pcs</td></tr>
            <tr><th>Stage</th><td>${row.stage}</td></tr>
            <tr><th>Dispatch</th><td>${row.dispatchStatus}</td></tr>
            <tr><th>Approval</th><td>${row.approvalStatus}</td></tr>
            <tr><th>Colours</th><td>${Array.isArray(row.colours) && row.colours.length ? row.colours.join(', ') : (row.color || '—')}</td></tr>
            <tr><th>Sizes</th><td>${sizes.length ? sizes.join(', ') : '—'}</td></tr>
          </table>
        </div>
      </div>
      ${carry.length ? `<div class="section"><h3>Previous Revision / Rejection Comments</h3><table><thead><tr><th>Date</th><th>By</th><th>Type</th><th>Comment</th></tr></thead><tbody>${carry.map(c => `<tr><td>${formatDate(c.date)}</td><td>${c.by}</td><td>${c.type}</td><td>${String(c.text || '').replace(/\n/g,'<br/>')}</td></tr>`).join('')}</tbody></table></div>` : ''}
      <div class="section"><h3>Sample Notes</h3><div class="box small">${row.comments || '—'}</div></div>
      <div class="section"><h3>Progress Checklist</h3><table><thead><tr>${STAGES.map(s => `<th>${s}</th>`).join('')}</tr></thead><tbody><tr>${STAGES.map(s => `<td>${row.stage === s ? '●' : ''}</td>`).join('')}</tr></tbody></table></div>
    `
    PrintWindow({ html, title: `${row.sample_number} Program` })
  }

  const renderRow = r => (
    <tr key={r.id}>
      <td><input type="checkbox" checked={selectedIds.includes(r.id)} onChange={e => setSelectedIds(v => e.target.checked ? [...new Set([...v,r.id])] : v.filter(x=>x!==r.id))}/></td>
      <td><div style={{fontFamily:'monospace',fontWeight:700}}>{r.sample_number}</div></td>
      <td><div style={{fontWeight:600}}>{r.order.buyer_name || r.buyer.name || '—'}</div></td>
      <td><div style={{fontFamily:'monospace',fontWeight:600}}>{r.order.job_number || '—'}</div></td>
      <td><div style={{fontWeight:700}}>{r.order.style_number || '—'}</div><div style={{fontSize:10,color:'#9ca3af'}}>{r.order.description || ''}</div></td>
      <td><div>{r.sample_type || '—'}</div><div style={{fontSize:10,color:'#6b7280'}}>{r.version}</div></td>
      <td style={{fontWeight:600}}>{r.qty || '—'}</td>
      <td>{r.dispatchStatus === 'Dispatched' ? <div>{statusPill('#dcfce7','#166534','Dispatched')}<div style={{fontSize:10,color:'#9ca3af',marginTop:4}}>{formatDate(r.meta.dispatchDate || r.meta.sentToParcelsAt)}</div></div> : <div><select style={{...inp,height:30,minWidth:130}} value={r.stage} onChange={e=>saveStage(r.id,e.target.value)}>{STAGES.map(x=><option key={x}>{x}</option>)}</select><div style={{fontSize:10,color:'#9ca3af',marginTop:4}}>{r.meta.stageDates?.[r.stage] ? formatDate(r.meta.stageDates[r.stage]) : '—'}</div></div>}</td>
      <td><div style={{fontWeight:600}}>{r.dueDate ? formatDate(r.dueDate) : '—'}</div>{r.dueDate && <div style={{fontSize:10,color:new Date(r.dueDate)<new Date()&&!isCompleted(r)?'#dc2626':'#9ca3af',marginTop:3}}>{Math.ceil((new Date(r.dueDate)-new Date())/86400000) >= 0 ? `${Math.ceil((new Date(r.dueDate)-new Date())/86400000)}d` : `${Math.abs(Math.ceil((new Date(r.dueDate)-new Date())/86400000))}d overdue`}</div>}</td>
      <td>{r.approvalStatus === 'Approved' ? statusPill('#dcfce7','#166534','Approved') : r.approvalStatus === 'Rejected' ? statusPill('#fee2e2','#991b1b','Rejected') : r.approvalStatus === 'Revision Required' ? statusPill('#fff7ed','#9a3412','Revision') : statusPill('#f3f4f6','#4b5563','Pending')}</td>
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
        <select value={filterBuyer} onChange={e=>setFilterBuyer(e.target.value)} style={{...inp,width:'100%',minWidth:0}}><option value="">All Customers</option>{buyerOptions.map(x=><option key={x}>{x}</option>)}</select>
        <select value={filterType} onChange={e=>setFilterType(e.target.value)} style={{...inp,width:'100%',minWidth:0}}><option value="">All Types</option>{typeOptions.map(x=><option key={x}>{x}</option>)}</select>
        <select value={filterStage} onChange={e=>setFilterStage(e.target.value)} style={{...inp,width:'100%',minWidth:0}}><option value="">All Stages</option>{STAGES.map(x=><option key={x}>{x}</option>)}</select>
        <select value={filterApproval} onChange={e=>setFilterApproval(e.target.value)} style={{...inp,width:'100%',minWidth:0}}><option value="">All Approvals</option>{approvalOptions.map(x=><option key={x}>{x}</option>)}</select>
        <button className="btn btn-secondary" style={{whiteSpace:'nowrap',justifySelf:'end'}} onClick={()=>setRefreshKey(x=>x+1)}><RefreshCw size={14}/> Refresh</button>
      </div>

      <div style={{flex:1,minHeight:0,overflow:'auto',padding:'0 24px'}} className="table-wrap">
        <table style={{width:'100%'}}><thead><tr><th style={{width:36}}><input type="checkbox" checked={rows.length>0&&selectedIds.length===rows.length} onChange={e=>setSelectedIds(e.target.checked?rows.map(r=>r.id):[])}/></th><th>SAM #</th><th>Customer</th><th>Job #</th><th>Style #</th><th>Type / Ver.</th><th>Qty</th><th>Stage</th><th>Due Date</th><th>Approval</th></tr></thead>
          <tbody>{groupedRows ? Object.entries(groupedRows).flatMap(([group,items]) => [<tr key={`g-${group}`}><td colSpan={10} style={{background:'#dceefa',fontWeight:700,padding:'8px 12px'}}>{group} <span style={{color:'#6b7280',fontWeight:500}}>— {items.length} sample{items.length===1?'':'s'}</span></td></tr>, ...items.map(renderRow)]) : rows.map(renderRow)}{rows.length===0&&<tr><td colSpan={10} style={{textAlign:'center',padding:28,color:'#9ca3af'}}>No sample requests found.</td></tr>}</tbody>
        </table>
      </div>
      <div style={{height:34,borderTop:'1px solid #e5e7eb',display:'flex',alignItems:'center',padding:'0 24px',fontSize:11,color:'#6b7280',flexShrink:0}}><strong style={{color:'#374151'}}>{rows.length} {viewTab === 'completed' ? 'COMPLETED SAMPLES' : 'SAMPLES'}</strong><span style={{marginLeft:'auto'}}>{selectedIds.length ? `${selectedIds.length} selected` : (viewTab === 'completed' ? `${completedCount} completed` : `${pendingCount} pending approval`)}</span></div>
      {dispatching&&<DispatchChecklistModal sample={dispatching} onClose={()=>setDispatching(null)} onDone={checks=>{sendSampleToParcelPool(dispatching.id,checks);setDispatching(null);setRefreshKey(x=>x+1)}}/>}
      {commenting&&<CommentModal sample={commenting} onClose={()=>setCommenting(null)} onSaved={payload=>saveComment(commenting,payload)}/>}<Dialogs/>
    </div>
  )
}
