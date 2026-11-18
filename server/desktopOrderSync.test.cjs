'use strict'
const {test}=require('node:test')
const assert=require('node:assert/strict')
const {createHmac}=require('node:crypto')
const {createDesktopOrderSync}=require('./desktopOrderSync.cjs')
const {issueDesktopSyncToken}=require('./desktopSyncToken.cjs')
const {operationId}=require('../desktop/offlineSyncPlanner.cjs')

test('desktop order sync accepts scoped tokens and reports each database outcome',async()=>{
 const key='s'.repeat(64)
 const actor='e9f91602-3635-41ce-888a-e699bad377e0'
 const recordId='ce26cc69-47fe-4dfd-bc5b-7b91cba60b6a'
 const draft={draftId:recordId,recordId,status:'uncommitted',table:'orders',
  snapshotHash:'a'.repeat(64),before:{notes:null},changes:{notes:'new note'}}
 let calls=0
 let outcome='applied'
 const sync=createDesktopOrderSync({key,db:{async rpc(name,args){
  calls++
  assert.equal(name,'desktop_apply_order_note')
  assert.deepEqual(args,{actor,operation:operationId(draft),order_id:recordId,previous_note:null,new_note:'new note'})
  return {data:outcome}
 }}})
 const send=(token,change=draft,identity=actor)=>sync({method:'POST',
  headers:{authorization:'Bearer '+token,'content-type':'application/json'},
  rawBody:JSON.stringify({operations:[{draft:change,identity,operationId:operationId(change)}]})
 })
 const token=issueDesktopSyncToken(key,actor)
 const payload=Buffer.from(JSON.stringify({id:actor,exp:Date.now()+60000})).toString('base64url')
 for(const domain of ['','desktop-snapshot:']){
  const mac=createHmac('sha256',key).update(domain+payload).digest('base64url')
  assert.equal((await send(payload+'.'+mac)).status,401)
 }
 assert.equal((await send(issueDesktopSyncToken(key,actor,0))).status,401)
 assert.equal((await send(token,draft,recordId)).status,400)
 assert.equal((await send(token,{...draft,table:'production_daily_entries'})).body.results[0].decision,'blocked')
 assert.equal(calls,0)
 for(const [rpc,decision] of [['applied','applied'],['already-applied','already-applied'],['conflict','conflict'],['unauthorized','blocked']]){
  outcome=rpc
  assert.equal((await send(token)).body.results[0].decision,decision)
 }
 assert.equal(calls,4)
})
