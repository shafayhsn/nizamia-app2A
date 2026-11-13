import React,{useState} from 'react'
import {ArrowLeft,Download,Printer,Search,SlidersHorizontal} from 'lucide-react'

const FORMATS=[
 {name:'Fabric 4 Point Inspection',code:'QMS-MAT-001',department:'Materials',columns:['Date','Supplier','Fabric Lot','Roll No','Inspected Length (YD)','Defect Description','Defect Points','Points/100 SQ YD','Decision','Inspector'],signatures:['Prepared by','Checked by','Approved by']},
 {name:'Needle & Broken Needle Control',code:'QMS-SEW-004',department:'Stitching',columns:['Time','Operator / Machine','Type / Size Needle','Event Reason','Returned Old Needle','Recovered Fragments','Action Missing','Issued New Needle','Verified By','Remarks / Release'],signatures:['Prepared by','QC Incharge','QA Manager'],notice:'If needle breaks: stop machine, isolate affected work, recover all fragments, investigate missing pieces and authorize restart.'},
 {name:'Final AQL Inspection',code:'QMS-SHIP-001',department:'Final Inspection',columns:['Date','Buyer','PO','Style','Lot Size','Sample Size','Critical Defects','Major Defects','Minor Defects','Decision'],signatures:['Prepared by','Checked by','Approved by']}
]
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
export default function ProductionFormats({onBack}){
 const [query,setQuery]=useState(''),[dept,setDept]=useState('All'),[selected,setSelected]=useState(null),[date,setDate]=useState(''),[hidden,setHidden]=useState([]),[rows,setRows]=useState(8)
 const available=FORMATS.filter(f=>(dept==='All'||f.department===dept)&&[f.name,f.code,f.department].join(' ').toLowerCase().includes(query.toLowerCase()))
 const choose=f=>{setSelected(f);setHidden([]);setDate('');setRows(8)}
 return <div style={{fontFamily:'var(--font,Arial,sans-serif)',color:'#202633'}}>
  <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',gap:12,marginBottom:20}}>
   <div><h2 style={{margin:0,fontSize:20}}>Production Formats</h2><div style={{fontSize:12,color:'#64748b',marginTop:5}}>Standalone printable QMS forms · No database connection</div></div>
   <button style={button} onClick={onBack}><ArrowLeft size={14}/> All Reports</button>
  </div>
  <div style={{padding:'11px 13px',background:'#f8fafc',border:'1px solid #e2e8f0',borderRadius:8,fontSize:12,color:'#475569',marginBottom:18}}>Pilot: 3 reconstructed forms from your approved PDFs. The remaining 37 will be added after layout review. These are blank downloadable/printable forms, not saved records.</div>
  <div style={{display:'flex',gap:10,flexWrap:'wrap',marginBottom:18}}>
   <label style={{display:'flex',alignItems:'center',gap:6}}><Search size={15}/><input style={input} placeholder="Search format..." value={query} onChange={e=>setQuery(e.target.value)}/></label>
   <select style={input} value={dept} onChange={e=>setDept(e.target.value)}>{['All',...new Set(FORMATS.map(f=>f.department))].map(x=><option key={x}>{x}</option>)}</select>
  </div>
  <div style={{display:'grid',gridTemplateColumns:'minmax(240px,1fr) minmax(300px,1.4fr)',gap:18,alignItems:'start'}}>
   <div style={{border:'1px solid #e2e8f0',borderRadius:9,overflow:'hidden'}}>{available.map(f=><button key={f.code} onClick={()=>choose(f)} style={{display:'block',width:'100%',textAlign:'left',padding:'14px 15px',border:0,borderBottom:'1px solid #e2e8f0',background:selected?.code===f.code?'#eff6ff':'#fff',cursor:'pointer'}}><div style={{fontWeight:650,fontSize:13}}>{f.name}</div><div style={{color:'#64748b',fontSize:11,marginTop:4}}>{f.department} · {f.code}</div></button>)}{!available.length&&<div style={{padding:15,fontSize:12}}>No matching formats.</div>}</div>
   <div style={{border:'1px solid #e2e8f0',borderRadius:9,padding:18}}>
    {!selected?<div style={{color:'#64748b',fontSize:13}}>Select a format to customise its blank printable copy.</div>:<>
     <h3 style={{fontSize:16,margin:'0 0 5px'}}>{selected.name}</h3><div style={{color:'#64748b',fontSize:11,marginBottom:18}}>{selected.code} · REV 00</div>
     <label style={{display:'block',fontSize:12,fontWeight:650,marginBottom:7}}>Date (optional)</label><input type="date" value={date} onChange={e=>setDate(e.target.value)} style={{...input,marginBottom:16}}/>
     <label style={{display:'block',fontSize:12,fontWeight:650,marginBottom:7}}>Blank rows</label><input type="number" min="1" max="30" value={rows} onChange={e=>setRows(Math.min(30,Math.max(1,Number(e.target.value)||1)))} style={{...input,width:80,marginBottom:16}}/>
     <div style={{display:'flex',alignItems:'center',gap:7,fontSize:12,fontWeight:650,marginBottom:9}}><SlidersHorizontal size={14}/> Visible columns</div>
     <div style={{display:'grid',gridTemplateColumns:'repeat(2,minmax(0,1fr))',gap:8,marginBottom:18}}>{selected.columns.map(c=><label key={c} style={{fontSize:11,display:'flex',alignItems:'start',gap:6}}><input type="checkbox" checked={!hidden.includes(c)} onChange={e=>setHidden(h=>e.target.checked?h.filter(x=>x!==c):[...h,c])}/>{c}</label>)}</div>
     <button style={{...button,background:'#17233c',color:'#fff',borderColor:'#17233c'}} disabled={hidden.length===selected.columns.length} onClick={()=>printForm(selected,date,selected.columns.filter(c=>!hidden.includes(c)),rows)}><Printer size={15}/> Print / Save as PDF</button>
     <div style={{fontSize:11,color:'#64748b',marginTop:12}}>Use your browser's print dialog and choose “Save as PDF”. Settings apply only to this download.</div>
    </>}
   </div>
  </div>
 </div>
}
