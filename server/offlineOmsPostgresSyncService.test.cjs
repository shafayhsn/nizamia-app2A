'use strict'
const assert=require('node:assert/strict')
const {createHmac}=require('node:crypto')
const {createOmsPostgresSyncService}=require('./offlineOmsPostgresSyncService.cjs')
const {operationId}=require('../desktop/offlineSyncPlanner.cjs')
async function main(){
 let connections=0,updates=0,active=true,canEdit=true
 const db={from(table){
  const state={table}
  return {select(){return this},eq(field,value){state[field]=value;return this},
   async maybeSingle(){return {data:{id:state.id,role:'operator',role_id:'r1',is_active:active,is_restricted:false},error:null}},
   then(resolve){return Promise.resolve({data:[{module:'orders',can_edit:canEdit}],error:null}).then(resolve)}
  }
 }}
 const pool={async connect(){connections++;return {async query(){throw Error('No production or test database writes permitted in this integration test')},release(){}}}}
 const secret='s'.repeat(64)
 const disabled=createOmsPostgresSyncService({secret,db,pool})
 const draft={draftId:'123e4567-e89b-42d3-a456-426614174000',status:'uncommitted',
  table:'orders',recordId:'o1',snapshotHash:'a'.repeat(64),before:{notes:'old'},changes:{notes:'new'}}
 const operation={draft,operationId:operationId(draft),identity:'u1'}
 const token=()=>{
  const payload=Buffer.from(JSON.stringify({id:'u1',exp:Date.now()+60000})).toString('base64url')
  return payload+'.'+createHmac('sha256',secret).update(payload).digest('base64url')
 }
 const request=t=>({method:'POST',headers:{'content-type':'application/json',authorization:'Bearer '+t},rawBody:JSON.stringify({operations:[operation]})})
 assert.equal((await disabled(request(token()))).status,503)
 assert.equal(connections,0)
 assert.throws(()=>createOmsPostgresSyncService({secret,db,enabled:true}),/pool/)
 const enabled=createOmsPostgresSyncService({secret,db,pool,enabled:true})
 assert.equal((await enabled(request('invalid-token-long-enough'))).status,401)
 assert.equal(connections,0)
 canEdit=false
 const blocked=await enabled(request(token()))
 assert.equal(blocked.status,200)
 assert.equal(blocked.body.results[0].decision,'blocked')
 assert.equal(connections,0)
 canEdit=true;active=false
 assert.equal((await enabled(request(token()))).status,401)
 assert.equal(connections,0)
 assert.equal(updates,0)
 process.stdout.write('Fail-closed OMS PostgreSQL sync composition tests passed.\\n')
}
main().catch(e=>{console.error(e);process.exitCode=1})
