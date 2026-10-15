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
const flatten = CATALOG.flatMap(group => group.reports.map(([title,table,fields])=>({ title,table,fields,category:group.category })))
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
  const dateFields = useMemo(()=>columns.filter(k=>/date|created_at|updated_at|due_at|deadline/i.test(k)),[columns])
  useEffect(()=>{ if (!active) return; let cancelled=false; (async()=>{
    setLoading(true);setError('');setRows([]);setColumns([]);setTruncated(false);setFilter('');setDateField('');setDateFrom('');setDateTo('')
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
      const keys=[...new Set(all.flatMap(row=>Object.keys(row)))];
      const ordered=active.fields ? [...active.fields.filter(f=>keys.includes(f)),...keys.filter(f=>!active.fields.includes(f))] : keys
      setColumns(ordered);setRows(all);setTruncated(all.length>=limit)
    } catch(e){if(!cancelled)setError(e?.message||'Unable to load report')} finally {if(!cancelled)setLoading(false)}
  })();return()=>{cancelled=true} },[active])
  const visible=useMemo(()=>rows.filter(row=>{
    if(filter && !Object.values(row).some(value=>cell(value).toLowerCase().includes(filter.toLowerCase())))return false
    if(dateField && (dateFrom||dateTo)){
      const v=cell(row[dateField]).slice(0,10)
      if(!v || (dateFrom && v<dateFrom) || (dateTo && v>dateTo))return false
    }
    return true
  }),[rows,filter,dateField,dateFrom,dateTo])
  const filename=()=>`${safe(active?.title)}${dateFrom?`_From-${dateFrom}`:''}${dateTo?`_To-${dateTo}`:''}_${stamp()}`
  const excel=()=>{
    if(!active||loading||truncated)return
    const wb=XLSX.utils.book_new();const ws=XLSX.utils.json_to_sheet(visible.map(r=>Object.fromEntries(columns.map(k=>[k,cell(r[k])]))),{header:columns})
    ws['!cols']=columns.map(k=>({wch:Math.min(38,Math.max(14,k.length+3))}))
    XLSX.utils.book_append_sheet(wb,ws,safe(active.title).slice(0,31));XLSX.writeFile(wb,`${filename()}.xlsx`)
  }
  const print=()=>{
    if(!active||loading||truncated)return
    const html=`<html><head><title>${escapeHTML(filename())}</title><style>@page{size:A4 ${printOrientation};margin:12mm}body{font:11px Arial,sans-serif;color:#1f2937}h1{font-size:19px;margin:0 0 7px}.sub{color:#6b7280;margin-bottom:15px}table{border-collapse:collapse;width:100%}th,td{border:1px solid #d1d5db;padding:5px;text-align:left;overflow-wrap:anywhere}th{background:#eef2f7}thead{display:table-header-group}tr{break-inside:avoid}</style></head><body><h1>${escapeHTML(active.title)}</h1><div class="sub">${escapeHTML(stamp())} · ${visible.length} records${dateField&&dateFrom?` · ${escapeHTML(dateField)} from ${escapeHTML(dateFrom)}`:''}${dateField&&dateTo?` to ${escapeHTML(dateTo)}`:''}</div><table><thead><tr>${columns.map(k=>`<th>${escapeHTML(k.replaceAll('_',' '))}</th>`).join('')}</tr></thead><tbody>${visible.map(r=>`<tr>${columns.map(k=>`<td>${escapeHTML(r[k])}</td>`).join('')}</tr>`).join('')}</tbody></table></body></html>`
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
        <select value={category} onChange={e=>setCategory(e.target.value)} style={{...btn,minWidth:180}}><option>All</option>{CATALOG.map(c=><option key={c.category}>{c.category}</option>)}</select>
      </div>
      {CATALOG.filter(g=>category==='All'||category===g.category).map(group=>{
        const items=matches.filter(r=>r.category===group.category);if(!items.length)return null
        return <section key={group.category} style={{marginBottom:20}}><div style={{fontSize:14,fontWeight:750,marginBottom:9}}>{group.category} <span style={{fontSize:11,color:'#9ca3af'}}>({items.length})</span></div><div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(235px,1fr))',gap:10}}>{items.map(r=><button key={`${r.category}-${r.title}`} onClick={()=>setActive(r)} style={{background:'#fff',border:'1px solid #e4e7ec',borderRadius:10,padding:14,textAlign:'left',cursor:'pointer',display:'flex',alignItems:'center',gap:11}}><FileText size={18} color="#5064a2"/><span style={{fontSize:12,fontWeight:650}}>{r.title}</span></button>)}</div></section>
      })}
    </> : <div style={{background:'#fff',border:'1px solid #e4e7ec',borderRadius:12,padding:16}}>
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',gap:12,flexWrap:'wrap',marginBottom:14}}><div><div style={{fontSize:17,fontWeight:700}}>{active.title}</div><div style={{fontSize:12,color:'#6b7280',marginTop:4}}>{active.category} · {visible.length.toLocaleString()} displayed / {rows.length.toLocaleString()} loaded</div></div><div style={{display:'flex',gap:8,flexWrap:'wrap'}}><button style={btn} disabled={loading} onClick={()=>setActive({...active})}><RefreshCw size={14}/> Refresh</button><button style={btn} disabled={loading||!!error||truncated} onClick={excel}><FileSpreadsheet size={14}/> Excel .xlsx</button><button style={btn} disabled={loading||!!error||truncated} onClick={print}><Printer size={14}/> Print / PDF</button></div></div>
      <div style={{display:'flex',gap:9,flexWrap:'wrap',marginBottom:14,alignItems:'center'}}><input value={filter} onChange={e=>setFilter(e.target.value)} placeholder="Filter any field..." style={{...btn,minWidth:210,fontWeight:400}}/><select value={dateField} onChange={e=>setDateField(e.target.value)} style={btn}><option value="">No date filter</option>{dateFields.map(k=><option key={k}>{k}</option>)}</select>{dateField&&<><input type="date" value={dateFrom} onChange={e=>setDateFrom(e.target.value)} style={btn}/><input type="date" value={dateTo} onChange={e=>setDateTo(e.target.value)} style={btn}/></>}<select value={printOrientation} onChange={e=>setPrintOrientation(e.target.value)} style={btn}><option value="landscape">A4 Landscape</option><option value="portrait">A4 Portrait</option></select></div>
      {error&&<div style={{color:'#b91c1c',background:'#fef2f2',padding:12,borderRadius:8,marginBottom:12}}>Could not load report: {error}</div>}
      {truncated&&<div style={{color:'#92400e',background:'#fffbeb',padding:12,borderRadius:8,marginBottom:12}}>This report exceeds the 30,000-record preview limit. Export is disabled to prevent incomplete files.</div>}
      {loading?<div style={{padding:30,color:'#6b7280'}}>Loading live records…</div>:!error?<div style={{overflow:'auto',maxHeight:'calc(100vh - 320px)',border:'1px solid #e5e7eb',borderRadius:8}}><table style={{borderCollapse:'collapse',width:'100%',fontSize:11,whiteSpace:'nowrap'}}><thead><tr>{columns.map(k=><th key={k} style={{position:'sticky',top:0,background:'#f2f4f8',padding:'9px 10px',textAlign:'left',borderBottom:'1px solid #d1d5db'}}>{k.replaceAll('_',' ')}</th>)}</tr></thead><tbody>{visible.slice(0,500).map((r,i)=><tr key={r.id||i}>{columns.map(k=><td key={k} title={cell(r[k])} style={{padding:'7px 10px',borderBottom:'1px solid #eef0f3',maxWidth:260,overflow:'hidden',textOverflow:'ellipsis'}}>{cell(r[k])}</td>)}</tr>)}</tbody></table>{visible.length>500&&<div style={{padding:12,fontSize:12,color:'#6b7280'}}>Showing first 500 matching records on screen. Exports include all {visible.length.toLocaleString()} matching records.</div>}{!visible.length&&<div style={{padding:22,fontSize:12,color:'#6b7280'}}>No records match the selected filters.</div>}</div>:null}
    </div>}
  </div>
}
