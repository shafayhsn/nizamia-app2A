import React, { useState } from 'react'
const n=v=>Math.max(0,Number(v)||0)
const field=(label,value,onChange)=> <label style={{display:'grid',gap:4,fontSize:12}}>{label}<input className="input" type="number" min="0" value={value} onChange={e=>onChange(e.target.value)}/></label>
export default function TrimsCalculator(){
 const [tab,setTab]=useState('Button Size')
 const [a,A]=useState('24'),[b,B]=useState('1000'),[c,C]=useState('1'),[d,D]=useState('5'),[e,E]=useState('144')
 const reset=t=>{setTab(t);A('');B('');C('');D('');E('')}
 const modes=['Button Size','Pieces / Gross','Length','Requirement','Costing']
 const units={mm:1,cm:10,inches:25.4,metres:1000,yards:914.4,feet:304.8}
 const [from,F]=useState('cm'),[to,T]=useState('metres')
 const [priceUnit,P]=useState('gross')
 const multiplier={piece:1,dozen:12,gross:144,'100 pcs':100,'1000 pcs':1000}
 const box={padding:14,background:'#f8fafc',borderRadius:9,marginTop:14}
 let result=null
 if(tab==='Button Size')result=<div style={box}><strong>{(n(a)*0.635).toFixed(2)} mm</strong> · {(n(a)*0.0635).toFixed(3)} cm · {(n(a)*0.025).toFixed(3)} inches</div>
 if(tab==='Pieces / Gross')result=<div style={box}>{(n(a)/12).toFixed(2)} dozen · {(n(a)/144).toFixed(3)} gross · <strong>{Math.ceil(n(a)/144)} full gross</strong></div>
 if(tab==='Length')result=<div style={box}><strong>{(n(a)*units[from]/units[to]).toFixed(3)} {to}</strong></div>
 if(tab==='Requirement'){const qty=n(a)*n(b)*(1+n(c)/100),packs=n(d)>0?Math.ceil(qty/n(d)):0;result=<div style={box}>Required: <strong>{Math.ceil(qty).toLocaleString()} pcs</strong> · {packs.toLocaleString()} packs · {n(d)>0?(packs*n(d)).toLocaleString():0} pcs to purchase</div>}
 if(tab==='Costing'){const each=n(a)/(multiplier[priceUnit]||1);result=<div style={box}>Cost per trim: <strong>{each.toFixed(4)}</strong> · per garment: <strong>{(each*n(b)).toFixed(4)}</strong> (supplier currency)</div>}
 return <div>
  <div style={{display:'flex',flexWrap:'wrap',gap:6}}>{modes.map(t=><button key={t} className={'btn btn-sm '+(tab===t?'btn-primary':'btn-secondary')} onClick={()=>reset(t)}>{t}</button>)}</div>
  <div style={{display:'grid',gridTemplateColumns:'repeat(2,minmax(0,1fr))',gap:12,marginTop:16}}>
  {tab==='Button Size'&&field('Button size (Ligne)',a,A)}
  {tab==='Pieces / Gross'&&field('Pieces',a,A)}
  {tab==='Length'&&<>{field('Length',a,A)}<label>From<select className="select" value={from} onChange={x=>F(x.target.value)}>{Object.keys(units).map(x=><option key={x}>{x}</option>)}</select></label><label>To<select className="select" value={to} onChange={x=>T(x.target.value)}>{Object.keys(units).map(x=><option key={x}>{x}</option>)}</select></label></>}
  {tab==='Requirement'&&<>{field('Order quantity (pcs)',a,A)}{field('Trims per garment',b,B)}{field('Wastage %',c,C)}{field('Supplier pack size (pcs)',d,D)}</>}
  {tab==='Costing'&&<>{field('Supplier price',a,A)}{field('Usage per garment',b,B)}<label>Price unit<select className="select" value={priceUnit} onChange={x=>P(x.target.value)}>{Object.keys(multiplier).map(x=><option key={x} value={x}>{x}</option>)}</select></label></>}
  </div>{result}
  <p style={{fontSize:11,color:'#667085',marginTop:12}}>Conversions are arithmetic estimates. Confirm supplier pack size and price basis before ordering.</p>
 </div>
}