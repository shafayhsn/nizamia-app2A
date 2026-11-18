'use strict'
const {test}=require('node:test')
const assert=require('node:assert/strict')
const {readSnapshotTable}=require('./snapshotTableReader.cjs')

function database(results){
 return {calls:[],from(table){
  const call={table}
  this.calls.push(call)
  return {
   select(fields,options){Object.assign(call,{fields,options});return this},
   order(key){call.key=key;return this},
   limit(size){call.size=size;return this},
   gt(key,cursor){call.cursor=[key,cursor];return this},
   then(resolve){return Promise.resolve(results.shift()).then(resolve)}
  }
 }}
}

test('keyset pagination keeps reading through a shorter gateway page',async()=>{
 const db=database([
  {data:[{key:'a'}],count:3},
  {data:[{key:'b'},{key:'c'}],count:2},
  {count:3}
 ])
 assert.deepEqual(await readSnapshotTable(db,'settings'),[{key:'a'},{key:'b'},{key:'c'}])
 assert.deepEqual(db.calls[1].cursor,['key','a'])
 assert.equal(db.calls[2].options.head,true)
})

test('changed counts, partial pages and repeated keys fail closed',async()=>{
 for(const page of [{data:[],count:1},{data:[{id:'a'}],count:1},{data:[],count:0}]){
  const db=database([{data:[{id:'a'}],count:2},page])
  await assert.rejects(readSnapshotTable(db,'orders'))
 }
 await assert.rejects(readSnapshotTable(database([{data:[{id:'a'}],count:1},{count:2}]),'orders'))
})
