'use strict'
const commonReads=new Set(['records','pending-status','version','refresh','po-review','drafts','pdf'])
const fixed={
 'order-note':['orders','edit'],'order-copy':['orders','edit'],'order-import':['orders','create'],
 'order-section':['orders','edit'],bom:['orders','edit'],'po-matrix':['orders','edit'],
 'job-create':['orders','edit'],'parcel-create':['parcels','create'],'parcel-transition':['parcels','edit'],
 'sample-stage':['sampling','edit']
}
const modules={orders:'orders',suppliers:'suppliers',buyers:'buyers',samples:'sampling',sample_comments:'sampling',parcels:'parcels',
 production_daily_entries:'production',shipments:'shipping',booking:'shipping',shipment:'shipping',batch:'production',
 library_items:'library',size_group_templates:'library',trimPackage:'library',meeting:'reports/pp-meeting',pp_meetings:'reports/pp-meeting',
 costing:'features/costing',costingAssignment:'features/costing',costing_batches:'features/costing'}
function right(route,body){
 if(Object.hasOwn(fixed,route))return fixed[route]
 if(route==='order-general')return ['orders',body.orderId?'edit':'create']
 if(route==='buyer')return ['buyers',body.buyerId?'edit':'create']
 if(route==='operational-record'){
   if(body.payment || body.kind==='shipment' && body.action==='delete')return []
   return [modules[body.kind],body.action==='delete'?'delete':body.kind==='batch'||body.kind==='costingAssignment'||body.id?'edit':'create']
 }
 if(['mutate','mutate-batch','sampling-parcels','batch'].includes(route)){
   if(!['orders','samples','sample_comments','parcels','shipments','suppliers','production_daily_entries'].includes(body.table))return []
   // Unsupported generic deletes never enter a queue as if the server could apply them.
   if(body.action==='delete'&&route!=='sampling-parcels')return []
   return [modules[body.table],route==='batch'?'create':body.action==='update'?'edit':body.action]
 }
 return []
}
async function staffRequestAllowed(user,path,request){
 if(!path.startsWith('/api/offline/'))return false
 const route=path.slice('/api/offline/'.length)
 if(commonReads.has(route))return true
 if(request.method!=='POST')return false
 let input={}
 if(!Object.hasOwn(fixed,route)){
   const raw=await request.clone().text()
   if(raw.length>1048576)return false
   try{input=JSON.parse(raw)}catch{return false}
   if(!input||typeof input!=='object')return false
 }
 const [area,action]=right(route,input),grant=user.permissions?.[area]
 return !!(user.role_id && grant?.view===true && ['create','edit','delete'].includes(action) && grant[action]===true)
}
module.exports={staffRequestAllowed}
