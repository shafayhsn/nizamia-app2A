'use strict'
const assert=require('node:assert/strict')
const {createHmac}=require('node:crypto')
const {createOmsSyncSecurity}=require('./offlineOmsSyncSecurity.cjs')
async function main(){
 const secret='s'.repeat(64),now=Date.now()
 let active=true,allowed=true,failPermissions=false
 const db={from(table){
  const state={table}
  return {
   select(){return this},
   eq(field,value){state[field]=value;return this},
   async maybeSingle(){return {data:{id:state.id,role:'operator',role_id:'r1',is_active:active,is_restricted:false},error:null}},
   then(resolve){return Promise.resolve({data:failPermissions?null:[{module:'orders',can_edit:allowed}],error:failPermissions?{message:'denied'}:null}).then(resolve)}
  }
 }}
 const security=createOmsSyncSecurity({secret,db,now:()=>now})
 const sign=(id,exp,key=secret)=>{
  const payload=Buffer.from(JSON.stringify({id,exp})).toString('base64url')
  return payload+'.'+createHmac('sha256',key).update(payload).digest('base64url')
 }
 const request=token=>({headers:{authorization:'Bearer '+token}})
 const token=sign('u1',now+60000)
 const session=await security.authenticate(request(token))
 assert.equal(session.identity,'u1')
 assert.equal(await security.authenticate(request(sign('u1',now-1))),null)
 assert.equal(await security.authenticate(request(sign('u1',now+60000,'x'.repeat(64)))),null)
 assert.equal(await security.authenticate(request(token+'a')),null)
 const args={session,identity:'u1',table:'orders',fields:['notes'],purpose:'offline-sync'}
 assert.equal(await security.authorize(args),true)
 allowed=false
 assert.equal(await security.authorize(args),false)
 allowed=true;failPermissions=true
 assert.equal(await security.authorize(args),false)
 failPermissions=false;active=false
 assert.equal(await security.authenticate(request(token)),null)
 assert.equal(await security.authorize(args),false)
 assert.throws(()=>createOmsSyncSecurity({secret:'short',db}),/Trusted/)
 process.stdout.write('OMS signed-session sync authentication tests passed.\\n')
}
main().catch(e=>{console.error(e);process.exitCode=1})
