import React,{useMemo,useState} from 'react'
const STYLES={
 'Denim Bottom':{
 'Five-Pocket Jeans':{pieces:2.25,extras:.20,measurements:['Inseam','Back rise','Half thigh']},
 'Cargo Pants':{pieces:2.4,extras:.40,measurements:['Inseam','Back rise','Half thigh']},
 'Denim Shorts':{pieces:2.25,extras:.20,measurements:['Inseam','Back rise','Half thigh']},
 'Denim Skirt':{pieces:2,extras:.20,measurements:['Garment length','Half hip','Half hem']}},
 'Denim Top':{
 'Denim Shirt':{pieces:2.3,extras:.25,measurements:['Body length','Half chest','Sleeve length']},
 'Denim Jacket':{pieces:2.6,extras:.40,measurements:['Body length','Half chest','Sleeve length']},
 'Denim Vest':{pieces:2.1,extras:.25,measurements:['Body length','Half chest','Armhole depth']},
 'Denim Pinafore / Dress':{pieces:2.2,extras:.25,measurements:['Body length','Half chest','Skirt length']}},
 'Knits Top':{
 'T-Shirt':{pieces:2.1,extras:.08,measurements:['Body length','Half chest','Sleeve length']},
 'Long-Sleeve T-Shirt':{pieces:2.3,extras:.08,measurements:['Body length','Half chest','Sleeve length']},
 'Polo Shirt':{pieces:2.3,extras:.14,measurements:['Body length','Half chest','Sleeve length']},
 'Sweatshirt':{pieces:2.4,extras:.12,measurements:['Body length','Half chest','Sleeve length']},
 'Pullover Hoodie':{pieces:2.55,extras:.32,measurements:['Body length','Half chest','Sleeve length']},
 'Zip Hoodie':{pieces:2.65,extras:.32,measurements:['Body length','Half chest','Sleeve length']}},
 'Knits Bottom':{
 'Jogger':{pieces:2.35,extras:.16,measurements:['Outseam','Half hip','Half thigh']},
 'Knit Shorts':{pieces:2.15,extras:.13,measurements:['Outseam','Half hip','Half thigh']},
 'Straight-Leg Sweatpants':{pieces:2.35,extras:.14,measurements:['Outseam','Half hip','Half thigh']}}
}
const inp={width:'100%',boxSizing:'border-box',padding:'7px 9px',border:'1px solid #d0d5dd',borderRadius:7}
const label=(title,element)=><label style={{display:'grid',gap:4,fontSize:12,color:'#475467'}}>{title}{element}</label>
const num=(v,defaultValue=0)=>Math.max(0,Number(v)||defaultValue)
export default function FabricConsumption(){
 const [category,C]=useState('Denim Bottom')
 const [style,S]=useState('Five-Pocket Jeans')
 const [fit,F]=useState('Regular')
 const [unit,U]=useState('inches')
 const [dims,D]=useState(['32','15','12'])
 const [width,W]=useState('58')
 const [gsm,G]=useState('220')
 const [ribGsm,RG]=useState('350')
 const [ribShare,RS]=useState('5')
 const [shrinkL,SL]=useState('3'),[shrinkW,SW]=useState('2'),[waste,WA]=useState('5'),[eff,E]=useState('80')
 const [qty,Q]=useState('1000'),[ref,R]=useState('')
 const [saved,SS]=useState([])
 const config=STYLES[category][style]
 const knit=category.startsWith('Knits')
 const calc=useMemo(()=>{
  const factor=unit==='inches'?.0254:.01
  const [a,b,c]=dims.map(x=>num(x)*factor)
  const w=num(width)*factor
  const widthAvailable=w*(1-num(shrinkW)/100)
  const length=a/(1-num(shrinkL)/100)
  const bodyWidth=b/(1-num(shrinkW)/100)
  // Explicitly a coarse rectangular component-area estimate, not a CAD marker.
  const bodyArea=length*bodyWidth*config.pieces
  const extraArea=(a+b+c)*config.extras*bodyWidth
  const rawArea=bodyArea+extraArea
  const cuttingEfficiency=Math.max(.4,Math.min(1,num(eff)/100))
  const requiredArea=rawArea/cuttingEfficiency*(1+num(waste)/100)
  const metres=widthAvailable>0?requiredArea/widthAvailable:0
  const ribFraction=Math.min(.35,num(ribShare)/100)
  const mainKg=requiredArea*(1-ribFraction)*num(gsm)/1000
  const ribKg=requiredArea*ribFraction*num(ribGsm)/1000
  return {requiredArea,metres,mainKg,ribKg,totalKg:mainKg+ribKg}
 },[dims,unit,width,shrinkL,shrinkW,waste,eff,config,gsm,ribGsm,ribShare])
 const changeCategory=v=>{C(v);S(Object.keys(STYLES[v])[0]);D(['','',''])}
 const changeStyle=v=>{S(v);D(['','',''])}
 const result=knit?calc.totalKg:calc.metres
 const valid=dims.slice(0,3).every(x=>Number(x)>0)&&Number(width)>0&&Number(eff)>0&&Number(eff)<=100&&Number(shrinkL)<100&&Number(shrinkW)<100&&(!knit||Number(gsm)>0)
 const unitLabel=knit?'kg/pc':'m/pc'
 return <div style={{display:'grid',gap:13}}>
  <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:10}}>
   {label('Category',<select style={inp} value={category} onChange={e=>changeCategory(e.target.value)}>{Object.keys(STYLES).map(x=><option key={x}>{x}</option>)}</select>)}
   {label('Style',<select style={inp} value={style} onChange={e=>changeStyle(e.target.value)}>{Object.keys(STYLES[category]).map(x=><option key={x}>{x}</option>)}</select>)}
   {label('Fit',<select style={inp} value={fit} onChange={e=>F(e.target.value)}>{['Slim','Regular','Relaxed','Oversized'].map(x=><option key={x}>{x}</option>)}</select>)}
   {label('Measurement unit',<select style={inp} value={unit} onChange={e=>U(e.target.value)}><option>inches</option><option>cm</option></select>)}
   {config.measurements.map((x,i)=><React.Fragment key={x}>{label(x,<input style={inp} type="number" min="0" value={dims[i]} onChange={e=>D(a=>a.map((v,j)=>j===i?e.target.value:v))}/>)}</React.Fragment>)}
   {label('Fabric width ('+unit+')',<input style={inp} type="number" min="0" value={width} onChange={e=>W(e.target.value)}/>)}
   {knit&&label('Main fabric GSM',<input style={inp} type="number" min="0" value={gsm} onChange={e=>G(e.target.value)}/>)}
   {knit&&label('Rib fabric GSM',<input style={inp} type="number" min="0" value={ribGsm} onChange={e=>RG(e.target.value)}/>)}
   {knit&&label('Rib area allowance (%)',<input style={inp} type="number" min="0" max="35" value={ribShare} onChange={e=>RS(e.target.value)}/>)}
   {label('Length shrinkage %',<input style={inp} type="number" min="0" max="99" value={shrinkL} onChange={e=>SL(e.target.value)}/>)}
   {label('Width shrinkage %',<input style={inp} type="number" min="0" max="99" value={shrinkW} onChange={e=>SW(e.target.value)}/>)}
   {label('Wastage %',<input style={inp} type="number" min="0" value={waste} onChange={e=>WA(e.target.value)}/>)}
   {label('Estimated cutting efficiency %',<input style={inp} type="number" min="1" max="100" value={eff} onChange={e=>E(e.target.value)}/>)}
   {label('Order quantity',<input style={inp} type="number" min="0" value={qty} onChange={e=>Q(e.target.value)}/>)}
   {label('Style / buyer reference',<input style={inp} value={ref} onChange={e=>R(e.target.value)}/>)}
  </div>
  <div style={{padding:14,borderRadius:9,background:'#f8fafc'}}>
   {valid?<><div style={{fontSize:12,color:'#667085'}}>Preliminary consumption estimate</div><div style={{fontSize:24,fontWeight:750}}>{result.toFixed(3)} {unitLabel}</div><div style={{fontSize:12}}>Order requirement: <strong>{(result*num(qty)).toFixed(knit?1:2)} {knit?'kg':'m'}</strong></div>{knit&&<div style={{fontSize:12}}>Main fabric: {calc.mainKg.toFixed(3)} kg/pc · Rib: {calc.ribKg.toFixed(3)} kg/pc</div>}<div style={{fontSize:11,color:'#667085',marginTop:8}}>Estimated fabric area including allowances: {calc.requiredArea.toFixed(3)} m²/pc. Fit is a reference only: enter actual measurements for each fit.</div><div style={{display:'flex',gap:8,marginTop:9}}><button className="btn btn-secondary btn-sm" onClick={()=>navigator.clipboard?.writeText(result.toFixed(3))}>Copy result</button><button className="btn btn-primary btn-sm" onClick={()=>SS(v=>[{ref,category,style,fit,value:result.toFixed(3),unit:unitLabel},...v])}>Save calculation</button></div></>:<div>Enter valid garment dimensions, width and cutting efficiency.</div>}
  </div>
  {!!saved.length&&<div style={{fontSize:12}}><strong>Saved this session</strong>{saved.map((x,i)=><div key={i} style={{padding:'5px 0',borderBottom:'1px solid #eee'}}>{x.ref||'Untitled'} · {x.style} · {x.value} {x.unit}</div>)}</div>}
  <div style={{fontSize:11,color:'#b45309'}}>Planning estimate only. This uses simplified rectangular garment-panel assumptions, not a validated pattern or CAD marker. Hood, pockets, collar, cuffs and rib allowances are approximate; fabric consumption must be confirmed with an actual marker before bulk purchasing.</div>
 </div>
}
