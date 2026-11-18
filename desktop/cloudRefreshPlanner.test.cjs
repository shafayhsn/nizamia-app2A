'use strict'
const assert=require('node:assert/strict')
const {createCloudRefreshPlanner}=require('./cloudRefreshPlanner.cjs')
const token='a'.repeat(32)
const payload={backup_metadata:{table_count:4,table_row_counts:{orders:1,buyers:1,suppliers:0,users:1}},tables:{orders:[{id:'o1',status:'new',access_token:'never-export'}],buyers:[{id:'b1'}],suppliers:[],users:[{id:'u1',password:'never-export'}]}}
const response=data=>({status:200,url:'https://app.nizamia.com/api/desktop/snapshot',headers:{get:()=>null},body:new ReadableStream({start(c){c.enqueue(new TextEncoder().encode(JSON.stringify(data)));c.close()}})})
async function main(){
 const planner=createCloudRefreshPlanner({origin:'https://app.nizamia.com',fetchImpl:async()=>response(payload),getOnlineToken:async()=>token,authenticateOnlineSession:async s=>s?.valid===true})
 await assert.rejects(()=>planner.plan({valid:false}),/Verified online/)
 const result=await planner.plan({valid:true})
 assert.equal(result.tableCount,3)
 assert.equal(result.rowCount,2)
 assert.deepEqual(result.tables.orders,[{id:'o1',status:'new'}])
 assert.equal(Object.hasOwn(result.tables,'users'),false)
 const expired=createCloudRefreshPlanner({origin:'https://app.nizamia.com',fetchImpl:async()=>response(payload),getOnlineToken:async()=>token,authenticateOnlineSession:async()=>false})
 await assert.rejects(()=>expired.plan({valid:true}),/Verified online/)
 console.log('Authenticated cloud refresh planning tests passed')
}
main().catch(e=>{console.error(e);process.exitCode=1})
