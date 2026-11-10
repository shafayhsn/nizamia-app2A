import QuoteReport from './QuoteReport'
import React, { useEffect, useMemo, useState } from 'react'
import { RotateCcw, Copy } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../lib/authContext'

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
const blank=(type)=>({type,customer:'',buyer_id:null,style:'',description:'',buying_agency:'',size_range:'',base_size:'',target_price:'',quote_currency:'USD',rates:{USD:280,EUR:310,GBP:360},quantity:'',exchange_rate:280,profit_pct:10,agency_pct:'',rejection_pct:3,shipping:'',testing:'',banking:'',str_adjustment:'',notes:'',sections:sections[type].map(([name,items])=>({name,rows:items.map(label=>({label,values:['','','','']}))}))})
const num=v=>Number(v)||0
const rowTotal=(row,si,type)=>{const [a,b,c]=row.values.map(num);if(si===0)return a*b;if(si===1||si===2||si===4)return a*(1+b/100);return a*b*(1+c/100)}
const trimDefaults=['Thread','Zipper','Button','Rivet','Hangtag','Price Tag','Joker Tag','Leather Patch','Main Label','Size Label','Care Label','Barcode Sticker','Polybag','Master Polybag','Carton','Carton Sticker','Hanger','Hanger Size Tab','Silica Gel']
const money=v=>num(v).toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2})
const formattedNumber=v=>v===''?'':Number(v).toLocaleString('en-US',{maximumFractionDigits:5})
const symbol={USD:String.fromCharCode(36),EUR:String.fromCharCode(8364),GBP:String.fromCharCode(163)}
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
const reportPrintCss = `
@page{size:A4 portrait;margin:19.05mm 6.35mm}
*{box-sizing:border-box}
html,body{margin:0;padding:0;width:197.3mm;max-width:197.3mm;color:#101010;font:9px Arial,Helvetica,sans-serif;-webkit-print-color-adjust:exact;print-color-adjust:exact}
.costing-report{display:block!important;width:197.3mm;max-width:197.3mm;color:#111;padding:0;overflow:visible}
.cr-header{display:grid;grid-template-columns:1fr 1fr 1fr;align-items:center;margin-bottom:14px;padding-bottom:7px;border-bottom:1px solid #111}
.cr-header b{font-size:17px}.cr-header .cr-center{text-align:center}.cr-header .cr-right{text-align:right}
.cr-header .cr-right b{font-size:16px}.cr-header small{font-size:8px;display:block;font-weight:400}
.cr-columns{display:grid;grid-template-columns:minmax(0,63fr) minmax(0,37fr);gap:10px;align-items:start}
.cr-left,.cr-right{min-width:0}
.cr-section{border:1px solid #111;margin:0 0 12px;break-inside:avoid}
.cr-section-title{display:flex;justify-content:space-between;align-items:center;gap:5px;font-weight:700;font-size:9px;min-height:22px;padding:4px 5px;border-bottom:1px solid #111}
.cr-section-title span:last-child{font-size:7px;white-space:nowrap}
.cr-table{border-collapse:collapse;width:100%;table-layout:fixed}
.cr-table thead{display:table-header-group}
.cr-table th{background:#e4e5e7;text-transform:uppercase;font-size:7px;font-weight:700;border-bottom:1px solid #111;padding:4px 4px;text-align:right}
.cr-table th:first-child,.cr-table td:first-child{text-align:left}
.cr-table td{padding:5px 4px;vertical-align:top;line-height:1.2;text-align:right;font-size:8.3px;overflow-wrap:anywhere}
.cr-table tbody tr{break-inside:avoid}
.cr-table tfoot td{font-weight:700;border-top:1px solid #111;padding:5px 4px}
.cr-meta{border:1.3px solid #111;border-collapse:collapse;width:100%;table-layout:fixed;margin-bottom:12px}
.cr-meta td{border:1px solid #111;padding:6px 6px;vertical-align:middle;font-size:8px;overflow-wrap:anywhere}
.cr-meta td:first-child{width:37%;font-weight:700;text-transform:uppercase;font-size:7.3px}
.cr-summary{border:1.3px solid #111;margin-bottom:12px;break-inside:avoid}
.cr-summary-title{text-align:center;font-size:10px;font-weight:700;padding:5px;border-bottom:1px solid #111}
.cr-summary table{width:100%;border-collapse:collapse;table-layout:fixed}
.cr-summary th{background:#e4e5e7;font-size:7px;text-align:left;padding:4px;border-bottom:1px solid #111}
.cr-summary td{font-size:8.3px;padding:4px 4px;vertical-align:top;overflow-wrap:anywhere}
.cr-summary th:nth-child(2),.cr-summary th:nth-child(3),.cr-summary td:nth-child(2),.cr-summary td:nth-child(3){text-align:right}
.cr-summary .cr-rule td{border-top:1px solid #111;font-weight:700}
.cr-summary .cr-highlight td{border-top:1px solid #111;font-weight:700}
.cr-summary .cr-comparison{width:100%;border-collapse:collapse;table-layout:fixed;border-top:1px solid #111}
.cr-summary .cr-comparison th,.cr-summary .cr-comparison td{border:0;border-right:1px solid #111;text-align:center;padding:5px 2px;font-size:8px}.cr-summary .cr-comparison th:last-child,.cr-summary .cr-comparison td:last-child{border-right:0}.cr-summary .cr-comparison th{border-bottom:1px solid #111}.cr-summary .cr-comparison tbody td{text-align:center}
.cr-summary .cr-comparison th{background:#e4e5e7;font-weight:700}
.cr-difference{border-top:1px solid #111;display:flex;justify-content:space-between;gap:5px;padding:6px 5px;font-weight:700}
.cr-history{border:1.3px solid #111;min-height:125px;break-inside:avoid}
.cr-history-title{border-bottom:1px solid #111;font-size:9px;font-weight:700;padding:5px}
.cr-history-entry{display:flex;justify-content:space-between;border-bottom:1px solid #ddd;padding:4px 6px;font-size:7.5px}
@media screen{.costing-report{background:white}}
`;
const inputStyle={height:32,border:'1px solid #d5dae2',borderRadius:6,padding:'4px 8px',width:'100%',boxSizing:'border-box',fontSize:12}
const btn={padding:'8px 12px',border:'1px solid #d5dae2',borderRadius:7,background:'#fff',cursor:'pointer',fontSize:12}
function FormattedInput({value,onChange,prefix='',style,decimals=5,ariaLabel}){
 const [editing,setEditing]=useState(false)
 const raw=value==null?'':String(value)
 const display=raw===''?'':prefix+Number(raw).toLocaleString('en-US',{maximumFractionDigits:decimals})
 return <input aria-label={ariaLabel} type="text" inputMode="decimal" value={editing?raw:display} onFocus={e=>{setEditing(true);e.target.select()}} onBlur={()=>setEditing(false)} onChange={e=>{const v=e.target.value.replace(/,/g,'').replace(prefix,'');if(v===''||/^-?\d*\.?\d*$/.test(v))onChange(v)}} style={style}/>
}
async function costingApi(action,payload=null){
 const get=payload===null
 const url='/api/oms?action='+encodeURIComponent(action)+(get&&action==='costingHistory'?'':'')
 const response=await fetch(url,{method:get?'GET':'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},...(get?{}:{body:JSON.stringify({action,...payload})})})
 const data=await response.json().catch(()=>({}))
 if(!response.ok)throw new Error(data.error||'Costing request failed')
 return data
}
export default function CostingSheet({onClose}){
  const {user}=useAuth()
  const [viewingVersion,setViewingVersion]=useState(null),[records,setRecords]=useState([]),[buyers,setBuyers]=useState([]),[doc,setDoc]=useState(null),[current,setCurrent]=useState(null),[history,setHistory]=useState([]),[historyOpen,setHistoryOpen]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState(''),[search,setSearch]=useState(''),[typeFilter,setTypeFilter]=useState('all'),[customerFilter,setCustomerFilter]=useState('all'),[groupBy,setGroupBy]=useState('none'),[sortBy,setSortBy]=useState('updated_desc'),[selected,setSelected]=useState([]),[batches,setBatches]=useState([]),[batchFilter,setBatchFilter]=useState('all'),[batchAction,setBatchAction]=useState(''),[quotationOpen,setQuotationOpen]=useState(false)
  const update=(key,value)=>setDoc(d=>({...d,[key]:value}))
  async function refresh(){
    try{
      const [result,b]=await Promise.all([costingApi('listCostings'),supabase.from('buyers').select('id,name').order('name')])
      setRecords(result.costings||[])
      try{const batchResult=await costingApi('listCostingBatches');setBatches(batchResult.batches||[])}catch(e){console.warn('Costing batches not yet available',e)}
      setError('')
      if(!b.error)setBuyers(b.data||[])
    }catch(e){setError(e.message||String(e))}
  }
  useEffect(()=>{refresh()},[])
  const calculated=useMemo(()=>doc?totals(doc):null,[doc])
  const visibleCostings=useMemo(()=>{
    const rows=records.filter(r=>(typeFilter==='all'||r.type===typeFilter)&&(customerFilter==='all'||r.customer===customerFilter)&&(batchFilter==='all'||(batchFilter==='unbatched'?!r.batch_id:r.batch_id===batchFilter))&&[r.reference,r.customer,r.style].join(' ').toLowerCase().includes(search.trim().toLowerCase()))
    const compareText=(a,b)=>String(a||'').localeCompare(String(b||''),undefined,{numeric:true,sensitivity:'base'})
    rows.sort((a,b)=>sortBy==='updated_asc'?new Date(a.updated_at)-new Date(b.updated_at):sortBy==='reference_asc'?compareText(a.reference,b.reference):sortBy==='reference_desc'?compareText(b.reference,a.reference):sortBy==='customer_asc'?compareText(a.customer,b.customer):sortBy==='style_asc'?compareText(a.style,b.style):new Date(b.updated_at)-new Date(a.updated_at))
    return rows
  },[records,typeFilter,customerFilter,batchFilter,search,sortBy])
  const groupedCostings=useMemo(()=>{
    if(groupBy==='none')return [['',visibleCostings]]
    const groups=new Map()
    visibleCostings.forEach(r=>{const key=groupBy==='type'?(r.type==='woven'?'Woven':'Knits'):(r.customer||'Unspecified');if(!groups.has(key))groups.set(key,[]);groups.get(key).push(r)})
    return [...groups.entries()].sort((a,b)=>a[0].localeCompare(b[0]))
  },[visibleCostings,groupBy])
  const selectedRows=records.filter(r=>selected.includes(r.id))
  const allVisibleSelected=visibleCostings.length>0&&visibleCostings.every(r=>selected.includes(r.id))
  function toggleSelection(ids,checked){setSelected(prev=>checked?[...new Set([...prev,...ids])]:prev.filter(id=>!ids.includes(id)))}
  async function createBatch(){
    const name=window.prompt('New costing batch name')
    if(name===null||!name.trim())return
    try{const response=await costingApi('saveCostingBatch',{name:name.trim()});setBatches(prev=>[response.batch,...prev]);setBatchAction(response.batch.id);setError('')}catch(e){setError(e.message)}
  }
  async function assignBatch(nextBatchId){
    if(!selected.length)return
    try{setBusy(true);await costingApi('assignCostingBatch',{ids:selected,batch_id:nextBatchId==='unbatched'?null:nextBatchId});setSelected([]);await refresh();setError('')}catch(e){setError(e.message)}finally{setBusy(false)}
  }
  function beginQuotation(){
    if(!selectedRows.length)return
    const customers=[...new Set(selectedRows.map(r=>r.customer.trim().toLowerCase()))]
    if(customers.length!==1){setError('Select costings for one customer only to make a quotation.');return}
    const currencies=[...new Set(selectedRows.map(r=>r.document?.quote_currency||'USD'))]
    if(currencies.length!==1){setError('Selected costings must use the same quote currency.');return}
    const batchIds=[...new Set(selectedRows.map(r=>r.batch_id||''))]
    if(batchIds.length!==1||!batchIds[0]){setError('Select costings from one assigned batch to make a quotation.');return}
    setQuotationOpen(true);setError('')
  }
  function printQuotation(){
    const node=document.getElementById('costing-quotation-print')
    if(!node)return
    const frame=document.createElement('iframe');frame.style.cssText='position:fixed;width:1px;height:1px;left:-9999px;border:0';document.body.appendChild(frame)
    const page=frame.contentDocument;page.open();page.write('<!doctype html><html><head><title>Customer Quotation</title><style>@page{size:A4 portrait;margin:18mm}body{font-family:Arial,sans-serif;color:#111;font-size:11px}h1{font-size:20px;margin-bottom:6px}table{width:100%;border-collapse:collapse;margin-top:25px}th,td{border:1px solid #aaa;padding:9px;text-align:left}th{background:#f0f0f0}td.num{text-align:right}p{line-height:1.6}</style></head><body>'+node.innerHTML+'</body></html>');page.close()
    frame.contentWindow.focus();frame.contentWindow.print();frame.contentWindow.addEventListener('afterprint',()=>frame.remove(),{once:true})
  }
  const selectStyle={...inputStyle,width:'auto',minWidth:108,maxWidth:155,height:35,padding:'0 6px',fontSize:12,background:'#fff',flexShrink:1}

  function open(record){setCurrent(record);setDoc(structuredClone(record.document));setViewingVersion(null);setHistoryOpen(false);setError('')}
  function duplicateSelected(){
    if(selectedRows.length!==1||busy)return
    const source=selectedRows[0]
    setCurrent(null)
    setDoc(structuredClone(source.document))
    setViewingVersion(null)
    setHistory([])
    setHistoryOpen(false)
    setSelected([])
    setError('Duplicated costing is unsaved. Save to create a new costing reference.')
  }
  function start(type){setCurrent(null);setDoc(blank(type));setViewingVersion(null);setHistory([]);setHistoryOpen(false);setError('')}
  function changeCell(section,row,index,value){setDoc(d=>{const next=structuredClone(d);next.sections[section].rows[row].values[index]=value;return next})}
  function addRow(si,label='New Item'){setDoc(d=>{const n=structuredClone(d);n.sections[si].rows.push({label,values:['','','','']});return n})}
  function removeRow(si,ri){setDoc(d=>{const n=structuredClone(d);n.sections[si].rows.splice(ri,1);return n})}
  function renameRow(si,ri,label){setDoc(d=>{const n=structuredClone(d);n.sections[si].rows[ri].label=label;return n})}
  function trimMode(mode){setDoc(d=>{const n=structuredClone(d);const i=3;n.sections[i].rows=(mode==='all'?['All Trims']:mode==='standard'?trimDefaults:['Custom Trim']).map(label=>({label,values:['','','','']}));return n})}
  async function save(){
    if(busy)return
    if(viewingVersion){setError('Historical versions are read-only. Return to the latest version before editing.');return}
    if(!doc?.customer.trim()){setError('Customer is required.');return}
    if(num(doc.rates?.[doc.quote_currency]??doc.exchange_rate)<=0){setError('Exchange rate must be greater than zero.');return}
    if(num(doc.quantity)<0){setError('Quantity cannot be negative.');return}
    if(doc.sections.some(s=>s.rows.some(r=>r.values.some(v=>!Number.isFinite(Number(v)))))){setError('Enter valid numeric cost values.');return}
    setBusy(true);setError('')
    try{
      const result=await costingApi('saveCosting',{id:current?.id||null,expected_version:current?.version||null,buyer_id:doc.buyer_id,document:doc})
      setCurrent(result.costing)
      setViewingVersion(null)
      await refresh()
    }catch(e){setError(e.message||String(e))}finally{setBusy(false)}
  }
  async function loadHistory(){
    if(!current)return
    try{
      const response=await fetch('/api/oms?action=costingHistory&id='+encodeURIComponent(current.id),{credentials:'same-origin'})
      const data=await response.json()
      if(!response.ok)throw new Error(data.error||'History unavailable')
      setHistory(data.history||[])
      setHistoryOpen(true)
    }catch(e){setError(e.message||String(e))}
  }
  const printable=async()=>{
    if(current){try{const response=await fetch('/api/oms?action=costingHistory&id='+encodeURIComponent(current.id),{credentials:'same-origin'});if(response.ok){const data=await response.json();setHistory(data.history||[])}}catch(e){console.warn('Costing history unavailable for print',e)}}
    const report=document.querySelector('.costing-report')
    if(!report)return
    const frame=document.createElement('iframe')
    frame.setAttribute('title','Costing print report')
    frame.style.cssText='position:absolute;left:-10000px;top:0;width:746px;height:1123px;border:0;pointer-events:none'
    document.body.appendChild(frame)
    const css=reportPrintCss
    await new Promise(resolve=>setTimeout(resolve,50))
    const page=frame.contentDocument
    page.open()
    page.write('<!doctype html><html><head><title>Costing Report</title><style>'+css+'</style></head><body>'+report.innerHTML+'</body></html>')
    page.close()
    await new Promise(resolve=>setTimeout(resolve,150))
    frame.contentWindow.focus()
    frame.contentWindow.print()
    frame.contentWindow.addEventListener('afterprint',()=>frame.remove(),{once:true})
  }
  return <div className="costing-root" style={{height:'100%',display:'flex',flexDirection:'column',background:'#fff',fontSize:12}}>
    <style>{`.costing-report{display:none}@media print {.costing-editor{display:none!important}.costing-report{display:block!important;position:static!important;width:100%!important;color:#111!important;font-size:10pt}.costing-report table{width:100%;border-collapse:collapse;margin:7px 0 16px}.costing-report th,.costing-report td{padding:5px;border-bottom:1px solid #ddd;text-align:right}.costing-report th:first-child,.costing-report td:first-child{text-align:left}.costing-report section{break-inside:avoid-page}.costing-report h3{background:#eef0f3;padding:7px}.costing-report .report-grid{display:block}.costing-report .report-summary{break-before:page}.costing-report section{break-inside:auto}.costing-report .report-meta{display:grid;grid-template-columns:repeat(5,1fr);gap:8px;margin:16px 0}.costing-report .report-meta div{border-bottom:1px solid #ddd;padding:5px}.costing-report .report-summary p{display:flex;justify-content:space-between;border-bottom:1px solid #ddd;padding:5px 0;margin:0}.costing-report .report-summary h3{margin-top:0}body *{visibility:hidden!important}.costing-report,.costing-report *{visibility:visible!important}.costing-report{position:absolute!important;top:0!important;left:0!important;width:100%!important;overflow:visible!important}.costing-actions,.costing-no-print{display:none!important}@page{size:A4 portrait;margin:12mm}.costing-print{height:auto!important;max-height:none!important;min-height:0!important;display:block!important}.costing-print input,.costing-print select,.costing-print textarea{color:#111!important;-webkit-text-fill-color:#111!important}.costing-root{height:auto!important;overflow:visible!important}.costing-print table{break-inside:auto}.costing-print tr{break-inside:avoid}}`}</style>
    {doc&&<div className="costing-actions" style={{display:'flex',alignItems:'center',gap:8,padding:'12px 22px',borderBottom:'1px solid #e5e7eb',flexWrap:'wrap'}}>
      <strong style={{fontSize:16,marginRight:'auto'}}>Costing Sheet {current?.reference?current.reference+'-V'+(viewingVersion||current.version):''}</strong>
      <button style={btn} onClick={()=>{setDoc(null);setCurrent(null);setViewingVersion(null)}}>All Costings</button><button style={btn} onClick={loadHistory} disabled={!current}>History</button>{viewingVersion&&<button style={btn} onClick={()=>{setDoc(structuredClone(current.document));setViewingVersion(null);setError('')}}>Return to Latest</button>}<button style={btn} onClick={printable}>Print / PDF</button><button style={{...btn,background:'#111827',color:'#fff'}} disabled={busy||!!viewingVersion} onClick={save}>{busy?'Saving…':'Save'}</button>
      <button style={btn} onClick={onClose}>Close</button>
    </div>}

    {quotationOpen&&<QuoteReport rows={selectedRows} batches={batches} totals={totals} onClose={()=>setQuotationOpen(false)}/>}
    {error&&<div role="alert" style={{color:'#b42318',background:'#fff3f2',padding:10}}>{error}</div>}
    {!doc?<div style={{flex:1,minHeight:0,overflow:'auto',background:'#fff'}}>
      <div style={{display:'flex',alignItems:'center',gap:12,padding:'15px 28px',borderBottom:'1px solid #e5e7eb',flexWrap:'wrap'}}>
        <h1 style={{fontSize:21,fontWeight:750,margin:0,marginRight:4}}>Costing Sheet</h1>
        {[['TOTAL COSTINGS',records.length],['WOVEN',records.filter(r=>r.type==='woven').length],['KNITS',records.filter(r=>r.type==='knits').length]].map(([label,value])=><div key={label} style={{border:'1px solid #e1e5eb',borderRadius:9,padding:'7px 12px',minWidth:120,background:'#fff'}}><div style={{fontSize:10,color:'#98a2b3',fontWeight:700,letterSpacing:'.3px'}}>{label}</div><strong style={{fontSize:16}}>{value}</strong></div>)}
        <div style={{marginLeft:'auto',display:'flex',gap:9,alignItems:'center'}}>
          <button style={{...btn,background:'#111',color:'#fff',borderColor:'#111',height:36,fontWeight:650}} onClick={()=>start('woven')}>+ Woven Costing</button>
          <button style={{...btn,background:'#fff',color:'#111',borderColor:'#111',height:36,fontWeight:650}} onClick={()=>start('knits')}>+ Knits Costing</button>
          <button style={{...btn,background:'#fff',color:'#111',borderColor:'#111',height:36,fontWeight:650}} disabled={!selected.length} onClick={beginQuotation}>Make Quotation</button>
        </div>
      </div>
      <div style={{padding:'11px 22px',borderBottom:'1px solid #e5e7eb',display:'flex',alignItems:'center',gap:7,flexWrap:'nowrap',overflowX:'auto'}}>
        <input aria-label="Search costings" placeholder="Search customer, style or reference" style={{...inputStyle,width:190,minWidth:145,flex:'0 1 190px',height:35}} value={search} onChange={e=>setSearch(e.target.value)}/>

        <select aria-label="Filter costing type" style={selectStyle} value={typeFilter} onChange={e=>setTypeFilter(e.target.value)}><option value="all">All Types</option><option value="woven">Woven</option><option value="knits">Knits</option></select>
        <select aria-label="Filter costing batch" style={selectStyle} value={batchFilter} onChange={e=>setBatchFilter(e.target.value)}><option value="all">All Batches</option><option value="unbatched">Unbatched</option>{batches.map(b=><option key={b.id} value={b.id}>{b.name}</option>)}</select>
        <select aria-label="Filter customer" style={selectStyle} value={customerFilter} onChange={e=>setCustomerFilter(e.target.value)}><option value="all">All Customers</option>{[...new Set(records.map(r=>r.customer).filter(Boolean))].sort().map(v=><option key={v} value={v}>{v}</option>)}</select>

        <select aria-label="Group costings" style={selectStyle} value={groupBy} onChange={e=>setGroupBy(e.target.value)}><option value="none">No Grouping</option><option value="customer">Group by Customer</option><option value="type">Group by Type</option></select>

        <select aria-label="Sort costings" style={selectStyle} value={sortBy} onChange={e=>setSortBy(e.target.value)}><option value="updated_desc">Last Edited (Newest)</option><option value="updated_asc">Last Edited (Oldest)</option><option value="reference_asc">Reference (A–Z)</option><option value="reference_desc">Reference (Z–A)</option><option value="customer_asc">Customer (A–Z)</option><option value="style_asc">Style (A–Z)</option></select>
        <button title="Reset filters and sorting" aria-label="Reset costing view" style={{...btn,padding:8,display:'flex'}} onClick={()=>{setSearch('');setTypeFilter('all');setCustomerFilter('all');setBatchFilter('all');setGroupBy('none');setSortBy('updated_desc')}}><RotateCcw size={15}/></button>
        <div style={{marginLeft:'auto',display:'flex',alignItems:'center',gap:6,flexShrink:0}}>
          <button style={btn} disabled={selected.length!==1} onClick={()=>open(selectedRows[0])}>Edit</button>
          <button title="Duplicate selected costing" aria-label="Duplicate selected costing" style={{...btn,padding:8,display:"flex",alignItems:"center"}} disabled={selected.length!==1||busy} onClick={duplicateSelected}><Copy size={15}/></button>
          <button style={btn} onClick={createBatch}>+ Batch</button>
          <select aria-label="Edit batch for selected costings" title="Select a batch to immediately update the selected costings" style={{...selectStyle,maxWidth:125}} value="" disabled={!selected.length||busy} onChange={e=>{if(e.target.value)assignBatch(e.target.value)}}><option value="">Edit Batch…</option><option value="unbatched">Remove from Batch</option>{batches.map(b=><option key={b.id} value={b.id}>{b.name}</option>)}</select>
        </div>
      </div>
      <div style={{padding:'0 22px 24px',overflowX:'auto'}}>
        <table style={{width:'100%',borderCollapse:'collapse',fontSize:12,whiteSpace:'nowrap'}}>
          <thead><tr style={{background:'#f8f9fb'}}><th style={{padding:'12px 8px',width:35,borderBottom:'1px solid #e5e7eb'}}><input type="checkbox" aria-label="Select all visible costings" checked={allVisibleSelected} onChange={e=>toggleSelection(visibleCostings.map(r=>r.id),e.target.checked)}/></th>{['REFERENCE','CUSTOMER','STYLE','TYPE','VERSION','LAST EDITED'].map(x=><th key={x} style={{textAlign:'left',padding:'12px 12px',borderBottom:'1px solid #e5e7eb',fontSize:11,color:'#98a2b3',letterSpacing:'.4px'}}>{x}</th>)}</tr></thead>
          <tbody>{groupedCostings.map(([group,rows])=><React.Fragment key={group}>{group&&<tr style={{background:'#e6f2fb'}}><td colSpan={7} style={{padding:'9px 12px',fontWeight:750}}><input type="checkbox" aria-label={'Select group '+group} style={{marginRight:12}} checked={rows.every(r=>selected.includes(r.id))} onChange={e=>toggleSelection(rows.map(r=>r.id),e.target.checked)}/>{group} — {rows.length} costing{rows.length===1?'':'s'}</td></tr>}{rows.map(r=><tr key={r.id} onClick={()=>toggleSelection([r.id],!selected.includes(r.id))} style={{cursor:'pointer',borderBottom:'1px solid #edf0f3'}} onMouseEnter={e=>e.currentTarget.style.background='#f5f9ff'} onMouseLeave={e=>e.currentTarget.style.background='transparent'}><td style={{padding:'13px 8px'}}><input type="checkbox" aria-label={'Select '+r.reference} checked={selected.includes(r.id)} onChange={e=>toggleSelection([r.id],e.target.checked)} onClick={e=>e.stopPropagation()}/></td><td style={{padding:'13px 12px',fontWeight:700}}>{r.reference}-V{r.version}</td><td style={{padding:'13px 12px'}}>{r.customer}</td><td style={{padding:'13px 12px'}}>{r.style||'—'}</td><td style={{padding:'13px 12px',textTransform:'capitalize'}}>{r.type}</td><td style={{padding:'13px 12px'}}>V{r.version}</td><td style={{padding:'13px 12px',color:'#667085'}}>{new Date(r.updated_at).toLocaleDateString()}</td></tr>)}</React.Fragment>)}</tbody>
        </table>
        {!visibleCostings.length&&<div style={{textAlign:'center',padding:40,color:'#98a2b3'}}>{records.length?'No costings match the current filters.':'No saved costings yet. Use + Woven Costing or + Knits Costing to begin.'}</div>}
      </div>
    </div>:
    <><div className="costing-editor costing-print" style={{flex:1,overflow:'auto',padding:18}}>
      <div style={{display:'flex',justifyContent:'space-between',marginBottom:12}}><strong style={{fontSize:18}}>NIZAMIA APPARELS · COSTING SHEET</strong><span>{current?.reference?current.reference+'-V'+(viewingVersion||current?.version||1):'UNSAVED'} · {doc.type.toUpperCase()}</span></div>
      <div style={{display:'grid',gridTemplateColumns:'minmax(0,1.8fr) minmax(360px,1fr)',gap:18,alignItems:'start'}}>
        <div style={{minWidth:0}}>
      <div style={{display:'grid',gridTemplateColumns:'2fr 2fr 1fr 1fr 1fr',gap:'10px 12px',marginBottom:16}}>
        {[
          ['Customer',<><input list="costing-buyers" value={doc.customer} onChange={e=>{const buyer=buyers.find(b=>b.name===e.target.value);setDoc(d=>({...d,customer:e.target.value,buyer_id:buyer?.id||null}))}} style={inputStyle}/><datalist id="costing-buyers">{buyers.map(b=><option key={b.id} value={b.name}/>)}</datalist></>],
          ['Style Number / Reference',<input value={doc.style} onChange={e=>update('style',e.target.value)} style={inputStyle}/>],
          ['Target Price',<FormattedInput value={doc.target_price} onChange={v=>update('target_price',v)} prefix={symbol[doc.quote_currency]} style={inputStyle}/>],
          ['Size Range',<input value={doc.size_range} onChange={e=>update('size_range',e.target.value)} style={inputStyle}/>],
          ['Quote Currency',<select value={doc.quote_currency||'USD'} onChange={e=>update('quote_currency',e.target.value)} style={inputStyle}>{['USD','EUR','GBP'].map(x=><option key={x}>{x}</option>)}</select>],
          ['Buying Agency Name',<input value={doc.buying_agency||''} onChange={e=>update('buying_agency',e.target.value)} style={inputStyle}/>],
          ['Item Description',<input value={doc.description} onChange={e=>update('description',e.target.value)} style={inputStyle}/>],
          ['Est. Quantity',<FormattedInput value={doc.quantity} onChange={v=>update('quantity',v)} style={inputStyle} decimals={0}/>],
          ['Base Size',<input value={doc.base_size||''} onChange={e=>update('base_size',e.target.value)} style={inputStyle}/>],
          ['PKR / '+(doc.quote_currency||'USD'),<input type="number" step="any" value={doc.rates?.[doc.quote_currency]??doc.exchange_rate} onChange={e=>update('rates',{...(doc.rates||{}),[doc.quote_currency]:e.target.value})} style={inputStyle}/>]
        ].map(([label,control])=><label key={label}><div style={{fontSize:10,color:'#667085',marginBottom:3}}>{label}</div>{control}</label>)}
      </div>
        <div>{doc.sections.map((section,si)=><div key={si} style={{marginBottom:14,border:'1px solid #e5e7eb',borderRadius:8,overflow:'hidden'}}><div style={{background:'#f3f5f8',padding:'7px 10px',fontWeight:700,display:'flex',alignItems:'center',gap:8}}><span>{si+1}. {section.name}</span>{si===3&&<span className="costing-no-print"><button style={btn} onClick={()=>trimMode('standard')}>Standard Trims</button></span>}<span style={{marginLeft:'auto'}}>PKR {money(calculated.groups[si])}</span></div><table style={{width:'100%',borderCollapse:'collapse'}}><thead><tr><th style={{textAlign:'left',padding:6}}>Item</th>{sections[doc.type][si][2].filter(h=>h!=='Total (PKR)').map(h=><th key={h} style={{fontSize:10,textAlign:'right',width:92,paddingRight:8}}>{h}</th>)}<th style={{fontSize:10,textAlign:'right',width:92,paddingRight:8}}>Total (PKR)</th><th className="costing-no-print" style={{width:24}}></th></tr></thead><tbody>{section.rows.map((row,ri)=><tr key={ri}><td style={{padding:'3px 6px'}}><input value={row.label} onChange={e=>renameRow(si,ri,e.target.value)} style={{...inputStyle,border:'1px solid transparent',width:'100%'}}/></td>{sections[doc.type][si][2].filter(h=>h!=='Total (PKR)').map((h,vi)=><td key={vi} style={{width:92}}><FormattedInput ariaLabel={row.label+' '+h} value={row.values[vi]} onChange={v=>changeCell(si,ri,vi,v)} style={{...inputStyle,textAlign:'right',height:26,width:82}}/></td>)}<td style={{textAlign:'right',fontWeight:600,paddingRight:8}}>{money(rowTotal(row,si,doc.type))}</td><td className="costing-no-print"><button title="Remove row" onClick={()=>removeRow(si,ri)} style={{...btn,padding:'3px 6px'}}>×</button></td></tr>)}</tbody></table><div className="costing-no-print" style={{padding:5}}><button style={btn} onClick={()=>addRow(si)}>+ Row</button></div></div>)}</div>

        </div>
        <div style={{minWidth:0,alignSelf:'start'}}>
          <div className="costing-no-print" style={{position:'sticky',top:0,zIndex:6,background:'#fff',padding:'2px 0 10px'}}>
          <div className="costing-no-print" style={{background:'#fff',display:'grid',gridTemplateColumns:'1.35fr .85fr .85fr .85fr 1.55fr',alignItems:'center',gap:5,padding:'7px 8px',border:'1px solid #cbd5e1',borderRadius:7,fontSize:11}}><label style={{display:'flex',alignItems:'center',gap:3,whiteSpace:'nowrap',flexWrap:'nowrap'}}>Profit % <input aria-label="Profit percent sticky" type="number" step="any" value={doc.profit_pct} onChange={e=>update('profit_pct',e.target.value)} style={{...inputStyle,width:54,minWidth:54,height:26,textAlign:'right',flexShrink:0}}/></label><span style={{whiteSpace:'nowrap'}}>Cost: {money(calculated.usd)}</span><span>Target: {money(doc.target_price)}</span><b>FOB: {money(calculated.fob)}</b><b style={{color:calculated.difference>0?'#b42318':'#067647'}}>Diff: {calculated.difference>0?'+':''}{money(calculated.difference)} / {calculated.differencePct===null?'—':`${calculated.differencePct>0?'+':''}${calculated.differencePct.toFixed(2)}%`}</b></div>

          </div>
          <div style={{border:'1px solid #e5e7eb',borderRadius:8,padding:12,background:'#fff'}}>
          <strong>Cost Summary</strong><div style={{color:'#667085',margin:'5px 0 12px'}}>Costing basis: {doc.type==='knits'?'per dozen · FOB per piece':'per garment'}</div>
          {doc.sections.map((s,i)=><div key={i} style={{display:'flex',justifyContent:'space-between',padding:'5px 0'}}><span>{s.name}</span><b>{money(calculated.groups[i])}</b></div>)}
          {[['Testing','testing'],['Shipping','shipping'],['Banking','banking'],['STR Adjustment','str_adjustment'],['Rejection %','rejection_pct']].map(([label,key])=><label key={key} style={{display:'flex',alignItems:'center',gap:8,margin:'7px 0'}}><span style={{flex:1}}>{label}</span><input type="number" step="any" value={doc[key]} onChange={e=>update(key,e.target.value)} style={{...inputStyle,width:90,textAlign:'right'}}/></label>)}
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
      </div>
      <div className="costing-report">
        <div className="cr-header">
          <b>Nizamia Apparels</b>
          <b className="cr-center">Costing Sheet</b>
          <div className="cr-right"><b>{current?.reference||'UNSAVED'} - V{viewingVersion||current?.version||1}</b><small>Printed on: {new Date().toLocaleString('en-GB',{day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit',hour12:false})}</small></div>
        </div>
        <div className="cr-columns">
          <div className="cr-left">{doc.sections.map((s,si)=>{
            const titles=['FABRIC COST CALCULATION','CM - CUT & MAKING COST','WASHING & DYEING','TRIMS & ACCESSORIES','EMBELLISHMENT - PRINTING & EMBROIDERY']
            const heads=si===0?['FABRIC DETAIL','CONSUMP.','COST','PRICE']:si===1?['FABRIC DETAIL','RATE/PC','EXTRA %','TOTAL']:si===2?['WASHING DETAILS','RATE/PC','TOTAL']:si===3?['FABRIC DETAIL','PER PC','PRICE','EXTRA %','TOTAL']:['DECORATION DETAIL','RATE/PC','TOTAL']
            const rowValues=(row)=>{
              const v=row.values||[]
              if(si===0)return [formattedNumber(v[0]),formattedNumber(v[1]),money(rowTotal(row,si,doc.type))]
              if(si===1)return [formattedNumber(v[0]),formattedNumber(v[1]),money(rowTotal(row,si,doc.type))]
              if(si===2)return [formattedNumber(v[0]),money(rowTotal(row,si,doc.type))]
              if(si===3)return [formattedNumber(v[0]),formattedNumber(v[1]),formattedNumber(v[2]),money(rowTotal(row,si,doc.type))]
              return [formattedNumber(v[0]),money(rowTotal(row,si,doc.type))]
            }
            const totalLabels=['TOTAL FABRIC PRICE','TOTAL CM + OVERHEAD PRICE','TOTAL WASHING PRICE','TOTAL TRIMS PRICE','TOTAL EMBELLISHMENT PRICE']
            return <section className="cr-section" key={si}>
              <div className="cr-section-title"><span>{si+1}- {titles[si]||s.name.toUpperCase()}</span><span>Rs. {money(calculated.groups[si])} | {symbol[doc.quote_currency]||'$'}{money(calculated.groups[si]/(num(doc.rates?.[doc.quote_currency])||num(doc.exchange_rate)||1))}</span></div>
              <table className="cr-table"><colgroup><col style={{width:si===3?'43%':'57%'}}/>{heads.slice(1).map((_,i)=><col key={i} style={{width:(si===3?57:43)/(heads.length-1)+'%'}}/>)}</colgroup>
                <thead><tr>{heads.map(h=><th key={h}>{h}</th>)}</tr></thead>
                <tbody>{s.rows.map((row,ri)=><tr key={ri}><td>{row.label}</td>{rowValues(row).map((v,i)=><td key={i}>{v}</td>)}</tr>)}</tbody>
                <tfoot><tr><td>{totalLabels[si]||'TOTAL'}</td><td colSpan={heads.length-1}>{money(calculated.groups[si])}</td></tr></tfoot>
              </table>
            </section>
          })}</div>
          <div className="cr-right">
            <table className="cr-meta"><tbody>{[
              ['CUSTOMER',doc.customer],['STYLE NUMBER',doc.style],['ITEM DESC',doc.description],
              ['BUYING AGENCY',doc.buying_agency],['SIZE RANGE',doc.size_range],['BASE SIZE',doc.base_size],
              ['QUOTE CURRENCY',doc.quote_currency],['FX RATE',formattedNumber(doc.rates?.[doc.quote_currency]??doc.exchange_rate)],
              ['EST. QUANTITY',formattedNumber(doc.quantity)],['USER',user?.displayName||user?.username||'—']
            ].map(([k,v])=><tr key={k}><td>{k}</td><td>{v||'—'}</td></tr>)}</tbody></table>
            <div className="cr-summary">
              <div className="cr-summary-title">COST SUMMARY</div>
              <table><thead><tr><th style={{width:'55%'}}>CATEGORY</th><th>COST PKR</th><th>COST %</th></tr></thead>
                <tbody>
                  {doc.sections.map((s,i)=><tr key={i}><td>{['FABRIC','CUT TO PACK + O.H','WASHING','TRIMS & ACCESSORIES','EMBELLISHMENT'][i]||s.name.toUpperCase()}</td><td>{money(calculated.groups[i])}</td><td>{calculated.manufacturing?((calculated.groups[i]/calculated.manufacturing)*100).toFixed(2)+'%':'—'}</td></tr>)}
                  {[['TESTING CHARGES',doc.testing],['SHIPPING CHARGES',doc.shipping],['BANKING CHARGES',doc.banking],['STR REDUCTION',doc.str_adjustment]].map(([k,v])=><tr key={k}><td>{k}</td><td>{money(v)}</td><td>{calculated.manufacturing?((num(v)/calculated.manufacturing)*100).toFixed(2)+'%':'—'}</td></tr>)}
                  <tr className="cr-rule"><td>REJECTION MARGIN</td><td></td><td>{money(doc.rejection_pct)}%</td></tr>
                  <tr className="cr-highlight"><td>MANUFACTURING COST</td><td>{money(calculated.manufacturing)}</td><td></td></tr>
                  <tr><td>IN {doc.quote_currency}</td><td>{symbol[doc.quote_currency]}{money(calculated.usd)}</td><td></td></tr>
                  <tr className="cr-rule"><td>NIZAMIA'S PROFIT</td><td>{symbol[doc.quote_currency]}{money(calculated.profit)}</td><td>{money(doc.profit_pct)}%</td></tr>
                  <tr><td>AGENCY %</td><td>{symbol[doc.quote_currency]}{money(calculated.agency)}</td><td>{money(doc.agency_pct)}%</td></tr>
                </tbody>
              </table>
              <table className="cr-comparison"><thead><tr><th>FTY COST</th><th>TARGET</th><th>FOB - KHI</th></tr></thead>
                <tbody><tr><td>Rs. {money(calculated.manufacturing)}<div>{symbol[doc.quote_currency]}{money(calculated.usd)}</div></td><td>{symbol[doc.quote_currency]}{money(doc.target_price)}</td><td>{symbol[doc.quote_currency]}{money(calculated.fob)}</td></tr></tbody>
              </table>
              <div className="cr-difference"><span>DIFFERENCE</span><span>{calculated.difference>0?'+':''}{symbol[doc.quote_currency]}{money(calculated.difference)} | Rs. {money(calculated.difference*(num(doc.rates?.[doc.quote_currency])||num(doc.exchange_rate)||1))} | {calculated.differencePct===null?'—':(calculated.differencePct>0?'+':'')+calculated.differencePct.toFixed(2)+'%'}</span></div>
            </div>
            <div className="cr-history"><div className="cr-history-title">VERSION HISTORY</div>
              {history.map(h=><div className="cr-history-entry" key={h.version}><span>V{h.version}</span><span>{new Date(h.created_at).toLocaleString('en-GB')}</span></div>)}
              {current&&<div className="cr-history-entry"><span>V{current.version} (Current)</span><span>{new Date(current.updated_at).toLocaleString('en-GB')}</span></div>}
            </div>
          </div>
        </div>
      </div>
      {historyOpen&&<div className="costing-no-print" style={{position:'fixed',inset:0,background:'#0006',display:'grid',placeItems:'center',zIndex:1200}}><div style={{background:'#fff',borderRadius:10,padding:20,width:430,maxHeight:'80vh',overflow:'auto'}}><div style={{display:'flex',justifyContent:'space-between'}}><strong>Edit History</strong><button style={btn} onClick={()=>setHistoryOpen(false)}>Close</button></div>{history.map(h=><div key={h.version} style={{padding:10,borderBottom:'1px solid #eee',display:'flex',justifyContent:'space-between'}}><span>V{h.version} · {new Date(h.created_at).toLocaleString()}</span><button style={btn} onClick={()=>{setDoc(structuredClone(h.document));setViewingVersion(h.version);setHistoryOpen(false);setError('Viewing a read-only historical snapshot. Use Return to Latest to edit.')}}>View</button></div>)}<div style={{padding:10}}>Current: V{current?.version}</div></div></div>}
    </>}
  </div>
}
