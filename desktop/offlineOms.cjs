'use strict'
const {listCombinedRecords,mutateLocalRecord}=require('./standaloneRecords.cjs')
const TYPES={addresses:'buyer_addresses',contacts:'buyer_contacts',snapshots:'parcel_invoice_snapshots'}
const json=(data,status=200)=>Response.json(data,{status,headers:{'Cache-Control':'no-store'}})
async function handleOfflineOms(directory,url,request,{queueParcelInvoice,saveCatalog}={}){
 const input=request.method==='POST'?JSON.parse(await request.text()):{}
 const action=request.method==='GET'?url.searchParams.get('action'):input.action
 const type=request.method==='GET'?url.searchParams.get('type'):input.type
 const get=table=>listCombinedRecords(directory,table)
 if(request.method==='GET'){
  const newest=(rows,key)=>rows.sort((a,b)=>String(b[key]||'').localeCompare(String(a[key]||'')))
  if(action==='listCostings')return json({costings:newest(await get('costing_sheets'),'updated_at').slice(0,500)})
  if(action==='listCostingBatches')return json({batches:newest(await get('costing_batches'),'created_at')})
  if(action==='listProformas')return json({invoices:newest(await get('proforma_invoices'),'updated_at').slice(0,200)})
  if(action==='ppmList'){
   const orderId=url.searchParams.get('orderId')
   const rows=(await get('pp_meetings')).filter(row=>!orderId||row.order_id===orderId)
   return json({data:newest(rows,'created_at').slice(0,200)})
  }
  if(action==='costingHistory'||action==='getProforma'){
   const id=url.searchParams.get('id')
   if(!/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(id||''))return json({error:'Invalid document ID'},400)
   if(action==='costingHistory'){
    const rows=(await get('costing_sheet_versions')).filter(row=>row.costing_id===id)
    return json({history:rows.sort((a,b)=>b.version-a.version).map(({version,document,created_at})=>({version,document,created_at}))})
   }
   const invoice=(await get('proforma_invoices')).find(row=>row.id===id)
   if(!invoice)return json({error:'Invoice not found'},404)
   const rows=(await get('proforma_invoice_revisions')).filter(row=>row.invoice_id===id)
   const history=rows.sort((a,b)=>b.revision-a.revision).map(({revision,action,actor_id,created_at})=>({revision,action,actor_id,created_at}))
   return json({invoice,history})
  }
 }
 if(request.method==='POST'){
  if(action==='previewProformaNumber')return json({number:'Pending sync'})
  if(action==='saveProforma'||action==='transitionProforma')return json({invoice:await saveCatalog({...input,kind:'proforma',action:'save'})})
  if(action==='saveCosting')return json({costing:await saveCatalog({...input,kind:'costing',action:'save'})})
  if(action==='assignCostingBatch'){await saveCatalog({...input,kind:'costingAssignment',action:'save'});return json({updated:input.ids.length})}
  if(action==='ppmCreate')return json({data:await saveCatalog({...input,kind:'meeting',action:'save'})})
  if(action==='ppmDelete'){await saveCatalog({...input,kind:'meeting',action:'delete'});return json({ok:true})}
 }
 if(request.method==='POST'&&action==='ppmSave')
  return json({data:await saveCatalog({kind:'pp_meetings',action:'save',id:input.id,fields:input.data})})
 if(request.method==='POST'&&action==='saveCostingBatch')
  return json({batch:await saveCatalog({kind:'costing_batches',action:'save',fields:{name:String(input.name||'').trim()}})})
 if(action==='testing'&&request.method==='GET'){
  const [requirements,testingOrders,suppliers,orders]=await Promise.all(['testing_requirements','testing_orders','suppliers','orders'].map(get))
  return json({requirements,testingOrders,suppliers:suppliers.filter(x=>String(x.category||'').toLowerCase().includes('testing')),orders})
 }
 if(action==='list'&&TYPES[type]){
  const rows=await get(TYPES[type])
  if(type==='snapshots')return json({data:rows.find(x=>x.parcel_id===url.searchParams.get('parcelId'))||null})
  return json({data:rows.filter(x=>String(x.buyer_id)===url.searchParams.get('buyerId'))})
 }
 if(action==='createParcel'&&request.method==='POST'){
  const parcel=input.parcel
  if(!parcel||!Array.isArray(parcel.items)||!Array.isArray(parcel.custom_items))return json({error:'Invalid parcel details'},400)
  const existing=await get('parcels')
  const year=new Date().getFullYear().toString().slice(-2)
  const used=existing.map(x=>Number(String(x.id||'').match(new RegExp('^PAR-'+year+'-(\\d+)$'))?.[1]||0))
  const number='PAR-'+year+'-'+String(Math.max(0,...used)+1).padStart(3,'0')
  await mutateLocalRecord(directory,{action:'create',table:'parcels',id:number,fields:{...parcel,status:'Draft'}})
  return json({id:number,offline:true})
 }
 if(action==='save'&&type==='snapshots'&&request.method==='POST'){
  const {parcelId,addressId,contactId}=input
  if(!parcelId||!/^([0-9a-f]{8}-([0-9a-f]{4}-){3}[0-9a-f]{12})$/i.test(addressId||''))
   return json({error:'A parcel and saved buyer address are required.'},400)
  if(!queueParcelInvoice)return json({error:'Parcel invoice sync is unavailable.'},503)
  return json({data:await queueParcelInvoice({parcelId,addressId,contactId}),offline:true})
 }
 return json({error:'This web-only action is not yet available offline. No data was changed.'},501)
}
module.exports={handleOfflineOms}
