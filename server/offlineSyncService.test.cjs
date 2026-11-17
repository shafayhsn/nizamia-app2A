'use strict'
const assert=require('node:assert/strict')
const {createOfflineSyncService}=require('./offlineSyncService.cjs')
const {operationId}=require('../desktop/offlineSyncPlanner.cjs')
const draft={draftId:'123e4567-e89b-42d3-a456-426614174000',status:'uncommitted',
 table:'orders',recordId:'o1',snapshotHash:'a'.repeat(64),
 before:{notes:'old'},changes:{notes:'new'}}
const operation={draft,operationId:operationId(draft),identity:'worker_1'}
async function main(){
 let active=true,edit=true,updates=0,record={id:'o1',notes:'old'}
 const ledger=new Set()
 const service=createOfflineSyncService({
  verifyBearer:async token=>token==='valid-online-session'?{userId:'worker_1'}:null,
  loadUser:async id=>({id,role:'operator',role_id:'role-1',is_active:active,is_restricted:false}),
  loadPermissions:async()=>({orders:{edit:true&&edit}}),
  transaction:async work=>work({
   once:async(id,fn)=>{if(ledger.has(id))return {decision:'already-applied'};const outcome=await fn();if(outcome.decision==='applied')ledger.add(id);return outcome},
   readForUpdate:async()=>({...record}),
   updateConditional:async(table,id,before,changes)=>{if(record.notes!==before.notes)return 0;record={...record,...changes};updates++;return 1}
  })
 })
 const request=(token='valid-online-session',ops=[operation])=>({method:'POST',headers:{'content-type':'application/json',authorization:'Bearer '+token},rawBody:JSON.stringify({operations:ops})})
 assert.equal((await service(request('invalid-token-long-enough'))).status,401)
 assert.equal(updates,0)
 const success=await service(request())
 assert.equal(success.status,200)
 assert.equal(success.body.results[0].decision,'applied')
 assert.equal(record.notes,'new')
 assert.equal((await service(request())).body.results[0].decision,'already-applied')
 assert.equal(updates,1)
 edit=false
 assert.equal((await service(request())).body.results[0].decision,'blocked')
 active=false
 assert.equal((await service(request())).status,401)
 assert.equal((await service(request('valid-online-session',[{...operation,identity:'someone_else'}]))).status,401)
 assert.throws(()=>createOfflineSyncService({}),/Trusted/)
 process.stdout.write('Offline HTTP security and conditional apply composition tests passed.\\n')
}
main().catch(e=>{console.error(e);process.exitCode=1})
