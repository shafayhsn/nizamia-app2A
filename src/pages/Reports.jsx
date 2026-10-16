import { formatDate as appFormatDate } from '../lib/utils'
import React, { useEffect, useMemo, useState } from 'react'
import * as XLSX from 'xlsx'
import { Search, FileSpreadsheet, Printer, RefreshCw, ArrowLeft, FileText, Columns3, RotateCcw, Star } from 'lucide-react'
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
// Phase 4: shipping and directory views display existing saved fields only.
const PHASE4 = [
 {category:'Shipping & Parcels',reports:[
  ['Shipment Schedule','shipments','shipments'],['Shipment Line Register','shipment_lines','shipmentLines'],
  ['Parcel Dispatch Register','parcels','parcels'],['Packing Snapshot Register','packing_snapshots','packing'],
 ]},
 {category:'Buyers & Suppliers',reports:[
  ['Buyer Contact Directory','buyers','buyers'],['Supplier Contact Directory','suppliers','suppliers'],
  ['Fabric Supplier Directory','suppliers','suppliers','fabric'],['Trim Supplier Directory','suppliers','suppliers','trim'],
 ]},
]
const PHASE4_VIEWS = {
 shipments:[['Shipment #','shipment_no'],['Shipment Date','shipment_date'],['Status','status'],['Container #','container_no'],['Booking Ref','booking_ref'],['ETD','etd'],['ETA','eta'],['Gate Pass #','gate_pass_no'],['Delivery Challan #','delivery_challan_no'],['GD #','gd_no'],['HBL / HAWB #','hbl_hawb_no'],['Invoice #','fi_no']],
 shipmentLines:[['Shipment #','Shipment #'],['Job #','Job #'],['Buyer','Buyer'],['Style #','Style #'],['Customer PO #','Customer PO #'],['Shipped Qty (pcs)','shipped_qty']],
 parcels:[['Tracking #','tracking_no'],['Courier','courier'],['Status','status'],['Dispatch Date','dispatch_date'],['Dispatched At','dispatched_at'],['Notes','notes']],
 packing:[['Job #','Job #'],['Buyer','Buyer'],['Style #','Style #'],['Customer PO #','Customer PO #'],['Mode','mode'],['Created','created_at']],
 buyers:[['Buyer','name'],['Contact','contact_person'],['Email','email'],['Phone','phone'],['Country','country'],['Currency','currency'],['Payment Terms (days)','payment_terms_days'],['Active','is_active']],
 suppliers:[['Supplier','name'],['Category','category'],['Process','process'],['Contact','contact_person'],['Email','email'],['Phone','phone'],['Lead Time (days)','lead_time_days'],['Active','is_active']],
}
// Phase 3: production and materials views reuse persisted records, not new demand formulas.
const OPERATIONS = [
 {category:'Materials & BOM',reports:[
  ['Order BOM Detail','bom_items','bom'],['Material Library Directory','library_items','materials'],
  ['BOM Preset Register','bom_presets','presets'],['BOM Preset Components','bom_preset_items','presetItems'],
 ]},
 {category:'Production & Processes',reports:[
  ['Production Queue Register','order_queues','queues'],['Washing Instructions','washing','washing'],
  ['Embellishment Instructions','embellishments','embellishments'],['Finishing Instructions','finishing','finishing'],
  ['Order Process Register','order_processes','processes'],
 ]},
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
const ACTIVE_COLUMNS = [['Picture','picture'],['Job / Status','job_status'],['Buyer','buyer_name'],['Store','store_name'],['Style / Description','style_desc'],['PO #','po_number'],['Factory Ref','factory_ref'],['Qty / Ship / Balance','qty_ship_balance'],['Value (USD)','total_value_usd'],['Ship Date','ship_date'],['#QS','queue_count']]
const isActiveOrders = r => r?.title === 'Active Orders'
const activeImage = r => r.style_image_base64 || r.style_image_url || ''
const activeImageHTML = r => {const src=activeImage(r);return src && /^(data:image\/|https?:\/\/)/i.test(src)?`<img class="style-picture" src="${escapeHTML(src)}" alt="Style picture"/>`:''}
const activeCellHTML=(k,r)=>k==='picture'?activeImageHTML(r):k==='job_status'?`<b>${escapeHTML(r.job_number)}</b><div>${escapeHTML(r.status)}</div>`:k==='style_desc'?`<b>${escapeHTML(r.style_number)}</b><div>${escapeHTML(r.description)}</div>`:k==='qty_ship_balance'?`<b>${formatNumber(Number(r.total_qty)||0)}</b><div>Ship ${formatNumber(Number(r.shipped_qty)||0)} · Bal ${formatNumber(Number(r.balance_qty)||0)}</div>`:escapeHTML(reportValue(k,r[k]))
const activeGroups = rows => {const groups=new Map();rows.forEach(r=>{const key=r.style_number||'Unspecified style';if(!groups.has(key))groups.set(key,[]);groups.get(key).push(r)});return [...groups]}
const OP_VIEWS = {
 bom:[['Job #','Job #'],['Buyer','Buyer'],['Style #','Style #'],['Customer PO #','Customer PO #'],['Material','material_name'],['Category','category'],['Description','description'],['Qty','qty'],['Unit','unit'],['Rate','unit_rate'],['Amount','amount']],
 materials:[['Name','name'],['Category','category'],['Type','type'],['Description','description'],['Unit','unit'],['Code','code']],
 presets:[['Name','name'],['Buyer','buyer_name'],['Category','category'],['Description','description']],
 presetItems:[['Description','description'],['Material','material_name'],['Qty','qty'],['Unit','unit']],
 queues:[['Job #','Job #'],['Buyer','Buyer'],['Style #','Style #'],['Customer PO #','Customer PO #'],['Status','status'],['Qty','qty'],['Colour','color_name'],['Process','process_name']],
 washing:[['Job #','Job #'],['Buyer','Buyer'],['Style #','Style #'],['Customer PO #','Customer PO #'],['Wash','wash_name'],['Colour','color_name'],['Status','status']],
 embellishments:[['Job #','Job #'],['Buyer','Buyer'],['Style #','Style #'],['Customer PO #','Customer PO #'],['Description','description'],['Process','process_name'],['Status','status']],
 finishing:[['Job #','Job #'],['Buyer','Buyer'],['Style #','Style #'],['Customer PO #','Customer PO #'],['Description','description'],['Status','status']],
 processes:[['Job #','Job #'],['Buyer','Buyer'],['Style #','Style #'],['Customer PO #','Customer PO #'],['Process','process_name'],['Status','status'],['Qty','qty'],['Unit','unit']],
}
// Only additive business quantities/amounts are totalled. Identifiers, sizes, rates and percentages are excluded.
const TOTAL_KEYS = /^(total_qty|req_pcs|qty|quantity|required_qty|ordered_qty|received_qty|amount|total_amount|total_value_usd|invoice_value)$/i
const numericValue = v => v !== null && v !== '' && Number.isFinite(Number(v)) ? Number(v) : null
const totalInfo = (rows,cols) => cols.filter(k=>TOTAL_KEYS.test(k)).map(k=>({key:k,values:rows.map(r=>numericValue(r[k])).filter(v=>v!==null)})).filter(x=>x.values.length)
const formatNumber = n => new Intl.NumberFormat('en-US',{maximumFractionDigits:2}).format(n)
const columnWidth = (rows,key,label) => {
 const samples=rows.slice(0,1000).map(r=>cell(r[key]).length)
 return Math.min(45,Math.max(6,Math.min(32,Math.max(label.length,...samples,0)+2)))
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
const flatten = [...PHASE4.flatMap(group=>group.reports.map(([title,table,kind,mode])=>({title,table,kind,mode,category:group.category,phase4:true}))),...OPERATIONS.flatMap(group=>group.reports.map(([title,table,kind])=>({title,table,kind,category:group.category,operations:true}))),...BUSINESS.flatMap(group => group.reports.map(([title,table,kind,mode,groupBy,defaultDate])=>({title,table,kind,mode,groupBy,defaultDate,category:group.category,business:true}))),...CATALOG.flatMap(group => group.reports.map(([title,table,fields])=>({ title,table,fields,category:group.category })))]
const safe = s => String(s||'').replace(/[^a-zA-Z0-9_-]+/g,'-').replace(/^-|-$/g,'').slice(0,70)
const stamp = () => new Date().toISOString().slice(0,10)
const cell = value => value == null ? '' : typeof value === 'object' ? JSON.stringify(value) : String(value)
const reportDate = value => {
  if (value == null || value === '') return ''
  const raw=String(value)
  const match=raw.match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (!match) return raw
  const [,year,month,day]=match
  const names=['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
  const index=Number(month)-1
  if(index<0||index>11||Number(day)<1||Number(day)>31)return raw
  return `${appFormatDate(raw.slice(0,10))}${raw.includes('T')?' '+raw.slice(11,16):''}`
}
const isReportDate = key => /(^|_)(date|created_at|updated_at|dispatched_at|received_at|etd|eta)$|date|deadline/i.test(key)
const reportValue=(key,value)=>isReportDate(key) && typeof value==='string' ? reportDate(value) : value
const reportTimestamp=()=>`${reportDate(new Date().toLocaleDateString('en-CA'))} ${new Date().toLocaleTimeString('en-GB',{hour:'2-digit',minute:'2-digit'})}`

const escapeHTML = s => cell(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;')
const btn = { border:'1px solid #d9dce4', background:'#fff', padding:'9px 13px', borderRadius:7, cursor:'pointer', display:'inline-flex', alignItems:'center', gap:7, fontSize:12, fontWeight:600 }

export default function Reports() {
  const [active,setActive] = useState(null)
  const [catalogSearch,setCatalogSearch] = useState('')
  const [favorites,setFavorites] = useState(()=>{try{return JSON.parse(window.localStorage.getItem('app2a-report-favorites')||'[]')}catch{return []}})
  const favoriteKey=r=>`${r.category}:${r.title}`
  const toggleFavorite=r=>setFavorites(old=>{const key=favoriteKey(r);const next=old.includes(key)?old.filter(x=>x!==key):[...old,key];try{window.localStorage.setItem('app2a-report-favorites',JSON.stringify(next))}catch(_){}return next})
  const [category,setCategory] = useState('All')
  const [rows,setRows] = useState([])
  const [columns,setColumns] = useState([])
  const [selectedColumns,setSelectedColumns] = useState([])
  const [columnsOpen,setColumnsOpen] = useState(false)
  const [loading,setLoading] = useState(false)
  const [error,setError] = useState('')
  const [filter,setFilter] = useState('')
  const [dateFrom,setDateFrom] = useState('')
  const [dateTo,setDateTo] = useState('')
  const [dateField,setDateField] = useState('')
  const [printOrientation,setPrintOrientation] = useState('landscape')
  const [truncated,setTruncated] = useState(false)
  const [printedBy,setPrintedBy] = useState('User not available')
  useEffect(()=>{supabase.auth.getUser().then(({data})=>{const u=data?.user;setPrintedBy(u?.user_metadata?.full_name||u?.user_metadata?.name||u?.email||'User not available')}).catch(()=>{})},[])
  const [statusFilter,setStatusFilter] = useState('All')
  const [groupFilter,setGroupFilter] = useState('All')
  const [buyerFilter,setBuyerFilter] = useState('All')
  const [styleFilter,setStyleFilter] = useState('All')
  const dateFields = useMemo(()=>columns.filter(k=>/date|created_at|updated_at|due_at|deadline/i.test(k)),[columns])
  useEffect(()=>{ if (!active) return; let cancelled=false; (async()=>{
    setLoading(true);setError('');setRows([]);setColumns([]);setSelectedColumns([]);setColumnsOpen(false);setTruncated(false);setFilter('');setDateField('');setDateFrom('');setDateTo('');setStatusFilter('All');setGroupFilter('All');setBuyerFilter('All');setStyleFilter('All')
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
      if(active.business || active.operations || active.phase4){
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
        if(active.kind==='shipmentLines'){
          const shipments=await lookup('shipments');const shipMap=map(shipments)
          finalRows=finalRows.map(r=>({...r,'Shipment #':shipMap.get(r.shipment_id)?.shipment_no||''}))
        }
        if(active.mode==='fabric'||active.mode==='trim')finalRows=finalRows.filter(r=>String(r.category||'').toLowerCase().includes(active.mode))
      }
      if(isActiveOrders(active)){
        const [shipResult,queueResult]=await Promise.all([supabase.from('shipment_lines').select('order_id,shipped_qty'),supabase.from('order_queues').select('id,order_id')])
        if(shipResult.error)throw shipResult.error
        if(queueResult.error)throw queueResult.error
        const shipped=new Map(),queues=new Map()
        ;(shipResult.data||[]).forEach(l=>shipped.set(l.order_id,(shipped.get(l.order_id)||0)+(Number(l.shipped_qty)||0)))
        ;(queueResult.data||[]).forEach(q=>queues.set(q.order_id,(queues.get(q.order_id)||0)+1))
        finalRows=finalRows.map(r=>({...r,shipped_qty:shipped.get(r.id)||0,balance_qty:Math.max(0,(Number(r.total_qty)||0)-(shipped.get(r.id)||0)),queue_count:queues.get(r.id)||0}))
      }
      const keys=isActiveOrders(active)?ACTIVE_COLUMNS.map(([,k])=>k):active.phase4?PHASE4_VIEWS[active.kind].map(([,k])=>k):active.business?VIEWS[active.kind].map(([,k])=>k):active.operations?[...new Set([...OP_VIEWS[active.kind].map(([,k])=>k).filter(k=>finalRows.some(r=>r[k]!==undefined)||['Job #','Buyer','Style #','Customer PO #'].includes(k)),...finalRows.flatMap(row=>Object.keys(row)).filter(k=>!['id','order_id','created_at','updated_at'].includes(k))])]:[...new Set(finalRows.flatMap(row=>Object.keys(row)))];
      const ordered=(active.business||active.operations||active.phase4) ? keys : active.fields ? [...active.fields.filter(f=>keys.includes(f)),...keys.filter(f=>!active.fields.includes(f))] : keys
      setColumns(ordered);
      // Per-report preferences are display-only and never modify Supabase records.
      let preferred = null
      try { preferred = JSON.parse(window.localStorage.getItem(`app2a-report-columns:${active.category}:${active.title}`)) } catch (_) {}
      const chosen = Array.isArray(preferred) ? ordered.filter(k=>preferred.includes(k)) : ordered
      setSelectedColumns(chosen.length ? chosen : ordered);setRows(finalRows);setDateField(active.defaultDate||'');setTruncated(all.length>=limit)
    } catch(e){if(!cancelled)setError(e?.message||'Unable to load report')} finally {if(!cancelled)setLoading(false)}
  })();return()=>{cancelled=true} },[active])
  const visible=useMemo(()=>rows.filter(row=>{
    if(isActiveOrders(active)&&buyerFilter!=='All'&&row.buyer_name!==buyerFilter)return false
    if(isActiveOrders(active)&&styleFilter!=='All'&&row.style_number!==styleFilter)return false
    if(statusFilter!=='All' && cell(row.status)!==statusFilter)return false
    if(groupFilter!=='All' && cell(row[active?.groupBy])!==groupFilter)return false
    if(filter && !Object.values(row).some(value=>cell(value).toLowerCase().includes(filter.toLowerCase())))return false
    if(dateField && (dateFrom||dateTo)){
      const v=cell(row[dateField]).slice(0,10)
      if(!v || (dateFrom && v<dateFrom) || (dateTo && v>dateTo))return false
    }
    return true
  }),[rows,filter,dateField,dateFrom,dateTo,statusFilter,groupFilter,buyerFilter,styleFilter,active])
  const statusOptions=useMemo(()=>[...new Set(rows.map(r=>cell(r.status)).filter(Boolean))].sort(),[rows])
  const groupOptions=useMemo(()=>active?.groupBy?[...new Set(rows.map(r=>cell(r[active.groupBy])).filter(Boolean))].sort():[],[rows,active])
  const buyerOptions=useMemo(()=>[...new Set(rows.map(r=>r.buyer_name).filter(Boolean))].sort(),[rows])
  const styleOptions=useMemo(()=>[...new Set(rows.map(r=>r.style_number).filter(Boolean))].sort(),[rows])
  const displayColumns=columns.filter(k=>selectedColumns.includes(k))
  const changeColumn=(key,checked)=>{
    const next=checked?columns.filter(k=>selectedColumns.includes(k)||k===key):selectedColumns.filter(k=>k!==key)
    if(!next.length)return
    setSelectedColumns(next)
    try {window.localStorage.setItem(`app2a-report-columns:${active.category}:${active.title}`,JSON.stringify(next))}catch(_){}
  }
  const resetColumns=()=>{setSelectedColumns(columns);try{window.localStorage.removeItem(`app2a-report-columns:${active.category}:${active.title}`)}catch(_){}}
  const label=k=>isActiveOrders(active)?(ACTIVE_COLUMNS.find(([,key])=>key===k)?.[0]||k):active?.phase4?(PHASE4_VIEWS[active.kind].find(([,key])=>key===k)?.[0]||k.replaceAll('_',' ')):active?.business?(VIEWS[active.kind].find(([,key])=>key===k)?.[0]||k):active?.operations?(OP_VIEWS[active.kind].find(([,key])=>key===k)?.[0]||k.replaceAll('_',' ')):k.replaceAll('_',' ')
  const filename=()=>`${safe(active?.title)}${dateFrom?`_From-${dateFrom}`:''}${dateTo?`_To-${dateTo}`:''}_${stamp()}`
  const totals=useMemo(()=>totalInfo(visible,displayColumns),[visible,selectedColumns,columns])
  const groupedTotals=useMemo(()=>totals.map(t=>({key:t.key,value:t.values.reduce((a,b)=>a+b,0)})),[totals])
  const widthFor=k=>columnWidth(visible,k,label(k))
  const excel=()=>{
    if(!active||loading||truncated)return
    const wb=XLSX.utils.book_new()
    const headers=displayColumns.map(label)
    const data=[headers,...visible.map(r=>displayColumns.map(k=>isActiveOrders(active)?(k==='picture'?'':k==='job_status'?`${r.job_number||''} / ${r.status||''}`:k==='style_desc'?`${r.style_number||''} / ${r.description||''}`:k==='qty_ship_balance'?`${r.total_qty||0} / ${r.shipped_qty||0} / ${r.balance_qty||0}`:reportValue(k,r[k])):r[k]==null?'':typeof r[k]==='object'?JSON.stringify(r[k]):reportValue(k,r[k])))]
    if(groupedTotals.length)data.push(displayColumns.map((k,i)=>groupedTotals.some(t=>t.key===k)?groupedTotals.find(t=>t.key===k).value:i===0?'TOTAL':''))
    const ws=XLSX.utils.aoa_to_sheet(data)
    ws['!cols']=displayColumns.map(k=>({wch:widthFor(k)}))
    ws['!autofilter']={ref:`A1:${XLSX.utils.encode_col(displayColumns.length-1)}${visible.length+1}`}
    ws['!printHeader']='&CNIZAMIA APPARELS — '+active.title
    ws['!printFooter']='&LPrinted by: '+printedBy+'&CPage &P of &N&R'+reportTimestamp()
    ws['!pageSetup']={orientation:printOrientation,paperSize:9,fitToWidth:1,fitToHeight:0}
    ws['!margins']={left:0.25,right:0.25,top:0.55,bottom:0.55,header:0.2,footer:0.2}
    XLSX.utils.book_append_sheet(wb,ws,safe(active.title).slice(0,31));XLSX.writeFile(wb,`${filename()}.xlsx`)
  }
  const print=()=>{
    if(!active||loading||truncated)return
    const when=reportTimestamp()
    // Explicit A4 page sections: each page owns its header, table heading, and footer.
    // Conservative row limits prevent the previous browser footer/header collision.
    const perPage=isActiveOrders(active)?(printOrientation==='landscape'?21:28):(printOrientation==='landscape'?24:35)
    const pages=[]
    for(let i=0;i<visible.length;i+=perPage)pages.push(visible.slice(i,i+perPage))
    if(!pages.length)pages.push([])
    const totalRow=groupedTotals.length?`<tr class="total">${displayColumns.map((k,i)=>`<td>${groupedTotals.some(t=>t.key===k)?escapeHTML(formatNumber(groupedTotals.find(t=>t.key===k).value)):i===0?'TOTAL':''}</td>`).join('')}</tr>`:''
    // Keep the totals on a dedicated final page if the last page is full.
    if(totalRow && pages[pages.length-1].length>=perPage)pages.push([])
    const filterText=[isActiveOrders(active)&&buyerFilter!=='All'?`Buyer: ${buyerFilter}`:'',isActiveOrders(active)&&styleFilter!=='All'?`Style: ${styleFilter}`:'',statusFilter!=='All'?`Status: ${statusFilter}`:'',groupFilter!=='All'?`Group: ${groupFilter}`:'',dateFrom?`From: ${reportDate(dateFrom)}`:'',dateTo?`To: ${reportDate(dateTo)}`:''].filter(Boolean).join(' · ')
    const printPages=isActiveOrders(active)?(()=>{
      const chunks=[];let chunk=[];let count=0
      activeGroups(visible).forEach(([style,items])=>items.forEach((r,i)=>{
        const newGroup = i===0 || count===0
        const cost=1+(newGroup?1:0)
        if(count+cost>perPage && chunk.length){chunks.push(chunk);chunk=[];count=0}
        if(i===0 || count===0){chunk.push({group:style,items,continued:i>0});count++}
        chunk.push({row:r});count++
      }))
      if(!chunks.length||chunk.length)chunks.push(chunk)
      return chunks
    })():pages
    // Merge consecutive identical picture/buyer cells only within a printed
    // style group and page. Never merge unrelated styles or across page breaks.
    const activePageRows=page=>{
      const output=[]
      page.forEach((entry,i)=>{
        if(entry.group){output.push(`<tr class="group-heading"><td colspan="${displayColumns.length}">Style ${escapeHTML(entry.group)}${entry.continued?' (continued)':''} — ${entry.items.length} orders · Qty: ${formatNumber(entry.items.reduce((n,r)=>n+(Number(r.total_qty)||0),0))} · Value: $${formatNumber(entry.items.reduce((n,r)=>n+(Number(r.total_value_usd)||0),0))}</td></tr>`);return}
        let tds=''
        for(const k of displayColumns){
          if(k==='picture'||k==='buyer_name'){
            const value=k==='picture'?activeImage(entry.row):entry.row.buyer_name
            const previous=page[i-1]
            const prevValue=previous?.row?(k==='picture'?activeImage(previous.row):previous.row.buyer_name):null
            if(previous?.row && value===prevValue)continue
            let span=1
            while(page[i+span]?.row && (k==='picture'?activeImage(page[i+span].row):page[i+span].row.buyer_name)===value)span++
            tds+=`<td rowspan="${span}" class="merged-cell">${activeCellHTML(k,entry.row)}</td>`
          }else tds+=`<td>${activeCellHTML(k,entry.row)}</td>`
        }
        output.push(`<tr>${tds}</tr>`)
      })
      return output.join('')
    }
    const pageHTML=printPages.map((page,index)=>`<section class="report-page">
      <header><strong>NIZAMIA APPARELS</strong><div>${escapeHTML(active.title)}</div><small>${visible.length} records · ${escapeHTML(active.category)}${filterText?' · '+escapeHTML(filterText):''}</small></header>
      <main><table><colgroup>${displayColumns.map(k=>`<col style="width:${widthFor(k)}ch">`).join('')}</colgroup><thead><tr>${displayColumns.map(k=>`<th>${escapeHTML(label(k))}</th>`).join('')}</tr></thead><tbody>${isActiveOrders(active)?activePageRows(page):page.map(r=>`<tr>${displayColumns.map(k=>`<td>${escapeHTML(reportValue(k,r[k]))}</td>`).join('')}</tr>`).join('')}${index===printPages.length-1?totalRow:''}</tbody></table></main>
      <footer><span>Printed by: ${escapeHTML(printedBy)}</span><span>Printed on: ${escapeHTML(when)}</span><span>Page ${index+1} of ${printPages.length}</span></footer>
    </section>`).join('')
    const html=`<html><head><title>${escapeHTML(filename())}</title><style>
      @page{size:A4 ${printOrientation};margin:0}
      *{box-sizing:border-box}
      html,body{margin:0;padding:0;color:#000;font:10px Arial,sans-serif}
      .report-page{width:${printOrientation==='landscape'?'297mm':'210mm'};height:${printOrientation==='landscape'?'210mm':'297mm'};padding:12mm 10mm 11mm;display:flex;flex-direction:column;break-after:page;page-break-after:always;overflow:hidden}
      .report-page:last-child{break-after:auto;page-break-after:auto}
      header{flex-shrink:0;border-bottom:2px solid #000;padding-bottom:7px;margin-bottom:9px}
      header strong{font-size:14px}header div{font-size:13px;font-weight:bold;margin:4px 0}header small{color:#000;font-weight:600}
      main{flex:1;min-height:0}
      table{border-collapse:collapse;width:100%;table-layout:auto}
      th,td{border:1px solid #777;padding:3px 4px;text-align:left;overflow-wrap:anywhere;vertical-align:top;line-height:1.2}
      th{background:#fff;color:#000;font-size:9px;font-weight:800;text-transform:uppercase;border-bottom:2px solid #000}tr{break-inside:avoid;page-break-inside:avoid}
      .total td{background:#fff;color:#000;font-weight:800;border-top:2px solid #000}.group-heading td{background:#fff;color:#000;font-size:10px;font-weight:800;border-top:2px solid #000;border-bottom:2px solid #000;padding:6px 4px}.style-picture{width:34px;height:38px;object-fit:contain;filter:grayscale(1) contrast(1.2)}
      .merged-cell{vertical-align:middle;font-weight:600}
      footer{flex-shrink:0;margin-top:8px;border-top:1px solid #aaa;display:flex;justify-content:space-between;gap:12px;font-size:9px;color:#000;font-weight:600;padding-top:5px}
      @media screen{body{background:#eee}.report-page{background:white;margin:8px auto;box-shadow:0 1px 6px #aaa}}
    </style></head><body>${pageHTML}</body></html>`
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
        <select value={category} onChange={e=>setCategory(e.target.value)} style={{...btn,minWidth:180}}><option>All</option>{[...new Set([...PHASE4,...OPERATIONS,...BUSINESS,...CATALOG].map(c=>c.category))].map(c=><option key={c}>{c}</option>)}</select>
      </div>
      {favorites.length>0&&category==='All'&&!catalogSearch&&<section style={{marginBottom:22,padding:14,border:'1px solid #e5defc',borderRadius:11,background:'#faf8ff'}}><div style={{fontSize:14,fontWeight:750,marginBottom:10,color:'#513b92'}}>★ Favorite Reports</div><div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(235px,1fr))',gap:10}}>{flatten.filter(r=>favorites.includes(favoriteKey(r))).map(r=><div key={`fav-${favoriteKey(r)}`} style={{display:'flex',alignItems:'center',background:'#fff',border:'1px solid #ddd6fe',borderRadius:10}}><button type="button" title="Remove favorite" aria-label={`Unfavorite ${r.title}`} onClick={()=>toggleFavorite(r)} style={{border:0,background:'transparent',cursor:'pointer',padding:'12px 8px 12px 12px'}}><Star size={17} fill="#eab308" color="#d4a017"/></button><button onClick={()=>setActive(r)} style={{border:0,background:'transparent',cursor:'pointer',padding:'12px 10px 12px 0',fontSize:12,fontWeight:650,textAlign:'left',flex:1}}>{r.title}</button></div>)}</div></section>}
      {[...new Set(matches.map(r=>r.category))].map(group=>{
        const items=matches.filter(r=>r.category===group);if(!items.length)return null
        return <section key={group} style={{marginBottom:20}}><div style={{fontSize:14,fontWeight:750,marginBottom:9}}>{group} <span style={{fontSize:11,color:'#9ca3af'}}>({items.length})</span></div><div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(235px,1fr))',gap:10}}>{items.map(r=><div key={favoriteKey(r)} style={{background:'#fff',border:'1px solid #e4e7ec',borderRadius:10,display:'flex',alignItems:'center',gap:4}}><button type="button" title={favorites.includes(favoriteKey(r))?'Remove from favorites':'Add to favorites'} aria-label={`Favorite ${r.title}`} onClick={()=>toggleFavorite(r)} style={{border:0,background:'transparent',padding:'13px 4px 13px 12px',cursor:'pointer',flexShrink:0}}><Star size={17} color={favorites.includes(favoriteKey(r))?'#d4a017':'#a3aab8'} fill={favorites.includes(favoriteKey(r))?'#eab308':'none'}/></button><button onClick={()=>setActive(r)} style={{border:0,background:'transparent',padding:'13px 12px 13px 3px',textAlign:'left',cursor:'pointer',display:'flex',alignItems:'center',gap:9,flex:1,minWidth:0}}><FileText size={17} color="#5064a2" style={{flexShrink:0}}/><span style={{fontSize:12,fontWeight:650}}>{r.title}</span></button></div>)}</div></section>
      })}
    </> : <div style={{background:'#fff',border:'1px solid #e4e7ec',borderRadius:12,padding:16}}>
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',gap:12,flexWrap:'wrap',marginBottom:14}}><div><div style={{fontSize:17,fontWeight:700}}>{active.title}</div><div style={{fontSize:12,color:'#6b7280',marginTop:4}}>{active.category} · {visible.length.toLocaleString()} displayed / {rows.length.toLocaleString()} loaded</div></div><div style={{display:'flex',gap:8,flexWrap:'wrap'}}><button style={btn} disabled={loading} onClick={()=>setActive({...active})}><RefreshCw size={14}/> Refresh</button><div style={{position:'relative'}}><button style={{...btn,background:columnsOpen?'#eef2ff':'#fff',color:'#4338ca',borderColor:'#c7d2fe'}} disabled={loading||!!error||!columns.length} onClick={()=>setColumnsOpen(v=>!v)}><Columns3 size={14}/> Columns ({displayColumns.length}/{columns.length})</button>{columnsOpen&&<div style={{position:'absolute',right:0,top:'calc(100% + 6px)',zIndex:30,width:280,maxHeight:360,overflow:'auto',background:'#fff',border:'1px solid #d9dce4',borderRadius:9,boxShadow:'0 12px 35px #18233a2b',padding:12}}><div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:10}}><strong style={{fontSize:12}}>Customize Columns</strong><button type='button' style={{...btn,padding:'4px 7px',fontSize:11}} onClick={resetColumns}><RotateCcw size={12}/> Reset</button></div>{columns.map(k=><label key={k} style={{display:'flex',alignItems:'center',gap:9,padding:'6px 4px',fontSize:12,cursor:'pointer'}}><input type='checkbox' checked={selectedColumns.includes(k)} disabled={selectedColumns.length===1&&selectedColumns.includes(k)} onChange={e=>changeColumn(k,e.target.checked)}/><span>{label(k)}</span></label>)}<div style={{fontSize:10,color:'#6b7280',marginTop:8}}>Selections apply to the table, Excel and Print/PDF. Saved in this browser for each report.</div></div>}</div><button style={btn} disabled={loading||!!error||truncated} onClick={excel}><FileSpreadsheet size={14}/> Excel .xlsx</button><button style={btn} disabled={loading||!!error||truncated} onClick={print}><Printer size={14}/> Print / PDF</button></div></div>
      <div style={{display:'flex',gap:9,flexWrap:'wrap',marginBottom:14,alignItems:'center'}}>{isActiveOrders(active)&&<><select value={buyerFilter} onChange={e=>setBuyerFilter(e.target.value)} style={btn}><option value="All">All buyers</option>{buyerOptions.map(v=><option key={v}>{v}</option>)}</select><select value={styleFilter} onChange={e=>setStyleFilter(e.target.value)} style={btn}><option value="All">All styles</option>{styleOptions.map(v=><option key={v}>{v}</option>)}</select></>}{active.business&&<select value={statusFilter} onChange={e=>setStatusFilter(e.target.value)} style={btn}><option value="All">All statuses</option>{statusOptions.map(v=><option key={v}>{v}</option>)}</select>}{active.groupBy&&<select value={groupFilter} onChange={e=>setGroupFilter(e.target.value)} style={btn}><option>All</option>{groupOptions.map(v=><option key={v}>{v}</option>)}</select>}<input value={filter} onChange={e=>setFilter(e.target.value)} placeholder="Filter any field..." style={{...btn,minWidth:210,fontWeight:400}}/><select value={dateField} onChange={e=>setDateField(e.target.value)} style={btn}><option value="">No date filter</option>{dateFields.map(k=><option key={k}>{label(k)}</option>)}</select>{dateField&&<><input type="date" value={dateFrom} onChange={e=>setDateFrom(e.target.value)} style={btn}/><input type="date" value={dateTo} onChange={e=>setDateTo(e.target.value)} style={btn}/></>}<select value={printOrientation} onChange={e=>setPrintOrientation(e.target.value)} style={btn}><option value="landscape">A4 Landscape</option><option value="portrait">A4 Portrait</option></select></div>
      {error&&<div style={{color:'#b91c1c',background:'#fef2f2',padding:12,borderRadius:8,marginBottom:12}}>Could not load report: {error}</div>}
      {truncated&&<div style={{color:'#92400e',background:'#fffbeb',padding:12,borderRadius:8,marginBottom:12}}>This report exceeds the 30,000-record preview limit. Export is disabled to prevent incomplete files.</div>}
      {loading?<div style={{padding:30,color:'#6b7280'}}>Loading live records…</div>:!error?<div style={{overflow:'auto',maxHeight:'calc(100vh - 320px)',border:'1px solid #e5e7eb',borderRadius:8}}><table style={{borderCollapse:'collapse',width:'100%',fontSize:11,whiteSpace:'nowrap'}}><thead><tr>{displayColumns.map(k=><th key={k} style={{position:'sticky',top:0,background:'#f2f4f8',padding:'9px 10px',textAlign:'left',borderBottom:'1px solid #d1d5db'}}>{label(k)}</th>)}</tr></thead><tbody>{isActiveOrders(active)?activeGroups(visible.slice(0,500)).flatMap(([style,items])=>[<tr key={`group-${style}`} style={{background:'#f2f4f7',fontWeight:800}}><td colSpan={displayColumns.length} style={{padding:'9px 10px',borderTop:'2px solid #374151',borderBottom:'1px solid #374151'}}>Style {style} — {items.length} orders · Qty: {formatNumber(items.reduce((n,r)=>n+(Number(r.total_qty)||0),0))} · Value: ${formatNumber(items.reduce((n,r)=>n+(Number(r.total_value_usd)||0),0))}</td></tr>,...items.map(r=><tr key={r.id}>{displayColumns.map(k=><td key={k} style={{padding:'7px 10px',borderBottom:'1px solid #d1d5db',verticalAlign:'middle'}}>{k==='picture'?(activeImage(r)?<img src={activeImage(r)} alt="Style" style={{width:38,height:44,objectFit:'contain'}}/>:''):k==='job_status'?<><strong>{r.job_number}</strong><div>{r.status}</div></>:k==='style_desc'?<><strong>{r.style_number}</strong><div>{r.description}</div></>:k==='qty_ship_balance'?<><strong>{formatNumber(Number(r.total_qty)||0)}</strong><div>Ship {formatNumber(Number(r.shipped_qty)||0)} · Bal {formatNumber(Number(r.balance_qty)||0)}</div></>:cell(reportValue(k,r[k]))}</td>)}</tr>)]):visible.slice(0,500).map((r,i)=><tr key={r.id||i}>{displayColumns.map(k=><td key={k} title={cell(reportValue(k,r[k]))} style={{padding:'7px 10px',borderBottom:'1px solid #eef0f3',maxWidth:260,overflow:'hidden',textOverflow:'ellipsis'}}>{cell(reportValue(k,r[k]))}</td>)}</tr>)}</tbody></table>{visible.length>500&&<div style={{padding:12,fontSize:12,color:'#6b7280'}}>Showing first 500 matching records on screen. Exports include all {visible.length.toLocaleString()} matching records.</div>}{groupedTotals.length>0&&<div style={{display:'flex',gap:16,flexWrap:'wrap',padding:'10px 12px',background:'#eef2f7',fontSize:12,fontWeight:700}}>{groupedTotals.map(t=><span key={t.key}>{label(t.key)}: {formatNumber(t.value)}</span>)}</div>}{!visible.length&&<div style={{padding:22,fontSize:12,color:'#6b7280'}}>No records match the selected filters.</div>}</div>:null}
    </div>}
  </div>
}
