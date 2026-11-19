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
 const images=new Set()
 const grouped=new Map()
 let tasksChanged=false
 for(const [source,id,imageChanged] of page.changes){
  if(source==='orders'&&imageChanged!==false)images.add(id)
  let table=source
  if(table==='users' && (!staff||grants.tasks?.view))table='desktop_task_assignees'
  if(staff&&grants.tasks?.view&&['app_tasks','app_task_comments'].includes(table)){tasksChanged=true;continue}
  if(staff&&grants.purchasing?.view&&table==='po_approval_requests')table='purchase_orders'
  if(!allowed.has(table) && !(table==='desktop_task_assignees'&&grants.tasks?.view) &&
     !(table==='purchase_orders'&&grants.purchasing?.view))continue
  if(!grouped.has(table))grouped.set(table,new Set())
  grouped.get(table).add(id)
 }
 const changes={}
 if(tasksChanged){
   // Reassignment can revoke all comments for a task. Replace only this user's task views.
   const {readSnapshotTable}=require('./snapshotTableReader.cjs')
   const tasks=await readSnapshotTable(db,'app_tasks',{filter:q=>q.or('created_by.eq.'+user.id+',assignee_id.eq.'+user.id)})
   const comments=[]
   for(let i=0;i<tasks.length;i+=100){
     const ids=tasks.slice(i,i+100).map(row=>row.id)
     comments.push(...await readSnapshotTable(db,'app_task_comments',{filter:q=>q.in('task_id',ids)}))
   }
   changes.app_tasks={key:'id',records:tasks,removed:[],replace:true}
   changes.app_task_comments={key:'id',records:comments,removed:[],replace:true}
 }
 for(const [table,ids] of grouped){
  if(staff&&table==='purchase_orders'){
    const records=[],removed=[]
    for(const id of ids){
      const {data,error}=await db.rpc('read_purchase_order_page',{actor:user.id,after_id:null,only_id:id})
      if(error)throw error
      if(!data.length){removed.push(id);continue}
      const {po_number,status}=data[0].document
      records.push({id,po_number,status,details_hidden:true})
    }
    changes[table]={key:'id',records,removed};continue
  }
  if(table==='desktop_task_assignees'){
    const {data,error,count}=await db.from('users').select('id,username',{count:'exact'}).in('id',[...ids]).eq('is_active',true)
    if(error||data?.length!==count)throw Error('Incomplete user directory')
    const found=new Set(data.map(r=>r.id))
    changes[table]={key:'id',records:data,removed:[...ids].filter(id=>!found.has(id))};continue
  }
  const key=primaryKeys[table]||'id'
  const {data,error,count}=table==='orders'?await db.rpc('nzos_order_delta',{ids:[...ids],images:[...images]},{count:'exact'}):await db.from(table).select('*',{count:'exact'}).in(key,[...ids])
  if(error||count!==data?.length)throw Error('Incomplete changed records')
  const records=data.map(row=>Object.fromEntries(Object.entries(row).filter(([k])=>
   !/password|secret|token|api_key|private_key|session|credential|auth_hash|passkey/i.test(k)&&
   !(staff&&(/attachment_path|storage_path/i.test(k)||table==='shipments'&&/notes|payment|credit|receipt|settlement|bank/i.test(k))))))
  const found=new Set(records.map(r=>String(r[key])))
  changes[table]={key,records,removed:[...ids].filter(id=>!found.has(id))}
 }
 return {metadata,delta:{after,changes,more:page.more===true}}
}
module.exports={buildDelta}
