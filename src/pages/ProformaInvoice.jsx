import React,{useEffect,useMemo,useState} from 'react'
import {supabase} from '../lib/supabase'
import {openPrintWindow} from '../components/PrintReports'

const TERMS = `1. This proforma invoice is an offer subject to the buyer's written acceptance and confirmation of all specifications, quantities, prices, delivery dates and payment terms.
2. Production lead time starts only after timely receipt of all required purchase orders, approvals, materials, artwork and payment/security arrangements agreed in writing. Buyer delays may require a revised shipment date.
3. Any change to specifications, quantity, delivery schedule or packaging after acceptance requires written agreement and may result in additional charges and revised delivery dates.
4. Cancellation after acceptance is subject to reimbursement of reasonable, documented non-recoverable costs and committed materials, subject to applicable law and the parties' written agreement.
5. Quantity and shipment tolerances apply only where expressly agreed in writing. No automatic over/under tolerance is assumed.
6. Inspection, quality claims and remedies shall follow the mutually agreed inspection protocol. The buyer shall provide prompt written notice and supporting evidence of any claimed defect.
7. Freight, insurance, customs clearance, taxes, title and risk of loss are governed by the Incoterms rule and named place agreed in this document.
8. Overdue payment, banking charges, force majeure, governing law and dispute resolution are subject to the parties' separately agreed written terms. No unilateral penalty is implied.
9. The attached detailed order schedule, if any, forms part of this proforma invoice. Any conflict must be resolved in writing before acceptance.`
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))
const money=(n,c)=>new Intl.NumberFormat('en-US',{style:'currency',currency:c||'USD'}).format(Number(n)||0)
const day=v=>v?String(v).slice(0,10):'—'
const today=()=>new Date().toISOString().slice(0,10)
const field={padding:'9px 10px',border:'1px solid #d5d9e2',borderRadius:7,width:'100%',boxSizing:'border-box',fontSize:12}
const label={fontSize:11,fontWeight:700,color:'#475569',display:'block',marginBottom:5}
export default function ProformaInvoice({onBack}){
 const [buyers,setBuyers]=useState([]),[orders,setOrders]=useState([]),[loading,setLoading]=useState(true),[error,setError]=useState('')
 const [buyerId,setBuyerId]=useState(''),[selected,setSelected]=useState([]),[query,setQuery]=useState(''),[manual,setManual]=useState([]),[savedLines,setSavedLines]=useState(null)
 const [invoices,setInvoices]=useState([]),[invoice,setInvoice]=useState(null),[history,setHistory]=useState([]),[busy,setBusy]=useState(false)
 const [emailFrom,setEmailFrom]=useState(''),[emailDate,setEmailDate]=useState(''),[emailReference,setEmailReference]=useState('')
 const [form,setForm]=useState({number:'',date:today(),seller:'Nizamia Apparels',sellerAddress:'Karachi, Pakistan',buyerAddress:'',paymentTerms:'',shipmentDate:'',shipMode:'SEA',incoterms:'FOB',portLoading:'Karachi, Pakistan',portDischarge:'',currency:'USD',terms:TERMS,remarks:'',acceptance:'Awaiting buyer email acceptance'})
 const change=(k,v)=>setForm(f=>({...f,[k]:v}))
 useEffect(()=>{let alive=true;(async()=>{try{const [b,o]=await Promise.all([supabase.from('buyers').select('id,name,address,country,currency,payment_terms_days').order('name'),supabase.from('orders').select('id,buyer_id,buyer_name,job_number,po_number,style_number,description,total_qty,total_value_usd,ship_date,currency,incoterms,ship_mode,po_date').order('created_at',{ascending:false}).limit(3000)]);if(b.error)throw b.error;if(o.error)throw o.error;if(alive){setBuyers(b.data||[]);setOrders(o.data||[])}}catch(e){if(alive)setError(e.message)}finally{if(alive)setLoading(false)}})();return()=>{alive=false}},[])
 const buyer=buyers.find(x=>x.id===buyerId)
 const available=useMemo(()=>orders.filter(o=>buyer&&(o.buyer_id===buyerId||(!o.buyer_id&&o.buyer_name?.trim().toLowerCase()===buyer.name?.trim().toLowerCase()))),[orders,buyer,buyerId])
 const chosen=savedLines||[...available.filter(o=>selected.includes(o.id)),...manual.filter(o=>o.style_number||o.po_number||o.job_number).map(o=>({...o,id:o.id||'manual',total_qty:Number(o.total_qty)||0,total_value_usd:(Number(o.total_qty)||0)*(Number(o.unit_price)||0),currency:form.currency}))]
 const filtered=available.filter(o=>[o.job_number,o.po_number,o.style_number,o.description].some(x=>String(x||'').toLowerCase().includes(query.toLowerCase())))
 const currencySet=[...new Set(chosen.map(o=>o.currency||'USD'))]
 const currency=currencySet.length===1?currencySet[0]:form.currency
 const totalQty=chosen.reduce((s,o)=>s+(Number(o.total_qty)||0),0)
 const totalValue=chosen.reduce((s,o)=>s+(Number(o.total_value_usd)||0),0)
 const updateBuyer=id=>{setBuyerId(id);setSelected([]);setManual([]);setSavedLines(null);const b=buyers.find(x=>x.id===id);setForm(f=>({...f,buyerAddress:b?.address||'',currency:b?.currency||'USD',paymentTerms:b?.payment_terms_days!=null?'Net '+b.payment_terms_days+' days':''}))}
 const toggle=id=>{setSavedLines(null);setSelected(a=>a.includes(id)?a.filter(x=>x!==id):[...a,id])}
 const api=async(action,payload,method='POST')=>{
   const url='/api/oms?action='+encodeURIComponent(action)+(method==='GET'&&payload?.id?'&id='+encodeURIComponent(payload.id):'')
   const r=await fetch(url,{method,credentials:'same-origin',headers:{'Content-Type':'application/json'},...(method==='POST'?{body:JSON.stringify({action,...payload})}:{})})
   const data=await r.json();if(!r.ok)throw Error(data.error||'Request failed');return data
 }
 const refresh=async()=>{try{const data=await api('listProformas',{},'GET');setInvoices(data.invoices||[])}catch(e){setError(e.message)}}
 useEffect(()=>{refresh()},[])
 const loadInvoice=async id=>{
   try{setBusy(true);setError('');const data=await api('getProforma',{id},'GET');const snap=data.invoice.snapshot
   setInvoice(data.invoice);setHistory(data.history||[]);setBuyerId(snap.buyer?.id||'');setForm(snap.form);setSavedLines(snap.lines||[]);setSelected([]);setManual([])
   setEmailFrom(data.invoice.acceptance_email_from||'');setEmailDate(data.invoice.acceptance_email_date?.slice(0,10)||'');setEmailReference(data.invoice.acceptance_email_reference||'')
   }catch(e){setError(e.message)}finally{setBusy(false)}
 }
 const save=async()=>{
   if(!buyer||!chosen.length||!form.number.trim()||!form.paymentTerms.trim()||!form.shipmentDate||!form.terms.trim())return alert('Customer, lines, PI number, payment, shipment date and terms are required.')
   if(currencySet.length>1)return alert('Use one currency per PI.')
   if(chosen.some(o=>!(Number(o.total_qty)>0)||Number(o.total_value_usd)<0))return alert('Check line quantities and values.')
   try{setBusy(true);setError('')
     const snapshot={buyer:{id:buyer.id,name:buyer.name},form:{...form},lines:chosen.map(o=>({id:o.id,po_number:o.po_number,job_number:o.job_number,style_number:o.style_number,description:o.description,total_qty:Number(o.total_qty),total_value_usd:Number(o.total_value_usd),currency:o.currency||currency})),currency}
     const data=await api('saveProforma',{id:invoice?.id,revision:invoice?.revision,piNumber:form.number,snapshot})
     setInvoice(data.invoice);setSavedLines(snapshot.lines);await refresh();alert('Draft saved, revision '+data.invoice.revision)
   }catch(e){setError(e.message)}finally{setBusy(false)}
 }
 const transition=async status=>{
   if(!invoice)return alert('Save the draft first.')
   if(status==='issued'&&!window.confirm('Issue this PI and lock its commercial details?'))return
   if(status==='cancelled'&&!window.confirm('Cancel this issued PI?'))return
   try{setBusy(true);setError('');const data=await api('transitionProforma',{id:invoice.id,revision:invoice.revision,status,emailFrom,emailDate,emailReference})
     setInvoice(data.invoice);await refresh();await loadInvoice(data.invoice.id)
   }catch(e){setError(e.message)}finally{setBusy(false)}
 }
 const newInvoice=()=>{setInvoice(null);setHistory([]);setBuyerId('');setSelected([]);setManual([]);setSavedLines(null);setForm({number:'',date:today(),seller:'Nizamia Apparels',sellerAddress:'Karachi, Pakistan',buyerAddress:'',paymentTerms:'',shipmentDate:'',shipMode:'SEA',incoterms:'FOB',portLoading:'Karachi, Pakistan',portDischarge:'',currency:'USD',terms:TERMS,remarks:'',acceptance:'Awaiting buyer email acceptance'})}
 const locked=!!invoice&&invoice.status!=='draft'
 const generate=()=>{
  if(!buyer||!chosen.length)return alert('Select a customer and at least one order or manual PI line.')
  if(currencySet.length>1)return alert('Selected orders use different currencies. Create separate proforma invoices.')
  if(!form.number.trim())return alert('Enter a unique PI number before printing.')
  if(!form.paymentTerms.trim())return alert('Enter agreed payment terms.')
  if(!form.shipmentDate)return alert('Confirm the proposed shipment date.')
  const w=openPrintWindow();if(!w)return
  const rows=chosen.map(o=>`<tr><td>${esc(o.po_number||'—')}</td><td>${esc(o.job_number||'—')}</td><td>${esc(o.style_number||'—')}</td><td>${esc(o.description||'')}</td><td class="num">${Number(o.total_qty||0).toLocaleString()}</td><td class="num">${money(o.total_value_usd,currency)}</td></tr>`).join('')
  const summary=[...new Map(chosen.map(o=>[o.po_number||o.job_number||o.id,1])).keys()].join(', ')
  const detail=chosen.length>4
  const html=`<!doctype html><html><head><meta charset="utf-8"/><title>${esc(form.number)} - Proforma Invoice</title><style>
  @page{size:A4 portrait;margin:13mm}*{box-sizing:border-box}body{font:10px Arial,sans-serif;color:#172033;margin:0}h1{font-size:20px;margin:0}h2{font-size:12px;margin:0 0 9px}p{margin:4px 0}header{display:flex;justify-content:space-between;align-items:start;border-bottom:2px solid #1e293b;padding-bottom:10px;margin-bottom:13px}.right{text-align:right}.grid{display:grid;grid-template-columns:1fr 1fr;gap:10px}.panel{border:1px solid #b7c1ce;padding:10px;min-height:70px}.k{color:#64748b;font-size:9px;text-transform:uppercase;font-weight:bold}.v{font-size:11px;margin:3px 0 7px;white-space:pre-wrap}.meta{display:grid;grid-template-columns:repeat(3,1fr);gap:7px;margin:12px 0}.meta>div{border-bottom:1px solid #d9dfe7;padding-bottom:4px}table{border-collapse:collapse;width:100%;font-size:9px;margin-top:9px}th,td{border:1px solid #b7c1ce;padding:6px;text-align:left;vertical-align:top}th{background:#eef2f7}.num{text-align:right;white-space:nowrap}.total{font-size:13px;font-weight:bold;text-align:right;padding:10px 0}.terms{white-space:pre-wrap;line-height:1.45;font-size:9px}.sign{display:flex;justify-content:space-between;border-top:1px solid #b7c1ce;padding-top:10px;margin-top:15px}.note{padding:8px;background:#f1f5f9;margin-top:10px;font-weight:bold}.annex{break-before:page;page-break-before:always}.keep{break-inside:avoid}.foot{margin-top:10px;font-size:9px;color:#64748b}@media print{.annex{break-before:page;page-break-before:always}tr{break-inside:avoid}}
  </style></head><body><header><div><h1>Nizamia</h1><p>PROFORMA INVOICE · SALES CONFIRMATION</p></div><div class="right"><b>${esc(form.number)}</b><p>Issued: ${esc(day(form.date))}</p><p>Status: ${esc(form.acceptance)}</p></div></header>
  <div class="grid"><div class="panel"><div class="k">Seller / Shipper</div><div class="v"><b>${esc(form.seller)}</b><br/>${esc(form.sellerAddress)}</div></div><div class="panel"><div class="k">Buyer / Customer</div><div class="v"><b>${esc(buyer.name)}</b><br/>${esc(form.buyerAddress)}</div></div></div>
  <div class="meta">${[['Payment terms',form.paymentTerms],['Shipment date',day(form.shipmentDate)],['Shipment mode',form.shipMode],['Incoterms',form.incoterms],['Port of loading',form.portLoading],['Port of discharge',form.portDischarge||'—']].map(([a,b])=>`<div><div class="k">${esc(a)}</div><div class="v">${esc(b)}</div></div>`).join('')}</div>
  <h2>ORDER CONFIRMATION SUMMARY</h2><p>PO / Job references: ${esc(summary)}</p>
  ${detail?`<table><thead><tr><th>PO Number</th><th>Job Number</th><th>Styles</th><th>Quantity</th><th>Value</th></tr></thead><tbody>${Object.values(chosen.reduce((a,o)=>{const key=o.po_number||o.job_number||o.id;if(!a[key])a[key]={po:o.po_number,job:o.job_number,styles:new Set(),qty:0,value:0};a[key].styles.add(o.style_number||'—');a[key].qty+=Number(o.total_qty)||0;a[key].value+=Number(o.total_value_usd)||0;return a},{})).slice(0,5).map(o=>`<tr><td>${esc(o.po||'—')}</td><td>${esc(o.job||'—')}</td><td>${esc([...o.styles].join(', '))}</td><td class="num">${o.qty.toLocaleString()}</td><td class="num">${money(o.value,currency)}</td></tr>`).join('')}</tbody></table><div class="note">Summary displays up to five PO groups. See Annexure A on the following pages for all PO/job/style details. Annexure A forms part of this proforma invoice.</div>`:`<table><thead><tr><th>Customer PO</th><th>Job</th><th>Style</th><th>Description</th><th>Qty</th><th>Value</th></tr></thead><tbody>${rows}</tbody></table>`}
  <div class="total">TOTAL: ${totalQty.toLocaleString()} PCS · ${money(totalValue,currency)}</div>
  ${form.remarks?`<p><b>Special conditions:</b> ${esc(form.remarks)}</p>`:''}
  <h2>STANDARD COMMERCIAL TERMS & CONDITIONS</h2><div class="terms">${esc(form.terms)}</div>
  <div class="sign"><div>For ${esc(form.seller)}<p>Authorised by: __________________</p></div><div>Buyer acceptance: <b>Written email confirmation</b><p>Record acceptance email separately.</p></div></div>
  <div class="foot">This proforma invoice is not a customs or final commercial invoice. Terms are subject to legal review and mutual written acceptance.</div>
  ${detail?`<section class="annex"><header><h2>ANNEXURE A — DETAILED ORDER SCHEDULE</h2><div>${esc(form.number)}</div></header><table><thead><tr><th>PO</th><th>Job</th><th>Style</th><th>Description</th><th>Qty</th><th>Value</th></tr></thead><tbody>${rows}</tbody></table><div class="total">TOTAL: ${totalQty.toLocaleString()} PCS · ${money(totalValue,currency)}</div></section>`:''}
  </body></html>`
  w.document.open();w.document.write(html);w.document.close();setTimeout(()=>{try{w.focus();w.print()}catch(e){alert('Print preview unavailable: '+e.message)}},350)
 }
 return <div style={{padding:24,maxWidth:1200,margin:'0 auto'}}>
 <button onClick={onBack} style={{...field,width:'auto',cursor:'pointer',marginBottom:14}}>← All Reports</button>
 <h2 style={{margin:'0 0 5px'}}>Proforma Invoice & Sales Confirmation</h2>
 <div style={{display:'flex',gap:10,alignItems:'center',margin:'12px 0',flexWrap:'wrap'}}><button onClick={newInvoice} style={{...field,width:'auto',cursor:'pointer'}}>+ New PI</button><select style={{...field,width:340}} value={invoice?.id||''} onChange={e=>e.target.value?loadInvoice(e.target.value):newInvoice()}><option value=''>New / unsaved PI</option>{invoices.map(x=><option key={x.id} value={x.id}>{x.pi_number} · {x.status.toUpperCase()} · Rev {x.revision}</option>)}</select>{invoice&&<b style={{fontSize:12}}>Status: {invoice.status.toUpperCase()} · Revision {invoice.revision}</b>}</div><p style={{fontSize:12,color:'#64748b'}}>Create before or after order entry. Select one or more customer POs or jobs, review terms, then print to A4 PDF. Draft preparation does not create an order.</p>
 {error&&<p style={{color:'#b91c1c'}}>{error}</p>}
 <fieldset disabled={locked||busy} style={{border:0,padding:0,margin:0}}><div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:18,marginTop:18}}>
 <section style={{background:'#fff',border:'1px solid #e2e8f0',borderRadius:10,padding:18}}>
 <h3>1. Customer and order selection</h3>
 <label style={label}>Customer</label><select style={field} value={buyerId} onChange={e=>updateBuyer(e.target.value)}><option value="">Select customer</option>{buyers.map(b=><option key={b.id} value={b.id}>{b.name}</option>)}</select>
 <p style={{fontSize:11,color:'#64748b'}}>Select existing orders, or add manual lines for a PI before an order is created.</p>
 <input style={{...field,margin:'10px 0'}} placeholder="Search PO, job, style..." value={query} onChange={e=>setQuery(e.target.value)}/>
 <div style={{maxHeight:280,overflow:'auto'}}>{loading?'Loading orders…':filtered.map(o=><label key={o.id} style={{display:'flex',gap:9,padding:'8px 3px',borderBottom:'1px solid #f1f5f9',fontSize:11}}><input type="checkbox" checked={selected.includes(o.id)} onChange={()=>toggle(o.id)}/><span><b>{o.po_number||'No PO'} · {o.job_number||'No job'}</b><br/>{o.style_number} · {Number(o.total_qty||0).toLocaleString()} pcs · {money(o.total_value_usd,o.currency||'USD')}</span></label>)}</div>
 <button type='button' style={{...field,width:'auto',cursor:'pointer',marginTop:12}} onClick={()=>setManual(v=>[...v,{id:'manual-'+(v.length+1),po_number:'',job_number:'',style_number:'',description:'',total_qty:'',unit_price:''}])}>+ Add pre-order PI line</button>
 {manual.map((o,i)=><div key={o.id} style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:6,marginTop:9,padding:9,background:'#f8fafc',borderRadius:7}}>{[['po_number','Customer PO'],['job_number','Job #'],['style_number','Style'],['description','Description'],['total_qty','Quantity'],['unit_price','Unit Price']].map(([k,l])=><label key={k} style={label}>{l}<input style={field} value={o[k]} type={k==='total_qty'||k==='unit_price'?'number':'text'} min={k==='total_qty'||k==='unit_price'?0:undefined} onChange={e=>setManual(v=>v.map((x,j)=>j===i?{...x,[k]:e.target.value}:x))}/></label>)}<button type='button' onClick={()=>setManual(v=>v.filter((_,j)=>j!==i))}>Remove line</button></div>)}
 <p style={{fontSize:12,fontWeight:700}}>Selected: {chosen.length} records · {totalQty.toLocaleString()} pcs · {money(totalValue,currency)}</p>
 {currencySet.length>1&&<p style={{color:'#b91c1c',fontSize:12}}>Mixed currencies detected. Separate the invoices.</p>}
 </section>
 <section style={{background:'#fff',border:'1px solid #e2e8f0',borderRadius:10,padding:18}}>
 <h3>2. Invoice and shipping details</h3>
 <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12}}>{[['number','PI Number'],['date','Issue Date'],['seller','Shipper / Seller'],['paymentTerms','Payment Terms'],['shipmentDate','Shipment Date'],['shipMode','Shipment Mode'],['incoterms','Incoterms'],['portLoading','Port of Loading'],['portDischarge','Port of Discharge']].map(([k,title])=><div key={k}><label style={label}>{title}</label><input style={field} type={k==='date'||k==='shipmentDate'?'date':'text'} value={form[k]} onChange={e=>change(k,e.target.value)}/></div>)}</div>
 <label style={{...label,marginTop:12}}>Seller address</label><textarea style={field} rows={2} value={form.sellerAddress} onChange={e=>change('sellerAddress',e.target.value)}/>
 <label style={{...label,marginTop:12}}>Buyer address</label><textarea style={field} rows={2} value={form.buyerAddress} onChange={e=>change('buyerAddress',e.target.value)}/>
 </section>
 </div>
 <section style={{background:'#fff',border:'1px solid #e2e8f0',borderRadius:10,padding:18,marginTop:18}}>
 <h3>3. Standard terms — editable per invoice</h3><textarea style={{...field,lineHeight:1.5}} rows={12} value={form.terms} onChange={e=>change('terms',e.target.value)}/>
 <label style={{...label,marginTop:12}}>Special conditions / remarks</label><textarea style={field} rows={2} value={form.remarks} onChange={e=>change('remarks',e.target.value)}/>
 <p style={{fontSize:11,color:'#92400e'}}>Terms are a working commercial template, not legal advice. Have them reviewed before issuing to customers. Acceptance is by email, not an assumed signature.</p>
 </section>
 </fieldset>
 <div style={{display:'flex',gap:9,flexWrap:'wrap',marginTop:14}}><button disabled={locked||busy} onClick={save} style={{background:'#171b30',color:'#fff',border:0,borderRadius:7,padding:'11px 18px',fontWeight:700,cursor:'pointer'}}>Save Draft</button><button onClick={generate} style={{background:'#fff',border:'1px solid #94a3b8',borderRadius:7,padding:'11px 18px',cursor:'pointer'}}>Preview / Print A4 PDF</button>{invoice?.status==='draft'&&<button disabled={busy} onClick={()=>transition('issued')} style={{...field,width:'auto',cursor:'pointer'}}>Issue PI</button>}{invoice?.status==='issued'&&<button disabled={busy} onClick={()=>transition('cancelled')} style={{...field,width:'auto',cursor:'pointer'}}>Cancel PI</button>}</div>
 {invoice?.status==='issued'&&<div style={{marginTop:16,padding:14,border:'1px solid #cbd5e1',borderRadius:8}}><h3>Record buyer acceptance by email</h3><div style={{display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:9}}><label style={label}>Sender email<input style={field} value={emailFrom} onChange={e=>setEmailFrom(e.target.value)} placeholder='buyer@example.com'/></label><label style={label}>Acceptance date<input style={field} type='date' value={emailDate} onChange={e=>setEmailDate(e.target.value)}/></label><label style={label}>Email subject / reference<input style={field} value={emailReference} onChange={e=>setEmailReference(e.target.value)}/></label></div><button disabled={busy} onClick={()=>transition('accepted')} style={{...field,width:'auto',cursor:'pointer',marginTop:10}}>Mark Accepted</button><p style={{fontSize:11,color:'#64748b'}}>This records acceptance evidence manually. It does not send or verify the email.</p></div>}
 {!!history.length&&<div style={{marginTop:15,fontSize:11,color:'#64748b'}}>Revision history: {history.map(h=>`Rev ${h.revision} ${h.action} (${new Date(h.created_at).toLocaleString()})`).join(' · ')}</div>}
 </div>
}
