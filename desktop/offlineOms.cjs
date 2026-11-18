'use strict'
const {listCombinedRecords,mutateLocalRecord}=require('./standaloneRecords.cjs')
const TYPES={addresses:'buyer_addresses',contacts:'buyer_contacts',snapshots:'parcel_invoice_snapshots'}
const json=(data,status=200)=>Response.json(data,{status,headers:{'Cache-Control':'no-store'}})
async function handleOfflineOms(directory,url,request,{queueParcelInvoice}={}){
 const input=request.method==='POST'?JSON.parse(await request.text()):{}
 const action=request.method==='GET'?url.searchParams.get('action'):input.action
 const type=request.method==='GET'?url.searchParams.get('type'):input.type
 const get=table=>listCombinedRecords(directory,table)
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
