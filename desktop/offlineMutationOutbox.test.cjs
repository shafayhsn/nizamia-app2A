'use strict'
const {test}=require('node:test')
const assert=require('node:assert/strict')
const initSqlJs=require('sql.js')
const {stageMutation,pendingMutations,recordMutationOutcome}=require('./offlineMutationOutbox.cjs')

test('a persisted operation retains its ID through retry and blocks later writes after a conflict',async()=>{
 const SQL=await initSqlJs()
 let db=new SQL.Database()
 const first={table:'shipments',id:'shipment',operation:'update',fingerprint:'a'.repeat(64)}
 const second={...first,fingerprint:'b'.repeat(64)}
 try{
  const id=stageMutation(db,'owner',first)
  const bytes=db.export()
  db.close()
  db=new SQL.Database(bytes)
  assert.equal(stageMutation(db,'owner',first),id)
  assert.deepEqual(pendingMutations(db,'owner'),[{operationId:id,intent:first}])
  assert.deepEqual(pendingMutations(db,'other'),[])
  assert.equal(stageMutation(db,'other',second),null)
  assert.equal(recordMutationOutcome(db,'other',id,'applied'),false)
  assert.equal(recordMutationOutcome(db,'owner',id,'retry'),true)
  assert.equal(stageMutation(db,'owner',second),null)
  assert.equal(recordMutationOutcome(db,'owner',id,'conflict'),true)
  assert.deepEqual(pendingMutations(db,'owner'),[])
  assert.equal(stageMutation(db,'owner',second),null)
  assert.equal(recordMutationOutcome(db,'owner',id,'applied'),false)
 }finally{db.close()}
})

test('only a server acknowledgement releases the next write on the same record',async()=>{
 const SQL=await initSqlJs()
 const db=new SQL.Database()
 try{
  const first={table:'orders',id:'order',operation:'update',fingerprint:'a'.repeat(64)}
  const id=stageMutation(db,'owner',first)
  assert.equal(recordMutationOutcome(db,'owner',id,'already-applied'),true)
  assert.equal(stageMutation(db,'owner',first),id)
  assert.notEqual(stageMutation(db,'owner',{...first,fingerprint:'b'.repeat(64)}),id)
  assert.equal(pendingMutations(db,'owner').length,1)
 }finally{db.close()}
})
