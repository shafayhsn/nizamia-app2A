'use strict'
const crypto=require('node:crypto')
const {listCombinedRecords,mutateLocalRecord}=require('./standaloneRecords.cjs')
const TYPES={addresses:'buyer_addresses',contacts:'buyer_contacts',snapshots:'parcel_invoice_snapshots'}
const json=(data,status=200)=>Response.json(data,{status,headers:{'Cache-Control':'no-store'}})
async function handleOfflineOms(directory,url,request){
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
  const [parcels,addresses,contacts,buyers,snapshots]=await Promise.all(['parcels','buyer_addresses','buyer_contacts','buyers','parcel_invoice_snapshots'].map(get))
  const parcel=parcels.find(x=>x.id===input.parcelId)
  const address=addresses.find(x=>x.id===input.addressId)
  if(!parcel||!address)return json({error:'Parcel or address not found in local data'},400)
  const contact=contacts.find(x=>x.id===input.contactId&&x.buyer_id===address.buyer_id)
  const buyer=buyers.find(x=>x.id===address.buyer_id)
  const consignee={name:address.recipient||buyer?.name||'',label:address.label||'',address_line1:address.address_line1||'',address_line2:address.address_line2||'',city:address.city||'',region:address.region||'',postal_code:address.postal_code||'',country:address.country||'',contact_name:contact?.name||buyer?.contact_person||'',phone:contact?.phone||address.phone||'',email:contact?.email||address.email||''}
  const prior=snapshots.find(x=>x.parcel_id===input.parcelId)
  const fields={parcel_id:input.parcelId,buyer_id:address.buyer_id,address_id:address.id,contact_id:contact?.id||null,consignee,updated_at:new Date().toISOString()}
  const data=await mutateLocalRecord(directory,{action:prior?'update':'create',table:'parcel_invoice_snapshots',id:prior?.id||crypto.randomUUID(),fields})
  return json({data,offline:true})
 }
 return json({error:'This web-only action is not yet available offline. No data was changed.'},501)
}
module.exports={handleOfflineOms}
