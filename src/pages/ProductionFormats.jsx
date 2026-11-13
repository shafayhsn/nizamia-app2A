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

const XML_NS='http://schemas.openxmlformats.org/spreadsheetml/2006/main'
const xChildren=(node,name)=>Array.from(node?.children||[]).filter(c=>c.localName===name)
const xChild=(node,name)=>xChildren(node,name)[0]
const colNumber=letters=>letters.split('').reduce((n,c)=>n*26+c.charCodeAt(0)-64,0)
const colLetters=n=>{let s='';while(n){n--;s=String.fromCharCode(65+n%26)+s;n=Math.floor(n/26)}return s}
const cellText=cell=>xChild(cell,'v')?.textContent||xChild(xChild(cell,'is'),'t')?.textContent||''
const rowCells=row=>xChildren(row,'c')
const xmlString=doc=>new XMLSerializer().serializeToString(doc)
const xmlParse=s=>{const d=new DOMParser().parseFromString(s,'application/xml');if(d.querySelector('parsererror'))throw Error('Cannot read template XML');return d}
async function loadTemplate(form){
 const zip=await getZip()
 const file=Object.values(zip.files).find(f=>!f.dir&&f.name.split('/').pop()===form.filename&&!f.name.startsWith('__MACOSX/'))
 if(!file)throw Error('Original workbook not found: '+form.filename)
 const original=await file.async('arraybuffer')
 const book=await JSZip.loadAsync(original)
 const path='xl/worksheets/sheet1.xml'
 const sheet=xmlParse(await book.file(path).async('string'))
 const data=xChild(sheet.documentElement,'sheetData')
 const header=xChildren(data,'row').find(r=>r.getAttribute('r')==='9')
 if(!header)throw Error('Missing table header in '+form.filename)
 const columns=rowCells(header).filter(c=>cellText(c).trim()).map(c=>({index:colNumber(c.getAttribute('r').replace(/\d/g,'')),label:cellText(c)}))
 return {book,sheet,data,columns,path}
}
function customizeSheet(t,date,visible,rows){
 const {sheet,data,columns}=t
 const originalRows=xChildren(data,'row')
 const entry=originalRows.filter(r=>+r.getAttribute('r')>=10&&+r.getAttribute('r')<=29)
 const count=Math.max(1,Math.min(60,Number(rows)||20))
 const delta=count-entry.length
 const template=entry[0]
 const footer=originalRows.filter(r=>+r.getAttribute('r')>=30)
 for(const row of entry)row.remove()
 for(const row of footer){
  const newRow=+row.getAttribute('r')+delta
  row.setAttribute('r',String(newRow))
  for(const cell of rowCells(row))cell.setAttribute('r',cell.getAttribute('r').replace(/\d+$/,String(newRow)))
 }
 const before=footer[0]
 for(let i=0;i<count;i++){
  const row=template.cloneNode(true)
  row.setAttribute('r',String(10+i))
  for(const cell of rowCells(row)){
   cell.setAttribute('r',cell.getAttribute('r').replace(/\d+$/,String(10+i)))
   for(const child of [...cell.children])if(['v','f','is'].includes(child.localName))child.remove()
   cell.removeAttribute('t')
  }
  data.insertBefore(row,before||null)
 }
 const cols=xChild(sheet.documentElement,'cols')
 for(const col of xChildren(cols,'col')){
  const n=+col.getAttribute('min')
  col.setAttribute('hidden',visible.includes(n)?'0':'1')
 }
 const merges=xChild(sheet.documentElement,'mergeCells')
 for(const merge of xChildren(merges,'mergeCell')){
  const ref=merge.getAttribute('ref')
  merge.setAttribute('ref',ref.replace(/(\d+)/g,n=>+n>=30?String(+n+delta):n))
 }
 for(const row of xChildren(data,'row')){
  if(+row.getAttribute('r')!==7||!date)continue
  const cell=rowCells(row)[0],v=xChild(cell,'v')
  if(v)v.textContent=v.textContent.replace(/DATE:\s*_{3,}/i,'DATE: '+date)
 }
 const dimension=xChild(sheet.documentElement,'dimension')
 if(dimension)dimension.setAttribute('ref',dimension.getAttribute('ref').replace(/\d+$/,String(32+delta)))
 return t
}
async function buildCustomized(form,date,visible,rows){
 const t=await loadTemplate(form)
 customizeSheet(t,date,visible,rows)
 t.book.file(t.path,xmlString(t.sheet))
 return t
}
async function downloadCustomized(form,date,visible,rows){
 const t=await buildCustomized(form,date,visible,rows)
 const blob=await t.book.generateAsync({type:'blob',compression:'DEFLATE'})
 const url=URL.createObjectURL(blob),a=document.createElement('a')
 a.href=url;a.download=form.filename.replace(/\.xlsx$/i,' - Custom.xlsx');document.body.appendChild(a);a.click();a.remove()
 setTimeout(()=>URL.revokeObjectURL(url),15000)
}
async function printCustomized(form,date,visible,rows){
 const t=await buildCustomized(form,date,visible,rows)
 const data=xChild(t.sheet.documentElement,'sheetData')
 const entries=xChildren(data,'row')
 const headers=entries.find(r=>+r.getAttribute('r')===9)
 const cellAt=(row,n)=>rowCells(row).find(c=>colNumber(c.getAttribute('r').replace(/\d/g,''))===n)
 const shown=t.columns.filter(c=>visible.includes(c.index))
 const title=entries.find(r=>+r.getAttribute('r')===3)
 const meta=entries.find(r=>+r.getAttribute('r')===4)
 const rowHtml=entries.filter(r=>+r.getAttribute('r')>=10&&+r.getAttribute('r')<10+rows).map(row=>'<tr>'+shown.map(c=>'<td>'+esc(cellText(cellAt(row,c.index)))+'</td>').join('')+'</tr>').join('')
 const footer=entries.filter(r=>+r.getAttribute('r')>=30+rows-20).map(r=>esc(cellText(cellAt(r,1)))).filter(Boolean)
 const html='<!doctype html><html><head><meta charset="utf-8"><title>'+esc(form.name)+'</title><style>@page{size:A4 landscape;margin:12mm}body{font-family:Arial,sans-serif;color:#172033;font-size:11px}h1{font-size:19px;margin:6px 0}header{border-bottom:2px solid #1d2939;padding-bottom:12px;margin-bottom:16px}.meta{color:#475569;font-size:10px}table{width:100%;border-collapse:collapse;table-layout:fixed}th,td{border:1px solid #7b8794;padding:6px 4px;overflow-wrap:anywhere}th{background:#e9edf2;font-size:9px}td{height:21px}.footer{margin-top:22px;border-top:1px solid #cbd5e1;padding-top:9px;font-size:10px}</style></head><body><header><b>NIZAMIA APPARELS</b><h1>'+esc(cellText(cellAt(title,1))||form.name)+'</h1><div class="meta">'+esc(cellText(cellAt(meta,1)))+'</div><div class="meta">Date: '+esc(date||'____________')+'</div></header><table><thead><tr>'+shown.map(c=>'<th>'+esc(c.label)+'</th>').join('')+'</tr></thead><tbody>'+rowHtml+'</tbody></table><div class="footer">'+footer.map(x=>'<p>'+x+'</p>').join('')+'</div></body></html>'
 const frame=document.createElement('iframe')
 frame.style.cssText='position:fixed;width:0;height:0;border:0;visibility:hidden'
 document.body.appendChild(frame)
 let started=false
 const run=()=>{if(started)return;started=true;frame.contentWindow.focus();frame.contentWindow.print();setTimeout(()=>frame.remove(),60000)}
 frame.onload=()=>setTimeout(run,150)
 frame.contentDocument.open();frame.contentDocument.write(html);frame.contentDocument.close()
 setTimeout(run,1200)
}

export default function ProductionFormats(){
 const [query,setQuery]=useState(''),[department,setDepartment]=useState('All'),[sort,setSort]=useState('name'),[selected,setSelected]=useState(null),[busy,setBusy]=useState(false),[error,setError]=useState('')
 const [date,setDate]=useState(''),[hidden,setHidden]=useState([]),[rows,setRows]=useState(20),[templateCols,setTemplateCols]=useState([]),[loadingTemplate,setLoadingTemplate]=useState(false)
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
 const choose=async f=>{setSelected(f);setHidden([]);setDate('');setRows(20);setError('');setLoadingTemplate(true);try{const t=await loadTemplate(f);setTemplateCols(t.columns)}catch(e){setError(e.message)}finally{setLoadingTemplate(false)}}
 const download=async(type)=>{setBusy(true);setError('');try{const visible=templateCols.filter(c=>!hidden.includes(c.index)).map(c=>c.index);if(!visible.length)throw Error('Select at least one column');if(type==='excel')await downloadCustomized(selected,date,visible,rows);else await printCustomized(selected,date,visible,rows)}catch(e){setError(e.message||'Download failed')}finally{setBusy(false)}}
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
  {loadingTemplate?<div style={{fontSize:12,color:'#64748b'}}>Loading original format columns...</div>:<>
  <div style={{display:'flex',gap:16,flexWrap:'wrap',marginBottom:18}}>
   <label style={{fontSize:12}}>Report date (optional)<div><input type="date" value={date} onChange={e=>setDate(e.target.value)} style={{...input,marginTop:7}}/></div></label>
   <label style={{fontSize:12}}>Blank entry rows<div><input type="number" min="1" max="60" value={rows} onChange={e=>setRows(Math.max(1,Math.min(60,Number(e.target.value)||1)))} style={{...input,marginTop:7,width:90}}/></div></label>
  </div>
  <div style={{fontWeight:650,fontSize:12,marginBottom:9}}>Visible table columns</div>
  <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(180px,1fr))',gap:9,marginBottom:20}}>
   {templateCols.map(c=><label key={c.index} style={{fontSize:12,display:'flex',alignItems:'center',gap:7}}><input type="checkbox" checked={!hidden.includes(c.index)} onChange={e=>setHidden(h=>e.target.checked?h.filter(x=>x!==c.index):[...h,c.index])}/>{c.label}</label>)}
  </div>
  <div style={{display:'flex',gap:9,flexWrap:'wrap'}}>
   <button style={{...btn,background:'#141b2e',color:'#fff',borderColor:'#141b2e'}} disabled={busy||!!error||!templateCols.length} onClick={()=>download('excel')}><Download size={14} style={{verticalAlign:'middle',marginRight:6}}/>{busy?'Preparing...':'Download Excel'}</button>
   <button style={btn} disabled={busy||!!error||!templateCols.length} onClick={()=>download('pdf')}><Printer size={14} style={{verticalAlign:'middle',marginRight:6}}/>Print / Save as PDF</button>
   <button style={btn} disabled={busy} onClick={()=>downloadOriginalExcel(selected).catch(e=>setError(e.message))}>Original Excel (unchanged)</button>
  </div>
  <div style={{fontSize:11,color:'#64748b',marginTop:12}}>Customised Excel retains original workbook formatting. PDF uses a print-friendly rendition of the same selected columns and rows. Original master remains unchanged.</div>
  </>}
  {error&&<div role="alert" style={{fontSize:12,color:'#b91c1c',marginTop:12}}>{error}</div>}
 </div>
}