import React,{useState} from 'react'
import JSZip from 'jszip'
import {ArrowLeft,Download,Printer,Search,SlidersHorizontal} from 'lucide-react'

const PILOT_FORMATS=[
 {name:'Fabric 4 Point Inspection',code:'QMS-MAT-001',department:'Materials',columns:['Date','Supplier','Fabric Lot','Roll No','Inspected Length (YD)','Defect Description','Defect Points','Points/100 SQ YD','Decision','Inspector'],signatures:['Prepared by','Checked by','Approved by']},
 {name:'Needle & Broken Needle Control',code:'QMS-SEW-004',department:'Stitching',columns:['Time','Operator / Machine','Type / Size Needle','Event Reason','Returned Old Needle','Recovered Fragments','Action Missing','Issued New Needle','Verified By','Remarks / Release'],signatures:['Prepared by','QC Incharge','QA Manager'],notice:'If needle breaks: stop machine, isolate affected work, recover all fragments, investigate missing pieces and authorize restart.'},
 {name:'Final AQL Inspection',code:'QMS-SHIP-001',department:'Final Inspection',columns:['Date','Buyer','PO','Style','Lot Size','Sample Size','Critical Defects','Major Defects','Minor Defects','Decision'],signatures:['Prepared by','Checked by','Approved by']}
]
const FORMATS=["MEASUREMENT AUDIT","CUTTING INSPECTION","MATERIAL NONCONFORMANCE","70 PROCESS AUDIT","SUPPLIER EVALUATION","PREVENTIVE MAINTENANCE","MANAGEMENT REVIEW","INCOMING MATERIAL TESTS","FUSING PROCESS CONTROL","CALIBRATION REGISTER","PILOT RUN APPROVAL","TRIMS INSPECTION","TRAINING COMPETENCY","WASH CHEMICAL CONTROL","PACKING CARTON AUDIT","FINAL AQL INSPECTION","WASHING BATCH QUALITY","APPROVED SAMPLE SPECS","METAL DETECTION","BACK QUALITY CHECKING","NEEDLE & BROKEN NEEDLE CONTROL","CUSTOMER COMPLAINT CLAIMS","FRONT QUALITY CHECKING","SHIPMENT QUALITY RELEASE","CUTTING INLINE 70 AUDIT","FINISHING INSPECTION","BUYER REQUIREMENTS","QUALITY CONTROL PLAN","QUALITY KPI PERFORMANCE","FABRIC 4 POINT INSPECTION","DEFECT ANALYSIS DHU RFT","FABRIC SHRINKAGE SHADE","SEWING INLINE INSPECTION","NONCONFORMANCE NCR","POST WASH MEASUREMENT","INTERNAL QUALITY AUDIT","CORRECTIVE ACTION CAPA","PRE-PRODUCTION MEETING","FINAL STITCHING QUALITY CHECKING","SHADE BUNDLE TRACEABILITY"].map((name,index)=>({
 name:name.toLowerCase().replace(/\b\w/g,c=>c.toUpperCase()),
 filename:name+'.xlsx',code:'QMS-'+String(index+1).padStart(2,'0'),
 department:'QMS',pilot:PILOT_FORMATS.find(p=>p.name.toUpperCase()===name)
}))
const ZIP_URL='https://raw.githubusercontent.com/shafayhsn/nizamia-app2A/feature/production-formats/QMS%20Excel%20formats.zip'
let cachedZipPromise=null
async function getZip(){
 if(!cachedZipPromise)cachedZipPromise=fetch(ZIP_URL).then(r=>{
  if(!r.ok)throw Error('Unable to load master Excel templates ('+r.status+').')
  return r.arrayBuffer()
 }).then(data=>JSZip.loadAsync(data)).catch(err=>{cachedZipPromise=null;throw err})
 return cachedZipPromise
}
async function downloadOriginalExcel(form){
 const zip=await getZip()
 const file=Object.values(zip.files).find(f=>!f.dir&&f.name.split('/').pop()===form.filename)
 if(!file)throw Error('Original workbook not found: '+form.filename)
 const blob=await file.async('blob')
 const url=URL.createObjectURL(new Blob([blob],{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'}))
 const link=document.createElement('a');link.href=url;link.download=form.filename;document.body.appendChild(link);link.click();link.remove()
 setTimeout(()=>URL.revokeObjectURL(url),10000)
}
const input={border:'1px solid #d8dce4',borderRadius:6,padding:'7px 9px',fontSize:12,background:'#fff'}
const button={...input,cursor:'pointer',fontWeight:600,display:'inline-flex',alignItems:'center',gap:6}
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))
function printForm(form,date,columns,rows){
 const header=['JOB# / PO','CUSTOMER','DESIGN / STYLE','DEPARTMENT / LINE','DATE','LOT / BATCH']
 const html=`<!doctype html><html><head><meta charset="utf-8"><title>${esc(form.name)}</title><style>@page{size:A4 landscape;margin:13mm}body{font-family:Arial,sans-serif;color:#111;font-size:10px}.head{display:flex;justify-content:space-between;border-bottom:2px solid #333;padding-bottom:12px;margin-bottom:16px}h1{font-size:18px;margin:4px 0}.meta{font-size:10px;text-align:right}.fields{display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin:14px 0 18px}.field{border-bottom:1px solid #999;padding:5px 0}table{border-collapse:collapse;width:100%;table-layout:fixed}th,td{border:1px solid #666;padding:7px 4px;text-align:left;overflow-wrap:anywhere}th{background:#eee;font-size:9px}td{height:20px}.sign{display:flex;justify-content:space-around;margin-top:35px}.sign span{border-top:1px solid #555;min-width:140px;text-align:center;padding-top:7px}.foot{font-size:9px;color:#555;margin-top:18px}button{display:none}@media screen{body{max-width:1100px;margin:25px auto}}</style></head><body><div class="head"><div><b>NIZAMIA APPARELS</b><h1>${esc(form.name.toUpperCase())}</h1><div>${esc(form.department)} · ${esc(form.code)}</div></div><div class="meta">PAGE 01 OF 01 | REV: 00<br>Document Nr: ${esc(form.code)}<br>Dated: ${esc(date||'____________')}</div></div><div class="fields">${header.map(h=>`<div class="field"><b>${h}:</b> ${h==='DATE'?esc(date||'____________'):'____________________'}</div>`).join('')}</div><table><thead><tr>${columns.map(c=>`<th>${esc(c)}</th>`).join('')}</tr></thead><tbody>${Array.from({length:rows},()=>`<tr>${columns.map(()=>'<td>&nbsp;</td>').join('')}</tr>`).join('')}</tbody></table>${form.notice?`<p><b>${esc(form.notice)}</b></p>`:''}<div class="sign">${form.signatures.map(s=>`<span>${esc(s)}</span>`).join('')}</div><div class="foot">Controlled QMS form | Record actual observations; mark N/A where applicable. Reference approved specifications and relevant NCR/CAPA when needed.</div></body></html>`
 const frame=document.createElement('iframe')
 frame.setAttribute('title','Print production format')
 frame.style.cssText='position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden'
 document.body.appendChild(frame)
 const doc=frame.contentDocument
 if(!doc){frame.remove();window.alert('Unable to prepare the print view. Please try again.');return}
 let started=false
 const doPrint=()=>{
   if(started)return
   started=true
   try{
     frame.contentWindow.focus()
     frame.contentWindow.print()
   }catch(error){
     window.alert('The browser could not open the print dialog. Please try again.')
   }
   setTimeout(()=>frame.remove(),60000)
 }
 frame.onload=()=>setTimeout(doPrint,150)
 doc.open();doc.write(html);doc.close()
 setTimeout(doPrint,1000)
}
export default function ProductionFormats(){
 const [query,setQuery]=useState(''),[department,setDepartment]=useState('All'),[sort,setSort]=useState('name'),[selected,setSelected]=useState(null),[busy,setBusy]=useState(false),[error,setError]=useState('')
 const [date,setDate]=useState(''),[hidden,setHidden]=useState([]),[rows,setRows]=useState(8)
 const departmentOf=name=>{
  if(/FABRIC|MATERIAL|TRIMS|SUPPLIER|SHRINKAGE|SHADE BUNDLE|INCOMING/.test(name))return 'Materials & Fabric'
  if(/CUTTING|FUSING/.test(name))return 'Cutting'
  if(/SEWING|STITCHING|NEEDLE|FRONT QUALITY|BACK QUALITY|70 PROCESS|PILOT RUN/.test(name))return 'Sewing'
  if(/WASH|POST WASH/.test(name))return 'Washing'
  if(/FINISHING|MEASUREMENT|METAL DETECTION|PACKING|FINAL AQL|SHIPMENT/.test(name))return 'Finishing & Final QC'
  return 'Quality Management'
 }
 const departments=['All',...new Set(FORMATS.map(f=>departmentOf(f.filename.toUpperCase())))]
 const matches=FORMATS.filter(f=>(department==='All'||departmentOf(f.filename.toUpperCase())===department)&&[f.name,f.filename,departmentOf(f.filename.toUpperCase())].join(' ').toLowerCase().includes(query.toLowerCase())).sort((a,b)=>sort==='department'?departmentOf(a.filename.toUpperCase()).localeCompare(departmentOf(b.filename.toUpperCase()))||a.name.localeCompare(b.name):a.name.localeCompare(b.name))
 const choose=f=>{setSelected(f);setHidden([]);setDate('');setRows(8);setError('')}
 const download=async()=>{setBusy(true);setError('');try{await downloadOriginalExcel(selected)}catch(e){setError(e.message||'Download failed')}finally{setBusy(false)}}
 const cell={padding:'11px',borderTop:'1px solid #edf0f4'}
 const btn={border:'1px solid #d9dce4',borderRadius:7,padding:'7px 11px',background:'#fff',cursor:'pointer',fontSize:12,fontWeight:650}
 return !selected?<div>
  <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',gap:10,flexWrap:'wrap',marginBottom:12}}>
   <div style={{display:'flex',gap:9,flexWrap:'wrap'}}>
    <div style={{display:'flex',alignItems:'center',gap:8,background:'#fff',border:'1px solid #d9dce4',borderRadius:7,padding:'0 11px',width:290}}><Search size={15}/><input placeholder="Search formats..." value={query} onChange={e=>setQuery(e.target.value)} style={{border:0,outline:0,padding:'10px 0',width:'100%',fontSize:12}}/></div>
    <select value={sort} onChange={e=>setSort(e.target.value)} style={btn}><option value="name">Name (A–Z)</option><option value="department">Department (A–Z)</option></select>
    <select value={department} onChange={e=>setDepartment(e.target.value)} style={btn}>{departments.map(d=><option key={d} value={d}>{d==='All'?'All Departments':d}</option>)}</select>
   </div>
   <span style={{fontSize:12,color:'#64748b'}}>{matches.length} formats</span>
  </div>
  <div style={{background:'#fff',border:'1px solid #e2e6ed',borderRadius:9,overflow:'auto'}}>
   <table style={{width:'100%',borderCollapse:'collapse',fontSize:12,textAlign:'left'}}><thead><tr style={{background:'#f4f6f9',color:'#64748b',fontSize:10,textTransform:'uppercase'}}><th style={{padding:11}}>Report Name</th><th style={{padding:11}}>Format</th><th style={{padding:11}}>Department</th><th style={{padding:11,textAlign:'right'}}>Action</th></tr></thead><tbody>{matches.map(f=><tr key={f.filename}><td style={{...cell,fontWeight:700}}><button onClick={()=>choose(f)} style={{border:0,background:'transparent',cursor:'pointer',font:'inherit',fontWeight:700,textAlign:'left'}}>{f.name}</button></td><td style={{...cell,color:'#64748b'}}>Excel (.xlsx)</td><td style={{...cell,color:'#475569'}}>{departmentOf(f.filename.toUpperCase())}</td><td style={{...cell,textAlign:'right'}}><button style={btn} onClick={()=>choose(f)}>View</button></td></tr>)}</tbody></table>
   {!matches.length&&<div style={{padding:24,textAlign:'center',color:'#64748b'}}>No formats found.</div>}
  </div>
 </div>:<div style={{background:'#fff',border:'1px solid #e4e7ec',borderRadius:12,padding:18}}>
  <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',gap:12,flexWrap:'wrap',marginBottom:18}}>
   <div><div style={{fontSize:17,fontWeight:700}}>{selected.name}</div><div style={{fontSize:12,color:'#64748b',marginTop:4}}>{departmentOf(selected.filename.toUpperCase())} · Original Excel master template</div></div>
   <button style={btn} onClick={()=>{setSelected(null);setError('')}}><ArrowLeft size={14} style={{verticalAlign:'middle',marginRight:5}}/> All Production Formats</button>
  </div>
  <button style={{...btn,background:'#141b2e',color:'#fff',borderColor:'#141b2e'}} disabled={busy} onClick={download}><Download size={14} style={{verticalAlign:'middle',marginRight:6}}/>{busy?'Preparing Excel...':'Download Original Excel'}</button>
  {error&&<div role="alert" style={{fontSize:12,color:'#b91c1c',marginTop:12}}>{error}</div>}
  <div style={{fontSize:12,color:'#64748b',marginTop:12}}>Downloads your original Excel workbook without altering its formatting. Edit dates, rows and columns in Excel.</div>
  {selected.pilot&&<div style={{borderTop:'1px solid #e2e8f0',marginTop:22,paddingTop:17}}>
   <div style={{fontWeight:650,fontSize:13,marginBottom:12}}>Optional pilot PDF print layout</div>
   <label style={{display:'block',fontSize:12,marginBottom:7}}>Date (optional)</label><input type="date" value={date} onChange={e=>setDate(e.target.value)} style={{...input,marginBottom:12}}/>
   <label style={{display:'block',fontSize:12,marginBottom:7}}>Blank rows</label><input type="number" min="1" max="30" value={rows} onChange={e=>setRows(Math.min(30,Math.max(1,Number(e.target.value)||1)))} style={{...input,width:80,marginBottom:12}}/>
   <div style={{display:'flex',alignItems:'center',gap:7,fontSize:12,marginBottom:9}}><SlidersHorizontal size={14}/> PDF visible columns</div>
   <div style={{display:'grid',gridTemplateColumns:'repeat(2,minmax(0,1fr))',gap:8,marginBottom:15}}>{selected.pilot.columns.map(c=><label key={c} style={{fontSize:11,display:'flex',gap:6}}><input type="checkbox" checked={!hidden.includes(c)} onChange={e=>setHidden(h=>e.target.checked?h.filter(x=>x!==c):[...h,c])}/>{c}</label>)}</div>
   <button style={btn} disabled={hidden.length===selected.pilot.columns.length} onClick={()=>printForm(selected.pilot,date,selected.pilot.columns.filter(c=>!hidden.includes(c)),rows)}><Printer size={15} style={{verticalAlign:'middle',marginRight:6}}/>Print / Save as PDF</button>
  </div>}
 </div>
}