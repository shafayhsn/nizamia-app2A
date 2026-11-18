'use strict'

const {test}=require('node:test')
const assert=require('node:assert/strict')
const initSqlJs=require('sql.js')
const {inspectPendingMutations}=require('./offlineMutationPlan.cjs')

test('extracts creates, deletes and only changed fields with stable fingerprints',async()=>{
 const SQL=await initSqlJs()
 const db=new SQL.Database()
 try{
  db.run('CREATE TABLE snapshot_rows(table_name TEXT,row_json TEXT)')
  db.run('CREATE TABLE snapshot_edits(table_name TEXT,record_id TEXT,fields_json TEXT,updated_at TEXT)')
  db.run('CREATE TABLE standalone_records(table_name TEXT,id TEXT,fields_json TEXT,created_at TEXT,updated_at TEXT)')
  db.run('INSERT INTO snapshot_rows VALUES (?,?),(?,?)',
   ['orders','{"id":"order","status":"Active","notes":"note"}','samples','{"id":"sample","stage":null}'])
  db.run('INSERT INTO snapshot_edits VALUES (?,?,?,?),(?,?,?,?),(?,?,?,?)',
   ['orders','order','{"status":"Booked","notes":"note","id":"order"}','later',
    'samples','sample',null,'later','orders','missing','{"status":"Booked"}','later'])
  db.run('INSERT INTO standalone_records VALUES (?,?,?,?,?)',
   ['production_daily_entries','local-new','{"order_id":"order","quantity":9}','first','later'])
  const plan=inspectPendingMutations(db)
  assert.deepEqual(plan.mutations.map(x=>x.operation),['create','update','delete'])
  assert.deepEqual(plan.mutations[1].changes,{status:'Booked'})
  assert.deepEqual(plan.mutations[1].expected,{status:'Active'})
  assert.deepEqual(plan.blocked,[{table:'orders',id:'missing',reason:'missing-or-ambiguous-base'}])
  db.run('UPDATE snapshot_edits SET fields_json=? WHERE record_id=?',
   ['{"id":"order","notes":"note","status":"Booked"}','order'])
  assert.deepEqual(inspectPendingMutations(db),plan)
  db.run('UPDATE snapshot_edits SET fields_json=? WHERE record_id=?',
   ['{"id":"order","notes":"note","new_field":true}','order'])
  assert.ok(inspectPendingMutations(db).blocked.some(item=>item.reason==='missing-base-fields'))
 }finally{db.close()}
})
