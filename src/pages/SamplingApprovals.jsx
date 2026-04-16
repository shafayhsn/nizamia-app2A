import React, { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAppDialogs } from '../components/ui/AppDialogs'
import { formatDate, generateSampleNumber } from '../lib/utils'
import { loadSamplingStore, getSampleComments, updateSampleMeta, addSampleComment, sendSampleToParcelPool } from '../lib/samplingStore'
import { CheckCircle2, ClipboardCheck, FileText, MessageSquarePlus, PackagePlus, Printer, RefreshCw } from 'lucide-react'

const STAGES = ['Not Started', 'Pattern', 'Cutting', 'Stitching', 'Washing', 'Finishing', 'Ready']
const COMMENT_TYPES = ['Approval', 'Revision', 'Rejection']

const card = { background:'#fff', border:'1px solid #ececec', borderRadius:12, boxShadow:'0 1px 2px rgba(0,0,0,.03)' }
const inp = { height:34, padding:'0 10px', border:'1px solid #e5e7eb', borderRadius:8, fontSize:12, width:'100%', boxSizing:'border-box', outline:'none' }
const btn = { height:32, padding:'0 12px', border:'1px solid #e5e7eb', borderRadius:8, background:'#fff', fontSize:12, fontWeight:600, cursor:'pointer' }

function statusPill(bg, color, text) {
  return <span style={{ background:bg, color, padding:'4px 8px', borderRadius:999, fontSize:11, fontWeight:700 }}>{text}</span>
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
  const [checks, setChecks] = useState({ checked:false, standard:false, qr:false })
  const all = checks.checked && checks.standard && checks.qr
  return (
    <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,.35)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:400 }}>
      <div style={{ ...card, width:420, padding:18 }}>
        <div style={{ fontSize:16, fontWeight:800, marginBottom:4 }}>Send to Parcels</div>
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
  const [type, setType] = useState('Revision')
  const [date, setDate] = useState(new Date().toISOString().slice(0,10))
  const [by, setBy] = useState('')
  const [text, setText] = useState('')
  const valid = type && date && by.trim() && text.trim()
  return (
    <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,.35)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:400 }}>
      <div style={{ ...card, width:560, padding:18 }}>
        <div style={{ fontSize:16, fontWeight:800, marginBottom:4 }}>Record Comment</div>
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

  const rows = useMemo(() => samples.map(s => {
    const order = orderMap[s.order_id] || {}
    const buyer = buyerMap[order.buyer_id] || {}
    const meta = loadSamplingStore().sampleMeta[s.id] || {}
    const comments = getSampleComments(s.id)
    const latest = comments[comments.length - 1]
    return {
      ...s,
      order,
      buyer,
      meta,
      comments,
      latest,
      version: meta.version || 'V1',
      stage: meta.stage || 'Not Started',
      dispatchStatus: meta.dispatchStatus || 'In Development',
      approvalStatus: meta.approvalStatus || 'Pending',
      qty: s.req_pcs || s.qty || 0,
      latestCommentText: latest?.text || '',
    }
  }).filter(r => {
    const hay = `${r.sample_number} ${r.order.job_number || ''} ${r.order.style_number || ''} ${r.order.buyer_name || ''} ${r.sample_type || ''}`.toLowerCase()
    return hay.includes(query.toLowerCase())
  }), [samples, orderMap, buyerMap, query, refreshKey])

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

  return (
    <div className="page-content" style={{ display:'flex', flexDirection:'column', gap:14 }}>
      <div className="section-header">
        <div>
          <div style={{ fontSize:22, fontWeight:800, color:'#111827' }}>Sampling & Approvals</div>
          <div style={{ fontSize:13, color:'#6b7280', marginTop:2 }}>Track SAM# requests, stage progress, comments, revisions and approvals.</div>
        </div>
        <div style={{ display:'flex', gap:8, alignItems:'center' }}>
          <input style={{ ...inp, width:260 }} placeholder="Search SAM#, job, style, buyer..." value={query} onChange={e=>setQuery(e.target.value)} />
          <button className="btn btn-secondary" onClick={() => setRefreshKey(x => x + 1)}><RefreshCw size={14} /> Refresh</button>
        </div>
      </div>

      <div style={{ ...card, padding:12 }}>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', gap:10, marginBottom:12, flexWrap:'wrap' }}>
          <div style={{ fontSize:12, color:'#6b7280' }}>{selectedIds.length ? `${selectedIds.length} selected` : 'Select a sample to enable actions'}</div>
          <div style={{ display:'flex', gap:8, flexWrap:'wrap' }}>
            <button style={{ ...btn, opacity:canSingle ? 1 : 0.5 }} disabled={!canSingle} onClick={() => selectedRow && setCommenting(selectedRow)}><MessageSquarePlus size={13} /> Add Comment</button>
            <button style={{ ...btn, opacity:canSingle ? 1 : 0.5 }} disabled={!canSingle} onClick={() => selectedRow && createRevision(selectedRow)}><ClipboardCheck size={13} /> Create V+</button>
            <button style={{ ...btn, opacity:canSend ? 1 : 0.5 }} disabled={!canSend} onClick={() => selectedRow && setDispatching(selectedRow)}><PackagePlus size={13} /> Send to Parcels</button>
            <button style={{ ...btn, opacity:canSingle ? 1 : 0.5 }} disabled={!canSingle} onClick={() => selectedRow && printSampleProgram(selectedRow)}><Printer size={13} /> Program</button>
          </div>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th style={{ width:36 }}><input type="checkbox" checked={rows.length > 0 && selectedIds.length === rows.length} onChange={e => setSelectedIds(e.target.checked ? rows.map(r => r.id) : [])} /></th><th>SAM#</th><th>Job / Style</th><th>Type / Ver.</th><th>Qty</th><th>Stage</th><th>Approval</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(r => (
                <tr key={r.id}>
                  <td><input type="checkbox" checked={selectedIds.includes(r.id)} onChange={e => setSelectedIds(s => e.target.checked ? [...new Set([...s, r.id])] : s.filter(x => x !== r.id))} /></td>
                  <td>
                    <div style={{ fontFamily:'monospace', fontWeight:700 }}>{r.sample_number}</div>
                    <div style={{ fontSize:11, color:'#9ca3af' }}>{r.order.buyer_name || '—'}</div>
                  </td>
                  <td>
                    <div style={{ fontWeight:700 }}>{r.order.job_number || '—'}</div>
                    <div style={{ fontSize:11, color:'#6b7280' }}>{r.order.style_number || '—'} · {r.order.description || '—'}</div>
                  </td>
                  <td>
                    <div>{r.sample_type || '—'}</div>
                    <div style={{ fontSize:11, color:'#6b7280' }}>{r.version}</div>
                  </td>
                  <td>{r.qty || '—'}</td>
                  <td>
                    {r.dispatchStatus === 'Dispatched' ? (
                      <div>
                        {statusPill('#dcfce7','#166534','Dispatched')}
                        <div style={{ fontSize:10, color:'#9ca3af', marginTop:4 }}>{formatDate(r.meta.dispatchDate || r.meta.sentToParcelsAt)}</div>
                      </div>
                    ) : (
                      <div>
                        <select style={{ ...inp, height:30, minWidth:130 }} value={r.stage} onChange={e => saveStage(r.id, e.target.value)}>
                          {STAGES.map(s => <option key={s}>{s}</option>)}
                        </select>
                        <div style={{ fontSize:10, color:'#9ca3af', marginTop:4 }}>{r.meta.stageDates?.[r.stage] ? formatDate(r.meta.stageDates[r.stage]) : '—'}</div>
                      </div>
                    )}
                  </td>
                  <td>{r.approvalStatus === 'Approved' ? statusPill('#dcfce7','#166534','Approved') : r.approvalStatus === 'Rejected' ? statusPill('#fee2e2','#991b1b','Rejected') : r.approvalStatus === 'Revision Required' ? statusPill('#fff7ed','#9a3412','Revision') : statusPill('#f3f4f6','#4b5563','Pending')}</td>
                </tr>
              ))}
              {rows.length === 0 && <tr><td colSpan={7} style={{ textAlign:'center', padding:'28px 12px', color:'#9ca3af' }}>No sample requests found.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>

      {dispatching && <DispatchChecklistModal sample={dispatching} onClose={() => setDispatching(null)} onDone={(checks) => { sendSampleToParcelPool(dispatching.id, checks); setDispatching(null); setRefreshKey(x => x + 1) }} />}
      {commenting && <CommentModal sample={commenting} onClose={() => setCommenting(null)} onSaved={(payload) => saveComment(commenting, payload)} />}
      <Dialogs />
    </div>
  )
}
