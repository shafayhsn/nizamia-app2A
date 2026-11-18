'use strict'

const {randomUUID}=require('node:crypto')

function initialize(db){
 db.run(`CREATE TABLE IF NOT EXISTS offline_mutation_outbox (
  operation_id TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL,
  table_name TEXT NOT NULL,
  record_id TEXT NOT NULL,
  fingerprint TEXT NOT NULL,
  intent_json TEXT NOT NULL,
  state TEXT NOT NULL CHECK(state IN ('pending','conflict','applied')),
  UNIQUE(owner_id,fingerprint)
 )`)
 db.run(`CREATE UNIQUE INDEX IF NOT EXISTS offline_mutation_active_record
  ON offline_mutation_outbox(table_name,record_id)
  WHERE state IN ('pending','conflict')`)
}

function stageMutation(db,ownerId,intent){
 if(typeof ownerId!=='string'||!ownerId||!intent?.table||!intent?.id||
    !['create','update','delete'].includes(intent.operation)||!/^[a-f0-9]{64}$/.test(intent.fingerprint))
  throw Error('Authorized mutation intent required')
 initialize(db)
 const saved=db.exec('SELECT operation_id FROM offline_mutation_outbox WHERE owner_id=? AND fingerprint=?',
  [ownerId,intent.fingerprint])[0]?.values?.[0]
 if(saved)return saved[0]
 const active=db.exec("SELECT 1 FROM offline_mutation_outbox WHERE table_name=? AND record_id=? AND state IN ('pending','conflict')",
  [intent.table,intent.id])[0]?.values?.[0]
 if(active)return null
 const operationId=randomUUID()
 db.run("INSERT INTO offline_mutation_outbox VALUES (?,?,?,?,?,?,'pending')",
  [operationId,ownerId,intent.table,intent.id,intent.fingerprint,JSON.stringify(intent)])
 return operationId
}

function pendingMutations(db,ownerId){
 initialize(db)
 const rows=db.exec("SELECT operation_id,intent_json FROM offline_mutation_outbox WHERE owner_id=? AND state='pending' ORDER BY rowid LIMIT 20",
  [ownerId])[0]?.values||[]
 return rows.map(([operationId,intent])=>({operationId,intent:JSON.parse(intent)}))
}

function recordMutationOutcome(db,ownerId,operationId,outcome){
 if(!['applied','already-applied','conflict','retry'].includes(outcome))throw Error('Invalid sync acknowledgement')
 initialize(db)
 const state=outcome==='already-applied'?'applied':outcome==='retry'?'pending':outcome
 db.run("UPDATE offline_mutation_outbox SET state=? WHERE operation_id=? AND owner_id=? AND state='pending'",
  [state,operationId,ownerId])
 return db.getRowsModified()===1
}

module.exports={stageMutation,pendingMutations,recordMutationOutcome}
