'use strict'
const assert=require('node:assert/strict')
const {createOfflineSyncHttpHandler}=require('./offlineSyncHttpHandler.cjs')
async function main(){
 let received
 const handler=createOfflineSyncHttpHandler({apply:async req=>{received=req;return {status:200,body:{results:[]}}}})
 const req={method:'POST',headers:{'content-type':'application/json','authorization':'Bearer server-token'},
  rawBody:JSON.stringify({operations:[{draftId:'abc'}]})}
 assert.equal((await handler(req)).status,200)
 assert.equal(received.operations.length,1)
 assert.equal(received.headers.authorization,'Bearer server-token')
 assert.equal(received.rawBody,undefined)
 assert.equal((await handler({...req,method:'GET'})).status,405)
 assert.equal((await handler({...req,rawBody:'not json'})).status,400)
 assert.equal((await handler({...req,headers:{'content-type':'text/plain'}})).status,415)
 assert.equal((await handler({...req,rawBody:'x'.repeat(262145)})).status,413)
 assert.equal((await handler({...req,rawBody:'{}'})).status,400)
 process.stdout.write('Offline synchronization HTTP adapter tests passed.\n')
}
main().catch(e=>{console.error(e);process.exitCode=1})
