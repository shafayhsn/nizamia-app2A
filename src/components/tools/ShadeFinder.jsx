import React,{useMemo,useState} from 'react'
import { BUILTIN_SHADES } from './shadeReference'
import { TC_SHADES } from './pantoneTCReference'
import { TPX_SHADES } from './pantoneTPXReference'
const hexOk=s=>/^#[0-9a-f]{6}$/i.test(s)
const rgb=h=>[1,3,5].map(i=>parseInt(h.slice(i,i+2),16))
const distance=(a,b)=>rgb(a).reduce((sum,v,i)=>sum+(v-rgb(b)[i])**2,0)
const parse=text=>text.split(/\r?\n/).map(l=>l.split(/[\t,;]/).map(x=>x.trim())).filter(x=>x.length>=3&&hexOk(x[2])).map(x=>({book:x[0],code:x[1],hex:x[2].toUpperCase(),page:x[3]||'',warning:x[4]||''}))
export default function ShadeFinder(){
 const [hex,H]=useState('#506A88'),[text,T]=useState(''),[expanded,E]=useState(false),[lookup,L]=useState('')
 const rows=useMemo(()=>[...BUILTIN_SHADES.map(([book,code,hex,page,warning])=>({book,code,hex,page,warning})),...TPX_SHADES.map(([code,name,hex,page])=>({book:'Pantone TPX',code,name,hex,page,warning:'PDF sampled swatch; not colour calibrated'})),...TC_SHADES.map(([code,name,hex,page])=>({book:'Pantone TC',code,name,hex,page,warning:'Adobe RGB converted approximately to sRGB'})),...parse(text)],[text])
 const color=hexOk(hex)?hex.toUpperCase():null
 const find=(book)=>rows.filter(r=>r.book.toLowerCase()===book.toLowerCase()).map(r=>({...r,dist:color?distance(color,r.hex):Infinity})).sort((a,b)=>a.dist-b.dist).slice(0,3)
 const exact=useMemo(()=>rows.filter(r=>lookup.trim().length>=2&&(r.code.toLowerCase().includes(lookup.trim().toLowerCase())||r.name?.toLowerCase().includes(lookup.trim().toLowerCase()))).slice(0,20),[rows,lookup])
 const groups=[['Pantone TPX','Pantone TPX'],['Pantone TC','Pantone TC'],['Coats Sewing Thread','Coats'],['YKK Zipper Tape','YKK']]
 const copy=value=>navigator.clipboard?.writeText(value)
 const compact={fontSize:11,color:'#344054'}
 const shadeCard=(r,i)=> <div key={r.book+'-'+r.code+'-'+i} style={{minWidth:0,display:'flex',flexDirection:'column',alignItems:'flex-start',gap:4,padding:'3px 2px',borderRadius:7,border:expanded===r.code?'1px solid #98a2b3':'1px solid transparent'}}>
  <button type="button" title={'Compare '+r.code+' with your selected colour'} onClick={()=>H(r.hex)} style={{background:r.hex,width:49,height:49,borderRadius:8,border:'1px solid #d0d5dd',cursor:'pointer'}}/>
  <div style={{fontSize:11,fontWeight:650,lineHeight:1.25,overflowWrap:'anywhere'}}>{r.code}</div>
  {r.name&&<div style={{fontSize:10,lineHeight:1.2,color:'#475467',overflowWrap:'anywhere'}}>{r.name}</div>}
  <div style={{fontSize:10,color:'#667085'}}>{r.hex}</div>
  {r.page&&<div style={{fontSize:10,color:'#667085'}}>Page {r.page}</div>}
  <button className="btn btn-secondary btn-sm" style={{padding:'3px 9px',fontSize:10,marginTop:'auto'}} onClick={()=>copy(r.code)}>Copy</button>
 </div>
 return <div className="shade-finder-compact" style={{display:'grid',gap:12,fontSize:12}}>
 <style>{`@media(max-width:620px){.shade-finder-compact .shade-search,.shade-finder-compact .shade-groups{grid-template-columns:1fr!important}.shade-finder-compact .shade-preview{flex-wrap:wrap!important}}.shade-finder-compact .shade-search label{min-width:0}.shade-finder-compact .shade-groups>section{min-width:0}.shade-finder-compact button{cursor:pointer}`}</style>
 <div className="shade-search" style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:14}}>
 <label style={compact}>HEX colour<div style={{position:'relative'}}><input className="input" value={hex} onChange={e=>H(e.target.value)} style={{width:'100%',boxSizing:'border-box',paddingRight:45}}/><label title="Open colour picker" style={{position:'absolute',right:7,top:'50%',transform:'translateY(-50%)',height:25,width:27,background:color||'#506A88',border:'1px solid #d0d5dd',borderRadius:5,overflow:'hidden',cursor:'pointer'}}><input type="color" aria-label="Pick a colour" value={color||'#506A88'} onChange={e=>H(e.target.value.toUpperCase())} style={{position:'absolute',inset:0,width:'100%',height:'100%',opacity:0,cursor:'pointer'}}/></label></div></label>
 <label style={compact}>Search by Shade Code<input className="input" placeholder="Pantone / Coats / YKK code or name" value={lookup} onChange={e=>L(e.target.value)}/></label>
 </div>
 {color?<div className="shade-preview" style={{display:'flex',gap:14,alignItems:'center',paddingBottom:10,borderBottom:'1px solid #e5e7eb'}}>
  <div style={{width:175,height:44,flexShrink:0,background:color,border:'1px solid #d0d5dd',borderRadius:8}}/>
  <strong style={{fontSize:15}}>{color}</strong><span style={{color:'#667085',whiteSpace:'nowrap'}}>RGB {rgb(color).join(', ')}</span>
  <button className="btn btn-secondary btn-sm" style={{marginLeft:'auto',whiteSpace:'nowrap'}} onClick={()=>copy(color)}>Copy HEX</button>
 </div>:<div style={{color:'#b42318'}}>Enter a valid six-digit HEX colour, such as #506A88.</div>}
 {lookup.trim().length>=2&&<section style={{borderBottom:'1px solid #e5e7eb',paddingBottom:9}}><strong>Shade-code results ({exact.length})</strong><div style={{display:'flex',gap:8,overflowX:'auto',paddingTop:8}}>{exact.length?exact.map((r,i)=><button key={i} type="button" title={'Use '+r.code} onClick={()=>H(r.hex)} style={{display:'flex',gap:7,alignItems:'center',minWidth:150,maxWidth:220,padding:7,background:'white',border:'1px solid #e5e7eb',borderRadius:7,textAlign:'left',cursor:'pointer'}}><span style={{background:r.hex,width:27,height:27,flexShrink:0,borderRadius:5,border:'1px solid #ddd'}}/><span style={{fontSize:10,overflowWrap:'anywhere'}}><b>{r.code}</b><br/>{r.book}{r.name?' · '+r.name:''}</span></button>):<span style={{color:'#98a2b3'}}>No matching shade code or name.</span>}</div></section>}
 <div className="shade-groups" style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'14px 18px'}}>
 {groups.map(([title,book])=><section key={book} style={{borderBottom:'1px solid #e5e7eb',paddingBottom:10}}>
  <strong style={{fontSize:13,display:'block',marginBottom:9}}>{title} closest matches</strong>
  <div style={{display:'grid',gridTemplateColumns:'repeat(3,minmax(0,1fr))',gap:7}}>
  {find(book).length?find(book).map(shadeCard):<span style={{gridColumn:'1/-1',color:'#98a2b3',fontSize:11}}>No {book} reference available.</span>}
  </div>
 </section>)}
 </div>
 <details><summary style={{cursor:'pointer',fontSize:11,color:'#667085'}}>Reference information and colour accuracy</summary><p style={{fontSize:11,color:'#667085',lineHeight:1.5}}>2,100 TPX and 1,930 TC references are included from uploaded books. Pantone digital values are approximate, not official calibrated values. TPX shades were sampled from PDF images; TC values were converted from Adobe RGB. Coats PDF swatches are not calibrated textile colours. YKK reference shades are provisional. Confirm codes and physical swatches before ordering, and check Coats chemical-wash warnings.</p></details>
 <button className="btn btn-secondary btn-sm" style={{justifySelf:'start'}} onClick={()=>E(!expanded)}>{expanded?'Hide':'Add / edit'} colour book data ({rows.length} shades)</button>
 {expanded&&<><div style={{fontSize:11,color:'#667085'}}>Paste verified shade data: Book, Code, HEX, Page, Warning. Tab or comma separated. Session only.</div><textarea className="input" rows={6} value={text} onChange={e=>T(e.target.value)} placeholder={'Coats,C1740,#506A88,4,Check wash suitability'}/></>}
 </div>
}
