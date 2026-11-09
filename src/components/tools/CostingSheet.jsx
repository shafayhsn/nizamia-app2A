import React, { useEffect, useMemo, useState } from 'react'
import { supabase } from '../../lib/supabase'

const sections = {
  woven: [
    ['Fabric Cost Calculation',['Body Fabric','Pocket Lining','Additional Fabric'],['Consumption','Rate','Total (PKR)']],
    ['CM — Cut & Making',['Cutting','Stitching','Kaj / Bartack','Finishing','Factory Overheads'],['Rate','Extra %']],
    ['Washing & Dyeing',['Garment Washing','Garment Dyeing'],['Rate','Total (PKR)']],
    ['Trims & Accessories',['All Trims'],['Qty / Piece','Rate','Extra %','Total (PKR)']],
    ['Embellishment — Printing & Embroidery',['Printing','Embroidery'],['Rate','Total (PKR)']]
  ],
  knits: [
    ['Yarn / Fabric',['Yarn','Knitting','Dyeing','Fabric Processing'],['Consumption / Dozen','Rate','Wastage %']],
    ['CM — Cut & Making',['Cutting','Stitching','Finishing','Overheads'],['Rate / Dozen','Extra %']],
    ['Washing & Dyeing',['Washing','Garment Dyeing'],['Rate / Dozen','Total (PKR)']],
    ['Trims & Accessories',['All Trims'],['Qty / Dozen','Rate','Extra %']],
    ['Embellishment',['Printing','Embroidery'],['Rate / Dozen','Total (PKR)']]
  ]
}
const blank=(type)=>({type,customer:'',buyer_id:null,style:'',description:'',buying_agency:'',size_range:'',base_size:'',target_price:0,quote_currency:'USD',rates:{USD:280,EUR:310,GBP:360},quantity:0,exchange_rate:280,profit_pct:10,agency_pct:0,rejection_pct:3,shipping:0,testing:0,banking:0,str_adjustment:0,notes:'',sections:sections[type].map(([name,items])=>({name,rows:items.map(label=>({label,values:[0,0,0,0]}))}))})
const num=v=>Number(v)||0
const rowTotal=(row,si,type)=>{const [a,b,c]=row.values.map(num);if(si===0)return a*b;if(si===1||si===2||si===4)return a*(1+b/100);return a*b*(1+c/100)}
const trimDefaults=['Thread','Zipper','Button','Rivet','Hangtag','Price Tag','Joker Tag','Leather Patch','Main Label','Size Label','Care Label','Barcode Sticker','Polybag','Master Polybag','Carton','Carton Sticker','Hanger','Hanger Size Tab','Silica Gel']
const money=v=>num(v).toFixed(2)
function totals(doc){
  const groups=doc.sections.map((s,i)=>s.rows.reduce((sum,row)=>sum+rowTotal(row,i,doc.type),0))
  const base=groups.reduce((a,b)=>a+b,0)+num(doc.shipping)+num(doc.testing)+num(doc.banking)+num(doc.str_adjustment)
  const manufacturing=base*(1+num(doc.rejection_pct)/100)
  const unit=doc.type==='knits'?manufacturing/12:manufacturing
  const rate=num(doc.rates?.[doc.quote_currency])||num(doc.exchange_rate)||1
  const cost=unit/rate
  const profit=cost*num(doc.profit_pct)/100
  const agency=(cost+profit)*num(doc.agency_pct)/100
  const fob=cost+profit+agency
  return {groups,manufacturing,usd:cost,profit,agency,fob,invoice:fob*num(doc.quantity),difference:fob-num(doc.target_price),differencePct:num(doc.target_price)>0?(fob-num(doc.target_price))/num(doc.target_price)*100:null,currency:doc.quote_currency||'USD'}

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
  function addRow(si,label='New Item'){setDoc(d=>{const n=structuredClone(d);n.sections[si].rows.push({label,values:[0,0,0,0]});return n})}
  function removeRow(si,ri){setDoc(d=>{const n=structuredClone(d);n.sections[si].rows.splice(ri,1);return n})}
  function renameRow(si,ri,label){setDoc(d=>{const n=structuredClone(d);n.sections[si].rows[ri].label=label;return n})}
  function trimMode(mode){setDoc(d=>{const n=structuredClone(d);const i=3;n.sections[i].rows=(mode==='all'?['All Trims']:mode==='standard'?trimDefaults:['Custom Trim']).map(label=>({label,values:[0,0,0,0]}));return n})}
  async function save(){
    if(busy)return
    if(viewingVersion){setError('Historical versions are read-only. Return to the latest version before editing.');return}
    if(!doc?.customer.trim()){setError('Customer is required.');return}
    if(num(doc.rates?.[doc.quote_currency]??doc.exchange_rate)<=0){setError('Exchange rate must be greater than zero.');return}
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
      <div style={{display:'grid',gridTemplateColumns:'minmax(0,1.8fr) minmax(360px,1fr)',gap:18,alignItems:'start'}}>
        <div style={{minWidth:0}}>
      <div style={{display:'grid',gridTemplateColumns:'2fr 2fr 1fr 1fr 1fr',gap:'10px 12px',marginBottom:16}}>
        {[
          ['Customer',<><input list="costing-buyers" value={doc.customer} onChange={e=>{const buyer=buyers.find(b=>b.name===e.target.value);setDoc(d=>({...d,customer:e.target.value,buyer_id:buyer?.id||null}))}} style={inputStyle}/><datalist id="costing-buyers">{buyers.map(b=><option key={b.id} value={b.name}/>)}</datalist></>],
          ['Style Number / Reference',<input value={doc.style} onChange={e=>update('style',e.target.value)} style={inputStyle}/>],
          ['Target Price',<input type="number" step="any" value={doc.target_price||0} onChange={e=>update('target_price',e.target.value)} style={inputStyle}/>],
          ['Size Range',<input value={doc.size_range} onChange={e=>update('size_range',e.target.value)} style={inputStyle}/>],
          ['Quote Currency',<select value={doc.quote_currency||'USD'} onChange={e=>update('quote_currency',e.target.value)} style={inputStyle}>{['USD','EUR','GBP'].map(x=><option key={x}>{x}</option>)}</select>],
          ['Buying Agency Name',<input value={doc.buying_agency||''} onChange={e=>update('buying_agency',e.target.value)} style={inputStyle}/>],
          ['Item Description',<input value={doc.description} onChange={e=>update('description',e.target.value)} style={inputStyle}/>],
          ['Est. Quantity',<input type="number" value={doc.quantity} onChange={e=>update('quantity',e.target.value)} style={inputStyle}/>],
          ['Base Size',<input value={doc.base_size||''} onChange={e=>update('base_size',e.target.value)} style={inputStyle}/>],
          ['PKR / '+(doc.quote_currency||'USD'),<input type="number" step="any" value={doc.rates?.[doc.quote_currency]??doc.exchange_rate} onChange={e=>update('rates',{...(doc.rates||{}),[doc.quote_currency]:e.target.value})} style={inputStyle}/>]
        ].map(([label,control])=><label key={label}><div style={{fontSize:10,color:'#667085',marginBottom:3}}>{label}</div>{control}</label>)}
      </div>
        <div>{doc.sections.map((section,si)=><div key={si} style={{marginBottom:14,border:'1px solid #e5e7eb',borderRadius:8,overflow:'hidden'}}><div style={{background:'#f3f5f8',padding:'7px 10px',fontWeight:700,display:'flex',alignItems:'center',gap:8}}><span>{si+1}. {section.name}</span>{si===3&&<span className="costing-no-print"><button style={btn} onClick={()=>trimMode('standard')}>Standard Trims</button></span>}<span style={{marginLeft:'auto'}}>PKR {money(calculated.groups[si])}</span></div><table style={{width:'100%',borderCollapse:'collapse'}}><thead><tr><th style={{textAlign:'left',padding:6}}>Item</th>{sections[doc.type][si][2].filter(h=>h!=='Total (PKR)').map(h=><th key={h} style={{fontSize:10,textAlign:'right',width:92,paddingRight:8}}>{h}</th>)}<th style={{fontSize:10,textAlign:'right',width:92,paddingRight:8}}>Total (PKR)</th><th className="costing-no-print" style={{width:24}}></th></tr></thead><tbody>{section.rows.map((row,ri)=><tr key={ri}><td style={{padding:'3px 6px'}}><input value={row.label} onChange={e=>renameRow(si,ri,e.target.value)} style={{...inputStyle,border:'1px solid transparent',width:'100%'}}/></td>{sections[doc.type][si][2].filter(h=>h!=='Total (PKR)').map((h,vi)=><td key={vi} style={{width:92}}><input aria-label={row.label+' '+h} type="number" step="any" value={row.values[vi]} onChange={e=>changeCell(si,ri,vi,e.target.value)} style={{...inputStyle,textAlign:'right',height:26,width:82}}/></td>)}<td style={{textAlign:'right',fontWeight:600,paddingRight:8}}>{money(rowTotal(row,si,doc.type))}</td><td className="costing-no-print"><button title="Remove row" onClick={()=>removeRow(si,ri)} style={{...btn,padding:'3px 6px'}}>×</button></td></tr>)}</tbody></table><div className="costing-no-print" style={{padding:5}}><button style={btn} onClick={()=>addRow(si)}>+ Row</button></div></div>)}</div>

        </div>
        <div style={{minWidth:0,alignSelf:'start'}}>
          <div className="costing-no-print" style={{position:'sticky',top:0,zIndex:6,background:'#fff',padding:'2px 0 10px'}}>
          <div className="costing-no-print" style={{background:'#fff',display:'grid',gridTemplateColumns:'1.1fr .9fr .9fr .9fr 1.6fr',alignItems:'center',gap:5,padding:'7px 8px',border:'1px solid #cbd5e1',borderRadius:7,fontSize:11}}><label style={{display:'flex',alignItems:'center',gap:3}}>Profit % <input aria-label="Profit percent sticky" type="number" step="any" value={doc.profit_pct} onChange={e=>update('profit_pct',e.target.value)} style={{...inputStyle,width:60,height:26,textAlign:'right'}}/></label><span style={{whiteSpace:'nowrap'}}>Cost: {money(calculated.usd)}</span><span>Target: {money(doc.target_price)}</span><b>FOB: {money(calculated.fob)}</b><b style={{color:calculated.difference>0?'#b42318':'#067647'}}>Diff: {calculated.difference>0?'+':''}{money(calculated.difference)} / {calculated.differencePct===null?'—':`${calculated.differencePct>0?'+':''}${calculated.differencePct.toFixed(2)}%`}</b></div>

          </div>
          <div style={{border:'1px solid #e5e7eb',borderRadius:8,padding:12,background:'#fff'}}>
          <strong>Cost Summary</strong><div style={{color:'#667085',margin:'5px 0 12px'}}>Costing basis: {doc.type==='knits'?'per dozen · FOB per piece':'per garment'}</div>
          {doc.sections.map((s,i)=><div key={i} style={{display:'flex',justifyContent:'space-between',padding:'5px 0'}}><span>{s.name}</span><b>{money(calculated.groups[i])}</b></div>)}
          {[[ 'Rejection %','rejection_pct'],['Testing','testing'],['Shipping','shipping'],['Banking','banking'],['STR Adjustment','str_adjustment']].map(([label,key])=><label key={key} style={{display:'flex',alignItems:'center',gap:8,margin:'7px 0'}}><span style={{flex:1}}>{label}</span><input type="number" step="any" value={doc[key]} onChange={e=>update(key,e.target.value)} style={{...inputStyle,width:90,textAlign:'right'}}/></label>)}
          <hr/><div style={{display:'flex',justifyContent:'space-between'}}><b>Manufacturing PKR / {doc.type==='knits'?'dozen':'piece'}</b><b>{money(calculated.manufacturing)}</b></div>
          <div style={{display:'flex',justifyContent:'space-between',marginTop:8}}><span>Manufacturing {calculated.currency} / piece</span><b>{money(calculated.usd)}</b></div>
          {[[ 'Profit %','profit_pct'],['Buying Agent %','agency_pct']].map(([label,key])=><label key={key} style={{display:'flex',alignItems:'center',gap:8,margin:'7px 0'}}><span style={{flex:1}}>{label}</span><input type="number" step="any" value={doc[key]} onChange={e=>update(key,e.target.value)} style={{...inputStyle,width:90,textAlign:'right'}}/></label>)}
          <div style={{display:'flex',justifyContent:'space-between',marginTop:8}}><span>Profit {calculated.currency} / piece</span><b>{money(calculated.profit)}</b></div>
          <div style={{display:'flex',justifyContent:'space-between',marginTop:8}}><span>Agency {calculated.currency} / piece</span><b>{money(calculated.agency)}</b></div>
          <div style={{display:'flex',justifyContent:'space-between',fontSize:17,marginTop:12,borderTop:'2px solid #111827',paddingTop:10}}><strong>FOB {calculated.currency} / piece</strong><strong>{money(calculated.fob)}</strong></div>
          <div style={{display:'flex',justifyContent:'space-between',marginTop:8}}><span>Estimated invoice {calculated.currency}</span><b>{money(calculated.invoice)}</b></div>
          <div style={{display:'flex',justifyContent:'space-between',marginTop:8}}><span>Buyer target {calculated.currency} / piece</span><b>{money(doc.target_price)}</b></div><div style={{display:'flex',justifyContent:'space-between',marginTop:8}}><span>FOB minus target</span><b style={{color:calculated.difference>0?'#b42318':'#067647'}}>{calculated.difference>0?'+':''}{money(calculated.difference)}</b></div><label style={{display:'block',marginTop:16}}>Notes<textarea rows={3} value={doc.notes} onChange={e=>update('notes',e.target.value)} style={{...inputStyle,height:70}}/></label>
          </div>
        </div>
      </div>
      {historyOpen&&<div className="costing-no-print" style={{position:'fixed',inset:0,background:'#0006',display:'grid',placeItems:'center',zIndex:1200}}><div style={{background:'#fff',borderRadius:10,padding:20,width:430,maxHeight:'80vh',overflow:'auto'}}><div style={{display:'flex',justifyContent:'space-between'}}><strong>Edit History</strong><button style={btn} onClick={()=>setHistoryOpen(false)}>Close</button></div>{history.map(h=><div key={h.version} style={{padding:10,borderBottom:'1px solid #eee',display:'flex',justifyContent:'space-between'}}><span>V{h.version} · {new Date(h.created_at).toLocaleString()}</span><button style={btn} onClick={()=>{setDoc(structuredClone(h.document));setViewingVersion(h.version);setHistoryOpen(false);setError('Viewing a read-only historical snapshot. Use Return to Latest to edit.')}}>View</button></div>)}<div style={{padding:10}}>Current: V{current?.version}</div></div></div>}
    </div>}
  </div>
}
