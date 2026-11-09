import React, { useEffect, useMemo, useState } from 'react'
import { supabase } from '../../lib/supabase'

const sections = {
  woven: [
    ['Fabric Cost Calculation',['Body Fabric','Pocket Lining','Additional Fabric'],['Consumption','Rate','Sales Tax %']],
    ['CM — Cut & Making',['Cutting','Stitching','Kaj / Bartack','Finishing','Factory Overheads'],['Rate','Extra %']],
    ['Washing & Dyeing',['Garment Washing','Garment Dyeing'],['Rate','Sales Tax %']],
    ['Trims & Accessories',['All Trims','Thread','Zipper','Button','Rivet','Hangtag','Price Tag','Joker Tag','Leather Patch','Main Label','Size Label','Care Label','Barcode Sticker','Polybag','Master Polybag','Carton','Carton Sticker','Hanger','Hanger Size Tab','Silica Gel'],['Qty / Piece','Rate','Extra %','Sales Tax %']],
    ['Embellishment — Printing & Embroidery',['Printing','Embroidery'],['Rate','Sales Tax %']]
  ],
  knits: [
    ['Yarn / Fabric',['Yarn','Knitting','Dyeing','Fabric Processing'],['Consumption / Dozen','Rate','Wastage %']],
    ['CM — Cut & Making',['Cutting','Stitching','Finishing','Overheads'],['Rate / Dozen','Extra %']],
    ['Washing & Dyeing',['Washing','Garment Dyeing'],['Rate / Dozen','Sales Tax %']],
    ['Trims & Accessories',['Thread','Labels','Tags','Polybag','Carton','Other Trims'],['Qty / Dozen','Rate','Extra %']],
    ['Embellishment',['Printing','Embroidery'],['Rate / Dozen','Sales Tax %']]
  ]
}
const blank=(type)=>({type,customer:'',buyer_id:null,style:'',description:'',size_range:'',quantity:0,exchange_rate:280,profit_pct:10,agency_pct:0,rejection_pct:3,shipping:0,testing:0,banking:0,str_adjustment:0,notes:'',sections:sections[type].map(([name,items])=>({name,rows:items.map(label=>({label,values:[0,0,0,0]}))}))})
const num=v=>Number(v)||0
const money=v=>num(v).toFixed(2)
function totals(doc){
  const groups=doc.sections.map((s,i)=>s.rows.reduce((sum,row)=>{
    const [a,b,c,d]=row.values.map(num)
    if(i===0)return sum+a*b*(1+c/100)
    if(i===1)return sum+a*(1+b/100)
    if(i===2||i===4)return sum+a*(1+b/100)
    return sum+a*b*(1+c/100)*(1+d/100)
  },0))
  const base=groups.reduce((a,b)=>a+b,0)+num(doc.shipping)+num(doc.testing)+num(doc.banking)+num(doc.str_adjustment)
  const manufacturing=base*(1+num(doc.rejection_pct)/100)
  const unit=doc.type==='knits'?manufacturing/12:manufacturing
  const usd=unit/(num(doc.exchange_rate)||1)
  const profit=usd*num(doc.profit_pct)/100
  const agency=(usd+profit)*num(doc.agency_pct)/100
  return {groups,manufacturing,usd,profit,agency,fob:usd+profit+agency,invoice:(usd+profit+agency)*num(doc.quantity)}
}
const inputStyle={height:32,border:'1px solid #d5dae2',borderRadius:6,padding:'4px 8px',width:'100%',boxSizing:'border-box',fontSize:12}
const btn={padding:'8px 12px',border:'1px solid #d5dae2',borderRadius:7,background:'#fff',cursor:'pointer',fontSize:12}
export default function CostingSheet({onClose}){
  const [viewingVersion,setViewingVersion]=useState(null),[records,setRecords]=useState([]),[buyers,setBuyers]=useState([]),[doc,setDoc]=useState(null),[current,setCurrent]=useState(null),[history,setHistory]=useState([]),[historyOpen,setHistoryOpen]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState(''),[search,setSearch]=useState('')
  const update=(key,value)=>setDoc(d=>({...d,[key]:value}))
  async function refresh(){
    const [r,b]=await Promise.all([supabase.from('costing_sheets').select('id,reference,customer,style,type,version,updated_at,document').order('updated_at',{ascending:false}),supabase.from('buyers').select('id,name').order('name')])
    if(r.error)setError('Costing database is not configured in this preview: '+r.error.message)
    else {setRecords(r.data||[]);setError('')}
    if(!b.error)setBuyers(b.data||[])
  }
  useEffect(()=>{refresh()},[])
  const calculated=useMemo(()=>doc?totals(doc):null,[doc])
  function open(record){setCurrent(record);setDoc(structuredClone(record.document));setViewingVersion(null);setHistoryOpen(false);setError('')}
  function start(type){setCurrent(null);setDoc(blank(type));setViewingVersion(null);setHistory([]);setHistoryOpen(false);setError('')}
  function changeCell(section,row,index,value){setDoc(d=>{const next=structuredClone(d);next.sections[section].rows[row].values[index]=value;return next})}
  async function save(){
    if(busy)return
    if(viewingVersion){setError('Historical versions are read-only. Return to the latest version before editing.');return}
    if(!doc?.customer.trim()){setError('Customer is required.');return}
    if(num(doc.exchange_rate)<=0){setError('Exchange rate must be greater than zero.');return}
    if(num(doc.quantity)<0){setError('Quantity cannot be negative.');return}
    if(doc.sections.some(s=>s.rows.some(r=>r.values.some(v=>!Number.isFinite(Number(v)))))){setError('Enter valid numeric cost values.');return}
    setBusy(true);setError('')
    try{
      if(current){
        const version=num(current.version)+1
        const updated=await supabase.rpc('save_costing_revision',{p_id:current.id,p_expected_version:current.version,p_customer:doc.customer,p_buyer_id:doc.buyer_id,p_style:doc.style,p_document:doc})
        if(updated.error)throw updated.error
        setCurrent(updated.data)
        setViewingVersion(null)
      }else{
        const created=await supabase.from('costing_sheets').insert({type:doc.type,customer:doc.customer,buyer_id:doc.buyer_id,style:doc.style,document:doc}).select('*').single()
        if(created.error)throw created.error
        setCurrent(created.data)
        setViewingVersion(null)
      }
      await refresh()
    }catch(e){setError(e.message||String(e))}finally{setBusy(false)}
  }
  async function loadHistory(){
    if(!current)return
    const r=await supabase.from('costing_sheet_versions').select('version,document,created_at').eq('costing_id',current.id).order('version',{ascending:false})
    if(r.error)setError(r.error.message);else {setHistory(r.data||[]);setHistoryOpen(true)}
  }
  const printable=()=>{window.print()}
  return <div className="costing-root" style={{height:'100%',display:'flex',flexDirection:'column',background:'#fff',fontSize:12}}>
    <style>{`@media print {body *{visibility:hidden!important}.costing-print,.costing-print *{visibility:visible!important}.costing-print{position:absolute!important;inset:0!important;width:100%!important;overflow:visible!important}.costing-actions,.costing-no-print{display:none!important}@page{size:A4 landscape;margin:8mm}}`}</style>
    <div className="costing-actions" style={{display:'flex',alignItems:'center',gap:8,padding:12,borderBottom:'1px solid #e5e7eb',flexWrap:'wrap'}}>
      <strong style={{fontSize:16,marginRight:'auto'}}>Costing Sheet {current?.reference||''}</strong>
      {doc?<><button style={btn} onClick={()=>{setDoc(null);setCurrent(null);setViewingVersion(null)}}>All Costings</button><button style={btn} onClick={loadHistory} disabled={!current}>History</button>{viewingVersion&&<button style={btn} onClick={()=>{setDoc(structuredClone(current.document));setViewingVersion(null);setError('')}}>Return to Latest</button>}<button style={btn} onClick={printable} disabled={!current}>Print / PDF</button><button style={{...btn,background:'#111827',color:'#fff'}} disabled={busy||!!viewingVersion} onClick={save}>{busy?'Saving…':'Save'}</button></>:<><button style={btn} onClick={()=>start('woven')}>+ Woven Costing</button><button style={btn} onClick={()=>start('knits')}>+ Knits Costing</button></>}
      <button style={btn} onClick={onClose}>Close</button>
    </div>
    {error&&<div role="alert" style={{color:'#b42318',background:'#fff3f2',padding:10}}>{error}</div>}
    {!doc?<div style={{padding:16,overflow:'auto'}}><input placeholder="Search customer, style or reference" style={{...inputStyle,maxWidth:350,marginBottom:12}} value={search} onChange={e=>setSearch(e.target.value)}/><table style={{width:'100%',borderCollapse:'collapse'}}><thead><tr>{['Reference','Customer','Style','Type','Version','Last Edited'].map(x=><th key={x} style={{textAlign:'left',padding:10,borderBottom:'1px solid #ddd'}}>{x}</th>)}</tr></thead><tbody>{records.filter(r=>[r.reference,r.customer,r.style].join(' ').toLowerCase().includes(search.toLowerCase())).map(r=><tr key={r.id} onDoubleClick={()=>open(r)} onClick={()=>open(r)} style={{cursor:'pointer',borderBottom:'1px solid #eee'}}><td style={{padding:10}}>{r.reference}</td><td>{r.customer}</td><td>{r.style||'—'}</td><td>{r.type}</td><td>V{r.version}</td><td>{new Date(r.updated_at).toLocaleDateString()}</td></tr>)}</tbody></table></div>:
    <div className="costing-print" style={{flex:1,overflow:'auto',padding:18}}>
      <div style={{display:'flex',justifyContent:'space-between',marginBottom:12}}><strong style={{fontSize:18}}>NIZAMIA APPARELS · COSTING SHEET</strong><span>{current?.reference||'UNSAVED'} · {doc.type.toUpperCase()} · V{viewingVersion||current?.version||1}</span></div>
      <div style={{display:'grid',gridTemplateColumns:'repeat(4,minmax(0,1fr))',gap:10,marginBottom:16}}>
        {[[ 'Customer',<><input list="costing-buyers" value={doc.customer} onChange={e=>{const buyer=buyers.find(b=>b.name===e.target.value);setDoc(d=>({...d,customer:e.target.value,buyer_id:buyer?.id||null}))}} style={inputStyle}/><datalist id="costing-buyers">{buyers.map(b=><option key={b.id} value={b.name}/>)}</datalist></>],['Style / Reference',<input value={doc.style} onChange={e=>update('style',e.target.value)} style={inputStyle}/>],['Description',<input value={doc.description} onChange={e=>update('description',e.target.value)} style={inputStyle}/>],['Size Range',<input value={doc.size_range} onChange={e=>update('size_range',e.target.value)} style={inputStyle}/>],['Quantity (pieces)',<input type="number" value={doc.quantity} onChange={e=>update('quantity',e.target.value)} style={inputStyle}/>],['PKR / USD',<input type="number" value={doc.exchange_rate} onChange={e=>update('exchange_rate',e.target.value)} style={inputStyle}/>],['Profit %',<input type="number" value={doc.profit_pct} onChange={e=>update('profit_pct',e.target.value)} style={inputStyle}/>],['Agency %',<input type="number" value={doc.agency_pct} onChange={e=>update('agency_pct',e.target.value)} style={inputStyle}/>]].map(([label,control])=><label key={label}><div style={{fontSize:10,color:'#667085',marginBottom:3}}>{label}</div>{control}</label>)}
      </div>
      <div style={{display:'grid',gridTemplateColumns:'minmax(0,1.8fr) minmax(280px,1fr)',gap:18}}>
        <div>{doc.sections.map((section,si)=><div key={si} style={{marginBottom:14,border:'1px solid #e5e7eb',borderRadius:8,overflow:'hidden'}}><div style={{background:'#f3f5f8',padding:'7px 10px',fontWeight:700}}>{si+1}. {section.name} <span style={{float:'right'}}>PKR {money(calculated.groups[si])}</span></div><table style={{width:'100%',borderCollapse:'collapse'}}><thead><tr><th style={{textAlign:'left',padding:6}}>Item</th>{sections[doc.type][si][2].map(h=><th key={h} style={{fontSize:10}}>{h}</th>)}</tr></thead><tbody>{section.rows.map((row,ri)=><tr key={ri}><td style={{padding:'3px 6px',width:'35%'}}>{row.label}</td>{sections[doc.type][si][2].map((h,vi)=><td key={vi}><input aria-label={row.label+' '+h} type="number" step="any" value={row.values[vi]} onChange={e=>changeCell(si,ri,vi,e.target.value)} style={{...inputStyle,textAlign:'right',height:26}}/></td>)}</tr>)}</tbody></table></div>)}</div>
        <div style={{position:'sticky',top:0,alignSelf:'start',border:'1px solid #e5e7eb',borderRadius:8,padding:12,background:'#fff'}}>
          <strong>Cost Summary</strong><div style={{color:'#667085',margin:'5px 0 12px'}}>Costing basis: {doc.type==='knits'?'per dozen · FOB per piece':'per garment'}</div>
          {doc.sections.map((s,i)=><div key={i} style={{display:'flex',justifyContent:'space-between',padding:'5px 0'}}><span>{s.name}</span><b>{money(calculated.groups[i])}</b></div>)}
          {[[ 'Rejection %','rejection_pct'],['Testing','testing'],['Shipping','shipping'],['Banking','banking'],['STR Adjustment','str_adjustment']].map(([label,key])=><label key={key} style={{display:'flex',alignItems:'center',gap:8,margin:'7px 0'}}><span style={{flex:1}}>{label}</span><input type="number" step="any" value={doc[key]} onChange={e=>update(key,e.target.value)} style={{...inputStyle,width:90,textAlign:'right'}}/></label>)}
          <hr/><div style={{display:'flex',justifyContent:'space-between'}}><b>Manufacturing PKR / {doc.type==='knits'?'dozen':'piece'}</b><b>{money(calculated.manufacturing)}</b></div>
          <div style={{display:'flex',justifyContent:'space-between',marginTop:8}}><span>Manufacturing USD / piece</span><b>{money(calculated.usd)}</b></div>
          <div style={{display:'flex',justifyContent:'space-between',marginTop:8}}><span>Profit USD / piece</span><b>{money(calculated.profit)}</b></div>
          <div style={{display:'flex',justifyContent:'space-between',marginTop:8}}><span>Agency USD / piece</span><b>{money(calculated.agency)}</b></div>
          <div style={{display:'flex',justifyContent:'space-between',fontSize:17,marginTop:12,borderTop:'2px solid #111827',paddingTop:10}}><strong>FOB USD / piece</strong><strong>{money(calculated.fob)}</strong></div>
          <div style={{display:'flex',justifyContent:'space-between',marginTop:8}}><span>Estimated invoice USD</span><b>{money(calculated.invoice)}</b></div>
          <label style={{display:'block',marginTop:16}}>Notes<textarea rows={3} value={doc.notes} onChange={e=>update('notes',e.target.value)} style={{...inputStyle,height:70}}/></label>
        </div>
      </div>
      {historyOpen&&<div className="costing-no-print" style={{position:'fixed',inset:0,background:'#0006',display:'grid',placeItems:'center',zIndex:1200}}><div style={{background:'#fff',borderRadius:10,padding:20,width:430,maxHeight:'80vh',overflow:'auto'}}><div style={{display:'flex',justifyContent:'space-between'}}><strong>Edit History</strong><button style={btn} onClick={()=>setHistoryOpen(false)}>Close</button></div>{history.map(h=><div key={h.version} style={{padding:10,borderBottom:'1px solid #eee',display:'flex',justifyContent:'space-between'}}><span>V{h.version} · {new Date(h.created_at).toLocaleString()}</span><button style={btn} onClick={()=>{setDoc(structuredClone(h.document));setViewingVersion(h.version);setHistoryOpen(false);setError('Viewing a read-only historical snapshot. Use Return to Latest to edit.')}}>View</button></div>)}<div style={{padding:10}}>Current: V{current?.version}</div></div></div>}
    </div>}
  </div>
}
