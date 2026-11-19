'use strict'
const {createHash}=require('node:crypto')
const moduleTables={
 orders:'orders jobs size_groups size_group_colors size_group_breakdown order_queues order_processes bom_items fitting fitting_blocks washing embellishments finishing finishing_color_packing finishing_packs',
 buyers:'buyers buyer_addresses buyer_contacts',suppliers:'suppliers',
 sampling:'samples sample_comments sample_logs',parcels:'parcels parcel_status_history',
 production:'production_batches production_batch_orders production_daily_entries',
 purchasing:'work_orders work_order_items work_order_changelog testing_orders testing_requirements',
 shipping:'shipments shipment_lines shipping_bookings shipping_booking_lines shipping_booking_shipments',
 'features/costing':'costing_batches costing_sheet_versions costing_sheets',
 'reports/pp-meeting':'pp_meetings',
 library:'library_items bom_presets bom_preset_items size_group_templates'
}
function scopeKey(user){
 const grants=Object.entries(user.permissions||{}).filter(([,v])=>v.view).map(([k])=>k).sort()
 return createHash('sha256').update(JSON.stringify([user.id,user.role_id,grants])).digest('hex')
}
async function staffSnapshot(db,user,readTable){
 const load=async()=>{
   const {data,error}=await db.from('permissions').select('module,can_view').eq('role_id',user.role_id)
   if(error)throw error
   return Object.fromEntries(data.map(r=>[r.module,{view:r.can_view}]))
 }
 const permissions=await load(),scope=scopeKey({...user,permissions})
 const tables={orders:[],suppliers:[],buyers:[]}
 for(const [module,group] of Object.entries(moduleTables)){
   if(!permissions[module]?.view)continue
   for(const table of group.split(' ')){
     const rows=await readTable(db,table)
     tables[table]=rows.map(row=>Object.fromEntries(Object.entries(row).filter(([field])=>
       !/password|secret|token|api_key|private_key|session|credential|auth_hash|passkey|attachment_path|storage_path/i.test(field)
       && !(table==='shipments' && /notes|payment|credit|receipt|settlement|bank/i.test(field)))))
   }
 }
 if(permissions.tasks?.view){
   const tasks=await readTable(db,'app_tasks')
   tables.app_tasks=tasks.filter(row=>row.assignee_id===user.id||row.created_by===user.id)
   const ids=new Set(tables.app_tasks.map(row=>row.id))
   tables.app_task_comments=(await readTable(db,'app_task_comments')).filter(row=>ids.has(row.task_id))
   tables.desktop_task_assignees=await readTable(db,'desktop_task_assignees')
 }
 if(permissions.purchasing?.view){
   const pos=[],items=[]
   let after=null
   for(;;){
     const {data,error}=await db.rpc('read_purchase_order_page',{actor:user.id,after_id:after,only_id:null})
     if(error)throw error
     for(const {document} of data){
       // Pending POs are always fetched online to avoid retaining an earlier approval offline.
       pos.push({id:document.id,po_number:document.po_number,status:document.status,details_hidden:true})
     }
     if(data.length<100)break
     const last=data.at(-1).id
     if(last===after)throw Error('PO pagination interrupted')
     after=last
   }
   tables.purchase_orders=pos;tables.purchase_order_items=items
 }
 const {data:current,error}=await db.from('users').select('role,role_id,is_active,is_restricted').eq('id',user.id).single()
 if(error||!current.is_active||current.is_restricted||current.role!==user.role||current.role_id!==user.role_id||
    scope!==scopeKey({...user,permissions:await load()}))throw Error('Permissions changed during download')
 return {tables,backup_metadata:{staff_scope:scope,table_count:Object.keys(tables).length,table_row_counts:Object.fromEntries(Object.entries(tables).map(([t,r])=>[t,r.length])),exported_at:new Date().toISOString()}}
}
module.exports={staffSnapshot,scopeKey}
