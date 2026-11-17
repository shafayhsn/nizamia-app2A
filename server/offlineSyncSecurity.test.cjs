'use strict'
const assert=require('node:assert/strict')
const {createOfflineSyncSecurity}=require('./offlineSyncSecurity.cjs')
async function main(){
 let active=true,edit=true,role='operator'
 const security=createOfflineSyncSecurity({
  verifyBearer:async token=>token==='trusted-online-session'?{userId:'worker_1'}:null,
  loadUser:async id=>({id,role,role_id:'role-1',is_active:active,is_restricted:false}),
  loadPermissions:async()=>({orders:{edit},production:{edit:false}})
 })
 const req={headers:{authorization:'Bearer trusted-online-session'}}
 const session=await security.authenticate(req)
 assert.equal(session.identity,'worker_1')
 assert.equal(await security.authenticate({headers:{authorization:'Bearer bad'}}),null)
 const args={session,identity:'worker_1',table:'orders',fields:['notes'],purpose:'offline-sync'}
 assert.equal(await security.authorize(args),true)
 assert.equal(await security.authorize({...args,identity:'worker_2'}),false)
 assert.equal(await security.authorize({...args,table:'production_daily_entries'}),false)
 assert.equal(await security.authorize({...args,fields:['price']}),false)
 edit=false
 assert.equal(await security.authorize(args),false)
 role='admin'
 assert.equal(await security.authorize(args),true)
 active=false
 assert.equal(await security.authenticate(req),null)
 assert.equal(await security.authorize(args),false)
 assert.throws(()=>createOfflineSyncSecurity({}),/Trusted/)
 process.stdout.write('Server offline sync security bridge tests passed.\\n')
}
main().catch(e=>{console.error(e);process.exitCode=1})
