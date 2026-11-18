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
   if(intent?.operation!=='create'||intent?.table!=='production_daily_entries'||
      !intent.fields||typeof intent.fields!=='object'||Array.isArray(intent.fields)){
    results.push({operationId,outcome:'unsupported'})
    continue
   }
   const payload=Object.fromEntries(productionFields.filter(key=>Object.hasOwn(intent.fields,key)).map(key=>[key,intent.fields[key]]))
   try{
    const {data,error}=await db.rpc('desktop_create_production_entry',{actor:claim.userId,operation:operationId,payload})
    results.push({operationId,outcome:!error&&['applied','already-applied','conflict','unauthorized','invalid'].includes(data)?data:'retry'})
   }catch{results.push({operationId,outcome:'retry'})}
  }
  return {status:200,body:{results}}
 }
}
module.exports={createDesktopMutationHttp}
