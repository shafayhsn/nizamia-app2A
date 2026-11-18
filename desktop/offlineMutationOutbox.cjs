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
 if(!db.exec('PRAGMA table_info(offline_mutation_outbox)')[0].values.some(column=>column[1]==='resource_id'))
  db.run('ALTER TABLE offline_mutation_outbox ADD COLUMN resource_id TEXT')
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
 db.run("INSERT INTO offline_mutation_outbox(operation_id,owner_id,table_name,record_id,fingerprint,intent_json,state) VALUES (?,?,?,?,?,?,'pending')",
  [operationId,ownerId,intent.table,intent.id,intent.fingerprint,JSON.stringify(intent)])
 return operationId
}

function pendingMutations(db,ownerId){
 initialize(db)
 const rows=db.exec("SELECT operation_id,intent_json FROM offline_mutation_outbox WHERE owner_id=? AND state='pending' ORDER BY rowid LIMIT 20",
  [ownerId])[0]?.values||[]
 return rows.map(([operationId,intent])=>({operationId,intent:JSON.parse(intent)}))
}

function recordMutationOutcome(db,ownerId,operationId,outcome,resourceId){
 if(!['applied','already-applied','conflict','retry','invalid','unauthorized','unsupported'].includes(outcome))throw Error('Invalid sync acknowledgement')
 initialize(db)
 const state=['applied','already-applied'].includes(outcome)?'applied':outcome==='retry'?'pending':'conflict'
 db.run("UPDATE offline_mutation_outbox SET state=?,resource_id=? WHERE operation_id=? AND owner_id=? AND state='pending'",
  [state,resourceId||null,operationId,ownerId])
 return db.getRowsModified()===1
}

function assertUnqueued(db,table,id){
 if(!db.exec("SELECT 1 FROM sqlite_master WHERE type='table' AND name='offline_mutation_outbox'").length)return
 if(db.exec("SELECT 1 FROM offline_mutation_outbox WHERE (table_name=? AND record_id=? AND (state<>'applied' OR json_extract(intent_json,'$.operation')='create')) OR (?='sample_comments' AND json_extract(intent_json,'$.historyRecord.id')=?) OR EXISTS(SELECT 1 FROM json_each(intent_json,'$.document.localLines') WHERE json_extract(value,'$.table')=? AND json_extract(value,'$.id')=?)",[table,id,table,id,table,id]).length)
  throw Error('This record is awaiting cloud synchronization or review.')
}

function holdOrderDetails(db,tables,hold){
 if(!tables.orders||!db.exec("SELECT 1 FROM sqlite_master WHERE type='table' AND name='offline_mutation_outbox'").length)return
 const {isOrderDetailsPatch}=require('./orderDetailsMutation.cjs')
 const entries=db.exec("SELECT intent_json,state FROM offline_mutation_outbox WHERE table_name='orders' AND json_extract(intent_json,'$.operation')='update'")[0]?.values||[]
 for(const [json,state] of entries){
  const {id,changes,editedAt}=JSON.parse(json)
  if(!isOrderDetailsPatch(changes)||(Object.keys(changes).join()==='status'&&changes.status!==null))continue
  if(!db.exec("SELECT 1 FROM snapshot_edits WHERE table_name='orders' AND record_id=? AND updated_at=?",[id,editedAt]).length)continue
  const cloud=tables.orders.find(row=>row.id===id)
  if(state!=='applied'||!cloud||!Object.entries(changes).every(([key,value])=>cloud[key]===value))
   hold.add('orders:'+id)
 }
}

function reconcileDocumentEdits(db,tables){
 const hold=new Set()
 if(!db.exec("SELECT 1 FROM sqlite_master WHERE type='table' AND name='offline_mutation_outbox'").length)return hold
 const entries=db.exec("SELECT intent_json,state FROM offline_mutation_outbox WHERE json_type(intent_json,'$.expected.lines')='array'")[0]?.values||[]
 for(const [json,state] of entries){
  const intent=JSON.parse(json)
  const linked=intent.document.localLines
  const childTable=linked[0].table
  const targets=[[intent.table,intent.id],...intent.expected.lines.map(line=>[childTable,line.id])]
  const current=tables[childTable]
  if(state==='applied'&&tables[intent.table]?.some(row=>row.id===intent.id)&&
     linked.every(line=>current?.some(row=>row.id===line.id.slice(6)))&&
     intent.expected.lines.every(line=>!current?.some(row=>row.id===line.id))){
   for(const [table,id] of targets)db.run('DELETE FROM snapshot_edits WHERE table_name=? AND record_id=? AND updated_at=?',[table,id,intent.editedAt])
   for(const {id,table} of linked)db.run('DELETE FROM standalone_records WHERE table_name=? AND id=? AND updated_at=?',[table,id,intent.editedAt])
  }else for(const [table,id] of targets){
   if(db.exec('SELECT 1 FROM snapshot_edits WHERE table_name=? AND record_id=? AND updated_at=?',[table,id,intent.editedAt]).length)
    hold.add(table+':'+id)
  }
 }
 return hold
}

function reconcileUploadedCreates(db,tables){
 if(!db.exec("SELECT 1 FROM sqlite_master WHERE type='table' AND name='offline_mutation_outbox'").length)return
 initialize(db)
 const entries=db.exec("SELECT operation_id,table_name,record_id,intent_json,resource_id FROM offline_mutation_outbox WHERE state='applied'")[0]?.values||[]
 for(const [operationId,table,id,json,resourceId] of entries){
  const intent=JSON.parse(json)
  if(intent.historyRecord&&tables.sample_comments?.some(row=>row.id===operationId)){
   const {id:historyId,editedAt}=intent.historyRecord
   db.run("DELETE FROM standalone_records WHERE table_name='sample_comments' AND id=? AND updated_at=?",
    [historyId,editedAt])
  }
  const cloudId=resourceId||operationId
  if(!tables[table]?.some(row=>row.id===cloudId))continue
  if(intent.operation!=='create')continue
  const linked=intent.document?.localLines||[]
  if(linked.length&&!tables[linked[0].table]?.filter(row=>row[linked[0].parentField]===cloudId).length)continue
  for(const child of linked)db.run('DELETE FROM standalone_records WHERE table_name=? AND id=? AND updated_at=?',
   [child.table,child.id,intent.editedAt])
  db.run('DELETE FROM standalone_records WHERE table_name=? AND id=? AND updated_at=?',
   [table,id,intent.editedAt])
 }
}

function findQueuedRecords(db){
 if(!db.exec("SELECT 1 FROM sqlite_master WHERE type='table' AND name='offline_mutation_outbox'").length)return new Set()
 return new Set((db.exec('SELECT table_name,record_id,intent_json FROM offline_mutation_outbox')[0]?.values||[]).flatMap(([table,id,json])=>{
  const intent=JSON.parse(json)
  return [table+':'+id,...(intent.historyRecord?['sample_comments:'+intent.historyRecord.id]:[]),...(intent.document?.localLines||[]).map(line=>line.table+':'+line.id),
   ...(intent.expected?.lines||[]).map(line=>intent.document.localLines[0].table+':'+line.id)]
 }))
}

module.exports={findQueuedRecords,stageMutation,pendingMutations,recordMutationOutcome,assertUnqueued,reconcileUploadedCreates,reconcileDocumentEdits,holdOrderDetails}
