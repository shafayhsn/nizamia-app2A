'use strict'
const {verifyDesktopSyncToken}=require('./desktopSyncToken.cjs')
const uuid=/^[a-f\d]{8}(?:-[a-f\d]{4}){3}-[a-f\d]{12}$/i
const productionFields=['order_id','size_group_id','color_id','department','movement','production_date','production_at','quantity']

function createDesktopMutationHttp({db,key}){
 return async function handle({method,headers,body}){
  const header=headers?.authorization
  const claim=typeof header==='string'&&header.startsWith('Bearer ')&&verifyDesktopSyncToken(key,header.slice(7))
  if(!claim||!uuid.test(claim.userId))return {status:401,body:{error:'Desktop sync session required'}}
  if(method!=='POST')return {status:405,body:{error:'Method not allowed'}}
  if(typeof body==='string'){
   if(Buffer.byteLength(body)>128*1024)return {status:413,body:{error:'Sync batch is too large'}}
   try{body=JSON.parse(body)}catch{return {status:400,body:{error:'Invalid sync batch'}}}
  }
  const operations=body?.operations
  if(!Array.isArray(operations)||!operations.length||operations.length>20||
     Buffer.byteLength(JSON.stringify(operations))>128*1024||
     new Set(operations.map(entry=>entry?.operationId)).size!==operations.length||
     operations.some(entry=>!uuid.test(entry?.operationId||'')))
   return {status:400,body:{error:'Invalid sync batch'}}
  const results=[]
  for(const {operationId,intent} of operations){
   let rpc,args
   if(intent?.operation==='create'&&intent.table==='production_daily_entries'&&
      intent.fields&&typeof intent.fields==='object'&&!Array.isArray(intent.fields)){
    rpc='desktop_create_production_entry'
    args={payload:Object.fromEntries(productionFields.filter(key=>Object.hasOwn(intent.fields,key)).map(key=>[key,intent.fields[key]]))}
   }else if(intent?.operation==='update'&&intent.table==='orders'&&uuid.test(intent.id||'')&&
      Object.keys(intent.changes||{}).join()==='status'&&Object.keys(intent.expected||{}).join()==='status'&&
      typeof intent.changes.status==='string'&&(intent.expected.status===null||typeof intent.expected.status==='string')){
    rpc='desktop_update_order_status'
    args={target_order:intent.id,previous_status:intent.expected.status,new_status:intent.changes.status}
   }else if(intent?.operation==='update'&&intent.table==='samples'&&uuid.test(intent.id||'')&&
      Object.keys(intent.changes||{}).join()==='stage'&&Object.keys(intent.expected||{}).join()==='stage'&&
      typeof intent.changes.stage==='string'&&(intent.expected.stage===null||typeof intent.expected.stage==='string')){
    rpc='desktop_update_sample_stage'
    args={target_sample:intent.id,previous_stage:intent.expected.stage,new_stage:intent.changes.stage}
   }else{
    results.push({operationId,outcome:'unsupported'})
    continue
   }
   try{
    const {data,error}=await db.rpc(rpc,{actor:claim.userId,operation:operationId,...args})
    results.push({operationId,outcome:!error&&['applied','already-applied','conflict','unauthorized','invalid'].includes(data)?data:'retry'})
   }catch{results.push({operationId,outcome:'retry'})}
  }
  return {status:200,body:{results}}
 }
}
module.exports={createDesktopMutationHttp}
