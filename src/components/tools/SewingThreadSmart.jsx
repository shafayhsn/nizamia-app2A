import React,{useState} from 'react'
import * as XLSX from 'xlsx'

const TYPES=['Jeans','Trousers','Shorts','Jacket','Shirt','Other']
const RULES={
 Jeans:{inseam:2,outseam:2,rise:2,waist:2.5,hip:1.1,hem:2.2,extra:24},
 Trousers:{inseam:2,outseam:2,rise:2,waist:2.1,hip:.7,hem:2,extra:17},
 Shorts:{inseam:2,outseam:2,rise:2,waist:2.4,hip:1,hem:2.2,extra:19},
 Jacket:{length:4,chest:3,sleeve:4,shoulder:2,hem:2,extra:30},
 Shirt:{length:4,chest:3,sleeve:3,shoulder:2,hem:2,extra:23},
 Other:{length:4,chest:2,waist:2,hem:2,extra:20}
}
const ALIASES={
 inseam:['inseam','inside leg','inside seam'],
 outseam:['outseam','outside leg','side length','side seam'],
 rise:['front rise','front crotch','rise'],
 waist:['waist','waist width','waist circumference'],
 hip:['hip','seat'],
 hem:['leg opening','bottom opening','hem opening','hem width'],
 length:['body length','garment length','center back length','total length','length'],
 chest:['chest','half chest','bust'],
 sleeve:['sleeve length','sleeve'],
 shoulder:['shoulder width','across shoulder']
}
const clean=s=>String(s||'').toLowerCase().replace(/[^a-z0-9 ]/g,' ').replace(/\s+/g,' ').trim()
function extractMeasurements(lines){
 const found={}
 for(const line of lines){
  const cells=line.map(x=>String(x??'').trim()).filter(Boolean)
  for(let i=0;i<cells.length;i++){
   const key=clean(cells[i])
   for(const [field,aliases] of Object.entries(ALIASES)){
    if(found[field]!==undefined||!aliases.some(a=>key===a||key.startsWith(a+' ')||key.endsWith(' '+a)))continue
    const inline=cells[i].match(/(?:^|\s)(\d+(?:\.\d+)?)\s*(cm|inch|inches|in)?$/i)
    const near=cells.slice(i+1,i+5).map(s=>s.match(/^\s*(\d+(?:\.\d+)?)\s*(cm|inch|inches|in)?\s*$/i)).find(Boolean)
    const match=near||inline
    if(match){const value=Number(match[1]);if(value>0&&value<300)found[field]=value*(/^(in|inch|inches)$/i.test(match[2]||'')?2.54:1)}
   }
  }
 }
 return found
}
async function readPdf(file){
 // PDF.js is loaded only when a PDF is selected. Processing stays in this browser.
 const pdfjs=await import(/* @vite-ignore */ 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.10.38/pdf.min.mjs')
 pdfjs.GlobalWorkerOptions.workerSrc='https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.10.38/pdf.worker.min.mjs'
 const doc=await pdfjs.getDocument({data:new Uint8Array(await file.arrayBuffer())}).promise
 const lines=[]
 for(let p=1;p<=Math.min(doc.numPages,12);p++){
  const page=await doc.getPage(p),content=await page.getTextContent()
  const grouped=new Map()
  content.items.forEach(item=>{const y=Math.round(item.transform?.[5]||0);grouped.set(y,[...(grouped.get(y)||[]),{x:item.transform?.[4]||0,text:item.str}])})
  for(const row of grouped.values())lines.push(row.sort((a,b)=>a.x-b.x).map(a=>a.text))
 }
 return lines
}
const number=v=>Math.max(0,Number(v)||0)
export default function SewingThreadSmart(){
 const [file,setFile]=useState(null),[sketch,setSketch]=useState(null),[measure,setMeasure]=useState({}),[status,setStatus]=useState(''),[type,setType]=useState('Jeans'),[complexity,setComplexity]=useState('standard'),[threads,setThreads]=useState([{count:'20/3',use:'Top'},{count:'20/2',use:'Bobbin'}]),[waste,setWaste]=useState(10),[qty,setQty]=useState(1000),[show,setShow]=useState(false)
 async function upload(e){
  const f=e.target.files?.[0];if(!f)return
  setFile(null);setMeasure({});setShow(false);setStatus('Reading file locally…')
  try{
   if(f.size>8*1024*1024)throw Error('Maximum file size is 8 MB.')
   let lines=[]
   if(/\.pdf$/i.test(f.name))lines=await readPdf(f)
   else if(/\.xlsx?$/i.test(f.name)){
    const wb=XLSX.read(await f.arrayBuffer(),{type:'array'})
    for(const name of wb.SheetNames.slice(0,5)){const rows=XLSX.utils.sheet_to_json(wb.Sheets[name],{header:1,defval:''});lines.push(...rows.slice(0,300))}
   }else throw Error('Choose an Excel or PDF file.')
   const result=extractMeasurements(lines)
   setMeasure(result);setFile(f.name);setStatus(Object.keys(result).length?Object.keys(result).length+' measurements found. Please check the values and units (cm).':'No measurements confidently identified. Enter them below. Scanned PDFs are not supported.')
  }catch(err){setStatus('Could not read file: '+err.message+'. You can enter measurements manually.')}
  e.target.value=''
 }
 const rules=RULES[type],present=Object.entries(rules).filter(([k])=>k!=='extra'&&number(measure[k])>0)
 // Seam length in cm; a transparent, intentionally approximate garment construction model.
 const seamCm=present.reduce((s,[k,f])=>s+number(measure[k])*f,0)
 const coverage=present.length/Object.keys(rules).filter(k=>k!=='extra').length
 const baseline=seamCm+(present.length?rules.extra*100:0)
 const complexityFactor={basic:.85,standard:1,detailed:1.2}[complexity]
 const totalMetres=(baseline/100)*3.15*complexityFactor*(1+number(waste)/100)
 const overlock=threads.find(t=>t.use==='Overlock')
 const overlockShare=overlock?.count?.trim()?.22:0
 const topShare=overlockShare? .49:.62
 const bottomShare=1-overlockShare-topShare
 const portions=threads.map(t=>({ ...t,metres:totalMetres*(t.use==='Overlock'?overlockShare:t.use==='Top'?topShare:bottomShare)}))
 const canCalculate=present.length>=2&&threads.length>=2&&threads.every(t=>t.count.trim())&&new Set(threads.map(t=>t.use)).size===threads.length
 return <div style={{fontSize:13,color:'#344054'}}>
  <p style={{fontSize:12,color:'#667085',margin:'0 0 14px'}}>A quick costing estimate, not a technical thread audit. No files are sent to or saved in the database.</p>
  <label>Measurement sheet (Excel or text-based PDF)</label>
  <input type="file" accept=".xlsx,.xls,.pdf" onChange={upload} style={{display:'block',margin:'6px 0 8px',maxWidth:'100%'}}/>
  {file&&<div style={{fontSize:11,color:'#047857'}}>Loaded: {file}</div>}
  {status&&<p style={{fontSize:11,color:'#667085',margin:'4px 0 10px'}}>{status}</p>}
  <label>Garment sketch (optional JPG)</label>
  <input type="file" accept=".jpg,.jpeg" onChange={e=>{const f=e.target.files?.[0];if(f&&f.size<=5*1024*1024){if(sketch)URL.revokeObjectURL(sketch);setSketch(URL.createObjectURL(f))}else if(f)setStatus('Sketch must be under 5 MB.');e.target.value=''}} style={{display:'block',margin:'6px 0 12px',maxWidth:'100%'}}/>
  {sketch&&<div style={{display:'flex',alignItems:'start',gap:8,marginBottom:12}}><img src={sketch} alt="Uploaded garment sketch" style={{maxHeight:140,maxWidth:160,objectFit:'contain',border:'1px solid #ddd',borderRadius:6}}/><button className="btn btn-secondary btn-sm" onClick={()=>{URL.revokeObjectURL(sketch);setSketch(null)}}>Remove sketch</button></div>}
  <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:10,marginBottom:12}}>
   <div><label>Garment type</label><select className="select" value={type} onChange={e=>{setType(e.target.value);setShow(false)}}>{TYPES.map(t=><option key={t}>{t}</option>)}</select></div>
   <div><label>Stitching detail</label><select className="select" value={complexity} onChange={e=>{setComplexity(e.target.value);setShow(false)}}><option value="basic">Basic</option><option value="standard">Standard</option><option value="detailed">Detailed</option></select></div>
  </div>
  <div style={{fontWeight:650,marginBottom:6}}>Measurements (cm) <span style={{fontSize:11,fontWeight:400,color:'#667085'}}>— review or fill missing values</span></div>
  <div style={{display:'grid',gridTemplateColumns:'repeat(2,minmax(0,1fr))',gap:8,marginBottom:14}}>
   {Object.keys(rules).filter(k=>k!=='extra').map(k=><div key={k}><label style={{textTransform:'capitalize'}}>{k}</label><input className="input" type="number" min="0" step=".1" placeholder="cm" value={measure[k]??''} onChange={e=>{setMeasure(m=>({...m,[k]:e.target.value}));setShow(false)}}/></div>)}
  </div>
  <div style={{fontWeight:650,marginBottom:8}}>Thread counts <span style={{fontWeight:400,color:'#667085'}}>(2–3)</span></div>
  {threads.map((t,i)=><div key={i} style={{display:'grid',gridTemplateColumns:'1fr 1fr auto',gap:8,marginBottom:8,alignItems:'end'}}>
   <div><label>Thread {i+1}</label><input className="input" value={t.count} placeholder="e.g. 20/3" onChange={e=>{setThreads(a=>a.map((v,j)=>j===i?{...v,count:e.target.value}:v));setShow(false)}}/></div>
   <div><label>Used for</label><select className="select" value={t.use} onChange={e=>{setThreads(a=>a.map((v,j)=>j===i?{...v,use:e.target.value}:v));setShow(false)}}>{['Top','Bobbin','Overlock'].map(x=><option key={x} disabled={threads.some((v,j)=>j!==i&&v.use===x)}>{x}</option>)}</select></div>
   <button className="btn btn-secondary btn-sm" disabled={threads.length<=2} onClick={()=>{setThreads(a=>a.filter((_,j)=>j!==i));setShow(false)}}>×</button>
  </div>)}
  {threads.length<3&&<button className="btn btn-secondary btn-sm" onClick={()=>{setThreads(a=>[...a,{count:'50/3',use:['Top','Bobbin','Overlock'].find(x=>!a.some(t=>t.use===x))}]);setShow(false)}}>+ Add third count</button>}
  <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:10,margin:'14px 0'}}>
   <div><label>Wastage %</label><input className="input" type="number" min="0" max="50" value={waste} onChange={e=>{setWaste(e.target.value);setShow(false)}}/></div>
   <div><label>Order quantity (pcs)</label><input className="input" type="number" min="1" value={qty} onChange={e=>setQty(e.target.value)}/></div>
  </div>
  <button className="btn btn-primary" disabled={!canCalculate} onClick={()=>setShow(true)}>Calculate estimate</button>
  {!canCalculate&&<p style={{fontSize:11,color:'#9a6700'}}>Enter at least two garment measurements and two different thread uses to calculate.</p>}
  {show&&canCalculate&&<div style={{marginTop:16,padding:14,background:'#f7f8fa',borderRadius:9}}>
   <div style={{fontSize:11,color:'#667085'}}>Approximate thread per garment</div>
   <div style={{fontSize:25,fontWeight:750}}>{totalMetres.toFixed(1)} m / pc</div>
   <table style={{width:'100%',fontSize:12,marginTop:10,borderCollapse:'collapse'}}><thead><tr><th align="left">Count</th><th align="left">Use</th><th align="right">m / pc</th><th align="right">m / order</th></tr></thead><tbody>{portions.map((t,i)=><tr key={i}><td>{t.count}</td><td>{t.use}</td><td align="right">{t.metres.toFixed(1)}</td><td align="right">{Math.round(t.metres*number(qty)).toLocaleString()}</td></tr>)}</tbody></table>
   <p style={{fontSize:11,color:'#667085',marginBottom:0}}>Rough estimate using {present.length} measurements, {complexity} construction and {waste}% wastage. Thread allocation is assumed, not derived from thread count. Validate with factory consumption before ordering. {coverage<.65?'Several measurements are missing; confidence is low.':''}</p>
  </div>}
 </div>
}
