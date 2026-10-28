import React,{useMemo,useState} from 'react'
const safeNumber=x=>Number.isFinite(Number(x))?Number(x):null
const parseRows=text=>text.trim().split(/\r?\n/).map(line=>line.split(/[\t,;]/).map(s=>s.trim())).filter(r=>r.length>=7).map(r=>({
 type:r[0],content:r[1],construction:r[2],gsm:safeNumber(r[3]),min:safeNumber(r[4]),max:safeNumber(r[5]),width:safeNumber(r[6]),weave:r[7]||'',name:r[8]||''
})).filter(r=>r.gsm!==null&&r.min!==null&&r.max!==null&&r.min<=r.max&&r.type&&r.content&&r.construction)
export default function FabricConstructionFinder(){
 const [gsm,G]=useState(''),[type,T]=useState('Denim'),[content,C]=useState('100% Cotton')
 const [rows,R]=useState(''),[showEditor,E]=useState(false)
 const parsed=useMemo(()=>parseRows(rows),[rows])
 const matches=useMemo(()=>parsed.filter(r=>r.type.toLowerCase()===type.toLowerCase()&&r.content.toLowerCase()===content.toLowerCase()).map(r=>({...r,distance:Number(gsm)<r.min?r.min-Number(gsm):Number(gsm)>r.max?Number(gsm)-r.max:0})).sort((a,b)=>a.distance-b.distance).slice(0,5),[parsed,type,content,gsm])
 const label=(title,child)=><label style={{display:'grid',gap:4,fontSize:12}}>{title}{child}</label>
 return <div style={{display:'grid',gap:12}}>
 <div style={{fontSize:12,color:'#667085'}}>Find the closest documented yarn construction from your own mill reference chart. No estimated construction codes are invented.</div>
 <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:10}}>
 {label('Required finished GSM',<input className="input" type="number" min="1" value={gsm} onChange={e=>G(e.target.value)}/>)}
 {label('Fabric type',<select className="select" value={type} onChange={e=>T(e.target.value)}>{['Denim','Twill','Poplin','Canvas','Sateen','Chambray','Corduroy','Other'].map(x=><option key={x}>{x}</option>)}</select>)}
 {label('Fabric content',<input className="input" value={content} onChange={e=>C(e.target.value)} placeholder="100% Cotton"/>)}
 </div>
 <button className="btn btn-secondary btn-sm" onClick={()=>E(!showEditor)}>{showEditor?'Hide':'Add / edit'} verified mill reference chart ({parsed.length} rows)</button>
 {showEditor&&<div style={{display:'grid',gap:6}}><div style={{fontSize:11,color:'#667085'}}>Paste rows in this order: Type, Content, Construction, Reference GSM, Minimum GSM, Maximum GSM, Width cm, Weave, Commercial Name. One fabric per line; tab-separated or comma-separated. Save is browser-session only.</div><textarea className="input" rows={7} value={rows} onChange={e=>R(e.target.value)} placeholder={'Denim,100% Cotton,7s x 7s / 68 x 42,400,385,415,150,3/1 Twill,Heavy Denim'}/></div>}
 {Number(gsm)>0&&(matches.length?<div style={{display:'grid',gap:9}}>{matches.map((r,i)=><div key={i} style={{padding:11,border:'1px solid #e5e7eb',borderRadius:8,fontSize:12}}><strong>{r.construction}</strong> · {r.name||r.weave}<div>Reference GSM {r.gsm} · documented range {r.min}–{r.max} · width {r.width||'not specified'} cm</div><div style={{color:r.distance===0?'#047857':'#b45309'}}>{r.distance===0?'Within reference range':r.distance+' GSM outside reference range'}</div></div>)}</div>:<div style={{padding:12,background:'#f8fafc',borderRadius:8,fontSize:12}}>No verified matching construction available. Add a mill reference chart to enable ranking.</div>)}
 <div style={{fontSize:11,color:'#b45309'}}>GSM and widths may refer to greige rather than finished fabric. Verify finishing, shrinkage, yarn count, EPI/PPI and physical swatch with the mill before committing.</div>
 </div>
}
