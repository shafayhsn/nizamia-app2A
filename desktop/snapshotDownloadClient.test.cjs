'use strict'
const assert=require('node:assert/strict')
const {createSnapshotDownloadClient}=require('./snapshotDownloadClient.cjs')
const origin='https://app.nizamia.com'
const token='x'.repeat(32)
const payload={backup_metadata:{table_count:3,table_row_counts:{orders:1,buyers:0,suppliers:0}},tables:{orders:[{id:'1'}],buyers:[],suppliers:[]}}
function reply(data,status=200){return {status,url:origin+'/api/desktop/snapshot',headers:{get:()=>null},body:new ReadableStream({start(controller){controller.enqueue(new TextEncoder().encode(JSON.stringify(data)));controller.close()}})}}
async function main(){
 assert.throws(()=>createSnapshotDownloadClient({origin:'http://app.nizamia.com',fetchImpl:async()=>reply(payload)}),/Pinned HTTPS/)
 let captured
 const client=createSnapshotDownloadClient({origin,fetchImpl:async(url,options)=>{captured={url,options};return reply(payload)}})
 assert.deepEqual(await client.download({token}),payload)
 assert.equal(captured.url,origin+'/api/desktop/snapshot')
 assert.equal(captured.options.headers.authorization,'Bearer '+token)
 assert.equal(captured.options.credentials,'omit')
 assert.equal(captured.options.redirect,'error')
 await assert.rejects(()=>client.download({token:'bad'}),/Authenticated online/)
 const invalid=createSnapshotDownloadClient({origin,fetchImpl:async()=>reply({...payload,tables:{orders:[],buyers:[],suppliers:[]}})})
 await assert.rejects(()=>invalid.download({token}),/manifest mismatch/i)
 const oversized=createSnapshotDownloadClient({origin,maxBytes:1024,fetchImpl:async()=>reply({...payload,extra:'a'.repeat(2000)})})
 await assert.rejects(()=>oversized.download({token}),/size limit/)
 console.log('Snapshot download transport tests passed')
}
main().catch(e=>{console.error(e);process.exitCode=1})
