'use strict'
const assert=require('node:assert/strict')
const {createPostgresSyncTransaction}=require('./offlinePostgresSyncTransaction.cjs')
const {createOfflineSyncApply}=require('./offlineSyncApply.cjs')
const {operationId}=require('../desktop/offlineSyncPlanner.cjs')
async function main(){
 let row={id:'o1',notes:'old',remarks:null},commits=0,rollbacks=0,released=0
 const ledger=new Set(),sql=[]
 const pool={connect:async()=>({
  query:async(statement,params=[])=>{
   sql.push({statement,params})
   if(statement.startsWith('COMMIT')){commits++;return {}}
   if(statement.startsWith('ROLLBACK')){rollbacks++;return {}}
   if(statement.startsWith('SELECT outcome'))return {rows:ledger.has(params[0])?[{outcome:'applied'}]:[]}
   if(statement.startsWith('INSERT INTO offline_sync_operations')){ledger.add(params[0]);return {rowCount:1}}
   if(statement.startsWith('SELECT id, notes'))return {rows:[{...row}]}
   if(statement.startsWith('UPDATE orders')){
    if(row.notes!==params[2])return {rowCount:0}
    row.notes=params[1];return {rowCount:1}
   }
   return {rows:[],rowCount:0}
  },
  release:()=>{released++}
 })}
 const transaction=createPostgresSyncTransaction({pool})
 const apply=createOfflineSyncApply({
  authenticate:async()=>({authenticated:true,identity:'worker_1'}),
  authorize:async()=>true,transaction
 })
 const draft={draftId:'123e4567-e89b-42d3-a456-426614174000',table:'orders',recordId:'o1',
  snapshotHash:'a'.repeat(64),status:'uncommitted',before:{notes:'old'},changes:{notes:'new'}}
 const request={operations:[{draft,identity:'worker_1',operationId:operationId(draft)}]}
 assert.equal((await apply(request)).body.results[0].decision,'applied')
 assert.equal(row.notes,'new')
 assert.equal((await apply(request)).body.results[0].decision,'already-applied')
 assert.equal(ledger.size,1)
 assert.equal(commits,2)
 assert.ok(sql.some(x=>x.statement.includes('FOR UPDATE')))
 assert.ok(sql.some(x=>x.statement.includes('IS NOT DISTINCT FROM')))
 assert.ok(sql.some(x=>x.statement.includes('pg_advisory_xact_lock')))
 const second={...draft,draftId:'123e4567-e89b-42d3-a456-426614174001',before:{notes:'old'},changes:{notes:'other'}}
 assert.equal((await apply({operations:[{draft:second,identity:'worker_1',operationId:operationId(second)}]})).body.results[0].decision,'conflict')
 assert.equal(row.notes,'new')
 assert.equal(ledger.size,1)
 await assert.rejects(()=>transaction(async tx=>tx.updateConditional('users','o1',{notes:'old'},{notes:'new'})),/Invalid/)
 assert.equal(rollbacks,1)
 assert.equal(released,4)
 assert.throws(()=>createPostgresSyncTransaction({pool:{}}),/pool/)
 process.stdout.write('PostgreSQL conditional sync integration and rollback tests passed.\n')
}
main().catch(e=>{console.error(e);process.exitCode=1})
