'use strict'
const assert=require('node:assert/strict')
const {createOfflineSyncClient}=require('./offlineSyncClient.cjs')
const draft={draftId:'123e4567-e89b-42d3-a456-426614174000',status:'uncommitted',
 table:'orders',recordId:'o1',snapshotHash:'a'.repeat(64),before:{notes:'old'},changes:{notes:'new'}}
const args={drafts:[draft],identity:'operator_1',token:'valid-server-session-token'}
async function main(){
 let called=0
 const client=createOfflineSyncClient({
  endpoint:'https://app.example.com/api/offline-sync',
  fetchImpl:async(url,request)=>{
   called++
   assert.equal(url,'https://app.example.com/api/offline-sync')
   assert.equal(request.method,'POST')
   assert.equal(request.headers.authorization,'Bearer valid-server-session-token')
   const body=JSON.parse(request.body)
   assert.equal(body.operations[0].identity,'operator_1')
   assert.equal(body.operations[0].operationId.length,64)
   return {status:200,headers:{get:()=>null},text:async()=>JSON.stringify({results:[{
    draftId:draft.draftId,decision:'applied'
   }]})}
  }
 })
 assert.equal((await client.submit(args)).results[0].decision,'applied')
 assert.equal(called,1)
 await assert.rejects(()=>client.submit({...args,drafts:[draft,draft]}),/Duplicate/)
 await assert.rejects(()=>client.submit({...args,token:'short'}),/Invalid/)
 assert.throws(()=>createOfflineSyncClient({endpoint:'http://app.example.com/api/offline-sync',fetchImpl:async()=>{}}),/Pinned/)
 assert.throws(()=>createOfflineSyncClient({endpoint:'https://app.example.com/unsafe',fetchImpl:async()=>{}}),/Pinned/)
 const forged=createOfflineSyncClient({endpoint:'https://app.example.com/api/offline-sync',
  fetchImpl:async()=>({status:200,headers:{get:()=>null},text:async()=>JSON.stringify({results:[{
   draftId:'other',decision:'applied'
  }]})})})
 await assert.rejects(()=>forged.submit(args),/Untrusted/)
 const huge=createOfflineSyncClient({endpoint:'https://app.example.com/api/offline-sync',
  fetchImpl:async()=>({status:200,headers:{get:()=>999999},text:async()=>''})})
 await assert.rejects(()=>huge.submit(args),/too large/)
 let release
 const wait=new Promise(resolve=>{release=resolve})
 const busy=createOfflineSyncClient({endpoint:'https://app.example.com/api/offline-sync',
  fetchImpl:async()=>{await wait;return {status:503}}})
 const first=busy.submit(args)
 await assert.rejects(()=>busy.submit(args),/already in progress/)
 release()
 await assert.rejects(()=>first,/rejected/)
 process.stdout.write('Authenticated HTTPS desktop sync transport tests passed.\n')
}
main().catch(e=>{console.error(e);process.exitCode=1})
