'use strict'
const assert=require('node:assert/strict')
const {createOfflineSyncApply}=require('./offlineSyncApply.cjs')
const {operationId}=require('../desktop/offlineSyncPlanner.cjs')
const draft={draftId:'123e4567-e89b-42d3-a456-426614174000',status:'uncommitted',
 table:'orders',recordId:'o1',snapshotHash:'a'.repeat(64),
 before:{notes:'old'},changes:{notes:'new'}}
const request={operations:[{draft,operationId:operationId(draft),identity:'operator_1'}]}
async function main(){
 let current={id:'o1',notes:'old'},updates=0
 const ledger=new Map()
 const transaction=async fn=>fn({
  once:async(id,work)=>{
   if(ledger.has(id))return {decision:'already-applied'}
   const result=await work()
   if(result.decision==='applied')ledger.set(id,true)
   return result
  },
  readForUpdate:async()=>({...current}),
  updateConditional:async(table,id,before,changes)=>{
   if(current.notes!==before.notes)return 0
   current={...current,...changes};updates++;return 1
  }
 })
 const apply=createOfflineSyncApply({
  authenticate:async()=>({authenticated:true,identity:'operator_1'}),
  authorize:async()=>true,transaction
 })
 assert.equal((await apply(request)).body.results[0].decision,'applied')
 assert.equal(current.notes,'new')
 assert.equal((await apply(request)).body.results[0].decision,'already-applied')
 assert.equal(updates,1)
 const invalid=await apply({operations:[{...request.operations[0],operationId:'forged'}]})
 assert.equal(invalid.status,400)
 const mismatch=await apply({operations:[{...request.operations[0],identity:'other'}]})
 assert.equal(mismatch.status,400)
 const denied=createOfflineSyncApply({authenticate:async()=>null,authorize:async()=>true,transaction})
 assert.equal((await denied(request)).status,401)
 const blocked=createOfflineSyncApply({authenticate:async()=>({authenticated:true,identity:'operator_1'}),authorize:async()=>false,transaction})
 assert.equal((await blocked(request)).body.results[0].decision,'blocked')
 const changed=createOfflineSyncApply({
  authenticate:async()=>({authenticated:true,identity:'operator_1'}),
  authorize:async()=>true,
  transaction:async fn=>fn({...{
   once:async(id,work)=>work(),readForUpdate:async()=>({id:'o1',notes:'cloud changed'}),
   updateConditional:async()=>{throw Error('Should not write')}
  }})
 })
 assert.equal((await changed(request)).body.results[0].reason,'cloud-field-changed')
 const unsafe=createOfflineSyncApply({authenticate:async()=>({authenticated:true,identity:'operator_1'}),authorize:async()=>true,transaction:async fn=>fn({})})
 assert.equal((await unsafe(request)).body.results[0].decision,'error')
 process.stdout.write('Authenticated conditional sync apply contract tests passed.\n')
}
main().catch(e=>{console.error(e);process.exitCode=1})
