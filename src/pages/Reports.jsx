import ProductionFormats from './ProductionFormats'
import ProformaInvoice from './ProformaInvoice'
import { formatDate as appFormatDate } from '../lib/utils'
import { useNavigate, useLocation } from 'react-router-dom'
import { Plus } from 'lucide-react'
import React, { useEffect, useMemo, useState } from 'react'
import * as XLSX from 'xlsx'
import { Search, FileSpreadsheet, Printer, RefreshCw, ArrowLeft, FileText, Columns3, RotateCcw, Star } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/authContext'
import { printHTML } from '../components/PrintReports'

// Read-only views of persisted application records. No recalculation of production requirements.
const CATALOG = [
  { category:'Production Daily Register', reports:[
    ['Daily Production','production_daily_entries',['production_date','department','job_number','buyer_name','style_number','po_number','wash_name','size_group_name','production_at','movement','quantity']],
    ['Weekly Production','production_daily_entries',['production_date','department','job_number','style_number','wash_name','size_group_name','production_at','movement','quantity']],
    ['Department-wise Production','production_daily_entries',['department','production_date','job_number','style_number','wash_name','size_group_name','production_at','movement','quantity']],
    ['Style-wise Production','production_daily_entries',['style_number','department','production_date','job_number','wash_name','size_group_name','movement','quantity']],
    ['Order-wise Production','production_daily_entries',['po_number','job_number','style_number','wash_name','size_group_name','department','production_date','movement','quantity']],
    ['Job-wise Production','production_daily_entries',['job_number','po_number','style_number','wash_name','size_group_name','department','production_date','movement','quantity']],
    ['Production Location / Contractor','production_daily_entries',['production_at','department','production_date','job_number','style_number','wash_name','size_group_name','movement','quantity']],
    ['Outsourced Production','production_daily_entries',['department','movement','production_at','production_date','job_number','style_number','wash_name','size_group_name','quantity']],
    ['Production Entry History','production_daily_entries',['created_at','created_by','production_date','department','movement','job_number','po_number','style_number','wash_name','size_group_name','production_at','quantity']],
  ]},
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
    ['Active Orders','orders','orders','active'],['Orders Data Entry Report','orders','orders'],['Order Register','orders','orders'],['Buyer-wise Orders','orders','orders','', 'buyer_name'],['Store-wise Orders','orders','orders','', 'store_name'],['Style-wise Orders','orders','orders','', 'style_number'],['Delivery Schedule','orders','orders','', '', 'ship_date'],
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
const ACTIVE_COLUMNS = [['Picture','picture'],['Job / Status','job_status'],['Buyer','buyer_name'],['Store','store_name'],['Style / Description','style_desc'],['PO #','po_number'],['Factory Ref','factory_ref'],['Fabric','shell_fabric'],['Approvals','approvals'],['Qty / Ship / Balance','qty_ship_balance'],['Value (USD)','total_value_usd'],['Ship Date','ship_date'],['#QS','queue_count']]
const isActiveOrders = r => r?.title === 'Active Orders'
const isDataEntry = r => r?.title === 'Orders Data Entry Report'
const isOrderReport = r => isActiveOrders(r) || isDataEntry(r)
const ENTRY_COLUMNS = [['FTY REF','factory_ref'],['BUYER','buyer_name'],['STYLE #','style_number'],['PO #','po_number'],['STORE','store_name'],['SIZE GROUPS','size_groups_count'],['COLOUR WAYS','colour_ways_count'],['FABRIC USED','fabric_used_count'],['STITCH TRIMS','stitch_trims_count'],['PACK TRIMS','pack_trims_count'],['FIT','fit_count'],['SAMPLE LINES','sample_lines_count'],['WASH DESC','wash_desc_count'],['PRINT / EMB','print_emb_count'],['PROCESS','process_count'],['LAB TEST','lab_test_count']]

const activeImage = r => r.style_image_base64 || r.style_image_url || ''
const activeImageHTML = r => {const src=activeImage(r);return src && /^(data:image\/|https?:\/\/)/i.test(src)?`<img class="style-picture" src="${escapeHTML(src)}" alt="Style picture"/>`:''}
const activeCellHTML=(k,r)=>k==='picture'?activeImageHTML(r):k==='job_status'?`<b>${escapeHTML(r.job_number)}</b><div>${escapeHTML(r.status)}</div>`:k==='style_desc'?`<b>${escapeHTML(r.style_number)}</b><div>${escapeHTML(r.description)}</div>`:k==='approvals'?escapeHTML(r.approvals||'').replace(/\n/g,'<br/>'):k==='qty_ship_balance'?`<b>${formatNumber(Number(r.total_qty)||0)}</b><div>Ship ${formatNumber(Number(r.shipped_qty)||0)} · Bal ${formatNumber(Number(r.balance_qty)||0)}</div>`:escapeHTML(reportValue(k,r[k]))
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
const formatUSD = n => String.fromCharCode(36)+new Intl.NumberFormat('en-US',{minimumFractionDigits:2,maximumFractionDigits:2}).format(Number(n)||0)
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
const flatten = [{title:'Proforma Invoice',table:'orders',category:'Orders & Customers',proforma:true},...PHASE4.flatMap(group=>group.reports.map(([title,table,kind,mode])=>({title,table,kind,mode,category:group.category,phase4:true}))),...OPERATIONS.flatMap(group=>group.reports.map(([title,table,kind])=>({title,table,kind,category:group.category,operations:true}))),...BUSINESS.flatMap(group => group.reports.map(([title,table,kind,mode,groupBy,defaultDate])=>({title,table,kind,mode,groupBy,defaultDate,category:group.category,business:true}))),...CATALOG.flatMap(group => group.reports.map(([title,table,fields])=>({ title,table,fields,category:group.category })))]
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
const reportValue=(key,value)=>key==='total_value_usd'?formatUSD(value):isReportDate(key) && typeof value==='string' ? reportDate(value) : value
const reportTimestamp=()=>`${reportDate(new Date().toLocaleDateString('en-CA'))} ${new Date().toLocaleTimeString('en-GB',{hour:'2-digit',minute:'2-digit'})}`

const escapeHTML = s => cell(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;')
const btn = { border:'1px solid #d9dce4', background:'#fff', padding:'9px 13px', borderRadius:7, cursor:'pointer', display:'inline-flex', alignItems:'center', gap:7, fontSize:12, fontWeight:600 }

export default function Reports() {
  const navigate = useNavigate()
  const location = useLocation()
  const incomingPI = location.state?.proformaOrderIds?.length ? location.state : null
  const [active,setActive] = useState(()=>incomingPI ? {title:'Proforma Invoice',proforma:true} : null)
  const [catalogSearch,setCatalogSearch] = useState('')
  const [favorites,setFavorites] = useState(()=>{try{return JSON.parse(window.localStorage.getItem('app2a-report-favorites')||'[]')}catch{return []}})
  const favoriteKey=r=>`${r.category}:${r.title}`
  const toggleFavorite=r=>setFavorites(old=>{const key=favoriteKey(r);const next=old.includes(key)?old.filter(x=>x!==key):[...old,key];try{window.localStorage.setItem('app2a-report-favorites',JSON.stringify(next))}catch(_){}return next})
  const [category,setCategory] = useState('All')
  const [catalogSort,setCatalogSort] = useState('name')
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
  const [activeGroupBy,setActiveGroupBy] = useState('style')
  const [activeSortBy,setActiveSortBy] = useState('style')
  const [activeSortDir,setActiveSortDir] = useState('asc')
  const [truncated,setTruncated] = useState(false)
  const {user:appUser}=useAuth()
  const printedBy=appUser?.displayName||appUser?.username||appUser?.email||'Unknown user'
  const [statusFilter,setStatusFilter] = useState([])
  const [groupFilter,setGroupFilter] = useState([])
  const [buyerFilter,setBuyerFilter] = useState([])
  const [styleFilter,setStyleFilter] = useState([])
  const [batchOptions,setBatchOptions] = useState([])
  const [batchMembership,setBatchMembership] = useState({})
  const [selectedBatches,setSelectedBatches] = useState([])
  const dateFields = useMemo(()=>columns.filter(k=>/date|created_at|updated_at|due_at|deadline/i.test(k)),[columns])
  useEffect(()=>{ if (!active) return; let cancelled=false; (async()=>{
    setLoading(true);setError('');setRows([]);setColumns([]);setSelectedColumns([]);setColumnsOpen(false);setTruncated(false);setFilter('');setDateField('');setDateFrom('');setDateTo('');setStatusFilter([]);setGroupFilter([]);setBuyerFilter([]);setStyleFilter([]);setSelectedBatches([])
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
      if(active.title==='Outsourced Production') finalRows=finalRows.filter(r=>r.movement==='sent'||r.movement==='received')
      if(isDataEntry(active)){
        const lookup=async(table,fields)=>{const result=[];for(let offset=0;offset<30000;offset+=750){const {data,error}=await supabase.from(table).select(fields).range(offset,offset+749);if(error)throw error;result.push(...(data||[]));if(!data||data.length<750)break}return result}
        const [groups,colours,bom,fitBlocks,fittings,samples,washes,embellishments,processes,tests,batches,members]=await Promise.all([
          lookup('size_groups','id,order_id,group_name'),lookup('size_group_colors','size_group_id,color_name'),
          lookup('bom_items','order_id,category,library_item_id,name,specification,detail'),
          lookup('fitting_blocks','order_id,block_name,spec_code'),lookup('fitting','order_id,fit_block,spec_ref'),
          lookup('samples','order_id,root_sample_id,parent_sample_id,sample_number,sample_type,size_group_name,color,version_no'),
          lookup('washing','order_id,color_name,wash_ref,wash_type'),
          lookup('embellishments','order_id,description,technique,placement,artwork_ref'),
          lookup('order_processes','order_id,process_name'),lookup('testing_requirements','order_id,source_type,source_id,item_name,specification,test_name'),
          lookup('production_batches','id,name'),lookup('production_batch_orders','order_id,batch_id')
        ])
        const byOrder=new Map(all.map(o=>[o.id,{size_groups_count:new Set(),colour_ways_count:new Set(),fabric_used_count:new Set(),stitch_trims_count:new Set(),pack_trims_count:new Set(),fit_count:new Set(),sample_lines_count:new Set(),wash_desc_count:new Set(),print_emb_count:new Set(),process_count:new Set(),lab_test_count:new Set()}]))
        const add=(id,key,value)=>{if(value&&byOrder.has(id))byOrder.get(id)[key].add(String(value).trim().toLowerCase())}
        const groupToOrder=new Map(groups.map(g=>[g.id,g.order_id]))
        for(const g of groups)add(g.order_id,'size_groups_count',g.id)
        for(const c of colours)add(groupToOrder.get(c.size_group_id),'colour_ways_count',c.color_name)
        for(const b of bom){const key=[b.library_item_id||b.name,b.specification,b.detail].filter(Boolean).join('|');const field=b.category==='Fabric'?'fabric_used_count':b.category==='Stitching Trim'?'stitch_trims_count':b.category==='Packing Trim'?'pack_trims_count':null;if(field)add(b.order_id,field,key)}
        for(const f of fitBlocks)add(f.order_id,'fit_count',[f.block_name,f.spec_code].filter(Boolean).join('|'))
        for(const f of fittings)add(f.order_id,'fit_count',[f.fit_block,f.spec_ref].filter(Boolean).join('|'))
        // Sampling lines are distinct requested sample definitions, not their V1/V2 approval history.
        for(const a of samples)add(a.order_id,'sample_lines_count',[a.sample_type,a.size_group_name,a.color].filter(Boolean).join('|')||a.root_sample_id||a.sample_number)
        for(const w of washes)add(w.order_id,'wash_desc_count',[w.color_name,w.wash_ref||w.wash_type].filter(Boolean).join('|'))
        for(const e of embellishments)add(e.order_id,'print_emb_count',[e.description,e.technique,e.placement,e.artwork_ref].filter(Boolean).join('|'))
        for(const p of processes)add(p.order_id,'process_count',p.process_name)
        for(const t of tests)add(t.order_id,'lab_test_count',[t.source_type,t.source_id||t.item_name,t.specification,t.test_name].filter(Boolean).join('|'))
        finalRows=all.map(o=>({...o,...Object.fromEntries(Object.entries(byOrder.get(o.id)).map(([key,set])=>[key,set.size]))}))
        setBatchOptions(batches);setBatchMembership(Object.fromEntries(members.map(m=>[m.order_id,m.batch_id])))
      }
      if(isActiveOrders(active)){
        // Main/shell fabric is the first fabric BOM row; when order is unavailable,
        // use the highest consumption. Keep this read-only for reports and exports.
        const bomRows=[]
        let bomOffset=0
        while(bomOffset<30000){
          const {data,error:be}=await supabase.from('bom_items').select('id,order_id,name,specification,detail,category,sort_order,base_qty,final_qty,created_at').eq('category','Fabric').range(bomOffset,bomOffset+749)
          if(be)throw be
          bomRows.push(...(data||[]))
          if(!data||data.length<750)break
          bomOffset+=750
        }
        const formatShellFabric=b=>{
          if(!b)return ''
          const item=[b.name,b.specification].filter(Boolean).join(' - ')
          return [item,b.detail].filter(Boolean).join(' — ')
        }
        const shellFabric=new Map()
        const consumption=b=>Number(b.base_qty)||Number(b.final_qty)||0
        for(const b of bomRows){
          const old=shellFabric.get(b.order_id)
          const position=b.sort_order==null?Number.MAX_SAFE_INTEGER:Number(b.sort_order)
          const oldPosition=old?.sort_order==null?Number.MAX_SAFE_INTEGER:Number(old.sort_order)
          if(!old||position<oldPosition||(position===oldPosition&&consumption(b)>consumption(old)))shellFabric.set(b.order_id,b)
        }
        const keyFor=o=>JSON.stringify([String(o?.buyer_name||'').trim().toLowerCase(),String(o?.style_number||'').trim().toLowerCase()])
        const lookupWizard=async(table,fields)=>{const result=[];for(let offset=0;offset<30000;offset+=750){const {data,error}=await supabase.from(table).select(fields).range(offset,offset+749);if(error)throw error;result.push(...(data||[]));if(!data||data.length<750)break}return result}
        const [sizeRows,colourRows]=await Promise.all([lookupWizard('size_groups','id,order_id,group_name'),lookupWizard('size_group_colors','size_group_id,color_name')])
        const styleCounts=new Map(),orderLookup=new Map(all.map(o=>[o.id,o]))
        const countFor=o=>{const key=keyFor(o);if(!styleCounts.has(key))styleCounts.set(key,{washes:new Set(),sizes:new Set()});return styleCounts.get(key)}
        const sizeToOrder=new Map(sizeRows.map(g=>[g.id,g.order_id]));for(const item of colourRows){const o=orderLookup.get(sizeToOrder.get(item.size_group_id));if(!o)continue;const colour=String(item.color_name||'').trim().toLowerCase();if(colour)countFor(o).washes.add(colour)}
        for(const item of sizeRows){const o=orderLookup.get(item.order_id);if(!o)continue;const name=String(item.group_name||'').trim().toLowerCase();if(name)countFor(o).sizes.add(name)}
        const [commentResult,parcelResult]=await Promise.all([supabase.from('sample_comments').select('sample_id,comment_type,comment_date').order('comment_date'),supabase.from('parcels').select('id,items,status,dispatch_date,dispatched_at,delivered_at,updated_at,created_at')])
        if(commentResult.error)throw commentResult.error
        if(parcelResult.error)throw parcelResult.error
        const commentsBySample=new Map(),parcelsBySample=new Map()
        for(const c of commentResult.data||[]){if(!commentsBySample.has(c.sample_id))commentsBySample.set(c.sample_id,[]);commentsBySample.get(c.sample_id).push(c)}
        for(const p of parcelResult.data||[])for(const item of p.items||[]){const id=item.sampleId||item.sample_id;if(!id)continue;if(!parcelsBySample.has(id))parcelsBySample.set(id,[]);parcelsBySample.get(id).push(p)}
        const unifiedSampleStatus=sample=>{
          const candidates=[{label:sample.stage||'Not Started',date:sample.created_at,rank:1}]
          for(const p of parcelsBySample.get(sample.id)||[]){if(p.dispatch_date||p.dispatched_at)candidates.push({label:'Dispatched',date:p.dispatch_date||p.dispatched_at,rank:2});if(p.delivered_at)candidates.push({label:'Delivered',date:p.delivered_at,rank:2});else if(p.status&&p.status!=='Dispatched')candidates.push({label:p.status,date:p.updated_at||p.dispatch_date,rank:2})}
          const approvalLabels={Approval:'Approved',Rejection:'Rejected',Revision:'Revision Required'}
          for(const c of commentsBySample.get(sample.id)||[]){if(approvalLabels[c.comment_type]||['Approved','Rejected','Revision Required'].includes(c.comment_type))candidates.push({label:approvalLabels[c.comment_type]||c.comment_type,date:c.comment_date,rank:3})}
          if(sample.last_comment_at&&sample.approval_status&&!['Pending','Pending Approval'].includes(sample.approval_status))candidates.push({label:sample.approval_status,date:sample.last_comment_at,rank:3})
          const valid=candidates.filter(x=>x.date&&!Number.isNaN(new Date(x.date).getTime()))
          const newest=rank=>valid.filter(x=>x.rank===rank).sort((a,b)=>new Date(b.date)-new Date(a.date))[0]
          const parcel=newest(2),approval=newest(3),sampling=newest(1)
          return (approval&&(!parcel||new Date(approval.date)>=new Date(parcel.date))?approval:parcel||sampling||candidates[0]).label
        }
        const sampleRows=[]
        for(let offset=0;offset<30000;offset+=750){
          const {data,error:se}=await supabase.from('samples').select('id,order_id,sample_number,root_sample_id,parent_sample_id,version_no,sample_type,size_group_name,color,colours,status,approval_status,stage,last_comment_at,created_at').range(offset,offset+749)
          if(se)throw se
          sampleRows.push(...(data||[]))
          if(!data||data.length<750)break
        }
        const orderById=new Map(all.map(o=>[o.id,o]))
        const sampleGroups=new Map()
        for(const sample of sampleRows){
          const order=orderById.get(sample.order_id)
          if(!order)continue
          const key=keyFor(order)
          if(!sampleGroups.has(key))sampleGroups.set(key,new Map())
          const versions=sampleGroups.get(key)
          // Retain every version; never replace historical approvals with the latest version.
          versions.set(sample.id,sample)
        }
        const approvalText=sample=>{
          const colour=sample.color||((Array.isArray(sample.colours)?sample.colours:[]).map(c=>typeof c==='string'?c:c?.name||c?.color||'').filter(Boolean).join(', '))
          const label='V'+(Number(sample.version_no)||1)+' '+[sample.sample_type,sample.size_group_name].filter(Boolean).join(' ')+(colour?' / '+colour:'')
          const current=unifiedSampleStatus(sample);return label+': '+current
        }
        const approvalsByStyle=new Map([...sampleGroups].map(([key,versions])=>[key,[...versions.values()].sort((a,b)=>String(a.sample_type||'').localeCompare(String(b.sample_type||''))||String(a.size_group_name||'').localeCompare(String(b.size_group_name||'') )||String(a.color||'').localeCompare(String(b.color||''))||(Number(a.version_no)||1)-(Number(b.version_no)||1)).map(approvalText).join('\n')]))
        const [shipResult,queueResult,batchesResult,membersResult]=await Promise.all([supabase.from('shipment_lines').select('order_id,shipped_qty'),supabase.from('order_queues').select('id,order_id'),supabase.from('production_batches').select('id,name').order('name'),supabase.from('production_batch_orders').select('order_id,batch_id')])
        if(batchesResult.error)throw batchesResult.error
        if(membersResult.error)throw membersResult.error
        setBatchOptions(batchesResult.data||[])
        setBatchMembership(Object.fromEntries((membersResult.data||[]).map(m=>[m.order_id,m.batch_id])))
        if(shipResult.error)throw shipResult.error
        if(queueResult.error)throw queueResult.error
        const shipped=new Map(),queues=new Map()
        ;(shipResult.data||[]).forEach(l=>shipped.set(l.order_id,(shipped.get(l.order_id)||0)+(Number(l.shipped_qty)||0)))
        ;(queueResult.data||[]).forEach(q=>queues.set(q.order_id,(queues.get(q.order_id)||0)+1))
        finalRows=finalRows.map(r=>({...r,shell_fabric:formatShellFabric(shellFabric.get(r.id)),approvals:approvalsByStyle.get(keyFor(r))||'',wash_count:styleCounts.get(keyFor(r))?.washes.size||0,size_group_count:styleCounts.get(keyFor(r))?.sizes.size||0,shipped_qty:shipped.get(r.id)||0,balance_qty:Math.max(0,(Number(r.total_qty)||0)-(shipped.get(r.id)||0)),queue_count:queues.get(r.id)||0}))
      }
      const keys=active.table==='production_daily_entries'?active.fields:isDataEntry(active)?ENTRY_COLUMNS.map(([,k])=>k):isActiveOrders(active)?ACTIVE_COLUMNS.map(([,k])=>k):active.phase4?PHASE4_VIEWS[active.kind].map(([,k])=>k):active.business?VIEWS[active.kind].map(([,k])=>k):active.operations?[...new Set([...OP_VIEWS[active.kind].map(([,k])=>k).filter(k=>finalRows.some(r=>r[k]!==undefined)||['Job #','Buyer','Style #','Customer PO #'].includes(k)),...finalRows.flatMap(row=>Object.keys(row)).filter(k=>!['id','order_id','created_at','updated_at'].includes(k))])]:[...new Set(finalRows.flatMap(row=>Object.keys(row)))];
      const ordered=(active.business||active.operations||active.phase4) ? keys : active.fields ? [...active.fields.filter(f=>keys.includes(f)),...keys.filter(f=>!active.fields.includes(f))] : keys
      setColumns(ordered);
      // Per-report preferences are display-only and never modify Supabase records.
      let preferred = null
      try { preferred = JSON.parse(window.localStorage.getItem(`app2a-report-columns:${active.category}:${active.title}`)) } catch (_) {}
      const chosen = Array.isArray(preferred) ? ordered.filter(k=>preferred.includes(k)) : ordered
      setSelectedColumns(chosen.length ? chosen : ordered);setRows(finalRows);setDateField(active.defaultDate||(active.table==='production_daily_entries'?'production_date':''));setTruncated(all.length>=limit)
    } catch(e){if(!cancelled)setError(e?.message||'Unable to load report')} finally {if(!cancelled)setLoading(false)}
  })();return()=>{cancelled=true} },[active])
  const visible=useMemo(()=>rows.filter(row=>{
    if(isOrderReport(active)&&buyerFilter.length&&!buyerFilter.includes(row.buyer_name))return false
    if(isOrderReport(active)&&styleFilter.length&&!styleFilter.includes(row.style_number))return false
    if(isOrderReport(active)&&selectedBatches.length&&!selectedBatches.includes(batchMembership[row.id]||'__unbatched__'))return false
    if(statusFilter.length && !statusFilter.includes(cell(row.status)))return false
    if(groupFilter.length && !groupFilter.includes(cell(row[active?.groupBy])))return false
    if(filter && !Object.values(row).some(value=>cell(value).toLowerCase().includes(filter.toLowerCase())))return false
    if(dateField && (dateFrom||dateTo)){
      const v=cell(row[dateField]).slice(0,10)
      if(!v || (dateFrom && v<dateFrom) || (dateTo && v>dateTo))return false
    }
    return true
  }),[rows,filter,dateField,dateFrom,dateTo,statusFilter,groupFilter,buyerFilter,styleFilter,selectedBatches,batchMembership,active])
  const statusOptions=useMemo(()=>[...new Set(rows.map(r=>cell(r.status)).filter(Boolean))].sort(),[rows])
  const groupOptions=useMemo(()=>active?.groupBy?[...new Set(rows.map(r=>cell(r[active.groupBy])).filter(Boolean))].sort():[],[rows,active])
  const buyerOptions=useMemo(()=>[...new Set(rows.map(r=>r.buyer_name).filter(Boolean))].sort(),[rows])
  const styleOptions=useMemo(()=>[...new Set(rows.map(r=>r.style_number).filter(Boolean))].sort(),[rows])
  const displayColumns=columns.filter(k=>selectedColumns.includes(k))
  const showOrderValue=displayColumns.includes('total_value_usd')
  // Collapse order-level rows only when neither Store nor PO # is visible.
  // Filters run before consolidation, so selected batches and dates remain accurate.
  const consolidatedActive=isActiveOrders(active)&&!selectedColumns.includes('store_name')&&!selectedColumns.includes('po_number')&&!['store','ship'].includes(activeGroupBy)
  const displayRows=useMemo(()=>{
    if(!consolidatedActive)return visible
    const groups=new Map()
    for(const r of visible){
      const key=JSON.stringify([String(r.buyer_name||'').trim().toLowerCase(),String(r.style_number||'').trim().toLowerCase()])
      if(!groups.has(key))groups.set(key,[])
      groups.get(key).push(r)
    }
    return [...groups.values()].map(items=>{
      const first=items[0]
      const distinct=k=>[...new Set(items.map(r=>String(r[k]||'').trim()).filter(Boolean))]
      const dates=distinct('ship_date').sort()
      const refs=distinct('factory_ref')
      const fabrics=distinct('shell_fabric')
      const statuses=distinct('status')
      const pictures=items.find(r=>activeImage(r))||first
      const sum=k=>items.reduce((n,r)=>n+(Number(r[k])||0),0)
      return {...first,id:'summary-'+first.id,style_image_base64:activeImage(pictures),style_image_url:activeImage(pictures),factory_ref:refs.join(', '),shell_fabric:fabrics.join(' / '),status:statuses.length===1?statuses[0]:'Mixed',job_number:distinct('job_number').join(', '),po_number:'',store_name:'',total_qty:sum('total_qty'),shipped_qty:sum('shipped_qty'),balance_qty:sum('balance_qty'),total_value_usd:sum('total_value_usd'),queue_count:sum('queue_count'),ship_date:dates.length>1?dates[0]+' to '+dates[dates.length-1]:(dates[0]||''),__order_count:items.length}
    })
  },[visible,consolidatedActive])
  const sortValue=(r,k)=>k==='style'?r.style_number:k==='factory'?r.factory_ref:k==='ship'?r.ship_date:k==='fabric'?r.shell_fabric:k==='store'?r.store_name:k==='qty'?r.total_qty:r.total_value_usd
  const compareReport=(a,b,k)=>{
    const x=sortValue(a,k),y=sortValue(b,k)
    if(['qty','value'].includes(k))return (Number(x)||0)-(Number(y)||0)
    return String(x||'').localeCompare(String(y||''),undefined,{numeric:true,sensitivity:'base'})
  }
  const sortedRows=useMemo(()=>isOrderReport(active)?[...displayRows].sort((a,b)=>(activeSortDir==='desc'?-1:1)*compareReport(a,b,activeSortBy)||compareReport(a,b,'style')):displayRows,[displayRows,active,activeSortBy,activeSortDir])
  const reportGroups=useMemo(()=>{
    if(!isOrderReport(active))return []
    if(activeGroupBy==='none')return [['',sortedRows]]
    const groupKey=r=>activeGroupBy==='style'?r.style_number:activeGroupBy==='fabric'?r.shell_fabric:activeGroupBy==='ship'?r.ship_date:r.store_name
    const groups=new Map()
    for(const row of sortedRows){const key=String(groupKey(row)||'Unspecified');if(!groups.has(key))groups.set(key,[]);groups.get(key).push(row)}
    const keys=[...groups.keys()].sort((a,b)=>a.localeCompare(b,undefined,{numeric:true,sensitivity:'base'}))
    // Apply the selected sort to the groups as well as their individual rows.
    if(activeSortBy===activeGroupBy){if(activeSortDir==='desc')keys.reverse()}
    else keys.sort((a,b)=>(activeSortDir==='desc'?-1:1)*compareReport(groups.get(a)[0],groups.get(b)[0],activeSortBy)||a.localeCompare(b,undefined,{numeric:true,sensitivity:'base'}))
    return keys.map(key=>[key,groups.get(key)])
  },[sortedRows,active,activeGroupBy,activeSortDir,activeSortBy])
  const groupLabel=key=>activeGroupBy==='style'?'Style '+key:activeGroupBy==='fabric'?'Fabric: '+key:activeGroupBy==='ship'?'Ship Date: '+reportDate(key):'Store: '+key
  const changeColumn=(key,checked)=>{
    const next=checked?columns.filter(k=>selectedColumns.includes(k)||k===key):selectedColumns.filter(k=>k!==key)
    if(!next.length)return
    setSelectedColumns(next)
    try {window.localStorage.setItem(`app2a-report-columns:${active.category}:${active.title}`,JSON.stringify(next))}catch(_){}
  }
  const resetColumns=()=>{setSelectedColumns(columns);try{window.localStorage.removeItem(`app2a-report-columns:${active.category}:${active.title}`)}catch(_){}}
  const label=k=>isDataEntry(active)?(ENTRY_COLUMNS.find(([,key])=>key===k)?.[0]||k):isActiveOrders(active)?(ACTIVE_COLUMNS.find(([,key])=>key===k)?.[0]||k):active?.phase4?(PHASE4_VIEWS[active.kind].find(([,key])=>key===k)?.[0]||k.replaceAll('_',' ')):active?.business?(VIEWS[active.kind].find(([,key])=>key===k)?.[0]||k):active?.operations?(OP_VIEWS[active.kind].find(([,key])=>key===k)?.[0]||k.replaceAll('_',' ')):k.replaceAll('_',' ')
  const filename=()=>{
    if(!isOrderReport(active))return `${safe(active?.title)}${dateFrom?`_From-${dateFrom}`:''}${dateTo?`_To-${dateTo}`:''}_${stamp()}`
    const batches=selectedBatches.map(id=>id==='__unbatched__'?'Unbatched':batchOptions.find(b=>b.id===id)?.name||id)
    const suffix=batches.length===1?batches[0]:batches.length>1?`${batches.length} Batches`:buyerFilter.length===1?buyerFilter[0]:buyerFilter.length>1?`${buyerFilter.length} Buyers`:new Date().toLocaleDateString('en-GB',{day:'2-digit',month:'short',year:'numeric'}).replace(/ /g,'-')
    const clean=v=>String(v||'').replace(/[\\/:*?"<>|]/g,'').trim()
    return clean(`${active.title} - ${suffix}`)
  }
  const totals=useMemo(()=>totalInfo(displayRows,displayColumns),[displayRows,selectedColumns,columns])
  const groupedTotals=useMemo(()=>totals.map(t=>({key:t.key,value:t.values.reduce((a,b)=>a+b,0)})),[totals])
  const widthFor=k=>columnWidth(sortedRows,k,label(k))
  const excel=()=>{
    if(!active||loading||truncated)return
    const wb=XLSX.utils.book_new()
    const headers=displayColumns.map(label)
    const data=[headers,...sortedRows.map(r=>displayColumns.map(k=>isDataEntry(active)?(k.endsWith('_count')?(r[k]||'–'):reportValue(k,r[k])):isActiveOrders(active)?(k==='picture'?'':k==='job_status'?`${r.job_number||''} / ${r.status||''}`:k==='style_desc'?`${r.style_number||''} / ${r.description||''}`:k==='qty_ship_balance'?`${r.total_qty||0} / ${r.shipped_qty||0} / ${r.balance_qty||0}`:reportValue(k,r[k])):r[k]==null?'':typeof r[k]==='object'?JSON.stringify(r[k]):reportValue(k,r[k])))]
    if(isOrderReport(active)&&activeGroupBy!=='none'){
      const groupedData=[headers]
      for(const [key,items] of reportGroups){
        const count=items.reduce((n,r)=>n+(r.__order_count||1),0)
        const qty=items.reduce((n,r)=>n+(Number(r.total_qty)||0),0)
        const value=items.reduce((n,r)=>n+(Number(r.total_value_usd)||0),0)
        groupedData.push([groupLabel(key)+' — '+count+' orders · Qty: '+formatNumber(qty)+(showOrderValue?' · Value: '+formatUSD(value):'')])
        for(const row of items)groupedData.push(displayColumns.map(k=>isDataEntry(active)?(k.endsWith('_count')?(row[k]||'–'):reportValue(k,row[k])):k==='picture'?'':k==='job_status'?(row.job_number||'')+' / '+(row.status||''):k==='style_desc'?(row.style_number||'')+' / '+(row.description||''):k==='qty_ship_balance'?[row.total_qty||0,row.shipped_qty||0,row.balance_qty||0].join(' / '):reportValue(k,row[k])))
      }
      data.splice(0,data.length,...groupedData)
    }
    if(groupedTotals.length)data.push(displayColumns.map((k,i)=>groupedTotals.some(t=>t.key===k)?groupedTotals.find(t=>t.key===k).value:i===0?'TOTAL':''))
    const ws=XLSX.utils.aoa_to_sheet(data)
    ws['!cols']=displayColumns.map(k=>({wch:widthFor(k)}))
    ws['!autofilter']={ref:`A1:${XLSX.utils.encode_col(displayColumns.length-1)}${displayRows.length+1}`}
    ws['!printHeader']='&CNIZAMIA APPARELS — '+active.title
    ws['!printFooter']='&LPrinted by: '+printedBy+'&CPage &P of &N&R'+reportTimestamp()
    ws['!pageSetup']={orientation:printOrientation,paperSize:9,fitToWidth:1,fitToHeight:0}
    ws['!margins']={left:0.25,right:0.25,top:0.55,bottom:0.55,header:0.2,footer:0.2}
    XLSX.utils.book_append_sheet(wb,ws,safe(active.title).slice(0,31));XLSX.writeFile(wb,`${filename()}.xlsx`)
  }
  const print=(outputMode='print')=>{
    if(!active||loading||truncated)return
    const when=reportTimestamp()
    // Explicit A4 page sections: each page owns its header, table heading, and footer.
    // Conservative row limits prevent the previous browser footer/header collision.
    const perPage=isDataEntry(active)?(printOrientation==='landscape'?18:30):isOrderReport(active)?(printOrientation==='landscape'?16:26):(printOrientation==='landscape'?19:32)
    const pages=[]
    for(let i=0;i<sortedRows.length;i+=perPage)pages.push(sortedRows.slice(i,i+perPage))
    if(!pages.length)pages.push([])
    const totalRow=isActiveOrders(active)?(()=>{
      const qty=displayRows.reduce((n,r)=>n+(Number(r.total_qty)||0),0)
      const value=displayRows.reduce((n,r)=>n+(Number(r.total_value_usd)||0),0)
      const count=displayRows.reduce((n,r)=>n+(r.__order_count||1),0)
      const qtyIndex=displayColumns.indexOf('qty_ship_balance')
      const valueIndex=showOrderValue?displayColumns.indexOf('total_value_usd'):-1
      const firstTotal=[qtyIndex,valueIndex].filter(i=>i>=0).sort((a,b)=>a-b)[0]??displayColumns.length
      let cells=firstTotal>0?`<td colspan="${firstTotal}" class="total-label">GRAND TOTAL — ORDERS: ${String(count).padStart(2,'0')}</td>`:''
      for(let i=firstTotal;i<displayColumns.length;i++){
        const k=displayColumns[i]
        cells+=k==='qty_ship_balance'?'<td class="total-number">'+formatNumber(qty)+'</td>':k==='total_value_usd'&&showOrderValue?'<td class="total-number">'+formatUSD(value)+'</td>':'<td></td>'
      }
      return '<tr class="total">'+cells+'</tr>'
    })():groupedTotals.length?`<tr class="total">${displayColumns.map((k,i)=>`<td>${groupedTotals.some(t=>t.key===k)?escapeHTML(formatNumber(groupedTotals.find(t=>t.key===k).value)):i===0?'TOTAL':''}</td>`).join('')}</tr>`:''
    // Keep the totals on a dedicated final page if the last page is full.
    if(totalRow && pages[pages.length-1].length>=perPage)pages.push([])
    const filterText=[isOrderReport(active)&&buyerFilter.length?`Buyers: ${buyerFilter.join(', ')}`:'',isOrderReport(active)&&styleFilter.length?`Styles: ${styleFilter.join(', ')}`:'',isOrderReport(active)&&selectedBatches.length?`Batches: ${selectedBatches.map(id=>id==='__unbatched__'?'Unbatched':batchOptions.find(b=>b.id===id)?.name||id).join(', ')}`:'',statusFilter.length?`Statuses: ${statusFilter.join(', ')}`:'',groupFilter.length?`Groups: ${groupFilter.join(', ')}`:'',dateFrom?`From: ${reportDate(dateFrom)}`:'',dateTo?`To: ${reportDate(dateTo)}`:''].filter(Boolean).join(' · ')
    // Height-budget pagination, not row counts. Keep each style group together
    // wherever it fits; split only a style larger than one physical page.
    const printPages=isActiveOrders(active)&&activeGroupBy!=='none'?(()=>{
      const availableMm=printOrientation==='landscape'?169:251
      const groupHeaderMm=9
      const rowMm=7
      const pictureMm=20
      const estimateRowMm=r=>Math.max(rowMm,Math.min(32,5+Math.ceil(String(r.approvals||'').split('\\n').length*(displayColumns.includes('approvals')?3.6:0))+Math.ceil(String(r.shell_fabric||'').length*(displayColumns.includes('shell_fabric')?0.11:0))))
      const groupMm=items=>groupHeaderMm+Math.max(items.reduce((n,r)=>n+estimateRowMm(r),0),pictureMm)
      const chunks=[]
      let chunk=[],used=0
      const flush=()=>{if(chunk.length){chunks.push(chunk);chunk=[];used=0}}
      reportGroups.forEach(([style,items])=>{
        const whole=groupMm(items)
        if(whole<=availableMm){
          if(used+whole>availableMm)flush()
          chunk.push({group:style,items,continued:false})
          items.forEach(row=>chunk.push({row}))
          used+=whole
          return
        }
        // Exception: unusually large style. Repeat a 'continued' group heading.
        let pos=0
        while(pos<items.length){
          const space=availableMm-used
          let take=0,estimated=groupHeaderMm
          while(pos+take<items.length && estimated+estimateRowMm(items[pos+take])<=space){estimated+=estimateRowMm(items[pos+take]);take++}
          if(take<1){if(used>0){flush();continue}take=1}
          chunk.push({group:style,items,continued:pos>0})
          items.slice(pos,pos+take).forEach(row=>chunk.push({row}))
          used+=groupMm(items.slice(pos,pos+take))
          pos+=take
          if(pos<items.length)flush()
        }
      })
      flush()
      if(totalRow && chunks.length){const last=chunks[chunks.length-1];const lastUsed=last.reduce((n,e)=>n+(e.group?groupHeaderMm:e.row?estimateRowMm(e.row):0),0);if(lastUsed+12>availableMm)chunks.push([])}
      return chunks.length?chunks:[[]]
    })():isDataEntry(active)&&activeGroupBy!=='none'?(()=>{
      const chunks=[],limit=perPage-2;let page=[],used=0
      for(const [key,items] of reportGroups){
        let pos=0
        while(pos<items.length){
          if(used>=limit){chunks.push(page);page=[];used=0}
          const take=Math.min(items.length-pos,limit-used)
          page.push({heading:key,continued:pos>0})
          page.push(...items.slice(pos,pos+take).map(row=>({row})))
          used+=take+1;pos+=take
          if(used>=limit){chunks.push(page);page=[];used=0}
        }
      }
      if(page.length)chunks.push(page)
      return chunks.length?chunks:[[]]
    })():pages
    // Merge consecutive identical picture/buyer cells only within a printed
    // style group and page. Never merge unrelated styles or across page breaks.
    const activePageRows=page=>{
      if(activeGroupBy==='none')return page.map(r=>'<tr>'+displayColumns.map(k=>'<td>'+activeCellHTML(k,r)+'</td>').join('')+'</tr>').join('')
      const output=[]
      // The image represents the style, not an individual order. Orders can
      // carry different image URLs (or no URL) for the same style.
      // Merge only inside a style segment on this printed page.
      let segmentStart=0
      while(segmentStart<page.length){
        const heading=page[segmentStart]
        if(!heading.group){segmentStart++;continue}
        let segmentEnd=segmentStart+1
        while(segmentEnd<page.length && page[segmentEnd].row)segmentEnd++
        const segment=page.slice(segmentStart+1,segmentEnd)
        const groupRows=heading.items;const first=groupRows[0]||{};const styleGroup=activeGroupBy==='style';const meta=styleGroup?'[ '+escapeHTML(first.factory_ref||'—')+' ]　[ '+escapeHTML(groupLabel(heading.group))+' ]　[ '+groupRows.reduce((n,r)=>n+(r.__order_count||1),0)+' POs ]　[ Washes: '+String(first.wash_count||0).padStart(2,'0')+' ]　[ Size Groups: '+String(first.size_group_count||0).padStart(2,'0')+' ]　[ Qty: '+formatNumber(groupRows.reduce((n,r)=>n+(Number(r.total_qty)||0),0))+' ]':escapeHTML(groupLabel(heading.group))+' — '+groupRows.reduce((n,r)=>n+(r.__order_count||1),0)+' orders · Qty: '+formatNumber(groupRows.reduce((n,r)=>n+(Number(r.total_qty)||0),0));
        output.push(`<tr class="group-heading"><td colspan="${displayColumns.length}">${meta}${heading.continued?' (continued)':''}${showOrderValue?'　[ Value: '+formatUSD(groupRows.reduce((n,r)=>n+(Number(r.total_value_usd)||0),0))+' ]':''}</td></tr>`)
        const representative=segment.find(e=>activeImage(e.row))?.row
        segment.forEach((entry,i)=>{
          let tds=''
          for(const k of displayColumns){
            if(k==='picture'){
              if(i===0)tds+=`<td rowspan="${segment.length}" class="merged-cell picture-cell">${representative?activeImageHTML(representative):''}</td>`
            }else if(k==='buyer_name'){
              const buyer=entry.row.buyer_name||''
              if(i>0 && (segment[i-1].row.buyer_name||'')===buyer)continue
              let span=1
              while(i+span<segment.length && (segment[i+span].row.buyer_name||'')===buyer)span++
              tds+=`<td rowspan="${span}" class="merged-cell">${escapeHTML(buyer)}</td>`
            }else if(k==='approvals'){if(i>0)continue;const entries=String(entry.row.approvals||'').split('\n').filter(Boolean).map(line=>{const cut=line.lastIndexOf(': ');return cut<0?'<div class="approval-line">'+escapeHTML(line)+'</div>':'<div class="approval-line"><span>'+escapeHTML(line.slice(0,cut))+'</span><b>[ '+escapeHTML(line.slice(cut+2))+' ]</b></div>'}).join('');tds+=`<td rowspan="${segment.length}" class="approvals-cell">${entries}</td>`}else if(k==='shell_fabric'){const fabric=String(entry.row.shell_fabric||'');const split=fabric.indexOf(' — ');tds+=`<td>${split>=0?'<b>'+escapeHTML(fabric.slice(0,split))+'</b><div>'+escapeHTML(fabric.slice(split+3))+'</div>':escapeHTML(fabric)}</td>`}else tds+=`<td>${activeCellHTML(k,entry.row)}</td>`
          }
          output.push(`<tr>${tds}</tr>`)
        })
        segmentStart=segmentEnd
      }
      return output.join('')
    }
    // Print-only proportional widths: headings wrap, while actual cell content drives allocation.
    const printColumnWidths=(()=>{
      const presets={picture:7,style_desc:printOrientation==='portrait'?16:18,job_status:12,buyer_name:12,store_name:12,po_number:11,factory_ref:9,shell_fabric:printOrientation==='portrait'?20:22,approvals:printOrientation==='portrait'?23:25,qty_ship_balance:14,total_value_usd:11,ship_date:10,qs_number:8}
      const weights=displayColumns.map(k=>{
        if(isDataEntry(active))return k.endsWith('_count')?7:k==='style_number'?12:k==='buyer_name'||k==='store_name'?11:9
        const values=sortedRows.slice(0,80).map(r=>String(k==='style_desc'?r.style_number||'':k==='qty_ship_balance'?formatNumber(r.total_qty||0):k==='approvals'?String(r.approvals||'').split('\\n')[0]:reportValue(k,r[k])||''))
        const max=Math.max(0,...values.map(v=>v.length))
        const base=presets[k]||11
        return k==='ship_date'?9:k==='factory_ref'?Math.max(7,Math.min(10,max+3)):k==='picture'?7:k==='qty_ship_balance'?13:Math.max(base,Math.min(base+5,max/3+5))
      })
      const total=weights.reduce((a,b)=>a+b,0)||1
      return weights.map(w=>(100*w/total).toFixed(3)+'%')
    })()
    const entryCell=(key,row)=>key.endsWith('_count')?(Number(row[key])?String(row[key]):'–'):reportValue(key,row[key])
    const entryPageRows=page=>page.map(item=>item.heading!==undefined?`<tr class="group-heading"><td colspan="${displayColumns.length}">${escapeHTML(groupLabel(item.heading))}${item.continued?' (continued)':''}</td></tr>`:`<tr>${displayColumns.map(k=>`<td>${escapeHTML(entryCell(k,item.row||item))}</td>`).join('')}</tr>`).join('')
    const pageHTML=printPages.map((page,index)=>`<section class="report-page">
      <header><strong>NIZAMIA APPARELS</strong><div class="report-batch">${escapeHTML(selectedBatches.length?selectedBatches.map(id=>batchOptions.find(b=>b.id===id)?.name||'Unbatched').join(', '):active.title)} | ${escapeHTML(active.title)}</div></header>
      <main><table><colgroup>${displayColumns.map((k,i)=>`<col style="width:${printColumnWidths[i]}">`).join('')}</colgroup><thead><tr>${displayColumns.map(k=>`<th>${escapeHTML(isActiveOrders(active)?({picture:'IMAGE',style_desc:'STYLE NUMBER',factory_ref:'FTY REF',shell_fabric:'FABRIC DESC',qty_ship_balance:'ORDER QUANTITY',ship_date:'SHIP DATE',total_value_usd:'VALUE (USD)'}[k]||label(k)):label(k))}</th>`).join('')}</tr></thead><tbody>${isActiveOrders(active)?activePageRows(page):isDataEntry(active)?entryPageRows(page):page.map(r=>`<tr>${displayColumns.map(k=>`<td>${escapeHTML(reportValue(k,r[k]))}</td>`).join('')}</tr>`).join('')}${index===printPages.length-1?totalRow:''}</tbody></table></main>
      <footer><span>Printed by: ${escapeHTML(printedBy)}</span><span>Printed on: ${escapeHTML(when)}</span><span>Page ${index+1} of ${printPages.length}</span></footer>
    </section>`).join('')
    const pdfColour=outputMode==='pdf'
    const html=`<html><head><title>${escapeHTML(filename())}</title><style>
      @page{size:A4 ${printOrientation};margin:0}
      *{box-sizing:border-box}
      html,body{margin:0;padding:0;color:#000;font:10px Arial,sans-serif;-webkit-print-color-adjust:exact;print-color-adjust:exact}
      .report-page{width:${printOrientation==='landscape'?'297mm':'210mm'};height:${printOrientation==='landscape'?'210mm':'297mm'};padding:6mm 7mm;display:flex;flex-direction:column;break-after:page;page-break-after:always;overflow:hidden}
      .report-page:last-child{break-after:auto;page-break-after:auto}
      header{flex-shrink:0;border-bottom:2px solid #000;padding-bottom:5px;margin-bottom:9px;display:flex;align-items:end;justify-content:space-between;gap:8px}.report-batch{font-size:10px;font-weight:700;text-align:right}
      header strong{font-size:14px}header div{font-size:13px;font-weight:bold;margin:4px 0}header small{color:#000;font-weight:600}
      main{flex:1;min-height:0;overflow:hidden}
      table{border-collapse:collapse;width:100%;table-layout:fixed}
      th,td{border:1px solid #777;padding:3px 4px;text-align:left;overflow-wrap:anywhere;vertical-align:top;line-height:1.2}
      th{background:#fff;color:#000;font-size:9px;font-weight:800;text-transform:uppercase;border-bottom:2px solid #000;white-space:normal;overflow-wrap:normal;word-break:normal;hyphens:none;line-height:1.25}tr{break-inside:avoid;page-break-inside:avoid}
      .approval-line{display:flex;justify-content:space-between;gap:5px;align-items:baseline;margin-bottom:2px}.approval-line span{min-width:0}.approval-line b{white-space:nowrap;font-weight:600}.approvals-cell{font-size:9px}.total-number{text-align:right;font-weight:800}.total-label{white-space:nowrap;overflow-wrap:normal;text-align:left}.total td{background:${pdfColour?'#e8e8e8':'#f0f0f0'};color:#000;font-weight:800;border-top:2px solid #000;padding:7px 5px;line-height:1.5}.group-heading td{background:${pdfColour?'#dff1fa':'#f0f0f0'};color:#000;font-size:10px;font-weight:800;border-top:2px solid #000;border-bottom:2px solid #000;padding:6px 4px}.picture-cell{width:86px;text-align:center;vertical-align:middle;padding:4px}.style-picture{display:block;width:100%;max-width:78px;height:auto;max-height:92px;object-fit:contain;margin:auto;filter:${pdfColour?'none':'grayscale(1) contrast(1.2)'}}
      .merged-cell{vertical-align:middle;font-weight:700}
      footer{flex-shrink:0;margin-top:8px;border-top:1px solid #aaa;display:flex;justify-content:space-between;gap:12px;font-size:9px;color:#000;font-weight:600;padding-top:5px}
      @media screen{body{background:#eee}.report-page{background:white;margin:8px auto;box-shadow:0 1px 6px #aaa}}
    </style></head><body>${pageHTML}</body></html>`
    if(outputMode==='pdf'){
      const popup=window.open('','_blank')
      if(!popup){window.alert('Please allow pop-ups to download the PDF.');return}
      // Render each prepared A4 section to exactly one PDF page. This avoids
      // html2pdf's automatic overflow pagination and trailing blank pages.
      const script='<script src="https://cdn.jsdelivr.net/npm/html2canvas@1.4.1/dist/html2canvas.min.js"><'+ '/script><script src="https://cdn.jsdelivr.net/npm/jspdf@2.5.2/dist/jspdf.umd.min.js"><'+'/script><script>window.addEventListener("load",async()=>{try{if(!window.html2canvas||!window.jspdf)throw Error("PDF generator unavailable");await Promise.all([...document.images].map(i=>i.complete?Promise.resolve():new Promise(r=>{i.onload=r;i.onerror=r})));const pdf=new window.jspdf.jsPDF({unit:"mm",format:"a4",orientation:'+JSON.stringify(printOrientation)+'});const pages=[...document.querySelectorAll(".report-page")];for(let i=0;i<pages.length;i++){const canvas=await window.html2canvas(pages[i],{scale:2,useCORS:true,backgroundColor:"#ffffff"});if(i)pdf.addPage();pdf.addImage(canvas.toDataURL("image/jpeg",0.98),"JPEG",0,0,pdf.internal.pageSize.getWidth(),pdf.internal.pageSize.getHeight())}pdf.save('+JSON.stringify(filename()+'.pdf')+');window.close()}catch(e){document.body.insertAdjacentHTML("afterbegin","<p style=color:red>PDF download failed. Please use Print.</p>")}});<'+'/script>'

      popup.document.open();popup.document.write(html.replace('</body>',script+'</body>'));popup.document.close()
    }else printHTML(html)
  }
  const reportCatalog=[...flatten,{title:'PP Meeting',table:'pp_meetings',category:'Orders & Customers',ppm:true}]
  const categories=[...new Set(reportCatalog.map(r=>r.category))]
   const matches=reportCatalog.filter(r=>(category==='All'||(category==='Favorites'?favorites.includes(favoriteKey(r)):r.category===category))&&`${r.title} ${r.category}`.toLowerCase().includes(catalogSearch.toLowerCase())).sort((a,b)=>catalogSort==='category'?a.category.localeCompare(b.category)||a.title.localeCompare(b.title):a.title.localeCompare(b.title))
   if(active?.proforma)return <div style={{height:'100%',overflow:'auto',background:'#f8fafc'}}><ProformaInvoice initialSelection={incomingPI} onBack={()=>{setActive(null);if(incomingPI)navigate('/reports',{replace:true,state:null})}}/></div>
   return <div style={{height:'100%',overflow:'auto',padding:'22px 26px',background:'#fff',fontFamily:'var(--font,Arial,sans-serif)',color:'#202633'}}>
    <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:18,gap:12}}>
      <div><div style={{fontSize:22,fontWeight:750}}>Reports</div><div style={{fontSize:12,color:'#6b7280',marginTop:4}}>Central read-only reporting · existing Supabase records · Excel and print/PDF</div></div>
      <div style={{display:'flex',gap:8}}>{active&&<button style={btn} onClick={()=>setActive(null)}><ArrowLeft size={15}/> All Reports</button>}<button style={{...btn,background:'#141b2e',color:'#fff',borderColor:'#141b2e'}} onClick={()=>navigate('/reports/custom')}><Plus size={15}/> Create Custom Report</button></div>
    </div>
    {!active ? <>

<div style={{display:'flex',flexWrap:'wrap',alignItems:'center',columnGap:6,rowGap:0,borderBottom:'1px solid #dce1e9',marginBottom:14}}>
{[['All','All Reports'],['Favorites','★ Favorites'],['Production Formats','Production Formats'],...categories.map(c=>[c,c])].map(([key,label])=><button key={key} onClick={()=>setCategory(key)} style={{border:0,borderBottom:category===key?'3px solid #151b30':'3px solid transparent',background:'transparent',padding:'11px 13px',fontSize:12,fontWeight:category===key?750:550,color:category===key?'#111827':'#64748b',whiteSpace:'nowrap',cursor:'pointer'}}>{label} <span style={{color:'#94a3b8'}}>{key==='All'?reportCatalog.length:key==='Favorites'?reportCatalog.filter(r=>favorites.includes(favoriteKey(r))).length:key==='Production Formats'?3:reportCatalog.filter(r=>r.category===key).length}</span></button>)}
</div>
{category==='Production Formats'?<ProductionFormats onBack={()=>setCategory('All')}/>:<>
<div style={{display:'flex',justifyContent:'space-between',alignItems:'center',gap:10,flexWrap:'wrap',marginBottom:12}}>
<div style={{display:'flex',gap:9,flexWrap:'wrap'}}><div style={{display:'flex',alignItems:'center',gap:8,background:'#fff',border:'1px solid #d9dce4',borderRadius:7,padding:'0 11px',width:290}}><Search size={15}/><input placeholder="Search reports..." value={catalogSearch} onChange={e=>setCatalogSearch(e.target.value)} style={{border:0,outline:0,padding:'10px 0',width:'100%',fontSize:12}}/></div><select value={catalogSort} onChange={e=>setCatalogSort(e.target.value)} style={btn}><option value="name">Name (A–Z)</option><option value="category">Category (A–Z)</option></select></div><span style={{fontSize:12,color:'#64748b'}}>{matches.length} reports</span></div>
<div style={{background:'#fff',border:'1px solid #e2e6ed',borderRadius:9,overflow:'auto'}}>
<table style={{width:'100%',borderCollapse:'collapse',fontSize:12,textAlign:'left'}}><thead><tr style={{background:'#f4f6f9',color:'#64748b',fontSize:10,textTransform:'uppercase'}}><th style={{padding:11,width:48}}>★</th><th style={{padding:11}}>Report Name</th><th style={{padding:11}}>Data Source</th><th style={{padding:11}}>Category</th><th style={{padding:11,textAlign:'right'}}>Action</th></tr></thead><tbody>{matches.map(r=><tr key={favoriteKey(r)} style={{borderTop:'1px solid #edf0f4'}}><td style={{padding:'8px 11px'}}><button title="Toggle favorite" onClick={()=>toggleFavorite(r)} style={{border:0,background:'transparent',cursor:'pointer'}}><Star size={16} color={favorites.includes(favoriteKey(r))?'#d4a017':'#a3aab8'} fill={favorites.includes(favoriteKey(r))?'#eab308':'none'}/></button></td><td style={{padding:11,fontWeight:700}}><button onClick={()=>r.ppm?navigate('/reports/pp-meeting'):setActive(r)} style={{border:0,background:'transparent',cursor:'pointer',font:'inherit',fontWeight:700,textAlign:'left'}}>{r.title}</button></td><td style={{padding:11,color:'#64748b'}}>{r.table.replace(/_/g,' ')}</td><td style={{padding:11,color:'#475569'}}>{r.category}</td><td style={{padding:8,textAlign:'right'}}><button style={{...btn,padding:'6px 11px'}} onClick={()=>r.ppm?navigate('/reports/pp-meeting'):setActive(r)}>View</button></td></tr>)}</tbody></table>{!matches.length&&<div style={{padding:24,textAlign:'center',color:'#64748b'}}>No reports found.</div>}</div>
</>}
</> : <div style={{background:'#fff',border:'1px solid #e4e7ec',borderRadius:12,padding:16}}>
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',gap:12,flexWrap:'wrap',marginBottom:14}}><div><div style={{fontSize:17,fontWeight:700}}>{active.title}</div><div style={{fontSize:12,color:'#6b7280',marginTop:4}}>{active.category} · {displayRows.length.toLocaleString()} displayed / {rows.length.toLocaleString()} loaded</div></div><div style={{display:'flex',gap:8,flexWrap:'wrap'}}><button style={btn} disabled={loading} onClick={()=>setActive({...active})}><RefreshCw size={14}/> Refresh</button><div style={{position:'relative'}}><button style={{...btn,background:columnsOpen?'#eef2ff':'#fff',color:'#4338ca',borderColor:'#c7d2fe'}} disabled={loading||!!error||!columns.length} onClick={()=>setColumnsOpen(v=>!v)}><Columns3 size={14}/> Columns ({displayColumns.length}/{columns.length})</button>{columnsOpen&&<div style={{position:'absolute',right:0,top:'calc(100% + 6px)',zIndex:30,width:280,maxHeight:360,overflow:'auto',background:'#fff',border:'1px solid #d9dce4',borderRadius:9,boxShadow:'0 12px 35px #18233a2b',padding:12}}><div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:10}}><strong style={{fontSize:12}}>Customize Columns</strong><button type='button' style={{...btn,padding:'4px 7px',fontSize:11}} onClick={resetColumns}><RotateCcw size={12}/> Reset</button></div>{columns.map(k=><label key={k} style={{display:'flex',alignItems:'center',gap:9,padding:'6px 4px',fontSize:12,cursor:'pointer'}}><input type='checkbox' checked={selectedColumns.includes(k)} disabled={selectedColumns.length===1&&selectedColumns.includes(k)} onChange={e=>changeColumn(k,e.target.checked)}/><span>{label(k)}</span></label>)}<div style={{fontSize:10,color:'#6b7280',marginTop:8}}>Selections apply to the table, Excel and Print/PDF. Saved in this browser for each report.</div></div>}</div><button style={btn} disabled={loading||!!error||truncated} onClick={excel}><FileSpreadsheet size={14}/> Excel .xlsx</button><label style={{display:'flex',alignItems:'center',gap:6,fontSize:12,fontWeight:700,color:'#202633'}}>Page
        <select aria-label="Report page orientation" value={printOrientation} onChange={e=>setPrintOrientation(e.target.value)} style={{...btn,minWidth:135}}>
          <option value="portrait">A4 Portrait</option><option value="landscape">A4 Landscape</option>
        </select></label><button style={btn} disabled={loading||!!error||truncated} onClick={()=>print('print')}><Printer size={14}/> Print B&W</button><button style={btn} disabled={loading||!!error||truncated} onClick={()=>print('pdf')} title="Download colour PDF"><Printer size={14}/> PDF Download</button></div></div>
      <div style={{display:'flex',gap:8,flexWrap:'wrap',marginBottom:14,alignItems:'center',padding:'10px 12px',background:'#f8fafc',border:'1px solid #e5e7eb',borderRadius:9}}>{isOrderReport(active)&&<><label style={{display:'flex',alignItems:'center',gap:5,fontSize:12}}>Group By <select aria-label="Group By" value={activeGroupBy} onChange={e=>setActiveGroupBy(e.target.value)} style={btn}>{[['style','Style #'],['fabric','Fabric'],['ship','Ship Date'],['store','Store'],['none','No Group']].map(([k,v])=><option key={k} value={k}>{v}</option>)}</select></label><label style={{display:'flex',alignItems:'center',gap:5,fontSize:12}}>Sort By <select aria-label="Sort By" value={activeSortBy} onChange={e=>setActiveSortBy(e.target.value)} style={btn}>{[['style','Style #'],['factory','Factory Ref #'],['ship','Ship Date'],['fabric','Fabric'],['store','Store'],['qty','Quantity'],['value','Order Value']].map(([k,v])=><option key={k} value={k}>{v}</option>)}</select></label><button type="button" title={activeSortDir==='asc'?'Ascending':'Descending'} aria-label="Toggle sort direction" onClick={()=>setActiveSortDir(d=>d==='asc'?'desc':'asc')} style={btn}>{activeSortDir==='asc'?'↑ Asc':'↓ Desc'}</button></>}{isOrderReport(active)&&<><details style={{position:'relative'}}><summary style={{...btn,cursor:'pointer',listStyle:'none',minWidth:108}}>Buyers: {buyerFilter.length||'All'} ▾</summary><div style={{position:'absolute',top:'100%',left:0,zIndex:110,width:245,maxHeight:290,overflowY:'auto',background:'#fff',border:'1px solid #d1d5db',borderRadius:8,padding:10,boxShadow:'0 8px 22px #0002'}}><button type="button" style={{...btn,fontSize:11}} onClick={()=>setBuyerFilter([])}>Clear / All</button>{buyerOptions.map(v=><label key={v} style={{display:'flex',gap:8,padding:'6px 3px',fontSize:12}}><input type="checkbox" checked={buyerFilter.includes(v)} onChange={e=>setBuyerFilter(old=>e.target.checked?[...old,v]:old.filter(x=>x!==v))}/>{v}</label>)}</div></details><details style={{position:'relative'}}><summary style={{...btn,cursor:'pointer',listStyle:'none',minWidth:108}}>Styles: {styleFilter.length||'All'} ▾</summary><div style={{position:'absolute',top:'100%',left:0,zIndex:110,width:245,maxHeight:290,overflowY:'auto',background:'#fff',border:'1px solid #d1d5db',borderRadius:8,padding:10,boxShadow:'0 8px 22px #0002'}}><button type="button" style={{...btn,fontSize:11}} onClick={()=>setStyleFilter([])}>Clear / All</button>{styleOptions.map(v=><label key={v} style={{display:'flex',gap:8,padding:'6px 3px',fontSize:12}}><input type="checkbox" checked={styleFilter.includes(v)} onChange={e=>setStyleFilter(old=>e.target.checked?[...old,v]:old.filter(x=>x!==v))}/>{v}</label>)}</div></details><details style={{position:'relative'}}><summary style={{...btn,display:'flex',alignItems:'center',cursor:'pointer',listStyle:'none'}}>{selectedBatches.length?`${selectedBatches.length} Batches`:'All Batches'} ▾</summary><div style={{position:'absolute',top:'100%',left:0,zIndex:100,width:230,maxHeight:280,overflowY:'auto',background:'#fff',border:'1px solid #d1d5db',borderRadius:8,padding:10,boxShadow:'0 8px 22px #0002'}}><button type="button" style={btn} onClick={()=>setSelectedBatches([])}>All Batches</button>{[...batchOptions,{id:'__unbatched__',name:'Unbatched'}].map(b=><label key={b.id} style={{display:'flex',alignItems:'center',gap:8,padding:'7px 3px',fontSize:12}}><input type="checkbox" checked={selectedBatches.includes(b.id)} onChange={e=>setSelectedBatches(v=>e.target.checked?[...v,b.id]:v.filter(id=>id!==b.id))}/>{b.name}</label>)}</div></details></>}{active.business&&<details style={{position:'relative'}}><summary style={{...btn,cursor:'pointer',listStyle:'none',minWidth:108}}>Statuses: {statusFilter.length||'All'} ▾</summary><div style={{position:'absolute',top:'100%',left:0,zIndex:110,width:245,maxHeight:290,overflowY:'auto',background:'#fff',border:'1px solid #d1d5db',borderRadius:8,padding:10,boxShadow:'0 8px 22px #0002'}}><button type="button" style={{...btn,fontSize:11}} onClick={()=>setStatusFilter([])}>Clear / All</button>{statusOptions.map(v=><label key={v} style={{display:'flex',gap:8,padding:'6px 3px',fontSize:12}}><input type="checkbox" checked={statusFilter.includes(v)} onChange={e=>setStatusFilter(old=>e.target.checked?[...old,v]:old.filter(x=>x!==v))}/>{v}</label>)}</div></details>}{active.groupBy&&<details style={{position:'relative'}}><summary style={{...btn,cursor:'pointer',listStyle:'none',minWidth:108}}>Groups: {groupFilter.length||'All'} ▾</summary><div style={{position:'absolute',top:'100%',left:0,zIndex:110,width:245,maxHeight:290,overflowY:'auto',background:'#fff',border:'1px solid #d1d5db',borderRadius:8,padding:10,boxShadow:'0 8px 22px #0002'}}><button type="button" style={{...btn,fontSize:11}} onClick={()=>setGroupFilter([])}>Clear / All</button>{groupOptions.map(v=><label key={v} style={{display:'flex',gap:8,padding:'6px 3px',fontSize:12}}><input type="checkbox" checked={groupFilter.includes(v)} onChange={e=>setGroupFilter(old=>e.target.checked?[...old,v]:old.filter(x=>x!==v))}/>{v}</label>)}</div></details>}{!isDataEntry(active)&&<input value={filter} onChange={e=>setFilter(e.target.value)} placeholder="Filter any field..." style={{...btn,minWidth:210,fontWeight:400}}/>}<select value={dateField} onChange={e=>setDateField(e.target.value)} style={btn}><option value="">No date filter</option>{dateFields.map(k=><option key={k}>{label(k)}</option>)}</select>{dateField&&<><input type="date" value={dateFrom} onChange={e=>setDateFrom(e.target.value)} style={btn}/><input type="date" value={dateTo} onChange={e=>setDateTo(e.target.value)} style={btn}/></>}</div>
      {error&&<div style={{color:'#b91c1c',background:'#fef2f2',padding:12,borderRadius:8,marginBottom:12}}>Could not load report: {error}</div>}
      {truncated&&<div style={{color:'#92400e',background:'#fffbeb',padding:12,borderRadius:8,marginBottom:12}}>This report exceeds the 30,000-record preview limit. Export is disabled to prevent incomplete files.</div>}
      {loading?<div style={{padding:30,color:'#6b7280'}}>Loading live records…</div>:!error?<div style={{overflow:'auto',maxHeight:'calc(100vh - 350px)',border:'1px solid #e5e7eb',borderRadius:8}}><table style={{borderCollapse:'collapse',width:'100%',fontSize:11,tableLayout:'fixed'}}><thead><tr>{displayColumns.map(k=><th key={k} style={{position:'sticky',top:0,background:'#f2f4f8',padding:'9px 7px',whiteSpace:'normal',overflowWrap:'normal',textAlign:'left',borderBottom:'1px solid #d1d5db'}}>{label(k)}</th>)}</tr></thead><tbody>{isActiveOrders(active)?reportGroups.flatMap(([style,items])=>[...(activeGroupBy==='none'?[]:[<tr key={`group-${style}`} style={{background:'#f2f4f7',fontWeight:800}}><td colSpan={displayColumns.length} style={{padding:'9px 10px',borderTop:'2px solid #374151',borderBottom:'1px solid #374151'}}>{groupLabel(style)} — {items.reduce((n,r)=>n+(r.__order_count||1),0)} orders · Qty: {formatNumber(items.reduce((n,r)=>n+(Number(r.total_qty)||0),0))}{showOrderValue?` · Value: ${formatUSD(items.reduce((n,r)=>n+(Number(r.total_value_usd)||0),0))}`:''}</td></tr>]),...items.map(r=><tr key={r.id}>{displayColumns.map(k=><td key={k} style={{padding:'7px 10px',borderBottom:'1px solid #d1d5db',verticalAlign:'middle',whiteSpace:k==='approvals'?'pre-line':'normal',overflowWrap:'anywhere',lineHeight:1.35,maxWidth:k==='approvals'?340:undefined}}>{k==='picture'?(activeImage(r)?<img src={activeImage(r)} alt="Style" style={{width:38,height:44,objectFit:'contain'}}/>:''):k==='job_status'?<><strong>{r.job_number}</strong><div>{r.status}</div></>:k==='style_desc'?<><strong>{r.style_number}</strong><div>{r.description}</div></>:k==='qty_ship_balance'?<><strong>{formatNumber(Number(r.total_qty)||0)}</strong><div>Ship {formatNumber(Number(r.shipped_qty)||0)} · Bal {formatNumber(Number(r.balance_qty)||0)}</div></>:cell(reportValue(k,r[k]))}</td>)}</tr>)]):isDataEntry(active)?reportGroups.flatMap(([group,items])=>[
        ...(activeGroupBy==='none'?[]:[<tr key={'entry-group-'+group} style={{background:'#e8eef5',fontWeight:800}}><td colSpan={displayColumns.length} style={{padding:'9px 10px',borderTop:'2px solid #374151',borderBottom:'1px solid #94a3b8'}}>{groupLabel(group)} — {items.length} {items.length===1?'order':'orders'} · {new Set(items.map(r=>r.po_number).filter(Boolean)).size} POs</td></tr>]),
        ...items.map((r,i)=><tr key={r.id||i}>{displayColumns.map(k=><td key={k} title={cell(reportValue(k,r[k]))} style={{padding:'7px 10px',borderBottom:'1px solid #eef0f3',maxWidth:260,overflow:'hidden',textOverflow:'ellipsis'}}>{k.endsWith('_count')?(Number(r[k])||'–'):cell(reportValue(k,r[k]))}</td>)}</tr>)
      ]):displayRows.slice(0,500).map((r,i)=><tr key={r.id||i}>{displayColumns.map(k=><td key={k} title={cell(reportValue(k,r[k]))} style={{padding:'7px 10px',borderBottom:'1px solid #eef0f3',maxWidth:260,overflow:'hidden',textOverflow:'ellipsis'}}>{cell(reportValue(k,r[k]))}</td>)}</tr>)}</tbody></table>{displayRows.length>500&&<div style={{padding:12,fontSize:12,color:'#6b7280'}}>Showing first 500 matching records on screen. Exports include all {displayRows.length.toLocaleString()} matching records.</div>}{groupedTotals.length>0&&<div style={{display:'flex',gap:16,flexWrap:'wrap',padding:'10px 12px',background:'#eef2f7',fontSize:12,fontWeight:700}}>{groupedTotals.map(t=><span key={t.key}>{label(t.key)}: {formatNumber(t.value)}</span>)}</div>}{!displayRows.length&&<div style={{padding:22,fontSize:12,color:'#6b7280'}}>No records match the selected filters.</div>}</div>:null}
    </div>}
  </div>
}
