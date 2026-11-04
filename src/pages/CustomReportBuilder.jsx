import React,{useEffect,useMemo,useState} from 'react'
import * as XLSX from 'xlsx'
import {useNavigate} from 'react-router-dom'
import {ArrowLeft,Plus,Eye,FileSpreadsheet,Printer,Search,RefreshCw,Save,Trash2,ChevronLeft,ChevronRight} from 'lucide-react'
import {supabase} from '../lib/supabase'
import {printHTML} from '../components/PrintReports'

const FIELDS=[['style_number','Style #'],['picture','Picture'],['buyer_name','Buyer'],['job_number','Job #'],['po_number','PO #'],['store_name','Store'],['description','Description'],['wash','Wash / Colour'],['size_group','Size Group'],['size','Size Breakdown'],['qty','Quantity'],['unit_price','Unit Price'],['value','Value'],['status','Status'],['ship_date','Ship Date'],["factory_ref","Factory Ref #"],["brand_name","Brand"],["merchandiser_name","Merchandiser"],["agent_name","Agent"],["product_id","Product ID"],["po_date","PO Date"],["planned_date","Planned Date"],["in_store_date","In-Store Date"],["ship_mode","Ship Mode"],["incoterms","Incoterms"],["currency","Currency"],["exchange_rate_snapshot","Exchange Rate"],["port_of_loading","Port of Loading"],["port_of_discharge","Port of Discharge"],["notes","Order Notes"],["order_total_qty","Order Total Qty"],["order_total_value","Order Total Value (USD)"],["excess_cutting_pct","Excess Cutting %"],["queue_split_rule","Queue Split Rule"],["created_at","Created At"],["updated_at","Updated At"],["tech_pack_url","Tech Pack URL"],["group_currency","Matrix Currency"],["base_size","Base Size"]]
const ORDER_FIELDS=["factory_ref","brand_name","merchandiser_name","agent_name","product_id","po_date","planned_date","in_store_date","ship_mode","incoterms","currency","exchange_rate_snapshot","port_of_loading","port_of_discharge","notes","order_total_qty","order_total_value","excess_cutting_pct","queue_split_rule","created_at","updated_at","tech_pack_url"]
const GROUP_FIELDS=['group_currency','base_size']
const NON_GROUPABLE=['qty','value','unit_price','picture','order_total_qty','order_total_value','exchange_rate_snapshot','excess_cutting_pct']
const GROUP_COLORS=[['#e0f2fe','Sky Blue'],['#dcfce7','Mint Green'],['#fef3c7','Soft Amber'],['#f3e8ff','Lavender'],['#fee2e2','Soft Rose'],['#e5e7eb','Light Grey']]
const INITIAL=['style_number','wash','size_group','size','qty']
const TEMPLATE_KEY='nizamia_custom_report_templates_v1'
const readTemplates=()=>{try{const v=JSON.parse(localStorage.getItem(TEMPLATE_KEY)||'[]');return Array.isArray(v)?v:[]}catch{return []}}
const box={border:'1px solid #dce0e8',borderRadius:8,padding:'9px 11px',background:'#fff',fontSize:12}
const action={...box,cursor:'pointer',display:'inline-flex',alignItems:'center',gap:7,fontWeight:650}
const esc=x=>String(x??'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;')
const money=x=>Number(x||0).toLocaleString('en-US',{maximumFractionDigits:2})
async function fetchAll(table,columns='*',max=30000){
 const result=[]
 for(let start=0;start<max;start+=750){
  const {data,error}=await supabase.from(table).select(columns).range(start,start+749)
  if(error)throw error
  result.push(...(data||[]))
  if((data||[]).length<750)return result
 }
 throw new Error('Report exceeds 30,000 source records. Narrow the selection before exporting.')
}
function compareValues(a,b){return typeof a==='number'&&typeof b==='number'?a-b:String(a??'').localeCompare(String(b??''),undefined,{numeric:true})}
function isGroupStart(rows,i,groups){return groups.length>0&&(i===0||groups.some(k=>String(rows[i]?.[k]??'')!==String(rows[i-1]?.[k]??'')))}
function aggregate(rows,groups,sortBy,descending){
 const map=new Map()
 for(const r of rows){
  const key=JSON.stringify(groups.map(k=>r[k]??''))
  if(!map.has(key))map.set(key,{...r,qty:0,value:0,_count:0})
  const x=map.get(key);x.qty+=Number(r.qty)||0;x.value+=Number(r.value)||0;x._count++
 }
 return [...map.values()].sort((a,b)=>{
  // Keep groups contiguous so their first row can be highlighted accurately.
  for(const key of groups){const c=compareValues(a[key],b[key]);if(c)return c}
  const c=compareValues(a[sortBy],b[sortBy]);return descending?-c:c
 })
}
function MultiSelectFields({label,options,selected,onChange,description}){
 const [query,setQuery]=useState('')
 const [open,setOpen]=useState(false)
 const shown=options.filter(([,name])=>name.toLowerCase().includes(query.trim().toLowerCase()))
 const names=selected.slice(0,2).map(k=>options.find(([id])=>id===k)?.[1]||k)
 return <div style={{position:'relative',minWidth:0}}>
  <div style={{fontSize:13,fontWeight:750,marginBottom:7}}>{label} <span style={{fontWeight:400,color:'#64748b'}}>· {description}</span></div>
  <button type="button" aria-expanded={open} aria-haspopup="true" onClick={()=>setOpen(v=>!v)} style={{...box,width:'100%',minHeight:39,display:'flex',alignItems:'center',justifyContent:'space-between',gap:12,cursor:'pointer',textAlign:'left'}}>
   <span style={{overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap',color:selected.length?'#202633':'#64748b'}}>{selected.length?names.join(', ')+(selected.length>2?` +${selected.length-2} more`:''):'Select fields…'}</span>
   <span style={{display:'flex',alignItems:'center',gap:8,flexShrink:0}}><span style={{background:'#eef2ff',borderRadius:12,padding:'2px 8px',fontSize:11,fontWeight:700}}>{selected.length} selected</span><span style={{fontSize:13,color:'#64748b'}}>{open?'▴':'▾'}</span></span>
  </button>
  {open&&<div style={{position:'absolute',zIndex:30,top:'100%',left:0,right:0,minWidth:260,marginTop:5,background:'#fff',border:'1px solid #dce0e8',borderRadius:9,boxShadow:'0 12px 28px rgba(15,23,42,.14)',padding:10}}>
   <input autoFocus aria-label={`Search ${label}`} placeholder="Search fields…" value={query} onChange={e=>setQuery(e.target.value)} style={{...box,width:'100%',boxSizing:'border-box',marginBottom:8}}/>
   <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',gap:8,marginBottom:6}}><button type="button" style={{...action,padding:'5px 9px'}} onClick={()=>onChange(options.map(([k])=>k))}>Select all</button><button type="button" style={{...action,padding:'5px 9px'}} onClick={()=>onChange([])}>Clear all</button><button type="button" style={{...action,padding:'5px 9px'}} onClick={()=>setOpen(false)}>Done</button></div>
   <div style={{maxHeight:240,overflowY:'auto'}}>{shown.map(([key,name])=><label key={key} style={{display:'flex',alignItems:'center',gap:9,padding:'7px 8px',fontSize:12,cursor:'pointer',borderRadius:5,background:selected.includes(key)?'#eff6ff':'transparent'}}><input type="checkbox" checked={selected.includes(key)} onChange={()=>onChange(selected.includes(key)?selected.filter(k=>k!==key):[...selected,key])}/>{name}</label>)}{!shown.length&&<div style={{padding:10,fontSize:12,color:'#64748b'}}>No matching fields</div>}</div>
  </div>}
 </div>
}
export default function CustomReportBuilder(){
 const navigate=useNavigate()
 const [name,setName]=useState('Style-wise Size Breakdown')
 const [orders,setOrders]=useState([])
 const [buyer,setBuyer]=useState('All')
 const [styles,setStyles]=useState([])
 const [fields,setFields]=useState(INITIAL)
 const [groups,setGroups]=useState(['style_number','wash','size_group','size'])
 const [sortBy,setSortBy]=useState('style_number')
 const [descending,setDescending]=useState(false)
 const [search,setSearch]=useState('')
 const [status,setStatus]=useState('All')
 const [preview,setPreview]=useState(null)
 const [loading,setLoading]=useState(false)
 const [error,setError]=useState('')
 const [refresh,setRefresh]=useState(0)
 const [templates,setTemplates]=useState(readTemplates)
 const [selectedTemplate,setSelectedTemplate]=useState('')
 const [notice,setNotice]=useState('')
 const [groupColor,setGroupColor]=useState('#e0f2fe')
 useEffect(()=>{let live=true;(async()=>{try{const list=await fetchAll('orders','id,buyer_name,style_number,job_number,po_number,store_name,description,style_image_url,style_image_base64,status,ship_date,total_qty,factory_ref,brand_name,merchandiser_name,agent_name,product_id,po_date,planned_date,in_store_date,ship_mode,incoterms,currency,exchange_rate_snapshot,port_of_loading,port_of_discharge,notes,total_value_usd,excess_cutting_pct,queue_split_rule,created_at,updated_at,tech_pack_url');if(live)setOrders(list)}catch(e){if(live)setError(e.message)}})();return()=>{live=false}},[refresh])
 const buyers=useMemo(()=>[...new Set(orders.map(o=>o.buyer_name).filter(Boolean))].sort(),[orders])
 const available=useMemo(()=>[...new Set(orders.filter(o=>buyer==='All'||o.buyer_name===buyer).map(o=>o.style_number).filter(Boolean))].sort(),[orders,buyer])
 const filteredOrders=useMemo(()=>orders.filter(o=>(buyer==='All'||o.buyer_name===buyer)&&(!styles.length||styles.includes(o.style_number))&&(status==='All'||o.status===status)&&(!search||[o.style_number,o.po_number,o.description,o.job_number,o.store_name].some(x=>String(x||'').toLowerCase().includes(search.toLowerCase())))),[orders,buyer,styles,status,search])
 const saveTemplate=()=>{
  const title=name.trim();if(!title){setError('Enter a report name before saving.');return}
  const id=selectedTemplate||`template-${Date.now()}`
  const template={id,name:title,buyer,styles:[...styles],fields:[...fields],groups:[...groups],sortBy,descending,search,status,groupColor,updatedAt:new Date().toISOString()}
  const next=[...templates.filter(t=>t.id!==id),template].sort((a,b)=>a.name.localeCompare(b.name))
  try{localStorage.setItem(TEMPLATE_KEY,JSON.stringify(next));setTemplates(next);setSelectedTemplate(id);setNotice(`Saved template: ${title}`);setError('')}catch{setError('Unable to save template in this browser. Check browser storage settings.')}
 }
 const loadTemplate=id=>{
  const t=templates.find(x=>x.id===id);setSelectedTemplate(id);if(!t)return
  setName(t.name||'Custom Report');setBuyer(t.buyer||'All');setStyles(Array.isArray(t.styles)?t.styles:[]);setFields(Array.isArray(t.fields)?t.fields:INITIAL);setGroups(Array.isArray(t.groups)?t.groups:[]);setSortBy(t.sortBy||'style_number');setDescending(!!t.descending);setSearch(t.search||'');setStatus(t.status||'All');setGroupColor(t.groupColor||'#e0f2fe');setPreview(null);setError('');setNotice(`Loaded template: ${t.name}`)
 }
 const deleteTemplate=()=>{
  if(!selectedTemplate)return
  if(!window.confirm('Delete this saved report template?'))return
  const next=templates.filter(t=>t.id!==selectedTemplate)
  try{localStorage.setItem(TEMPLATE_KEY,JSON.stringify(next));setTemplates(next);setSelectedTemplate('');setNotice('Template deleted.')}catch{setError('Unable to delete template from browser storage.')}
 }
 const moveColumn=(index,step)=>{
  const next=[...fields],target=index+step;if(target<0||target>=next.length)return
  ;[next[index],next[target]]=[next[target],next[index]];setFields(next)
  // Existing preview rows contain the same field data, so no new database query is necessary.
 }
 const toggle=(v,arr,set)=>{set(arr.includes(v)?arr.filter(x=>x!==v):[...arr,v]);setPreview(null)}
 const generate=async()=>{
  setLoading(true);setError('');setPreview(null)
  try{
   const chosen=filteredOrders
   if(!chosen.length)throw new Error('No orders match these filters.')
   const ids=new Set(chosen.map(o=>o.id))
   const [sizeGroups,colors,breakdowns]=await Promise.all([fetchAll('size_groups','id,order_id,group_name,unit_price,currency,base_size'),fetchAll('size_group_colors','id,size_group_id,color_name'),fetchAll('size_group_breakdown','size_group_id,color_id,size,qty')])
   const orderMap=new Map(chosen.map(o=>[o.id,o]))
   const groupMap=new Map(sizeGroups.filter(g=>ids.has(g.order_id)).map(g=>[g.id,g]))
   const colorMap=new Map(colors.map(c=>[c.id,c]))
   const detail=breakdowns.flatMap(b=>{
    const g=groupMap.get(b.size_group_id);if(!g)return []
    const o=orderMap.get(g.order_id);if(!o)return []
    const qty=Number(b.qty)||0,price=Number(g.unit_price)||0
    return [{style_number:o.style_number||'',picture:o.style_image_url||o.style_image_base64||'',buyer_name:o.buyer_name||'',job_number:o.job_number||'',po_number:o.po_number||'',store_name:o.store_name||'',description:o.description||'',wash:colorMap.get(b.color_id)?.color_name||'',size_group:g.group_name||'',size:b.size||'',qty,unit_price:price,value:qty*price,status:o.status||'',ship_date:o.ship_date||'',...Object.fromEntries(ORDER_FIELDS.map(k=>[k,k==='order_total_qty'?o.total_qty:k==='order_total_value'?o.total_value_usd:o[k]??''])),group_currency:g.currency||'',base_size:g.base_size||''}]
   })
   if(!detail.length)throw new Error('No saved size-matrix breakdown found for the selected orders.')
   // Group on all selected nonnumeric fields to prevent merging distinct PO records accidentally.
   const keys=[...new Set([...groups,...fields.filter(f=>!NON_GROUPABLE.includes(f))])]
   const result=aggregate(detail,keys,sortBy,descending)
   setPreview({rows:result,sourceRows:detail.length,sourceOrders:chosen.length,qty:detail.reduce((n,r)=>n+r.qty,0),value:detail.reduce((n,r)=>n+r.value,0)})
  }catch(e){setError(e.message||'Unable to generate report')}finally{setLoading(false)}
 }
 const outputFields=fields.length?fields:INITIAL
 const exportExcel=()=>{
  if(!preview)return
  const data=[outputFields.map(k=>FIELDS.find(f=>f[0]===k)?.[1]||k),...preview.rows.map(r=>outputFields.map(k=>k==='picture'?'':r[k]??''))]
  data.push(outputFields.map(k=>k==='qty'?preview.qty:k==='value'?preview.value:''))
  const ws=XLSX.utils.aoa_to_sheet(data);ws['!cols']=outputFields.map(k=>({wch:k==='description'?34:18}))
  const wb=XLSX.utils.book_new();XLSX.utils.book_append_sheet(wb,ws,'Report');XLSX.writeFile(wb,`${name.replace(/[^a-z0-9_-]+/gi,'-')||'Custom-Report'}.xlsx`)
 }
 const print=()=>{
  if(!preview)return
  const headers=outputFields.map(k=>'<th>'+esc(FIELDS.find(f=>f[0]===k)?.[1]||k)+'</th>').join('')
  const body=preview.rows.map((r,i)=>'<tr'+(isGroupStart(preview.rows,i,groups)?' style="background:'+esc(groupColor)+';font-weight:600"':'')+'>'+outputFields.map(k=>'<td>'+(k==='picture'&&/^https:\/\//.test(r[k]||'')?'<img width="65" src="'+esc(r[k])+'"/>':esc(r[k]))+'</td>').join('')+'</tr>').join('')
  printHTML(`<!doctype html><html><head><title>${esc(name)}</title><style>@page{size:A4 landscape;margin:12mm}body{font:11px Arial;color:#111}h1{font-size:19px}table{border-collapse:collapse;width:100%}th,td{border:1px solid #bbb;padding:6px;text-align:left}th{background:#eee}tr{break-inside:avoid}tfoot{font-weight:bold}</style></head><body><h1>${esc(name)}</h1><p>Buyer: ${esc(buyer)} · Orders: ${preview.sourceOrders} · Quantity: ${money(preview.qty)}</p><table><thead><tr>${headers}</tr></thead><tbody>${body}</tbody></table><p>Total Quantity: ${money(preview.qty)} · Total Value: ${money(preview.value)}</p></body></html>`)
 }
 const changeBuyer=v=>{setBuyer(v);setStyles([]);setPreview(null)}
 return <div style={{height:'100%',overflow:'auto',padding:'20px 28px',background:'#f8f9fb',fontFamily:'var(--font,Arial,sans-serif)',color:'#202633'}}>
  <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',gap:12,flexWrap:'wrap',marginBottom:17}}>
   <div style={{display:'flex',alignItems:'center',gap:12}}><button style={action} onClick={()=>navigate('/reports')}><ArrowLeft size={15}/> Reports</button><div><div style={{fontSize:21,fontWeight:750}}>Custom Report Builder</div><div style={{fontSize:12,color:'#64748b'}}>Orders & PO size matrix · Preview on demand</div></div></div>
   <div style={{display:'flex',gap:8}}><button style={action} onClick={saveTemplate}><Save size={14}/> Save Template</button><button style={action} onClick={()=>setRefresh(x=>x+1)}><RefreshCw size={14}/> Refresh</button><button style={{...action,background:'#141b2e',color:'#fff'}} disabled={loading} onClick={generate}><Eye size={15}/>{loading?'Generating…':'Preview Report'}</button></div>
  </div>
  <div style={{background:'#fff',border:'1px solid #e4e7ec',borderRadius:10,padding:12,marginBottom:12,display:'flex',alignItems:'center',gap:10,flexWrap:'wrap'}}><strong style={{fontSize:12}}>Saved Templates</strong><select aria-label="Saved report templates" style={{...box,minWidth:240}} value={selectedTemplate} onChange={e=>e.target.value?loadTemplate(e.target.value):setSelectedTemplate('')}><option value="">Select a saved template…</option>{templates.map(t=><option key={t.id} value={t.id}>{t.name}</option>)}</select><button style={action} onClick={()=>{setSelectedTemplate('');setNotice('New template: adjust your report and click Save Template.')}}>Save as New</button><button style={action} disabled={!selectedTemplate} onClick={deleteTemplate}><Trash2 size={13}/> Delete</button><span style={{fontSize:11,color:'#64748b'}}>Saved in this browser only</span></div>
  {notice&&<div role="status" style={{fontSize:12,color:'#047857',marginBottom:9}}>{notice}</div>}
  <div style={{background:'#fff',border:'1px solid #e4e7ec',borderRadius:10,padding:16,marginBottom:12}}>
   <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(185px,1fr))',gap:12}}>
    <label style={{fontSize:12,fontWeight:700}}>Report Name<input style={{...box,width:'100%',marginTop:6,boxSizing:'border-box'}} value={name} onChange={e=>setName(e.target.value)}/></label>
    <label style={{fontSize:12,fontWeight:700}}>Data Source<select style={{...box,width:'100%',marginTop:6}}><option>Orders & PO Matrix</option></select></label>
    <label style={{fontSize:12,fontWeight:700}}>Buyer<select style={{...box,width:'100%',marginTop:6}} value={buyer} onChange={e=>changeBuyer(e.target.value)}><option>All</option>{buyers.map(x=><option key={x}>{x}</option>)}</select></label>
    <label style={{fontSize:12,fontWeight:700}}>Status<select style={{...box,width:'100%',marginTop:6}} value={status} onChange={e=>{setStatus(e.target.value);setPreview(null)}}><option>All</option>{[...new Set(orders.map(o=>o.status).filter(Boolean))].sort().map(x=><option key={x}>{x}</option>)}</select></label>
   </div>
  </div>
  <div style={{display:'grid',gridTemplateColumns:'minmax(220px,1fr) minmax(0,3fr)',gap:12,alignItems:'start'}}>
   <section style={{background:'#fff',border:'1px solid #e4e7ec',borderRadius:10,padding:14}}>
    <div style={{fontSize:13,fontWeight:750,marginBottom:10}}>Select Styles <span style={{fontWeight:400,color:'#64748b'}}>({styles.length||'All'})</span></div>
    <input placeholder="Search styles / PO / job…" style={{...box,width:'100%',boxSizing:'border-box',marginBottom:9}} value={search} onChange={e=>{setSearch(e.target.value);setPreview(null)}}/>
    <div style={{display:'flex',gap:8,marginBottom:9}}><button style={action} onClick={()=>{setStyles([]);setPreview(null)}}>All styles</button><button style={action} onClick={()=>{setStyles(available);setPreview(null)}}>Select all</button></div>
    <div style={{maxHeight:235,overflow:'auto'}}>{available.map(x=><label key={x} style={{display:'flex',gap:8,padding:'6px 2px',fontSize:12}}><input type="checkbox" checked={styles.includes(x)} onChange={()=>toggle(x,styles,setStyles)}/>{x}</label>)}</div>
   </section>
   <section style={{background:'#fff',border:'1px solid #e4e7ec',borderRadius:10,padding:14}}>
    <MultiSelectFields label="Report Columns" description="Choose fields to display" options={FIELDS} selected={fields} onChange={v=>{setFields(v);setPreview(null)}}/>
    <div style={{height:15}}/>
    <div style={{fontSize:12,fontWeight:700,marginBottom:8}}>Column Order <span style={{fontWeight:400,color:'#64748b'}}>· Use arrows to move columns; preview and exports follow this order</span></div>
    <div style={{display:'flex',flexWrap:'wrap',gap:7,marginBottom:15}}>{fields.map((key,i)=><div key={key} style={{...box,padding:'5px 6px',display:'flex',alignItems:'center',gap:5,background:'#f8fafc'}}><span style={{fontSize:11,fontWeight:650}}>{i+1}. {FIELDS.find(f=>f[0]===key)?.[1]||key}</span><button title="Move column left" aria-label={`Move ${key} left`} disabled={i===0} style={{border:0,background:'transparent',cursor:i===0?'default':'pointer',padding:2}} onClick={()=>moveColumn(i,-1)}><ChevronLeft size={15}/></button><button title="Move column right" aria-label={`Move ${key} right`} disabled={i===fields.length-1} style={{border:0,background:'transparent',cursor:i===fields.length-1?'default':'pointer',padding:2}} onClick={()=>moveColumn(i,1)}><ChevronRight size={15}/></button></div>)}</div>
    <MultiSelectFields label="Group By" description="Select dimensions" options={FIELDS.filter(([k])=>!NON_GROUPABLE.includes(k))} selected={groups} onChange={v=>{setGroups(v);setPreview(null)}}/>
    <div style={{height:14}}/>
    <div style={{display:'flex',alignItems:'center',gap:9,flexWrap:'wrap',marginBottom:12}}><strong style={{fontSize:12}}>First Row of Each Group</strong><input aria-label="Group highlight colour" title="Choose custom highlight colour" type="color" value={groupColor} onChange={e=>setGroupColor(e.target.value)} style={{width:36,height:30,cursor:'pointer',border:'1px solid #dce0e8',borderRadius:5}}/>{GROUP_COLORS.map(([hex,label])=><button key={hex} type="button" title={label} aria-label={`Use ${label} group highlight`} onClick={()=>setGroupColor(hex)} style={{width:23,height:23,background:hex,border:groupColor===hex?'2px solid #111827':'1px solid #cbd5e1',borderRadius:5,cursor:'pointer'}}/>)}<span style={{fontSize:11,color:'#64748b'}}>Highlights the first data row whenever a group changes.</span></div>
    <div style={{display:'flex',gap:12,flexWrap:'wrap',alignItems:'center'}}><label style={{fontSize:12,fontWeight:650}}>Sort by <select style={box} value={sortBy} onChange={e=>{setSortBy(e.target.value);setPreview(null)}}>{FIELDS.map(([k,l])=><option value={k} key={k}>{l}</option>)}</select></label><label style={{fontSize:12}}><input type="checkbox" checked={descending} onChange={e=>{setDescending(e.target.checked);setPreview(null)}}/> Descending</label><span style={{fontSize:11,color:'#64748b'}}>Changes require a new preview.</span></div>
   </section>
  </div>
  {error&&<div style={{marginTop:12,padding:12,background:'#fff1f2',color:'#b91c1c',borderRadius:8,fontSize:12}}>{error}</div>}
  <section style={{background:'#fff',border:'1px solid #e4e7ec',borderRadius:10,marginTop:12,padding:14}}>
   <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',gap:10,flexWrap:'wrap',marginBottom:12}}><div><strong style={{fontSize:14}}>Report Preview</strong><div style={{fontSize:11,color:'#64748b'}}>{preview?`${preview.rows.length} grouped rows · ${preview.sourceOrders} orders · ${money(preview.qty)} pieces`:'Select fields and click Preview Report'}</div></div><div style={{display:'flex',gap:8}}><button style={action} disabled={!preview} onClick={exportExcel}><FileSpreadsheet size={14}/> Excel</button><button style={action} disabled={!preview} onClick={print}><Printer size={14}/> Print / PDF</button></div></div>
   {preview?<div style={{overflow:'auto',maxHeight:460}}><table style={{borderCollapse:'collapse',width:'100%',fontSize:12}}><thead><tr>{outputFields.map(k=><th key={k} style={{position:'sticky',top:0,background:'#f2f4f8',padding:9,borderBottom:'1px solid #dce0e8',textAlign:'left',whiteSpace:'nowrap'}}>{FIELDS.find(f=>f[0]===k)?.[1]||k}</th>)}</tr></thead><tbody>{preview.rows.slice(0,500).map((r,i)=><tr key={i} style={isGroupStart(preview.rows,i,groups)?{background:groupColor,fontWeight:600}:{}}>{outputFields.map(k=><td key={k} style={{padding:8,borderBottom:'1px solid #eef0f3',whiteSpace:'nowrap'}}>{k==='picture'&&r[k]?<img src={r[k]} alt="" style={{width:42,height:46,objectFit:'contain'}}/>:k==='qty'||k==='value'?money(r[k]):String(r[k]??'')}</td>)}</tr>)}</tbody></table>{preview.rows.length>500&&<p style={{fontSize:12}}>Showing first 500 rows. Excel and PDF include the complete report.</p>}</div>:<div style={{padding:36,textAlign:'center',color:'#94a3b8',fontSize:12}}>Your report will appear here after preview.</div>}
  </section>
 </div>
}
