import React,{useMemo,useState} from 'react'
import { BUILTIN_SHADES } from './shadeReference'
import { TC_SHADES } from './pantoneTCReference'
import { TPX_SHADES } from './pantoneTPXReference'
const hexOk=s=>/^#[0-9a-f]{6}$/i.test(s)
const rgb=h=>[1,3,5].map(i=>parseInt(h.slice(i,i+2),16))
const distance=(a,b)=>rgb(a).reduce((sum,v,i)=>sum+(v-rgb(b)[i])**2,0)
const parse=text=>text.split(/\r?\n/).map(l=>l.split(/[\t,;]/).map(x=>x.trim())).filter(x=>x.length>=3&&hexOk(x[2])).map(x=>({book:x[0],code:x[1],hex:x[2].toUpperCase(),page:x[3]||'',warning:x[4]||''}))
export default function ShadeFinder(){
 const [hex,H]=useState('#506A88'),[text,T]=useState(''),[expanded,E]=useState(false),[lookup,L]=useState(''),[pantoneBook,B]=useState('TPX')
 const rows=useMemo(()=>[...BUILTIN_SHADES.map(([book,code,hex,page,warning])=>({book,code,hex,page,warning})),...TPX_SHADES.map(([code,name,hex,page])=>({book:'Pantone TPX',code,name,hex,page,warning:'PDF sampled swatch; not colour calibrated'})),...TC_SHADES.map(([code,name,hex,page])=>({book:'Pantone TC',code,name,hex,page,warning:'Adobe RGB converted approximately to sRGB'})),...parse(text)],[text])
 const color=hexOk(hex)?hex.toUpperCase():null
 const find=(book)=>rows.filter(r=>r.book.toLowerCase()===book.toLowerCase()).map(r=>({...r,dist:color?distance(color,r.hex):Infinity})).sort((a,b)=>a.dist-b.dist).slice(0,3)
 const matches=['Pantone '+pantoneBook,'Coats','YKK']
 const exact=useMemo(()=>rows.filter(r=>lookup.trim().length>=2&&(r.code.toLowerCase().includes(lookup.trim().toLowerCase())||r.name?.toLowerCase().includes(lookup.trim().toLowerCase()))).slice(0,20),[rows,lookup])
 return <div style={{display:'grid',gap:12}}>
 <p style={{fontSize:12,color:'#667085'}}>Includes 2,100 TPX and 1,930 TC references from your uploaded books, plus Coats and provisional YKK shades. Pantone digital colours are approximate, not official calibrated values.</p>
 <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12}}>
 <label style={{fontSize:12}}>HEX colour<input className="input" value={hex} onChange={e=>H(e.target.value)}/></label>
 <label style={{fontSize:12}}>Look up shade code<input className="input" placeholder="e.g. 11-0103 / C1740 / 099" value={lookup} onChange={e=>L(e.target.value)}/></label>
 </div>
 {color&&<div style={{display:'flex',gap:12,alignItems:'center'}}><div style={{background:color,width:90,height:90,borderRadius:9,border:'1px solid #d0d5dd'}}/><div><strong>{color}</strong><div>RGB {rgb(color).join(', ')}</div><button className="btn btn-secondary btn-sm" onClick={()=>navigator.clipboard?.writeText(color)}>Copy HEX</button></div></div>}
 {!color&&<div style={{fontSize:12,color:'#b42318'}}>Enter a six-digit HEX colour such as #506A88.</div>}
 {exact.length>0&&<strong style={{fontSize:13}}>Code / name search ({exact.length} shown)</strong>}
 {exact.map((r,i)=><div key={i} style={{padding:9,border:'1px solid #eee',borderRadius:8,display:'flex',gap:10,alignItems:'center'}}><div style={{width:28,height:28,background:r.hex,border:'1px solid #ddd'}}/><div style={{fontSize:12}}><strong>{r.book} {r.code}</strong> {r.name&&'· '+r.name} · {r.hex} {r.page&&'· Page '+r.page} {r.warning&&<div style={{color:'#b45309'}}>{r.warning}</div>}</div><button className="btn btn-secondary btn-sm" onClick={()=>H(r.hex)}>Use colour</button></div>)}
 <label style={{fontSize:12,display:'flex',gap:8,alignItems:'center'}}>Pantone textile collection <select className="select" value={pantoneBook} onChange={e=>B(e.target.value)}><option value="TPX">TPX · 2,100 colours</option><option value="TC">TC · 1,930 colours</option></select></label>
 {matches.map(book=><div key={book}><strong style={{fontSize:13}}>{book} closest matches</strong>{find(book).length?find(book).map((r,i)=><div key={i} style={{display:'flex',gap:9,alignItems:'center',padding:7,fontSize:12,borderBottom:'1px solid #eee'}}><div style={{width:27,height:27,background:r.hex,border:'1px solid #ddd'}}/><span style={{flex:1}}>{r.code}{r.name&&' · '+r.name} · {r.hex} {r.page&&'· Page '+r.page}{r.warning&&<span style={{color:'#b45309'}}> · {r.warning}</span>}</span><button className="btn btn-secondary btn-sm" onClick={()=>navigator.clipboard?.writeText(r.code)}>Copy</button></div>):<div style={{fontSize:12,color:'#98a2b3',padding:8}}>No verified {book} shade reference loaded.</div>}</div>)}
 <button className="btn btn-secondary btn-sm" onClick={()=>E(!expanded)}>{expanded?'Hide':'Add / edit'} colour book data ({rows.length} shades, including {BUILTIN_SHADES.length} preloaded)</button>
 {expanded&&<><div style={{fontSize:11,color:'#667085'}}>Paste one verified shade per line: Book (Pantone TPX / Pantone TC / Coats / YKK), Code, HEX, Page, Warning. Tab or comma separated. Only paste reference data you have permission to use. Data is held for this session, not uploaded to a paid service.</div><textarea className="input" rows={7} value={text} onChange={e=>T(e.target.value)} placeholder={'Coats,C1740,#506A88,4,Check wash suitability'}/></>}
 <div style={{fontSize:11,color:'#b45309'}}>Digital RGB matches are approximate. TPX colours are sampled from PDF images and TC values converted from the book's Adobe RGB values. These books may be older than current Pantone textile standards. Coats book shades are PDF colour samples, not calibrated textile values. YKK scanned codes and colours are provisional; confirm the original colour-card code and physical swatch before ordering. Coats chemical-wash warnings must be checked before use.</div>
 </div>
}
