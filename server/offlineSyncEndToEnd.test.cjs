'use strict'
// End-to-end contract test: desktop HTTPS client -> HTTP handler -> authenticated
// sync engine -> PostgreSQL transaction adapter. Uses an isolated in-memory pg
// protocol double; never touches production or external networks.
const assert=require('node:assert/strict')
const {createOfflineSyncClient}=require('../desktop/offlineSyncClient.cjs')
const {createOfflineSyncHttpHandler}=require('./offlineSyncHttpHandler.cjs')
const {createOfflineSyncApply}=require('./offlineSyncApply.cjs')
const {createPostgresSyncTransaction}=require('./offlinePostgresSyncTransaction.cjs')
async function main(){
 let row={id:'order-101',notes:'before',remarks:null},writes=0
 const ledger=new Set()
 const pool={connect:async()=>({
  query:async(sql,args=[])=>{
   if(sql.startsWith('SELECT outcome'))return {rows:ledger.has(args[0])?[{outcome:'applied'}]:[]}
   if(sql.startsWith('INSERT INTO offline_sync_operations')){ledger.add(args[0]);return {rowCount:1}}
   if(sql.startsWith('SELECT id, notes'))return {rows:[{...row}]}
   if(sql.startsWith('UPDATE orders')){
    if(row.notes!==args[2])return {rowCount:0}
    row.notes=args[1];writes++;return {rowCount:1}
   }
   return {rows:[],rowCount:0}
  },release:()=>{}
 })}
 let permission=true
 const apply=createOfflineSyncApply({
  authenticate:async req=>req.headers.authorization==='Bearer trusted-session-token'
   ?{authenticated:true,identity:'operator_1'}:null,
  authorize:async()=>permission,
  transaction:createPostgresSyncTransaction({pool})
 })
 const http=createOfflineSyncHttpHandler({apply})
 const client=createOfflineSyncClient({
  endpoint:'https://app.example.test/api/offline-sync',
  fetchImpl:async(url,request)=>{
   const reply=await http({method:request.method,headers:request.headers,rawBody:request.body})
   return {status:reply.status,headers:{get:()=>null},text:async()=>JSON.stringify(reply.body)}
  }
 })
 const base={table:'orders',recordId:'order-101',status:'uncommitted',snapshotHash:'a'.repeat(64)}
 const draft={...base,draftId:'123e4567-e89b-42d3-a456-426614174000',
  before:{notes:'before'},changes:{notes:'after'}}
 const options={identity:'operator_1',token:'trusted-session-token'}
 assert.equal((await client.submit({...options,drafts:[draft]})).results[0].decision,'applied')
 assert.equal(row.notes,'after')
 assert.equal((await client.submit({...options,drafts:[draft]})).results[0].decision,'already-applied')
 assert.equal(writes,1)
 const stale={...draft,draftId:'123e4567-e89b-42d3-a456-426614174001',changes:{notes:'overwrite'}}
 assert.equal((await client.submit({...options,drafts:[stale]})).results[0].decision,'conflict')
 assert.equal(row.notes,'after')
 permission=false
 const blocked={...draft,draftId:'123e4567-e89b-42d3-a456-426614174002',
  before:{notes:'after'},changes:{notes:'denied'}}
 assert.equal((await client.submit({...options,drafts:[blocked]})).results[0].decision,'blocked')
 assert.equal(row.notes,'after')
 permission=true
 await assert.rejects(()=>client.submit({...options,token:'wrong-session-token',drafts:[blocked]}),/rejected/)
 assert.equal(writes,1)
 process.stdout.write('Desktop-to-HTTP-to-transaction offline sync end-to-end contract passed.\n')
}
main().catch(e=>{console.error(e);process.exitCode=1})
