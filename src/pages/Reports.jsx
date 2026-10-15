import React, { useEffect, useMemo, useState } from 'react'
import * as XLSX from 'xlsx'
import { Search, FileSpreadsheet, Printer, RefreshCw, ArrowLeft, FileText } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { printHTML } from '../components/PrintReports'

// Read-only views of persisted application records. No recalculation of production requirements.
const CATALOG = [
  { category:'Orders & Customers', reports:[
    ['Orders Register','orders',['job_no','po_number','style_no','buyer_name','store_name','status','total_qty','total_value_usd','ex_factory_date']],
    ['Order Size Groups','size_groups',['order_id','group_name','sizes','base_size','unit_price','currency','sort_order']],
    ['Order Colours & Washes','size_group_colors',['size_group_id','color_name','sort_order','ratio_locked']],
    ['PO Matrix Size Quantities','size_group_breakdown',['size_group_id','color_id','size','qty']],
    ['Buyers Directory','buyers',null], ['Jobs Register','jobs',null],
  ]},
  { category:'Sampling & Approvals', reports:[['Samples Register','samples',null],['Sample Comments','sample_comments',null],['Sample Activity Log','sample_logs',null],['Fitting Records','fitting',null],['Fitting Blocks','fitting_blocks',null]] },
  { category:'Purchasing & Demand', reports:[['Purchase Orders','purchase_orders',null],['Purchase Order Lines','purchase_order_items',null],['Purchase Order History','purchase_order_changelog',null],['Work Orders','work_orders',null],['Work Order Lines','work_order_items',null],['Work Order History','work_order_changelog',null]] },
  { category:'Materials & BOM', reports:[['Order BOM Register','bom_items',null],['BOM Presets','bom_presets',null],['BOM Preset Items','bom_preset_items',null],['Material Library','library_items',null],['Units of Measure','uoms',null]] },
  { category:'Production & Processes', reports:[['Production Queues','order_queues',null],['Washing Register','washing',null],['Embellishments Register','embellishments',null],['Finishing Register','finishing',null],['Finishing Packing','finishing_color_packing',null],['Order Processes','order_processes',null]] },
  { category:'Shipping & Parcels', reports:[['Shipment Register','shipments',null],['Shipment Lines','shipment_lines',null],['Parcels Register','parcels',null],['Packing Snapshots','packing_snapshots',null]] },
  { category:'Buyers & Suppliers', reports:[['Supplier Directory','suppliers',null],['Buyer Directory','buyers',null]] },
  { category:'Libraries & Administration', reports:[['Size Group Templates','size_group_templates',null],['Finishing Packs','finishing_packs',null],['Exchange Rates','exchange_rates',null],['Document Numbering','document_numbering',null],['Status Colours','ui_status_colors',null]] },
]
// Phase 2: business-facing views over persisted data; no new production calculations.
const BUSINESS = [
  {category:'Orders & Customers',reports:[
    ['Active Orders','orders','orders','active'],['Order Register','orders','orders'],['Buyer-wise Orders','orders','orders','', 'buyer_name'],['Store-wise Orders','orders','orders','', 'store_name'],['Style-wise Orders','orders','orders','', 'style_number'],['Delivery Schedule','orders','orders','', '', 'ship_date'],
  ]},
  {category:'Sampling & Approvals',reports:[
    ['Active Sampling','samples','samples','active'],['Pending Approvals','samples','samples','approval'],['Overdue Samples','samples','samples','overdue'],['Completed Samples','samples','samples','completed'],['Sampling Register','samples','samples'],
  ]},
  {category:'Purchasing & Demand',reports:[
    ['Purchase Order Register','purchase_orders','purchase'],['Supplier-wise Purchase Orders','purchase_orders','purchase','', 'Supplier'],['Purchase Order Items','purchase_order_items','purchaseItems'],['Work Order Register','work_orders','work'],['Vendor-wise Work Orders','work_orders','work','', 'Supplier'],['Work Order Items','work_order_items','workItems'],
  ]},
]
const VIEWS = {
  orders:[['Job #','job_number'],['Buyer','buyer_name'],['Store','store_name'],['Customer PO #','po_number'],['Style #','style_number'],['Factory Ref','factory_ref'],['Status','status'],['Order Qty (pcs)','total_qty'],['Order Value (USD)','total_value_usd'],['PO Date','po_date'],['Ship Date','ship_date'],['Planned Date','planned_date']],
  samples:[['Sample #','sample_number'],['Job #','Job #'],['Buyer','Buyer'],['Style #','Style #'],['Customer PO #','Customer PO #'],['Sample Type','sample_type'],['Version','version_label'],['Stage','stage'],['Approval','approval_status'],['Status','status'],['Required Qty (pcs)','req_pcs'],['Due Date','due_date'],['Received Date','received_date']],
  purchase:[['Supplier PO #','po_number'],['Supplier','Supplier'],['Job #','Job #'],['Buyer','Buyer'],['Style #','Style #'],['Customer PO #','Customer PO #'],['Status','status'],['PO Date','po_date'],['Delivery Date','delivery_date'],['Currency','currency'],['Payment Terms','payment_terms']],
  purchaseItems:[['Supplier PO #','Supplier PO #'],['Supplier','Supplier'],['Description','description'],['Specification','specification'],['Qty','qty'],['Unit','unit'],['Rate','unit_rate'],['Amount','amount'],['Source','source_type']],
  work:[['Work Order #','wo_number'],['Vendor','Supplier'],['Job #','Job #'],['Buyer','Buyer'],['Style #','Style #'],['Customer PO #','Customer PO #'],['Status','status'],['Qty','qty'],['Issue Date','issue_date'],['Complete By','complete_by'],['Vendor Type','vendor_type']],
  workItems:[['Work Order #','Work Order #'],['Process','process_name'],['Department','dept_info'],['Qty','qty'],['Unit','unit'],['Rate','rate'],['Amount','amount']],
}
const ACTIVE_STATUS = s => !/^(cancelled|completed|complete|closed|shipped|delivered|archived)$/i.test(String(s||'').trim())
const completedStatus = s => /^(completed|complete|approved|closed|delivered|shipped)$/i.test(String(s||'').trim())
const enrichRows = (report, data, related) => data.map(row=>{
  const order = related.orders?.get(row.order_id) || related.orders?.get(related.purchase?.get(row.po_id)?.order_id) || related.orders?.get(related.work?.get(row.wo_id)?.order_id)
  const purchase = related.purchase?.get(row.po_id)
  const work = related.work?.get(row.wo_id)
  const supplierId = row.supplier_id || row.vendor_id || purchase?.supplier_id || work?.vendor_id
  const supplier = related.suppliers?.get(supplierId)
  return {...row,'Job #':order?.job_number||'', 'Buyer':order?.buyer_name||'', 'Style #':order?.style_number||'', 'Customer PO #':order?.po_number||'',
    'Supplier':supplier?.name||'', 'Supplier PO #':purchase?.po_number||'', 'Work Order #':work?.wo_number||''}
})
const businessRows = (report, rows) => {
  if(report.mode==='active') return rows.filter(r=>ACTIVE_STATUS(r.status) && (report.kind!=='samples'||!completedStatus(r.approval_status)))
  if(report.mode==='completed')return rows.filter(r=>completedStatus(r.status)||completedStatus(r.approval_status))
  if(report.mode==='approval')return rows.filter(r=>!completedStatus(r.approval_status) && !/cancelled/i.test(r.status||''))
  if(report.mode==='overdue')return rows.filter(r=>r.due_date && r.due_date.slice(0,10)<new Date().toISOString().slice(0,10) && !completedStatus(r.status) && !completedStatus(r.approval_status))
  return rows
}
const flatten = [...BUSINESS.flatMap(group => group.reports.map(([title,table,kind,mode,groupBy,defaultDate])=>({title,table,kind,mode,groupBy,defaultDate,category:group.category,business:true}))),...CATALOG.flatMap(group => group.reports.map(([title,table,fields])=>({ title,table,fields,category:group.category })))]
const safe = s => String(s||'').replace(/[^a-zA-Z0-9_-]+/g,'-').replace(/^-|-$/g,'').slice(0,70)
const stamp = () => new Date().toISOString().slice(0,10)
const cell = value => value == null ? '' : typeof value === 'object' ? JSON.stringify(value) : String(value)
const escapeHTML = s => cell(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;')
const btn = { border:'1px solid #d9dce4', background:'#fff', padding:'9px 13px', borderRadius:7, cursor:'pointer', display:'inline-flex', alignItems:'center', gap:7, fontSize:12, fontWeight:600 }

export default function Reports() {
  const [active,setActive] = useState(null)
  const [catalogSearch,setCatalogSearch] = useState('')
  const [category,setCategory] = useState('All')
  const [rows,setRows] = useState([])
  const [columns,setColumns] = useState([])
  const [loading,setLoading] = useState(false)
  const [error,setError] = useState('')
  const [filter,setFilter] = useState('')
  const [dateFrom,setDateFrom] = useState('')
  const [dateTo,setDateTo] = useState('')
  const [dateField,setDateField] = useState('')
  const [printOrientation,setPrintOrientation] = useState('landscape')
  const [truncated,setTruncated] = useState(false)
  const [statusFilter,setStatusFilter] = useState('All')
  const [groupFilter,setGroupFilter] = useState('All')
  const dateFields = useMemo(()=>columns.filter(k=>/date|created_at|updated_at|due_at|deadline/i.test(k)),[columns])
  useEffect(()=>{ if (!active) return; let cancelled=false; (async()=>{
    setLoading(true);setError('');setRows([]);setColumns([]);setTruncated(false);setFilter('');setDateField('');setDateFrom('');setDateTo('');setStatusFilter('All');setGroupFilter('All')
    try {
      // Page through Supabase rather than silently showing only its default 1,000 records.
      const all=[];const pageSize=750;const limit=30000
      while(all.length<limit){
        const {data,error:dbError}=await supabase.from(active.table).select('*').range(all.length,all.length+pageSize-1)
        if(dbError) throw dbError
        if(cancelled) return
        const batch=data||[];all.push(...batch)
        if(batch.length<pageSize)break
      }
      if(cancelled)return
      let finalRows=all
      if(active.business){
        const lookup=async(table)=>{
          const result=[];let offset=0;while(offset<30000){const {data,error}=await supabase.from(table).select('*').range(offset,offset+749);if(error)throw error;result.push(...(data||[]));if(!data||data.length<750)break;offset+=750}return result
        }
        const [orders,suppliers,purchase,work]=await Promise.all([
          active.table==='orders'?Promise.resolve(all):lookup('orders'),lookup('suppliers'),
          active.table==='purchase_orders'?Promise.resolve(all):lookup('purchase_orders'),
          active.table==='work_orders'?Promise.resolve(all):lookup('work_orders')
        ])
        const map=a=>new Map(a.map(x=>[x.id,x]))
        finalRows=businessRows(active,enrichRows(active,all,{orders:map(orders),suppliers:map(suppliers),purchase:map(purchase),work:map(work)}))
      }
      const keys=active.business?VIEWS[active.kind].map(([,k])=>k):[...new Set(finalRows.flatMap(row=>Object.keys(row)))];
      const ordered=active.business ? keys : active.fields ? [...active.fields.filter(f=>keys.includes(f)),...keys.filter(f=>!active.fields.includes(f))] : keys
      setColumns(ordered);setRows(finalRows);setDateField(active.defaultDate||'');setTruncated(all.length>=limit)
    } catch(e){if(!cancelled)setError(e?.message||'Unable to load report')} finally {if(!cancelled)setLoading(false)}
  })();return()=>{cancelled=true} },[active])
  const visible=useMemo(()=>rows.filter(row=>{
    if(statusFilter!=='All' && cell(row.status)!==statusFilter)return false
    if(groupFilter!=='All' && cell(row[active?.groupBy])!==groupFilter)return false
    if(filter && !Object.values(row).some(value=>cell(value).toLowerCase().includes(filter.toLowerCase())))return false
    if(dateField && (dateFrom||dateTo)){
      const v=cell(row[dateField]).slice(0,10)
      if(!v || (dateFrom && v<dateFrom) || (dateTo && v>dateTo))return false
    }
    return true
  }),[rows,filter,dateField,dateFrom,dateTo,statusFilter,groupFilter,active])
  const statusOptions=useMemo(()=>[...new Set(rows.map(r=>cell(r.status)).filter(Boolean))].sort(),[rows])
  const groupOptions=useMemo(()=>active?.groupBy?[...new Set(rows.map(r=>cell(r[active.groupBy])).filter(Boolean))].sort():[],[rows,active])
  const label=k=>active?.business?(VIEWS[active.kind].find(([,key])=>key===k)?.[0]||k):k.replaceAll('_',' ')
  const filename=()=>`${safe(active?.title)}${dateFrom?`_From-${dateFrom}`:''}${dateTo?`_To-${dateTo}`:''}_${stamp()}`
  const excel=()=>{
    if(!active||loading||truncated)return
    const wb=XLSX.utils.book_new();const ws=XLSX.utils.json_to_sheet(visible.map(r=>Object.fromEntries(columns.map(k=>[label(k),cell(r[k])]))),{header:columns.map(label)})
    ws['!cols']=columns.map(k=>({wch:Math.min(38,Math.max(14,k.length+3))}))
    XLSX.utils.book_append_sheet(wb,ws,safe(active.title).slice(0,31));XLSX.writeFile(wb,`${filename()}.xlsx`)
  }
  const print=()=>{
    if(!active||loading||truncated)return
    const html=`<html><head><title>${escapeHTML(filename())}</title><style>@page{size:A4 ${printOrientation};margin:12mm}body{font:11px Arial,sans-serif;color:#1f2937}h1{font-size:19px;margin:0 0 7px}.sub{color:#6b7280;margin-bottom:15px}table{border-collapse:collapse;width:100%}th,td{border:1px solid #d1d5db;padding:5px;text-align:left;overflow-wrap:anywhere}th{background:#eef2f7}thead{display:table-header-group}tr{break-inside:avoid}</style></head><body><h1>${escapeHTML(active.title)}</h1><div class="sub">${escapeHTML(stamp())} · ${visible.length} records${dateField&&dateFrom?` · ${escapeHTML(dateField)} from ${escapeHTML(dateFrom)}`:''}${dateField&&dateTo?` to ${escapeHTML(dateTo)}`:''}</div><table><thead><tr>${columns.map(k=>`<th>${escapeHTML(label(k))}</th>`).join('')}</tr></thead><tbody>${visible.map(r=>`<tr>${columns.map(k=>`<td>${escapeHTML(r[k])}</td>`).join('')}</tr>`).join('')}</tbody></table></body></html>`
    // Browser print dialog supports Save as PDF; the document title supplies the PDF filename.
    printHTML(html)
  }
  const matches=flatten.filter(r=>(category==='All'||r.category===category)&&`${r.title} ${r.category}`.toLowerCase().includes(catalogSearch.toLowerCase()))
  return <div style={{height:'100%',overflow:'auto',padding:'22px 26px',background:'#f8f9fb',fontFamily:'var(--font,Arial,sans-serif)',color:'#202633'}}>
    <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:18,gap:12}}>
      <div><div style={{fontSize:22,fontWeight:750}}>Reports</div><div style={{fontSize:12,color:'#6b7280',marginTop:4}}>Central read-only reporting · existing Supabase records · Excel and print/PDF</div></div>
      {active&&<button style={btn} onClick={()=>setActive(null)}><ArrowLeft size={15}/> All Reports</button>}
    </div>
    {!active ? <>
      <div style={{display:'flex',gap:10,marginBottom:18,flexWrap:'wrap'}}>
        <div style={{display:'flex',alignItems:'center',gap:8,background:'#fff',border:'1px solid #d9dce4',borderRadius:8,padding:'0 12px',minWidth:280}}><Search size={15}/><input placeholder="Search reports..." value={catalogSearch} onChange={e=>setCatalogSearch(e.target.value)} style={{border:0,outline:0,padding:'11px 0',width:'100%'}}/></div>
        <select value={category} onChange={e=>setCategory(e.target.value)} style={{...btn,minWidth:180}}><option>All</option>{[...BUSINESS,...CATALOG].map(c=><option key={c.category}>{c.category}</option>)}</select>
      </div>
      {[...BUSINESS,...CATALOG].filter(g=>category==='All'||category===g.category).map(group=>{
        const items=matches.filter(r=>r.category===group.category);if(!items.length)return null
        return <section key={group.category} style={{marginBottom:20}}><div style={{fontSize:14,fontWeight:750,marginBottom:9}}>{group.category} <span style={{fontSize:11,color:'#9ca3af'}}>({items.length})</span></div><div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(235px,1fr))',gap:10}}>{items.map(r=><button key={`${r.category}-${r.title}`} onClick={()=>setActive(r)} style={{background:'#fff',border:'1px solid #e4e7ec',borderRadius:10,padding:14,textAlign:'left',cursor:'pointer',display:'flex',alignItems:'center',gap:11}}><FileText size={18} color="#5064a2"/><span style={{fontSize:12,fontWeight:650}}>{r.title}</span></button>)}</div></section>
      })}
    </> : <div style={{background:'#fff',border:'1px solid #e4e7ec',borderRadius:12,padding:16}}>
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',gap:12,flexWrap:'wrap',marginBottom:14}}><div><div style={{fontSize:17,fontWeight:700}}>{active.title}</div><div style={{fontSize:12,color:'#6b7280',marginTop:4}}>{active.category} · {visible.length.toLocaleString()} displayed / {rows.length.toLocaleString()} loaded</div></div><div style={{display:'flex',gap:8,flexWrap:'wrap'}}><button style={btn} disabled={loading} onClick={()=>setActive({...active})}><RefreshCw size={14}/> Refresh</button><button style={btn} disabled={loading||!!error||truncated} onClick={excel}><FileSpreadsheet size={14}/> Excel .xlsx</button><button style={btn} disabled={loading||!!error||truncated} onClick={print}><Printer size={14}/> Print / PDF</button></div></div>
      <div style={{display:'flex',gap:9,flexWrap:'wrap',marginBottom:14,alignItems:'center'}}>{active.business&&<select value={statusFilter} onChange={e=>setStatusFilter(e.target.value)} style={btn}><option>All</option>{statusOptions.map(v=><option key={v}>{v}</option>)}</select>}{active.groupBy&&<select value={groupFilter} onChange={e=>setGroupFilter(e.target.value)} style={btn}><option>All</option>{groupOptions.map(v=><option key={v}>{v}</option>)}</select>}<input value={filter} onChange={e=>setFilter(e.target.value)} placeholder="Filter any field..." style={{...btn,minWidth:210,fontWeight:400}}/><select value={dateField} onChange={e=>setDateField(e.target.value)} style={btn}><option value="">No date filter</option>{dateFields.map(k=><option key={k}>{k}</option>)}</select>{dateField&&<><input type="date" value={dateFrom} onChange={e=>setDateFrom(e.target.value)} style={btn}/><input type="date" value={dateTo} onChange={e=>setDateTo(e.target.value)} style={btn}/></>}<select value={printOrientation} onChange={e=>setPrintOrientation(e.target.value)} style={btn}><option value="landscape">A4 Landscape</option><option value="portrait">A4 Portrait</option></select></div>
      {error&&<div style={{color:'#b91c1c',background:'#fef2f2',padding:12,borderRadius:8,marginBottom:12}}>Could not load report: {error}</div>}
      {truncated&&<div style={{color:'#92400e',background:'#fffbeb',padding:12,borderRadius:8,marginBottom:12}}>This report exceeds the 30,000-record preview limit. Export is disabled to prevent incomplete files.</div>}
      {loading?<div style={{padding:30,color:'#6b7280'}}>Loading live records…</div>:!error?<div style={{overflow:'auto',maxHeight:'calc(100vh - 320px)',border:'1px solid #e5e7eb',borderRadius:8}}><table style={{borderCollapse:'collapse',width:'100%',fontSize:11,whiteSpace:'nowrap'}}><thead><tr>{columns.map(k=><th key={k} style={{position:'sticky',top:0,background:'#f2f4f8',padding:'9px 10px',textAlign:'left',borderBottom:'1px solid #d1d5db'}}>{label(k)}</th>)}</tr></thead><tbody>{visible.slice(0,500).map((r,i)=><tr key={r.id||i}>{columns.map(k=><td key={k} title={cell(r[k])} style={{padding:'7px 10px',borderBottom:'1px solid #eef0f3',maxWidth:260,overflow:'hidden',textOverflow:'ellipsis'}}>{cell(r[k])}</td>)}</tr>)}</tbody></table>{visible.length>500&&<div style={{padding:12,fontSize:12,color:'#6b7280'}}>Showing first 500 matching records on screen. Exports include all {visible.length.toLocaleString()} matching records.</div>}{!visible.length&&<div style={{padding:22,fontSize:12,color:'#6b7280'}}>No records match the selected filters.</div>}</div>:null}
    </div>}
  </div>
}
