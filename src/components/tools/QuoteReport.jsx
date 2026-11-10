import React,{useMemo,useState} from 'react'
import * as XLSX from 'xlsx'

const terms=[
'This quotation is valid for 30 days from the date of issue and is subject to re-confirmation thereafter.',
'Prices are based on provided tech packs and approved specs, with minor adjustments welcomed prior to PP sample approval subject to pricing updates.',
'Target delivery lead times commence upon receipt of the advance deposit, lab dips, and trim approvals.',
'Standard industry variance of +/- 3% on final shipped quantity and dimensions applies.',
'Sampling and proto-development costs are credited back upon final bulk order confirmation.',
'Prices are quoted net of overseas banking charges unless agreed under specific Incoterms.',
'Payment terms follow the agreed schedule specified on the quotation invoice.'
]
const defaults={payment:'10 Days before Vessel ETA',testing:'NONE',inspection:'On buyers account',nominations:'NONE',incoterms:'FOB',trims:'All Local',destinations:'03',lead:'90 DAYS FROM PO'}
const money=(n,c)=>new Intl.NumberFormat('en-US',{style:'currency',currency:c||'USD'}).format(Number(n)||0)
const btn={border:'1px solid #cbd5e1',background:'#fff',borderRadius:7,padding:'8px 12px',cursor:'pointer'}
const input={border:'1px solid #cbd5e1',borderRadius:5,padding:'7px 9px',width:'100%',boxSizing:'border-box',fontSize:12}
export default function QuoteReport({rows,batches,totals,onClose}){
 const batchIds=[...new Set(rows.map(r=>r.batch_id||''))]
 const currencies=[...new Set(rows.map(r=>r.document?.quote_currency||'USD'))]
 const customers=[...new Set(rows.map(r=>(r.customer||'').trim().toLowerCase()))]
 const valid=batchIds.length===1&&!!batchIds[0]&&currencies.length===1&&customers.length===1
 const currency=currencies[0]||'USD'
 const batch=batches.find(b=>b.id===batchIds[0])
 const [details,setDetails]=useState(defaults)
 const [seller,setSeller]=useState('Nizamia Apparels\nRCC14, SHED NR 2, ESTATE AVENUE ROAD,\nSITE INDUSTRIAL AREA, KARACHI 75700, PAKISTAN')
 const [buyer,setBuyer]=useState(rows[0]?.customer||'')
 const [quoteNo,setQuoteNo]=useState('')
 const [accepted,setAccepted]=useState({})
 const [prices,setPrices]=useState({})
 const [conditions,setConditions]=useState(terms)
 const [issued,setIssued]=useState(new Date().toISOString().slice(0,10))
 const items=useMemo(()=>rows.map((r,i)=>{const d=r.document||{};return {ref:i+1,id:r.reference,style:r.style||d.style||'',description:d.description||d.item_description||'',qty:Number(d.quantity)||0,target:Number(d.target_price)||0,price:prices[r.id]??totals(d).fob,accepted:accepted[r.id]??'' ,key:r.id}}),[rows,prices,accepted,totals])
 function exportExcel(){
  const aoa=[['Nizamia Apparels','','','','','QUOTATION',quoteNo],['Batch ID',batch?.name||'','Date',issued],[],['SELLER / SHIPPER / FACTORY',seller,'BUYER / CUSTOMER',buyer],[],['PAYMENT TERMS',details.payment,'TESTING',details.testing,'INSPECTION',details.inspection,'NOMINATIONS',details.nominations],['INCOTERMS',details.incoterms,'TRIMS',details.trims,'SHIP DESTINATIONS',details.destinations,'EST LEAD TIME',details.lead],[],['COSTING TABLE — All prices based on terms stated above'],['REF#','Costing ID','Style Number','Item Description','Est.Qty','Target','Price '+currency,'Accepted Price'],...items.map(x=>[x.ref,x.id,x.style,x.description,x.qty,x.target,Number(x.price),x.accepted===''?'':Number(x.accepted)]),[],['STANDARD COMMERCIAL TERMS & CONDITIONS'],...conditions.map(x=>['• '+x])]
  const ws=XLSX.utils.aoa_to_sheet(aoa);ws['!cols']=[{wch:8},{wch:22},{wch:20},{wch:38},{wch:14},{wch:14},{wch:16},{wch:18}]
  const head=aoa.findIndex(r=>r[0]==='REF#')
  for(let i=head+1;i<head+1+items.length;i++){for(let j of [4,5,6,7]){const cell=ws[XLSX.utils.encode_cell({r:i,c:j})];if(cell&&cell.t==='n')cell.z=j===4?'#,##0':'#,##0.00'}}
  XLSX.writeFile(XLSX.utils.book_append_sheet(XLSX.utils.book_new(),ws,'Quotation')||(()=>{const w=XLSX.utils.book_new();XLSX.utils.book_append_sheet(w,ws,'Quotation');return w})(),(quoteNo||'Quotation')+'.xlsx')
 }
 function print(){window.print()}
 if(!valid)return <div style={{padding:30}}><h2>Quotation requires one batch, one customer and one quote currency</h2><p>Select costings assigned to the same batch and customer, all using the same currency.</p><button style={btn} onClick={onClose}>Back</button></div>
 return <div className="quote-report-shell" style={{position:'fixed',inset:0,zIndex:10000,background:'#f4f5f7',overflow:'auto',fontFamily:'Arial,sans-serif'}}>
 <style>{`@page{size:A4 portrait;margin:19.05mm 6.35mm 19.05mm 6.35mm}@media print{body *{visibility:hidden!important}.quote-report-page,.quote-report-page *{visibility:visible!important}.quote-report-page{position:absolute!important;left:0!important;top:0!important;width:100%!important;box-shadow:none!important;margin:0!important;padding:0!important}.quote-report-toolbar,.quote-report-editor{display:none!important}.quote-report-shell{position:static!important;overflow:visible!important;background:white!important}.quote-report-table thead{display:table-header-group}.quote-report-table tr{break-inside:avoid}.quote-report-terms{break-inside:avoid}}.quote-report-page table{border-collapse:collapse;width:100%}.quote-report-page td,.quote-report-page th{border:1px solid #252525;padding:5px 6px;font-size:10px;vertical-align:top}.quote-report-page th{background:#e5e7eb}.quote-report-page .quote-small-label{font-size:9px;font-weight:700}.quote-report-page .quote-report-terms{margin-top:30px;border-top:2px solid #222;border-bottom:2px solid #222;padding:9px 0;font-size:10px;line-height:1.45}`}</style>
 <div className="quote-report-toolbar" style={{position:'sticky',top:0,zIndex:2,background:'white',padding:'12px 22px',display:'flex',alignItems:'center',gap:10,borderBottom:'1px solid #ddd'}}><strong style={{marginRight:'auto'}}>Quotation · {batch?.name||''}</strong><button style={btn} onClick={onClose}>Close</button><button style={btn} onClick={exportExcel}>Export Excel</button><button style={{...btn,background:'#111',color:'white'}} onClick={print}>Print / PDF</button></div>
 <div style={{display:'flex',gap:20,alignItems:'flex-start',padding:20,flexWrap:'wrap',justifyContent:'center'}}>
 <div className="quote-report-editor" style={{width:300,background:'white',padding:16,border:'1px solid #ddd',borderRadius:8,display:'grid',gap:9}}>
 <strong>Quotation details</strong><label>Quotation No. <input style={input} value={quoteNo} onChange={e=>setQuoteNo(e.target.value)} placeholder="Enter quotation reference"/></label><label>Date <input type="date" style={input} value={issued} onChange={e=>setIssued(e.target.value)}/></label><label>Seller / Factory<textarea style={input} rows={3} value={seller} onChange={e=>setSeller(e.target.value)}/></label><label>Buyer / Customer<textarea style={input} rows={3} value={buyer} onChange={e=>setBuyer(e.target.value)}/></label>
 {Object.entries({payment:'Payment Terms',testing:'Testing',inspection:'Inspection',nominations:'Nominations',incoterms:'Incoterms',trims:'Trims',destinations:'Ship Destinations',lead:'Est Lead Time'}).map(([k,v])=><label key={k}>{v}<input style={input} value={details[k]} onChange={e=>setDetails(d=>({...d,[k]:e.target.value}))}/></label>)}
 <strong>Costing lines · {currency}</strong>{items.map(x=><div key={x.key} style={{borderTop:'1px solid #eee',paddingTop:6}}><div>{x.id} · {x.style}</div><label>Quote price <input type="number" step=".01" style={input} value={x.price} onChange={e=>setPrices(p=>({...p,[x.key]:e.target.value}))}/></label><div style={{fontSize:11,color:'#667085'}}>Accepted Price intentionally blank on report</div></div>)}
 <strong>Commercial terms</strong>{conditions.map((v,i)=><textarea key={i} style={input} rows={2} value={v} onChange={e=>setConditions(a=>a.map((t,j)=>j===i?e.target.value:t))}/>)}
 </div>
 <div className="quote-report-page" style={{width:794,minHeight:1123,boxSizing:'border-box',background:'white',padding:'70px 24px',boxShadow:'0 3px 15px #0002',fontSize:11,display:'flex',flexDirection:'column'}}>
 <header style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',borderBottom:'2px solid #111',paddingBottom:12,marginBottom:12}}><strong style={{fontSize:18}}>Nizamia Apparels</strong><div style={{textAlign:'right'}}><strong>{quoteNo||'DRAFT QUOTATION'}</strong><div>Batch ID: {batch?.name}</div><div>{new Date(issued+'T12:00:00').toLocaleDateString('en-GB',{day:'2-digit',month:'long',year:'numeric'}).toUpperCase()}</div></div></header>
 <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:6,marginBottom:8}}>{[['SELLER / SHIPPER / FACTORY',seller],['BUYER / CUSTOMER',buyer]].map(([label,value])=><div key={label} style={{border:'1px solid #cbd5e1',padding:11,minHeight:58}}><div className="quote-small-label">{label}</div><div style={{whiteSpace:'pre-line',marginTop:4}}>{value}</div></div>)}</div>
 <div style={{border:'1px solid #cbd5e1',padding:12,display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:'18px 12px',marginBottom:18}}>{Object.entries({payment:'PAYMENT TERMS',testing:'TESTING',inspection:'INSPECTION',nominations:'NOMINATIONS',incoterms:'INCOTERMS',trims:'TRIMS',destinations:'SHIP DESTINATIONS',lead:'EST LEAD TIME'}).map(([k,v])=><div key={k}><div className="quote-small-label">{v}</div><div style={{marginTop:4}}>{details[k]}</div></div>)}</div>
 <div style={{display:'flex',justifyContent:'space-between',marginBottom:8,alignItems:'center'}}><strong style={{fontSize:13}}>COSTING TABLE</strong><span style={{fontSize:10}}>▲ All Prices are based on terms stated above</span></div>
 <table className="quote-report-table"><thead><tr>{['REF#','Costing ID','Style Number','Item Description','Est.Qty','Target','Price '+currency,'Accepted Price'].map(h=><th key={h}>{h}</th>)}</tr></thead><tbody>{items.map(x=><tr key={x.key}><td>{x.ref}</td><td>{x.id}</td><td>{x.style}</td><td>{x.description}</td><td style={{textAlign:'right'}}>{x.qty.toLocaleString('en-US')}</td><td style={{textAlign:'right'}}>{money(x.target,currency)}</td><td style={{textAlign:'right'}}>{money(x.price,currency)}</td><td></td></tr>)}</tbody></table>
 <div style={{flex:1,minHeight:55}}/>
 <div className="quote-report-terms"><strong>STANDARD COMMERCIAL TERMS & CONDITIONS</strong>{conditions.map((t,i)=><div key={i}>*{t}</div>)}</div>
 </div></div></div>
}
