import React,{useState,useEffect} from 'react'
import * as XLSX from 'xlsx'
import {buildThreadOperations,estimateThread} from './threadConsumptionReference'

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
 outseam:['outseam','outside leg','side length','side seam','o leg len','o leg length','outer leg length'],
 rise:['front rise','front crotch','rise'],
 waist:['waist relaxed','waist','waist width','waist circumference'],
 hip:['hip','seat'],
 hem:['leg opening','bottom opening','hem opening','hem width'],
 length:['body length','garment length','center back length','total length','length'],
 chest:['chest','half chest','bust'],
 sleeve:['sleeve length','sleeve'],
 shoulder:['shoulder width','across shoulder']
}
// Parse decimal, simple fraction and mixed fraction measurements (e.g. 23 3/4).
function measurementNumber(raw){
 const m=String(raw??'').trim().replace(/[″”]/g,'"').match(/^(\d+(?:\.\d+)?)(?:\s+(\d+)\s*\/\s*(\d+)|\s*\/\s*(\d+))?\s*(cm|inch|inches|in|")?$/i)
 if(!m)return null
 const value=Number(m[1])+(m[2]?Number(m[2])/Number(m[3]):m[4]?0:0)
 const actual=m[4]?Number(m[1])/Number(m[4]):value
 return actual>0&&actual<300?{value:actual,inch:/^(in|inch|inches|")$/i.test(m[5]||'')}:null
}
const clean=s=>String(s||'').toLowerCase().replace(/[^a-z0-9 ]/g,' ').replace(/\s+/g,' ').trim()
function identifySize(value){
 const raw=String(value??'').trim()
 if(!raw||raw.length>22)return null
 const v=raw.replace(/\s+/g,' ').trim()
 if(/^(?:size|sz)\s*[:#-]?\s*/i.test(v))return v.replace(/^(?:size|sz)\s*[:#-]?\s*/i,'').trim()||null
 if(/^(?:\d{1,2}\s*\/\s*\d{1,2}|\d{1,2}\s*[-–]\s*\d{1,2})(?:\s*(?:yrs?|years?|months?|mos?))?$/i.test(v))return v
 if(/^(?:XXS|XS|S|M|L|XL|XXL|XXXL|2XL|3XL|4XL|5XL)$/i.test(v))return v
 if(/^(?:\d{1,2})\s*(?:yrs?|years?|months?|mos?)$/i.test(v))return v
 if(/^(?:\d{1,2}|\d{1,2}T)$/i.test(v))return v
 return null
}
function extractMeasurements(lines){
 // Keep original column positions. Never mix sizes or silently choose the first column.
 const rows=lines.map(row=>row.map(v=>String(v??'').trim()))
 const candidates=[]
 for(let i=0;i<rows.length;i++){
  const row=rows[i]
  const matched=row.map((v,j)=>({label:identifySize(v),j})).filter(x=>x.label)
  if(matched.length<2||matched.length>24)continue
  // Size headers are column labels above a measurement table, not a long row of values.
  // Require nearby textual size context or measurement labels beneath these columns.
  const nearby=rows.slice(Math.max(0,i-3),i+1).flat().map(clean).join(' ')
  const context=/\b(size|sizes|measurement|specification|spec sheet|sample description)\b/.test(nearby)
  const below=rows.slice(i+1,i+35)
  const measured=below.filter(r=>r.some(v=>Object.values(ALIASES).flat().some(a=>{const t=clean(v);return t===a||t.startsWith(a+' ')}))).length
  const numericOnly=matched.every(x=>/^\d{1,2}$/.test(x.label))
  const explicitSizes=matched.filter(x=>/yrs?|years?|months?|mos?|T$|\/|[-–]/i.test(x.label)).length
  const contiguous=matched.every((x,k)=>k===0||x.j===matched[k-1].j+1)
  // Bare numeric runs without a clear header label are unsafe: they are often measurements.
  if(numericOnly&&!context)continue
  if(!numericOnly&&explicitSizes<2&&!context)continue
  if(measured<2||!contiguous)continue
  candidates.push({row:i,matched,score:measured*3+(context?10:0)+(numericOnly?-8:5)+explicitSizes*8})
 }
 const header=candidates.sort((a,b)=>b.score-a.score)[0]
 const sizes=header?header.matched.map(x=>({label:x.label,column:x.j})):[]
 const values={}
 for(const size of sizes)values[size.label]={}
 const fallback={}
 for(let i=0;i<rows.length;i++){
  const row=rows[i]
  for(let j=0;j<row.length;j++){
   const key=clean(row[j])
   const field=Object.keys(ALIASES).find(k=>ALIASES[k].some(a=>key===a||key.startsWith(a+' ')||key.endsWith(' '+a)))
   if(!field)continue
   const parse=(raw)=>{
    const parsed=measurementNumber(raw)
    if(!parsed)return null
    // Measurement unit is set from sheet metadata or user confirmation.
    return Number(parsed.value.toFixed(3))
   }
   if(header){
    for(const size of sizes){
     const v=parse(row[size.column])
     if(v!==null&&values[size.label][field]===undefined)values[size.label][field]=v
    }
   }else{
    const v=row.slice(j+1,j+5).map(parse).find(x=>x!==null&&x!==undefined)
    if(v!==undefined&&fallback[field]===undefined)fallback[field]=v
   }
  }
 }
 return {sizes:sizes.map(x=>x.label),values, fallback:header?{}:fallback}
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
 const [fabricWeight,setFabricWeight]=useState('medium'),[stitchDensity,setStitchDensity]=useState(9),[factoryAllowance,setFactoryAllowance]=useState(0),[overlockCount,setOverlockCount]=useState(''),[inputUnit,setInputUnit]=useState('cm'),[averageSizes,setAverageSizes]=useState(false),[details,setDetails]=useState({topstitch:false,waistband:'regular',waistMeasure:'flat',hipMeasure:'flat',hemMeasure:'flat',frontPockets:2,backPockets:2,extraPockets:0,beltLoops:5,hammerLoops:0,waistbandRows:1,topstitchLines:1}),[sizeData,setSizeData]=useState(null),[selectedSize,setSelectedSize]=useState(''),[unit,setUnit]=useState('m'),[sketchError,setSketchError]=useState(''),[file,setFile]=useState(null),[sketch,setSketch]=useState(null),[measure,setMeasure]=useState({}),[status,setStatus]=useState(''),[type,setType]=useState('Jeans'),[complexity,setComplexity]=useState('standard'),[threads,setThreads]=useState([{count:'20/3',use:'Top'},{count:'20/2',use:'Bobbin'}]),[waste,setWaste]=useState(10),[qty,setQty]=useState(1000),[show,setShow]=useState(false)
 async function upload(e){
  const f=e.target.files?.[0];if(!f)return
  setFile(null);setMeasure({});setSizeData(null);setSelectedSize('');setAverageSizes(false);setShow(false);setStatus('Reading file locally…')
  try{
   if(f.size>8*1024*1024)throw Error('Maximum file size is 8 MB.')
   let lines=[]
   if(/\.pdf$/i.test(f.name))lines=await readPdf(f)
   else if(/\.xlsx?$/i.test(f.name)){
    const wb=XLSX.read(await f.arrayBuffer(),{type:'array'})
    for(const name of wb.SheetNames.slice(0,5)){const rows=XLSX.utils.sheet_to_json(wb.Sheets[name],{header:1,defval:''});lines.push(...rows.slice(0,300));lines.push([])}
   }else throw Error('Choose an Excel or PDF file.')
   const result=extractMeasurements(lines)
   setSizeData(result);setFile(f.name);if(result.sizes.length){setStatus(result.sizes.length+' sizes detected. Select the size to calculate; no size has been chosen automatically.')}else{setMeasure(result.fallback);setStatus(Object.keys(result.fallback).length?Object.keys(result.fallback).length+' measurements found, but size headings were not identified. Verify these values manually.':'No measurements confidently identified. Enter them below. Scanned PDFs are not supported.')}
  }catch(err){setStatus('Could not read file: '+err.message+'. You can enter measurements manually.')}
  e.target.value=''
 }
 useEffect(()=>()=>{if(sketch)URL.revokeObjectURL(sketch)},[sketch])
 const rules=RULES[type],present=Object.entries(rules).filter(([k])=>k!=='extra'&&number(measure[k])>0)
 const coverage=present.length/Object.keys(rules).filter(k=>k!=='extra').length
 const inchesPerUnit=inputUnit==='in'?1:1/2.54
 const dimensions=Object.fromEntries(Object.entries(measure).map(([k,v])=>[k,number(v)*inchesPerUnit]))
 const baseOperations=buildThreadOperations({type,dimensions,details})
 const complexityFactor={basic:.85,standard:1,detailed:1.2}[complexity]
 const operations=estimateThread(baseOperations.map(op=>({...op,length:op.length*complexityFactor})),waste,stitchDensity,fabricWeight)
 const operationSets=averageSizes&&sizeData?.sizes?.length
  ?Object.values(sizeData.values).filter(v=>Object.keys(v).length>=2).map(v=>{
    const dims=Object.fromEntries(Object.entries(v).map(([k,n])=>[k,number(n)*inchesPerUnit]))
    return estimateThread(buildThreadOperations({type,dimensions:dims,details}).map(op=>({...op,length:op.length*complexityFactor})),waste,stitchDensity,fabricWeight)
   }):[]
 const calculationSets=operationSets.length?operationSets:[operations]
 const seamMetres=calculationSets.reduce((sum,ops)=>sum+ops.reduce((n,op)=>n+op.needleYd+op.looperYd,0),0)*.9144/calculationSets.length
 const totalMetres=seamMetres+number(factoryAllowance)
 const assignedUses=new Set(threads.map(t=>t.use))
 const overlockThread=threads.find(t=>t.count===overlockCount)||threads.find(t=>t.use==='Overlock')||threads.find(t=>t.use==='Bobbin')||threads[0]
 const useFor=(op,side)=>{
  if(op.channel==='overlock')return overlockThread.use
  if(side==='needle')return assignedUses.has('Top')?'Top':'Bobbin'
  return assignedUses.has('Bobbin')?'Bobbin':assignedUses.has('Overlock')?'Overlock':'Top'
 }
 const portions=threads.map(t=>({...t,metres:calculationSets.reduce((sum,ops)=>sum+ops.reduce((n,op)=>n+((useFor(op,'needle')===t.use?op.needleYd:0)+(useFor(op,'looper')===t.use?op.looperYd:0)),0),0)*.9144/calculationSets.length+(t===threads[0]?number(factoryAllowance):0)}))
 const estimateQuality=coverage>=.75?'More measurements supplied':coverage>=.45?'Several dimensions assumed':'Many dimensions assumed'
 const canCalculate=present.length>=2&&threads.length>=2&&threads.every(t=>t.count.trim())&&new Set(threads.map(t=>t.use)).size===threads.length
 return <div className="thread-smart-layout" style={{fontSize:12,color:'#344054',display:'grid',gridTemplateColumns:'minmax(0,1.4fr) minmax(330px,1fr)',gap:12,height:'auto',minHeight:0,alignItems:'start'}}><style>{`@media(max-width:800px){.thread-smart-layout{grid-template-columns:1fr!important;overflow-y:auto}.thread-smart-inputs,.thread-smart-results{overflow:visible!important;max-height:none!important}} .thread-smart-inputs .input,.thread-smart-inputs .select{min-height:30px!important;height:32px!important;padding:4px 8px!important;font-size:12px!important}.thread-smart-inputs label{font-size:11px!important;margin-bottom:2px!important;display:block}.thread-smart-inputs input[type=file]{font-size:11px}.thread-smart-inputs strong{font-size:12px}`}</style><div className="thread-smart-inputs" style={{overflowY:'visible',minHeight:0,padding:'2px 10px 10px 2px'}}>

  <label>Measurement sheet (Excel or text-based PDF)</label>
  <input type="file" accept=".xlsx,.xls,.pdf" onChange={upload} style={{display:'block',margin:'6px 0 8px',maxWidth:'100%'}}/>
  {file&&<div style={{fontSize:11,color:'#047857'}}>Loaded: {file}</div>}
  {status&&<p style={{fontSize:11,color:'#667085',margin:'4px 0 10px'}}>{status}</p>}
  {sizeData?.sizes?.length>0&&<div style={{margin:'12px 0'}}><label>Select measurement size</label><select className="select" value={selectedSize} onChange={e=>{const v=e.target.value;setSelectedSize(v);setAverageSizes(false);setMeasure(v?{...sizeData.values[v]}:{});setShow(false)}}><option value="">Choose a size…</option>{sizeData.sizes.map(v=><option key={v} value={v}>{v}</option>)}</select>{selectedSize&&<div style={{fontSize:11,color:'#667085',marginTop:5}}>{Object.keys(sizeData.values[selectedSize]||{}).length} measurements read for size {selectedSize}. Check the values below.</div>}</div>}
  {sizeData?.sizes?.length>1&&<label style={{display:'flex',gap:7,alignItems:'center',margin:'8px 0 12px'}}><input type="checkbox" checked={averageSizes} onChange={e=>{const yes=e.target.checked;setAverageSizes(yes);if(yes){const rows=Object.values(sizeData.values).filter(x=>Object.keys(x).length);const fields=Object.keys(ALIASES);const avg={};fields.forEach(k=>{const nums=rows.map(x=>x[k]).filter(x=>Number(x)>0);if(nums.length)avg[k]=Number((nums.reduce((a,b)=>a+b,0)/nums.length).toFixed(2))});setMeasure(avg);setSelectedSize('')}else setMeasure(selectedSize?{...sizeData.values[selectedSize]}:{});setShow(false)}}/>Use simple average across available sizes</label>}
  <label>Garment sketch (optional JPG, PNG or WebP)</label>
  <input type="file" accept=".jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp" onChange={e=>{const f=e.target.files?.[0];if(!f)return;setSketchError('');if(!/\.(jpg|jpeg|png|webp)$/i.test(f.name)&&!['image/jpeg','image/png','image/webp'].includes(f.type)){setSketchError('Please choose JPG, PNG or WebP.')}else if(f.size>10*1024*1024){setSketchError('Image exceeds 10 MB. Please use a smaller image.')}else{setSketch(URL.createObjectURL(f))}e.target.value=''}} style={{display:'block',margin:'6px 0 12px',maxWidth:'100%'}}/>
  {sketchError&&<p style={{fontSize:11,color:'#b42318'}}>{sketchError}</p>}
  {sketch&&<div style={{display:'flex',alignItems:'start',gap:8,marginBottom:12}}><img src={sketch} alt="Uploaded garment sketch" style={{maxHeight:140,maxWidth:160,objectFit:'contain',border:'1px solid #ddd',borderRadius:6}}/><button className="btn btn-secondary btn-sm" onClick={()=>{URL.revokeObjectURL(sketch);setSketch(null)}}>Remove sketch</button></div>}
  <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:10,marginBottom:12}}>
   <div><label>Garment type</label><select className="select" value={type} onChange={e=>{setType(e.target.value);setShow(false)}}>{TYPES.map(t=><option key={t}>{t}</option>)}</select></div>
   <div><label>Stitching detail</label><select className="select" value={complexity} onChange={e=>{setComplexity(e.target.value);setShow(false)}}><option value="basic">Basic</option><option value="standard">Standard</option><option value="detailed">Detailed</option></select></div>
  </div>
  <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',gap:8,marginBottom:6}}><strong>Measurements</strong><select aria-label="Measurement unit" className="select" style={{width:130}} value={inputUnit} onChange={e=>{setInputUnit(e.target.value);setShow(false)}}><option value="cm">Centimetres</option><option value="in">Inches</option></select></div><div style={{fontSize:11,color:'#667085',marginBottom:8}}>Confirm the unit used in your spec sheet. <span style={{fontSize:11,fontWeight:400,color:'#667085'}}>— review or fill missing values</span></div>
  <div style={{display:'grid',gridTemplateColumns:'repeat(3,minmax(0,1fr))',gap:6,marginBottom:9}}>
   {Object.keys(rules).filter(k=>k!=='extra').map(k=><div key={k}><label style={{textTransform:'capitalize'}}>{k}</label><input className="input" type="number" min="0" step=".1" placeholder="cm" value={measure[k]??''} onChange={e=>{setMeasure(m=>({...m,[k]:e.target.value}));setShow(false)}}/></div>)}
  </div>
  <div style={{fontWeight:650,marginBottom:5}}>Construction</div>
  <div style={{display:'grid',gridTemplateColumns:'repeat(3,minmax(0,1fr))',gap:6,marginBottom:8}}>
   <div><label>Waistband</label><select className="select" value={details.waistband} onChange={e=>{const v=e.target.value;setDetails(d=>({...d,waistband:v,waistbandRows:v==='elastic'?3:1,beltLoops:v==='elastic'?0:5}));setShow(false)}}><option value="regular">Regular</option><option value="elastic">Elasticated</option></select></div>
   <div><label>Topstitch lines</label><select className="select" value={details.topstitchLines} onChange={e=>{setDetails(d=>({...d,topstitchLines:Number(e.target.value)}));setShow(false)}}><option value="1">Single</option><option value="2">Double</option></select></div>
   {['frontPockets','backPockets','extraPockets','beltLoops','hammerLoops','waistbandRows'].map(k=><div key={k}><label style={{textTransform:'capitalize'}}>{({frontPockets:'Front pockets',backPockets:'Back pockets',extraPockets:'Extra / cargo pockets',beltLoops:'Belt loops',hammerLoops:'Hammer loops',waistbandRows:'Waistband stitch rows'})[k]}</label><input className="input" type="number" min="0" max="30" step="1" value={details[k]} onChange={e=>{setDetails(d=>({...d,[k]:Math.max(0,Math.min(30,Number(e.target.value)||0))}));setShow(false)}}/></div>)}
  </div>
  <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:8,marginBottom:8}}><div><label>Fabric weight</label><select className="select" value={fabricWeight} onChange={e=>{setFabricWeight(e.target.value);setShow(false)}}><option value="light">Light · 1.2 mm reference</option><option value="medium">Medium · 1.9 mm reference</option><option value="heavy">Heavy · 2.9 mm reference</option></select></div><div style={{fontSize:10,color:'#667085',alignSelf:'end',paddingBottom:4}}>Approximate seam thickness, not fabric GSM.</div></div>
  <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:8,marginBottom:8}}><div><label>Stitch density reference</label><select className="select" value={stitchDensity} onChange={e=>{setStitchDensity(Number(e.target.value));setShow(false)}}><option value={9}>Denim estimate · 8–10 SPI</option><option value={18}>Coats reference · 18 SPI</option></select></div><div style={{fontSize:10,color:'#667085',alignSelf:'end',paddingBottom:4}}>Select 18 SPI only if the garment uses fine, dense stitching.</div></div>
  <details style={{marginBottom:14}}><summary style={{cursor:'pointer',fontSize:12}}>Measurement interpretation (advanced)</summary><p style={{fontSize:11,color:'#667085'}}>Most garment spec sheets give flat widths. Select circumference only when the sheet explicitly gives the full measurement.</p><div style={{display:'grid',gridTemplateColumns:'repeat(3,minmax(0,1fr))',gap:7}}>{[['waistMeasure','Waist'],['hipMeasure','Hip'],['hemMeasure','Leg opening']].map(([key,label])=><div key={key}><label>{label}</label><select className="select" value={details[key]} onChange={e=>{setDetails(d=>({...d,[key]:e.target.value}));setShow(false)}}><option value="flat">Flat width</option><option value="circumference">Circumference</option></select></div>)}</div></details>
  <div style={{fontWeight:650,marginBottom:5}}>Thread counts (2–3)</div>
  {threads.map((t,i)=><div key={i} style={{display:'grid',gridTemplateColumns:'1fr 1fr auto',gap:8,marginBottom:8,alignItems:'end'}}>
   <div><label>Thread {i+1}</label><input className="input" value={t.count} placeholder="e.g. 20/3" onChange={e=>{setThreads(a=>a.map((v,j)=>j===i?{...v,count:e.target.value}:v));setShow(false)}}/></div>
   <div><label>Used for</label><select className="select" value={t.use} onChange={e=>{setThreads(a=>a.map((v,j)=>j===i?{...v,use:e.target.value}:v));setShow(false)}}>{['Top','Bobbin','Overlock'].map(x=><option key={x} disabled={threads.some((v,j)=>j!==i&&v.use===x)}>{x}</option>)}</select></div>
   <button className="btn btn-secondary btn-sm" disabled={threads.length<=2} onClick={()=>{setThreads(a=>a.filter((_,j)=>j!==i));setShow(false)}}>×</button>
  </div>)}
  {threads.length<3&&<button className="btn btn-secondary btn-sm" onClick={()=>{setThreads(a=>[...a,{count:'50/3',use:['Top','Bobbin','Overlock'].find(x=>!a.some(t=>t.use===x))}]);setShow(false)}}>+ Add third count</button>}
  <details style={{margin:'10px 0 14px'}}><summary style={{cursor:'pointer',fontWeight:600}}>Factory operation allowance (optional)</summary><p style={{fontSize:11,color:'#667085'}}>Bartacks, buttonholes, automation and special operations are not yet fully included. Enter their known combined thread consumption in metres per piece, or leave zero. This allowance is assigned to the first thread count.</p><label>Additional consumption (metres / pc)</label><input className="input" type="number" min="0" step=".5" value={factoryAllowance} onChange={e=>{setFactoryAllowance(e.target.value);setShow(false)}}/></details>
  <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:10,margin:'14px 0'}}>
   <div><label>Wastage %</label><input className="input" type="number" min="0" max="50" value={waste} onChange={e=>{setWaste(e.target.value);setShow(false)}}/></div>
   <div><label>Order quantity (pcs)</label><input className="input" type="number" min="1" value={qty} onChange={e=>setQty(e.target.value)}/></div>
  </div>
  <div style={{marginBottom:7}}><label>Consumption unit</label><select className="select" value={unit} onChange={e=>setUnit(e.target.value)}><option value="m">Metres</option><option value="yd">Yards</option></select></div>
  <button className="btn btn-primary" disabled={!canCalculate} onClick={()=>setShow(true)}>Calculate estimate</button>
  {!canCalculate&&<p style={{fontSize:11,color:'#9a6700'}}>Enter at least two garment measurements and two different thread uses to calculate.</p>}
  </div>
  <aside className="thread-smart-results" style={{minHeight:0,overflowY:'auto',position:'sticky',top:0,maxHeight:'calc(100dvh - 150px)',background:'#f7f8fa',border:'1px solid #e7e9ed',borderRadius:9,padding:12}}>
   <div style={{fontSize:13,fontWeight:750,marginBottom:10}}>How this was estimated</div>
   {show&&canCalculate?<div>
    <div style={{fontSize:11,color:'#667085'}}>Approximate consumption / piece</div>
    <div style={{fontSize:27,fontWeight:750,marginBottom:10}}>{(totalMetres*(unit==='yd'?1.0936133:1)).toFixed(1)} {unit}</div>
    <table style={{width:'100%',fontSize:11,borderCollapse:'collapse'}}><thead><tr><th align="left">Count</th><th align="left">Use</th><th align="right">{unit}/pc</th><th align="right">{unit}/order</th></tr></thead><tbody>{portions.map((t,i)=><tr key={i} style={{borderTop:'1px solid #e3e5e9'}}><td style={{padding:'6px 0'}}>{t.count}</td><td>{t.use}</td><td align="right">{(t.metres*(unit==='yd'?1.0936133:1)).toFixed(1)}</td><td align="right">{Math.round(t.metres*(unit==='yd'?1.0936133:1)*number(qty)).toLocaleString()}</td></tr>)}</tbody></table>
    <div style={{fontSize:11,color:'#667085',margin:'10px 0'}}>{fabricWeight[0].toUpperCase()+fabricWeight.slice(1)} fabric · {stitchDensity===18?'Coats 18 SPI':'Denim 8–10 SPI'} · Seams {seamMetres.toFixed(1)} m · Allowance {number(factoryAllowance).toFixed(1)} m</div>
    <div style={{fontSize:12,fontWeight:650,margin:'12px 0 6px'}}>Operation breakdown</div>
    <table style={{width:'100%',fontSize:10,borderCollapse:'collapse'}}><thead><tr><th align="left">Operation / stitch</th><th align="right">Needle</th><th align="right">Looper</th></tr></thead><tbody>{operations.map((op,i)=><tr key={i} style={{borderTop:'1px solid #e2e5ea'}}><td style={{padding:'6px 5px 6px 0'}}>{op.name}<div style={{color:'#98a2b3',fontSize:10}}>{op.stitchName}</div></td><td align="right">{(op.needleYd*(unit==='m'?.9144:1)).toFixed(1)}</td><td align="right">{(op.looperYd*(unit==='m'?.9144:1)).toFixed(1)}</td></tr>)}</tbody></table>
   </div>:<div style={{fontSize:12,color:'#667085',paddingTop:16}}>Enter measurements and select Calculate estimate to see the breakdown.</div>}
  </aside>

 </div>
}
