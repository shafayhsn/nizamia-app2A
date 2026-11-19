const test=require('node:test')
const assert=require('node:assert/strict')
const {buildDelta}=require('./snapshotDelta.cjs')
const {scopeKey}=require('./teamSnapshot.cjs')
const user={id:'member',role:'admin',role_id:null}
const scope=scopeKey(user)
test('12 idle checks send no business records; one stage edit downloads just that sample',async()=>{
 let changes=[],reads=[]
 const db={
  rpc:async()=>({data:{revision:changes.length?11:10,changes}}),
  from:table=>({select:()=>({in:async(key,ids)=>{
    reads.push([table,...ids]);return {data:[{id:'sample',stage:'Cutting'}],count:1}
  }})})
 }
 let bytes=0
 for(let i=0;i<12;i++){
  const response=await buildDelta(db,user,['samples','orders'],10,scope)
  assert.deepEqual(response.delta.changes,{})
  bytes+=Buffer.byteLength(JSON.stringify({checkpoint:response.metadata,delta:response.delta}))
 }
 assert.deepEqual(reads,[])
 changes=[['samples','sample',true]]
 const result=await buildDelta(db,user,['samples','orders'],10,scope)
 assert.deepEqual(reads,[['samples','sample']])
 assert.deepEqual(result.delta.changes.samples.records,[{id:'sample',stage:'Cutting'}])
 console.log('12 idle JSON responses:',bytes,'bytes. Single change:',Buffer.byteLength(JSON.stringify(result)),'bytes.')
})
