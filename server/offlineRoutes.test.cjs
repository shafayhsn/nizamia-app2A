'use strict'
const assert=require('node:assert/strict')
const {mountOfflineRoutes}=require('./offlineRoutes.cjs')
async function main(){
 const routes=new Map()
 const app={post:(name,handler)=>routes.set(name,handler)}
 let enrolled=false
 mountOfflineRoutes({
  app,
  issuer:{enrollment:async()=>{enrolled=true;return {signature:'signed'}},draft:async()=>({signature:'signed-draft'})},
  authenticateRequest:async req=>req.headers.authorization==='Bearer trusted'
   ?{authenticated:true,identity:'worker1'}:null,
  authorizeSync:async()=>false,
  pool:{connect:async()=>{throw Error('Must not open database for denied request')}}
 })
 async function invoke(route,body,token='Bearer trusted'){
  let response
  const res={status(code){response={status:code};return this},json(data){response.body=data;return response}}
  await routes.get(route)({method:'POST',headers:{'content-type':'application/json',authorization:token},body},res)
  return response
 }
 assert.equal(routes.size,2)
 assert.equal((await invoke('/api/offline-authorization',{kind:'enrollment',nonce:'a'.repeat(64)})).status,200)
 assert.equal(enrolled,true)
 assert.equal((await invoke('/api/offline-authorization',{kind:'enrollment',nonce:'a'.repeat(64)},'Bearer invalid')).status,401)
 assert.equal((await invoke('/api/offline-sync',{operations:[]})).status,400)
 assert.equal((await invoke('/api/offline-sync',{operations:[]},'Bearer invalid')).status,400)
 assert.throws(()=>mountOfflineRoutes({app}),/Trusted/)
 process.stdout.write('Authenticated offline route mounting tests passed.\n')
}
main().catch(e=>{console.error(e);process.exitCode=1})
