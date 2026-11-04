import React,{useEffect,useState} from 'react'
import {useSearchParams,useNavigate} from 'react-router-dom'
import {supabase} from '../lib/supabase'
import {printHTML} from '../components/PrintReports'

const DEPARTMENTS=['Sampling / Pattern','Fabric / Lining','Trims / Accessories','Cutting','Stitching','Embellishment','Washing','Testing / Quality','Packing / Finishing']
const CHECKS=['Order Matrix','BOM','Sampling','Washing','Testing','Packing','Processes']
const safe=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','\'':'&#39;'}[c]))
const formatDate=d=>d?new Date(d+'T12:00:00').toLocaleDateString('en-GB',{day:'2-digit',month:'short',year:'numeric'}):''
const button={padding:'9px 13px',border:'1px solid #d5dbe5',borderRadius:7,background:'#fff',cursor:'pointer',fontWeight:650}
const blankNote=()=>({critical:'',measure:'',owner_due:''})
const hasContent=m=>!!m&&(m.status!=='Draft'||!!m.meeting_date||!!m.decision||!!m.attachment_path||!!String(m.outstanding_actions||'').trim()||m.fit_approved!==null||Object.values(m.technical_checks||{}).some(Boolean)||Object.values(m.department_notes||{}).some(n=>Object.values(n||{}).some(v=>String(v||'').trim())))
export default function PPMeeting(){
 const [params]=useSearchParams(),navigate=useNavigate()
 const requestedOrder=params.get('order')
 const [orders,setOrders]=useState([]),[orderId,setOrderId]=useState(requestedOrder||''),[meetings,setMeetings]=useState([]),[showCreate,setShowCreate]=useState(false)
 const [current,setCurrent]=useState(null),[busy,setBusy]=useState(false),[error,setError]=useState(''),[search,setSearch]=useState(''),[orderSearch,setOrderSearch]=useState(''),[uploadFile,setUploadFile]=useState(null),[notice,setNotice]=useState('')
 const order=orders.find(o=>o.id===orderId)
 const loadOrders=async()=>{const {data,error}=await supabase.from('orders').select('id,job_number,style_number,factory_ref,po_number,buyer_name,store_name,merchandiser_name,total_qty,ship_date,planned_date').order('created_at',{ascending:false}) .limit(1000);if(error)throw error;setOrders(data||[])}
 const api=async(action,payload=null)=>{
  const isGet=payload===null
  const url='/api/oms'+(isGet?'?action='+encodeURIComponent(action)+(action==='ppmList'&&orderId?'&orderId='+encodeURIComponent(orderId):''):'')
  const res=await fetch(url,{method:isGet?'GET':'POST',credentials:'same-origin',headers:isGet?{}:{'Content-Type':'application/json'},...(isGet?{}:{body:JSON.stringify({action,...payload})})})
  const json=await res.json().catch(()=>({}))
  if(!res.ok)throw Error(json.error||'PP Meeting request failed')
  return json
 }
 const loadMeetings=async()=>{const result=await api('ppmList');setMeetings(result.data||[])}
 useEffect(()=>{loadOrders().catch(e=>setError(e.message))},[])
 useEffect(()=>{loadMeetings().catch(e=>setError(e.message))},[orderId])
 useEffect(()=>{if(requestedOrder)setOrderId(requestedOrder)},[requestedOrder])
 const upload=async()=>{if(!current||!uploadFile)return;setBusy(true);setError('');try{
  if(!['application/pdf','image/jpeg','image/png'].includes(uploadFile.type)||uploadFile.size>10485760)throw Error('Attach a PDF, JPG or PNG up to 10 MB')
  const extension=uploadFile.name.split('.').pop().toLowerCase()
  const signed=await api('ppmAttachmentUrl',{id:current.id,extension,contentType:uploadFile.type})
  const {error:upError}=await supabase.storage.from('ppm-attachments').uploadToSignedUrl(signed.path,signed.token,uploadFile,{contentType:uploadFile.type})
  if(upError)throw upError
  const result=await api('ppmAttachmentSave',{id:current.id,path:signed.path})
  setCurrent(result.data);setUploadFile(null);setNotice('Signed meeting sheet uploaded');await loadMeetings()
 }catch(e){setError(e.message)}finally{setBusy(false)}}
 const viewAttachment=async(m)=>{try{const res=await fetch('/api/oms?action=ppmAttachmentView&id='+encodeURIComponent(m.id),{credentials:'same-origin'});const result=await res.json();if(!res.ok)throw Error(result.error||'Cannot open attachment');window.open(result.url,'_blank','noopener,noreferrer')}catch(e){setError(e.message)}}
 const create=async()=>{if(!orderId)return;setBusy(true);setError('');try{const result=await api('ppmCreate',{orderId});setCurrent(result.data);setShowCreate(false);setNotice('PP Meeting created');await loadMeetings()}catch(e){setError(e.message)}finally{setBusy(false)}}
 const save=async()=>{if(!current)return;setBusy(true);setError('');try{
  const payload={meeting_date:current.meeting_date||null,status:current.status,decision:current.decision||null,technical_checks:current.technical_checks||{},fit_approved:current.fit_approved,department_notes:current.department_notes||{},outstanding_actions:current.outstanding_actions||'',signatures:current.signatures||{}}
  const result=await api('ppmSave',{id:current.id,data:payload});setCurrent(result.data);setNotice('Meeting saved');await loadMeetings()
 }catch(e){setError(e.message)}finally{setBusy(false)}}
 const remove=async(m)=>{if(hasContent(m)){setError('Meeting contains data and cannot be deleted');return}if(!window.confirm('Delete empty draft '+m.ppm_number+'? This cannot be undone.'))return;setBusy(true);setError('');try{await api('ppmDelete',{id:m.id});if(current?.id===m.id)setCurrent(null);setNotice(m.ppm_number+' deleted');await loadMeetings()}catch(e){setError(e.message)}finally{setBusy(false)}}
 const patch=(key,value)=>setCurrent(c=>({...c,[key]:value}))
 const updateNote=(dept,key,value)=>setCurrent(c=>({...c,department_notes:{...c.department_notes,[dept]:{...blankNote(),...(c.department_notes?.[dept]||{}),[key]:value}}}))
 const print=(meeting,filled=false)=>{
  const o=orders.find(x=>x.id===meeting.order_id)||order||{}
  const esc=safe
  const notes=meeting.department_notes||{}
  const abs=(x,y,w,h,content,cls='')=>'<div class="abs '+cls+'" style="left:'+x+'pt;top:'+y+'pt;width:'+w+'pt;height:'+h+'pt">'+content+'</div>'
  const line=(x,y,w,h=0)=>'<div class="line" style="left:'+x+'pt;top:'+y+'pt;width:'+w+'pt;height:'+h+'pt"></div>'
  const check=(name,on)=>'<span class="check">['+(on?'✓':'&nbsp;&nbsp;&nbsp;')+'] '+esc(name)+'</span>'
  const f=(label,value)=>'<span class="lab">'+esc(label)+':</span><span class="val">'+esc(value||'')+'</span>'
  const col=(x,items)=>items.map((a,i)=>abs(x,60+i*23,181,18,f(a[0],a[1]),'field')).join('')
  const header=abs(25,24,792,31.6,'<b>NIZAMIA / PRE-PRODUCTION MEETING</b><strong>PPM NO. &nbsp; '+esc(meeting.ppm_number)+'</strong>','heading')
  const info=col(35,[['BUYER',o.buyer_name],['STORE',o.store_name],['MERCHANDISER',o.merchandiser_name]])+
    col(230,[['STYLE',o.style_number],['WASH',o.wash_name||''],['FACTORY REF',o.factory_ref]])+
    col(415,[['JOB REF',o.job_number],['ORDER QTY',o.total_qty?o.total_qty+' pcs':''],['INSPECTION',formatDate(o.planned_date)]])+
    col(650,[['MEETING DATE',formatDate(meeting.meeting_date)||'____ / ____ / ______'],['PO',o.po_number],['SHIP DATE',formatDate(o.ship_date)]])
  const checks=abs(34,131,777,20,'<b>ORDER / TECHNICAL CHECK</b><span>'+CHECKS.map(c=>check(c,filled&&meeting.technical_checks?.[c])).join(' ')+'</span><span>Sample / FIT approved: '+check('Yes',filled&&meeting.fit_approved===true)+check('No',filled&&meeting.fit_approved===false)+'</span>','checks')
  const colX=[25,148,375,681,817]
  const deptHeader=abs(25,160.3,792,22.6,'','headbg')+['DEPARTMENT','CRITICAL AREA / CHALLENGE','PREVENTIVE / CORRECTIVE MEASURE','OWNER / DUE'].map((t,i)=>abs(colX[i]+7,165, colX[i+1]-colX[i]-10,16,esc(t),'th')).join('')
  const rows=DEPARTMENTS.map((d,i)=>{const y=182.9+i*34.9,n=filled?(notes[d]||{}):{};return '<div class="rowborder" style="left:25pt;top:'+y+'pt;width:792pt;height:34.9pt"></div>'+[148,375,681].map(x=>line(x,y,0,34.9)).join('')+abs(32,y+9,109,20,esc(d),'dept')+abs(155,y+3,213,29,esc(n.critical||''),'notes')+abs(382,y+3,292,29,esc(n.measure||''),'notes')+abs(688,y+3,122,29,esc(n.owner_due||''),'notes')}).join('')
  const bottom=abs(25,503.4,792,56.6,'','bottom')+abs(33,507,770,18,'<b>MEETING DECISION</b> '+['Ready for production','Conditional approval','Hold'].map(c=>check(c,filled&&meeting.decision===c)).join(' ')+' <b style="margin-left:15pt">KEY OUTSTANDING ACTION / NEXT REVIEW:</b>','decision')+abs(420,524,385,16,esc(filled?meeting.outstanding_actions:''),'notes')+abs(33,544,760,16,'Production: ___________________ &nbsp;&nbsp; Quality: ___________________ &nbsp;&nbsp; Merchandising: ___________________','signatures')
  const html='<!doctype html><html><head><meta charset="utf-8"><title>'+esc(meeting.ppm_number)+'</title><style>@page{size:297mm 210mm;margin:0}*{box-sizing:border-box}html,body{margin:0;padding:0;color:#1f2937;font-family:Arial,Helvetica,sans-serif}.page{position:relative;width:841.89pt;height:595.28pt;overflow:hidden;background:white}.abs,.line,.rowborder{position:absolute}.line{border-left:0.6pt solid #b7c0cb}.rowborder,.bottom,.heading{border:0.65pt solid #b7c0cb}.heading{display:flex;justify-content:space-between;align-items:center;padding:0 10pt;font-size:14pt}.heading strong{font-size:11pt}.field{display:flex;align-items:center;white-space:nowrap;font-size:9pt}.lab{font-weight:bold;width:83pt;flex-shrink:0}.val{font-size:9pt}.checks{display:flex;align-items:center;justify-content:space-between;gap:6pt;font-size:8pt;white-space:nowrap}.checks b{font-size:8.5pt}.check{white-space:nowrap;margin-right:4pt}.headbg{background:#f0f3f7;border:0.65pt solid #b7c0cb}.th{font-size:9pt;font-weight:bold}.dept{font-size:9pt;font-weight:bold}.notes{font-size:8pt;white-space:pre-wrap;overflow:hidden;overflow-wrap:anywhere}.decision{font-size:9pt;white-space:nowrap}.decision b{font-size:9pt}.signatures{font-size:9pt}@media screen{body{background:#e5e7eb}.page{margin:16px auto;box-shadow:0 2px 12px #999}}@media print{html,body{width:297mm;height:210mm}.page{margin:0;box-shadow:none}print-color-adjust:exact;-webkit-print-color-adjust:exact}</style></head><body><div class="page">'+header+abs(25,55.6,792,67,'','bottom')+line(221.8,55.6,0,67)+line(408,55.6,0,67)+info+checks+deptHeader+rows+bottom+'</div></body></html>'
  printHTML(html)
 }
 const filtered=meetings.filter(m=>{const o=orders.find(x=>x.id===m.order_id)||{};return !search||[m.ppm_number,o.job_number,o.style_number,o.po_number,o.buyer_name].some(v=>String(v||'').toLowerCase().includes(search.toLowerCase()))})
 return <div style={{padding:24,background:'#fff',height:'100%',overflowY:'auto',minHeight:0,fontFamily:'Inter,Arial,sans-serif'}}>
 <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:16}}><div><h2 style={{margin:0}}>PP Meeting</h2><p style={{color:'#64748b',fontSize:12}}>Reports / Orders & Customers · A4 landscape</p></div><button style={button} onClick={()=>navigate('/reports')}>← All Reports</button></div>
 {notice&&<div role="status" style={{padding:10,background:'#f0fdf4',color:'#166534',marginBottom:10}}>{notice}</div>}
 {error&&<div role="alert" style={{padding:12,background:'#fff4ed',color:'#9a3412',marginBottom:12}}>{error}</div>}

 <div style={{display:'flex',alignItems:'center',gap:10,marginBottom:16,flexWrap:'wrap'}}>
  <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search PPM number, job, style, PO or buyer" style={{...button,minWidth:340,flex:1,fontWeight:400}}/>
  <select value={orderId} onChange={e=>setOrderId(e.target.value)} style={{...button,minWidth:220}}><option value="">All orders</option>{orders.map(o=><option key={o.id} value={o.id}>{o.job_number} · {o.style_number} · {o.buyer_name}</option>)}</select>
  <button style={{...button,background:'#171d30',color:'#fff'}} onClick={()=>setShowCreate(true)}>+ New PP Meeting</button>
 </div>
 <div style={{border:'1px solid #e2e8f0',borderRadius:9,overflow:'auto',marginBottom:20}}>
 <table style={{width:'100%',borderCollapse:'collapse',fontSize:12,textAlign:'left'}}><thead><tr style={{background:'#f1f5f9'}}>{['PPM Number','Job / Style','Buyer / PO','Meeting Date','Status','Actions'].map(x=><th key={x} style={{padding:12}}>{x}</th>)}</tr></thead><tbody>{filtered.map(m=>{const o=orders.find(x=>x.id===m.order_id)||{};return <tr key={m.id} style={{borderTop:'1px solid #e2e8f0'}}><td style={{padding:12,fontWeight:750}}>{m.ppm_number}</td><td style={{padding:12}}>{o.job_number||'—'} / {o.style_number||'—'}</td><td style={{padding:12}}>{o.buyer_name||'—'} / {o.po_number||'—'}</td><td style={{padding:12}}>{formatDate(m.meeting_date)||'—'}</td><td style={{padding:12}}>{m.status}</td><td style={{padding:12,whiteSpace:'nowrap'}}><button style={button} onClick={()=>{setOrderId(m.order_id);setCurrent(m)}}>Open</button> <button style={button} onClick={()=>print(m,false)}>Print Blank</button> {!hasContent(m)&&<button style={{...button,color:'#b91c1c'}} disabled={busy} onClick={()=>remove(m)}>Delete</button>}</td></tr>})}</tbody></table>{!filtered.length&&<div style={{padding:22,color:'#64748b'}}>No PP Meetings found.</div>}
 </div>
 {showCreate&&<div role="dialog" aria-modal="true" aria-label="Create PP Meeting" style={{position:'fixed',inset:0,zIndex:1000,background:'rgba(15,23,42,.55)',display:'flex',alignItems:'center',justifyContent:'center',padding:24}}><div style={{background:'#fff',width:'min(620px,100%)',borderRadius:12,padding:24,boxShadow:'0 20px 70px #0003'}}><h2 style={{margin:'0 0 8px'}}>Create PP Meeting</h2><p style={{color:'#64748b',fontSize:13}}>Select an order. A unique PPM number will be assigned.</p><input value={orderSearch} onChange={e=>setOrderSearch(e.target.value)} placeholder="Find job, style, PO or buyer" style={{...button,width:'100%',marginBottom:12}}/><select value={orderId} onChange={e=>setOrderId(e.target.value)} style={{...button,width:'100%'}}><option value="">Select an order</option>{orders.filter(o=>!orderSearch||[o.job_number,o.style_number,o.po_number,o.buyer_name].some(v=>String(v||'').toLowerCase().includes(orderSearch.toLowerCase()))||o.id===orderId).map(o=><option key={o.id} value={o.id}>{o.job_number} · {o.style_number} · PO {o.po_number} · {o.buyer_name}</option>)}</select><div style={{display:'flex',justifyContent:'flex-end',gap:10,marginTop:22}}><button style={button} onClick={()=>setShowCreate(false)}>Cancel</button><button style={{...button,background:'#171d30',color:'#fff'}} disabled={!orderId||busy} onClick={create}>Create Draft</button></div></div></div>}
 
 {current?<div role="dialog" aria-modal="true" aria-label="PP Meeting editor" style={{position:'fixed',inset:0,zIndex:1000,background:'rgba(15,23,42,.55)',display:'flex',alignItems:'center',justifyContent:'center',padding:22}}><div style={{background:'#fff',width:'min(1450px,98vw)',maxHeight:'calc(100dvh - 44px)',overflowY:'auto',border:'1px solid #dbe1e9',borderRadius:12,padding:20,boxShadow:'0 20px 70px #0003'}}>
 <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',gap:10,marginBottom:12,position:'sticky',top:0,zIndex:5,background:'#fff',padding:'8px 0',borderBottom:'1px solid #e2e8f0',flexWrap:'wrap'}}><h3 style={{margin:0}}>{current.ppm_number} · {order?.style_number||''}</h3><div style={{display:'flex',gap:8,flexWrap:'wrap'}}><button style={{...button,background:'#171d30',color:'#fff'}} onClick={()=>print(current,false)}>Print Blank A4</button><button style={button} onClick={()=>print(current,true)}>Print Completed</button><button style={button} onClick={()=>setCurrent(null)}>Close editor</button></div></div>
 <div style={{display:'flex',gap:12,flexWrap:'wrap',marginBottom:15}}><label>Meeting date <input type="date" value={current.meeting_date||''} onChange={e=>patch('meeting_date',e.target.value)}/></label><label>Status <select value={current.status} onChange={e=>patch('status',e.target.value)}>{['Draft','Completed','Closed'].map(s=><option key={s}>{s}</option>)}</select></label><label>Decision <select value={current.decision||''} onChange={e=>patch('decision',e.target.value)}><option value="">Not decided</option>{['Ready for production','Conditional approval','Hold'].map(s=><option key={s}>{s}</option>)}</select></label></div>
 <div style={{display:'flex',gap:14,flexWrap:'wrap',marginBottom:12}}>{CHECKS.map(c=><label key={c}><input type="checkbox" checked={!!current.technical_checks?.[c]} onChange={e=>patch('technical_checks',{...current.technical_checks,[c]:e.target.checked})}/>{c}</label>)}<label>FIT approved <select value={current.fit_approved===null?'':String(current.fit_approved)} onChange={e=>patch('fit_approved',e.target.value===''?null:e.target.value==='true')}><option value="">Unknown</option><option value="true">Yes</option><option value="false">No</option></select></label></div>
 <div style={{overflowX:'auto'}}><table style={{width:'100%',borderCollapse:'collapse',fontSize:12}}><thead><tr>{['Department','Critical area / challenge','Preventive / corrective measure','Owner / due'].map(x=><th key={x} style={{textAlign:'left',padding:8,background:'#f1f5f9'}}>{x}</th>)}</tr></thead><tbody>{DEPARTMENTS.map(d=><tr key={d}><td style={{fontWeight:700,padding:8,borderBottom:'1px solid #e2e8f0'}}>{d}</td>{['critical','measure','owner_due'].map(k=><td key={k} style={{padding:5,borderBottom:'1px solid #e2e8f0'}}><textarea rows={2} style={{width:'100%',resize:'vertical',border:'1px solid #cbd5e1',borderRadius:4}} value={current.department_notes?.[d]?.[k]||''} onChange={e=>updateNote(d,k,e.target.value)}/></td>)}</tr>)}</tbody></table></div>
 <label style={{display:'block',marginTop:12}}>Outstanding actions / next review<textarea rows={2} style={{display:'block',width:'100%'}} value={current.outstanding_actions||''} onChange={e=>patch('outstanding_actions',e.target.value)}/></label>
 <div style={{display:'flex',gap:10,alignItems:'center',marginTop:14,flexWrap:'wrap'}}><label>Signed handwritten sheet (PDF/JPG/PNG, max 10MB) <input type="file" accept="application/pdf,image/jpeg,image/png" onChange={e=>setUploadFile(e.target.files?.[0]||null)}/></label><button style={button} disabled={busy||!uploadFile} onClick={upload}>Upload signed sheet</button>{current.attachment_path&&<button style={button} onClick={()=>viewAttachment(current)}>View attachment</button>}</div><div style={{display:'flex',gap:8,marginTop:14}}><button style={{...button,background:'#151b30',color:'#fff'}} disabled={busy} onClick={save}>Save meeting</button></div>
 </div></div>:null}
 </div>
}
