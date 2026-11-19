'use strict'
const {moduleTables,scopeKey}=require('./teamSnapshot.cjs')
const {primaryKeys}=require('./snapshotTableReader.cjs')

async function buildDelta(db,user,catalog,after,expectedScope){
 const staff=user.role!=='admin'
 let grants={}
 if(staff){
  const {data,error}=await db.from('permissions').select('module,can_view').eq('role_id',user.role_id)
  if(error)throw error
  grants=Object.fromEntries(data.map(r=>[r.module,{view:r.can_view}]))
 }
 const scope=scopeKey({...user,permissions:grants})
 const {data:page,error}=await db.rpc('nzos_sync_page',{after_revision:after})
 if(error||!Number.isSafeInteger(page?.revision))throw Error('Change journal unavailable')
 const metadata={revision:page.revision,scope}
 if(after===null||expectedScope!==scope||page.reset)return {metadata}
 const allowed=new Set(staff?Object.entries(moduleTables).filter(([m])=>grants[m]?.view).flatMap(([,v])=>v.split(' ')):catalog)
 const grouped=new Map()
 for(const [table,id] of page.changes){
  if(['users','permissions','roles'].includes(table) || staff&&(
   grants.purchasing?.view&&['purchase_orders','purchase_order_items','po_approval_requests'].includes(table) ||
   grants.tasks?.view&&['app_tasks','app_task_comments'].includes(table)))return {metadata}
  if(!allowed.has(table))continue
  if(!grouped.has(table))grouped.set(table,new Set())
  grouped.get(table).add(id)
 }
 const changes={}
 for(const [table,ids] of grouped){
  const key=primaryKeys[table]||'id'
  const {data,error,count}=await db.from(table).select('*',{count:'exact'}).in(key,[...ids])
  if(error||count!==data?.length)throw Error('Incomplete changed records')
  const records=data.map(row=>Object.fromEntries(Object.entries(row).filter(([k])=>
   !/password|secret|token|api_key|private_key|session|credential|auth_hash|passkey/i.test(k)&&
   !(staff&&(/attachment_path|storage_path/i.test(k)||table==='shipments'&&/notes|payment|credit|receipt|settlement|bank/i.test(k))))))
  const found=new Set(records.map(r=>String(r[key])))
  changes[table]={key,records,removed:[...ids].filter(id=>!found.has(id))}
 }
 return {metadata,delta:{after,changes}}
}
module.exports={buildDelta}
