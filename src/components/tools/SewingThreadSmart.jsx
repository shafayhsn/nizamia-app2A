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
 const [fabricWeight,setFabricWeight]=useState('medium'),[stitchDensity,setStitchDensity]=useState(9),[factoryAllowance,setFactoryAllowance]=useState(0),[overlockCount,setOverlockCount]=useState(''),[inputUnit,setInputUnit]=useState('cm'),[averageSizes,setAverageSizes]=useState(false),[details,setDetails]=useState({topstitch:false,waistband:'regular',waistMeasure:'flat',hipMeasure:'flat',hemMeasure:'flat',frontPockets:2,backPockets:2,extraPockets:0,beltLoops:5,hammerLoops:0,waistbandRows:1,topstitchLines:1}),[sizeData,setSizeData]=useState(null),[selectedSize,setSelectedSize]=useState(''),[unit,setUnit]=useState('m'),[sketchError,setSketchError]=useState(''),[file,setFile]=useState(null),[sketch,setSketch]=useState(null),[measure,setMeasure]=useState({}),[status,setStatus]=useState(''),[type,setType]=useState('Jeans'),[complexity,setComplexity]=useState('standard'),[threads,setThreads]=useState([{count:'20/3',use:'Top',coneUnit:'yd',coneLength:1500},{count:'20/2',use:'Bobbin',coneUnit:'yd',coneLength:1500}]),[waste,setWaste]=useState(10),[qty,setQty]=useState(1000),[show,setShow]=useState(false)
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
 const overlockThread=threads.find(t=>t.use==='Overlock')||threads.find(t=>t.use==='Bobbin')||threads[0]
 const useFor=(op,side)=>{
  if(op.channel==='overlock')return overlockThread.use
  if(side==='needle')return assignedUses.has('Top')?'Top':'Bobbin'
  return assignedUses.has('Bobbin')?'Bobbin':assignedUses.has('Overlock')?'Overlock':'Top'
 }
 // Purpose allocation is a purchasing approximation; machine-specific threading may differ.
 const portions=threads.map(t=>({...t,metres:calculationSets.reduce((sum,ops)=>sum+ops.reduce((n,op)=>n+((useFor(op,'needle')===t.use?op.needleYd:0)+(useFor(op,'looper')===t.use?op.looperYd:0)),0),0)*.9144/calculationSets.length+(t===threads[0]?number(factoryAllowance):0)}))
 const convert=(metres,to)=>metres*(to==='yd'?1.093613298:1)
 const summary=portions.map(t=>{const lengthMetres=number(t.coneLength)*(t.coneUnit==='yd'?.9144:1);const orderMetres=t.metres*number(qty);return {...t,perPiece:convert(t.metres,unit),order:convert(orderMetres,unit),cones:lengthMetres>0?Math.ceil(orderMetres/lengthMetres):null}})
 const displayOperations=(calculationSets.length>1?operations.map((op,i)=>({...op,length:calculationSets.reduce((n,ops)=>n+(ops[i]?.length||0),0)/calculationSets.length,needleYd:calculationSets.reduce((n,ops)=>n+(ops[i]?.needleYd||0),0)/calculationSets.length,looperYd:calculationSets.reduce((n,ops)=>n+(ops[i]?.looperYd||0),0)/calculationSets.length})):operations)
 function exportReport(){
  if(!show||!canCalculate)return
  const wb=XLSX.utils.book_new()
  const rows=[['Sewing Thread Consumption Report'],['Garment',type],['Size',averageSizes?'Average across sizes':selectedSize||'Manual'],['Fabric weight',fabricWeight],['Stitch density (SPI)',stitchDensity],['Measurement unit',inputUnit],['Order quantity',number(qty)],['Wastage %',number(waste)],['Consumption unit',unit],[],['Thread count','Purpose','Consumption / pc ('+unit+')','Required for order ('+unit+')','Cone unit','Length per cone','Cones required'],...summary.map(t=>[t.count,t.use,Number(t.perPiece.toFixed(2)),Number(t.order.toFixed(2)),t.coneUnit,number(t.coneLength),t.cones??'—']),['TOTAL','',Number(convert(totalMetres,unit).toFixed(2)),Number(convert(totalMetres*number(qty),unit).toFixed(2))],[],['Operation','Stitch class','Total stitched length (inches)','Needle ('+unit+')','Looper ('+unit+')'],...displayOperations.map(op=>[op.name,op.stitchName,Number((op.length*op.qty).toFixed(2)),Number(convert(op.needleYd*.9144,unit).toFixed(2)),Number(convert(op.looperYd*.9144,unit).toFixed(2))])]
  const ws=XLSX.utils.aoa_to_sheet(rows);ws['!cols']=[{wch:29},{wch:26},{wch:23},{wch:25},{wch:16},{wch:20},{wch:17}];XLSX.utils.book_append_sheet(wb,ws,'Thread Report');XLSX.writeFile(wb,'Sewing-Thread-Report.xlsx')
 }
 useEffect(()=>{const handler=()=>exportReport();window.addEventListener('nizamia:thread-export',handler);return()=>window.removeEventListener('nizamia:thread-export',handler)})
 const estimateQuality=coverage>=.75?'More measurements supplied':coverage>=.45?'Several dimensions assumed':'Many dimensions assumed'
 const canCalculate=present.length>=2&&threads.length>=2&&threads.every(t=>t.count.trim()&&number(t.coneLength)>0)&&new Set(threads.map(t=>t.use)).size===threads.length
 return <div className="thread-smart-layout" style={{fontSize:11,color:'#344054',display:'grid',gridTemplateColumns:'minmax(0,1.55fr) minmax(350px,1fr)',gap:12,height:'100%',minHeight:0,alignItems:'stretch'}}><style>{`
.thread-smart-inputs{min-height:0;overflow-y:auto;scrollbar-width:thin;line-height:1.1}
.thread-smart-inputs label{display:block;font-size:10px!important;margin:0 0 2px!important;font-weight:500;white-space:nowrap}
.thread-smart-inputs .input,.thread-smart-inputs .select{height:27px!important;min-height:27px!important;padding:3px 6px!important;font-size:11px!important;width:100%;box-sizing:border-box}
.thread-smart-inputs input[type=file]{font-size:10px;max-width:100%;width:100%}
.thread-smart-inputs input[type=file]::file-selector-button{font-size:10px;padding:3px 5px;margin-right:3px}
.thread-smart-inputs .smart-section{padding:6px 0 7px;border-bottom:1px solid #e5e7eb}
.thread-smart-inputs .smart-heading{font-size:11px;font-weight:750;margin:0 0 6px;color:#344054}
.thread-smart-inputs .smart-upload{display:grid;grid-template-columns:1.15fr 1.15fr 1fr .75fr;gap:7px;align-items:end}
.thread-smart-inputs .smart-seven{display:grid;grid-template-columns:minmax(82px,.75fr) minmax(0,1.15fr) minmax(0,1.15fr) minmax(0,1fr) minmax(0,.8fr) minmax(0,1fr) minmax(0,1fr);gap:6px;align-items:end;margin-bottom:7px}
.thread-smart-inputs .smart-seven>div,.thread-smart-inputs .smart-upload>div{min-width:0}.thread-smart-inputs .smart-seven label{overflow:hidden;text-overflow:ellipsis}.thread-smart-inputs details{margin-top:3px}.thread-smart-inputs details summary{padding:2px 0;color:#475467}.thread-smart-results .smart-operations td[title]{cursor:help}
.thread-smart-inputs .smart-thread{display:grid;grid-template-columns:1.2fr 1.15fr .7fr .85fr 25px;gap:5px;align-items:end;margin-bottom:4px}
.thread-smart-inputs .smart-thread>div{min-width:0}
.thread-smart-inputs .smart-final{display:grid;grid-template-columns:1.2fr .65fr 1fr .8fr auto;gap:6px;align-items:end}
.thread-smart-results .smart-operations{flex:1;overflow:hidden;min-height:0}
.thread-smart-results .smart-operations table{width:100%;table-layout:fixed;border-collapse:collapse}
.thread-smart-results .smart-operations th,.thread-smart-results .smart-operations td{font-size:9px;padding:2px 3px;line-height:1.13;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.thread-smart-results .smart-summary th,.thread-smart-results .smart-summary td{padding:4px 3px!important;white-space:nowrap;font-size:10px}
@media(max-width:1100px){.thread-smart-layout{grid-template-columns:1fr!important;overflow:auto;height:auto!important}.thread-smart-inputs,.thread-smart-results{overflow:visible!important;height:auto!important}.thread-smart-results .smart-operations{max-height:none}}
@media(max-height:780px){.thread-smart-inputs .input,.thread-smart-inputs .select{height:24px!important;min-height:24px!important}.thread-smart-inputs .smart-section{padding:3px 0 4px}.thread-smart-inputs .smart-heading{margin-bottom:3px}}
`}</style><div className="thread-smart-inputs" style={{padding:'0 8px 0 0'}}>
 <div className="smart-section"><div className="smart-heading">1 · Upload files and select size</div>
 <div className="smart-upload">
 <div><label>Upload spec (Excel / PDF)</label><input type="file" accept=".xlsx,.xls,.pdf" onChange={upload}/></div>
 <div><label>Upload sketch (JPG / PNG)</label><input type="file" accept=".jpg,.jpeg,.png,.webp" onChange={e=>{const f=e.target.files?.[0];if(!f)return;setSketchError('');if(!/\.(jpg|jpeg|png|webp)$/i.test(f.name))setSketchError('Choose JPG, PNG or WebP.');else if(f.size>10*1024*1024)setSketchError('Image exceeds 10 MB.');else setSketch(URL.createObjectURL(f));e.target.value=''}}/></div>
 <div><label>Select a size</label><select className="select" value={selectedSize} disabled={!sizeData?.sizes?.length||averageSizes} onChange={e=>{const v=e.target.value;setSelectedSize(v);setAverageSizes(false);setMeasure(v?{...sizeData.values[v]}:{});setShow(false)}}><option value="">Choose size…</option>{(sizeData?.sizes||[]).map(v=><option key={v} value={v}>{v}</option>)}</select></div>
 <div style={{alignSelf:'end',paddingBottom:6}}><label style={{display:'flex',alignItems:'center',gap:4,whiteSpace:'normal'}}><input type="checkbox" disabled={!sizeData?.sizes?.length} checked={averageSizes} onChange={e=>{const yes=e.target.checked;setAverageSizes(yes);if(yes){const rows=Object.values(sizeData.values).filter(x=>Object.keys(x).length);const avg={};Object.keys(ALIASES).forEach(k=>{const nums=rows.map(x=>x[k]).filter(x=>Number(x)>0);if(nums.length)avg[k]=Number((nums.reduce((a,b)=>a+b,0)/nums.length).toFixed(2))});setMeasure(avg);setSelectedSize('')}else setMeasure(selectedSize?{...sizeData.values[selectedSize]}:{});setShow(false)}}/>Use average size</label></div>
 </div>{file&&<div style={{fontSize:10,color:'#047857',marginTop:2}}>Loaded: {file}</div>}{status&&<div style={{fontSize:10,color:'#667085',marginTop:2}}>{status}</div>}{sketchError&&<div style={{color:'#b42318',fontSize:10}}>{sketchError}</div>}
 </div>
 <div className="smart-section"><div className="smart-heading">2 · Garment details and measurements</div>
 <div className="smart-seven">
 <div><label>Spec UoM</label><select className="select" value={inputUnit} onChange={e=>{setInputUnit(e.target.value);setShow(false)}}><option value="cm">cm</option><option value="in">inches</option></select></div>
 <div><label>Garment type</label><select className="select" value={type} onChange={e=>{setType(e.target.value);setShow(false)}}>{TYPES.map(x=><option key={x}>{x}</option>)}</select></div>
 <div><label>Stitch details</label><select className="select" value={complexity} onChange={e=>{setComplexity(e.target.value);setShow(false)}}><option value="basic">Basic</option><option value="standard">Standard</option><option value="detailed">Detailed</option></select></div>
 <div><label>Fabric weight</label><select className="select" value={fabricWeight} onChange={e=>{setFabricWeight(e.target.value);setShow(false)}}><option value="light">Light</option><option value="medium">Medium</option><option value="heavy">Heavy</option></select></div>
 <div><label>SPI</label><select className="select" value={stitchDensity} onChange={e=>{setStitchDensity(Number(e.target.value));setShow(false)}}><option value={9}>8–10</option><option value={18}>18</option></select></div>
 <div><label>Waistband</label><select className="select" value={details.waistband} onChange={e=>{const v=e.target.value;setDetails(d=>({...d,waistband:v,waistbandRows:v==='elastic'?3:1,beltLoops:v==='elastic'?0:5}));setShow(false)}}><option value="regular">Regular</option><option value="elastic">Elasticated</option></select></div>
 <div><label>Topstitch lines</label><select className="select" value={details.topstitchLines} onChange={e=>{setDetails(d=>({...d,topstitchLines:Number(e.target.value)}));setShow(false)}}><option value={1}>Single</option><option value={2}>Double</option></select></div>
 </div>
 <div className="smart-seven">
 {['waist','hip','hem'].map(k=><div key={k}><label>{k==='hem'?'Leg opening':k[0].toUpperCase()+k.slice(1)}</label><input className="input" type="number" min="0" step=".1" value={measure[k]??''} onChange={e=>{setMeasure(m=>({...m,[k]:e.target.value}));setShow(false)}}/></div>)}
 {['beltLoops','frontPockets','backPockets','extraPockets'].map(k=><div key={k}><label>{({beltLoops:'Belt loops',frontPockets:'Front pocket',backPockets:'Back pocket',extraPockets:'Cargo pockets'})[k]}</label><input className="input" type="number" min="0" max="30" value={details[k]} onChange={e=>{setDetails(d=>({...d,[k]:Math.min(30,number(e.target.value))}));setShow(false)}}/></div>)}
 </div>
 <div className="smart-seven">
 <div><label>Waistband rows</label><input className="input" type="number" min="0" value={details.waistbandRows} onChange={e=>{setDetails(d=>({...d,waistbandRows:number(e.target.value)}));setShow(false)}}/></div>
 {['inseam','outseam','rise'].map(k=><div key={k}><label>{k[0].toUpperCase()+k.slice(1)}</label><input className="input" type="number" min="0" step=".1" value={measure[k]??''} onChange={e=>{setMeasure(m=>({...m,[k]:e.target.value}));setShow(false)}}/></div>)}
 </div>
 <details><summary style={{fontSize:10,cursor:'pointer'}}>Advanced measurements / construction</summary><div style={{display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:5,paddingTop:5}}>{[['waistMeasure','Waist interpretation'],['hipMeasure','Hip interpretation'],['hemMeasure','Hem interpretation']].map(([k,label])=><div key={k}><label>{label}</label><select className="select" value={details[k]} onChange={e=>{setDetails(d=>({...d,[k]:e.target.value}));setShow(false)}}><option value="flat">Flat width</option><option value="circumference">Circumference</option></select></div>)}<div><label>Hammer loops</label><input className="input" type="number" value={details.hammerLoops} onChange={e=>{setDetails(d=>({...d,hammerLoops:number(e.target.value)}));setShow(false)}}/></div>{Object.keys(rules).filter(k=>k!=='extra'&&!['waist','hip','hem','inseam','outseam','rise'].includes(k)).map(k=><div key={k}><label>{k}</label><input className="input" type="number" value={measure[k]??''} onChange={e=>{setMeasure(m=>({...m,[k]:e.target.value}));setShow(false)}}/></div>)}</div></details>
 </div>
 <div className="smart-section"><div className="smart-heading">3 · Thread counts and purpose</div>
 {threads.map((t,i)=><div key={i} className="smart-thread"><div><label>Thread {i+1}</label><input className="input" value={t.count} onChange={e=>{setThreads(a=>a.map((v,j)=>j===i?{...v,count:e.target.value}:v));setShow(false)}}/></div><div><label>Purpose</label><select className="select" value={t.use} onChange={e=>{setThreads(a=>a.map((v,j)=>j===i?{...v,use:e.target.value}:v));setShow(false)}}>{['Top','Bobbin','Overlock'].map(x=><option key={x} disabled={threads.some((v,j)=>j!==i&&v.use===x)}>{x}</option>)}</select></div><div><label>UoM</label><select className="select" value={t.coneUnit||'yd'} onChange={e=>{setThreads(a=>a.map((v,j)=>j===i?{...v,coneUnit:e.target.value}:v));setShow(false)}}><option value="yd">Yards</option><option value="m">Metres</option></select></div><div><label>Per cone</label><input className="input" type="number" min="1" value={t.coneLength??1500} onChange={e=>{setThreads(a=>a.map((v,j)=>j===i?{...v,coneLength:e.target.value}:v));setShow(false)}}/></div><button className="btn btn-secondary btn-sm" style={{height:27,padding:'0 6px'}} disabled={threads.length<=2} onClick={()=>{setThreads(a=>a.filter((_,j)=>j!==i));setShow(false)}}>×</button></div>)}
 {threads.length<3&&<button className="btn btn-secondary btn-sm" style={{fontSize:10,padding:'3px 8px'}} onClick={()=>{setThreads(a=>[...a,{count:'50/3',use:['Top','Bobbin','Overlock'].find(x=>!a.some(t=>t.use===x)),coneUnit:'yd',coneLength:1500}]);setShow(false)}}>+ Add third count</button>}
 </div>
 <div className="smart-section"><div className="smart-heading">4 · Additional consumption and order quantity</div><div className="smart-final">
 <div><label>Additional consumption (m/pc)</label><input className="input" type="number" min="0" step=".5" value={factoryAllowance} onChange={e=>{setFactoryAllowance(e.target.value);setShow(false)}}/></div>
 <div><label>Wastage %</label><input className="input" type="number" min="0" max="50" value={waste} onChange={e=>{setWaste(e.target.value);setShow(false)}}/></div>
 <div><label>Order quantity</label><input className="input" type="number" min="1" value={qty} onChange={e=>setQty(e.target.value)}/></div>
 <div><label>UoM</label><select className="select" value={unit} onChange={e=>setUnit(e.target.value)}><option value="m">Metres</option><option value="yd">Yards</option></select></div>
 <button className="btn btn-primary btn-sm" style={{height:27,whiteSpace:'nowrap'}} disabled={!canCalculate} onClick={()=>setShow(true)}>Calculate Estimate</button>
 </div>{!canCalculate&&<div style={{fontSize:10,color:'#9a6700'}}>Enter at least two measurements and two thread uses.</div>}
 </div>
 </div>
  <aside className="thread-smart-results" style={{minHeight:0,overflow:'hidden',height:'100%',display:'flex',flexDirection:'column',boxSizing:'border-box',background:'#f7f8fa',border:'1px solid #e7e9ed',borderRadius:9,padding:9}}>
   <div style={{display:'flex',justifyContent:'space-between',alignItems:'baseline',gap:8,marginBottom:6}}><strong style={{fontSize:13}}>Estimated Consumption</strong>{show&&canCalculate&&<strong style={{fontSize:19,whiteSpace:'nowrap'}}>{convert(totalMetres,unit).toFixed(1)} {unit}/pc</strong>}</div>
   {show&&canCalculate?<div style={{display:'flex',flexDirection:'column',minHeight:0,flex:1}}>
    <table className="smart-summary" style={{width:'100%',fontSize:10,borderCollapse:'collapse',marginBottom:7}}><thead><tr><th align="left">Count</th><th align="left">Purpose</th><th align="right">{unit}/pc</th><th align="right">{unit} req.</th><th align="right">Cones</th></tr></thead><tbody>{summary.map((t,i)=><tr key={i} style={{borderTop:'1px solid #e2e5e9'}}><td>{t.count}</td><td>{t.use}</td><td align="right">{t.perPiece.toFixed(1)}</td><td align="right">{Math.round(t.order).toLocaleString()}</td><td align="right">{t.cones??'—'}</td></tr>)}<tr style={{borderTop:'1px solid #cbd5e1',fontWeight:700}}><td colSpan={2}>Total</td><td align="right">{convert(totalMetres,unit).toFixed(1)}</td><td align="right">{Math.round(convert(totalMetres*number(qty),unit)).toLocaleString()}</td><td align="right">{summary.every(t=>t.cones!==null)?summary.reduce((n,t)=>n+t.cones,0):'—'}</td></tr></tbody></table>
    <strong style={{fontSize:11,margin:'3px 0 5px'}}>How this was estimated</strong>
    <div className="smart-operations"><table><colgroup><col style={{width:'33%'}}/><col style={{width:'25%'}}/><col style={{width:'14%'}}/><col style={{width:'14%'}}/><col style={{width:'14%'}}/></colgroup><thead><tr><th align="left">Operation</th><th align="left">Stitch class</th><th align="right">Length (in)</th><th align="right">Needle</th><th align="right">Looper</th></tr></thead><tbody>{displayOperations.map((op,i)=><tr key={i} style={{borderTop:'1px solid #e2e5e9'}}><td title={op.name}>{op.name}</td><td title={op.stitchName}>{op.stitchName.replace('single needle ','1N ').replace('double needle ','2N ').replace('three-thread ','3T ').replace('four-thread ','4T ').replace('chainstitch','chain').replace('lockstitch','lock')}</td><td align="right">{(op.length*op.qty).toFixed(1)}</td><td align="right">{convert(op.needleYd*.9144,unit).toFixed(1)}</td><td align="right">{convert(op.looperYd*.9144,unit).toFixed(1)}</td></tr>)}<tr style={{borderTop:'1px solid #cbd5e1',fontWeight:700}}><td colSpan={2}>Total thread</td><td></td><td align="right">{convert(displayOperations.reduce((n,o)=>n+o.needleYd,0)*.9144,unit).toFixed(1)}</td><td align="right">{convert(displayOperations.reduce((n,o)=>n+o.looperYd,0)*.9144,unit).toFixed(1)}</td></tr></tbody></table></div>
   </div>:<div style={{fontSize:11,color:'#667085',paddingTop:12}}>Enter measurements and select Calculate estimate.</div>}
  </aside>
 </div>
}
