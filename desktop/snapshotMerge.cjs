'use strict'
const {isDeepStrictEqual:equal}=require('node:util')
const {reconcileUploadedCreates,reconcileDocumentEdits,holdOrderDetails,reconcileNewJobs,reconcilePoMatrices,holdSupplierEdits,reconcileBuyers,reconcileOrderRemovals,reconcileOrderCopies,reconcileArea3Records,reconcilePurchasingRemovals,reconcileOperationalChanges}=require('./offlineMutationOutbox.cjs')
const timestamp=value=>typeof value==='string'&&/(Z|[+-]\d\d:\d\d)$/i.test(value)?Date.parse(value):NaN

function shipmentStatusTime(before,after){
 const parse=notes=>{
  const match=typeof notes==='string'&&notes.match(/\[\[APP2A_SHIPPING_META:([A-Za-z0-9+/=]+)\]\]$/)
  if(!match)return null
  try {
   const {display_status,status_history,...fields}=JSON.parse(Buffer.from(match[1],'base64').toString('utf8'))
   return {text:notes.slice(0,match.index),fields,status:display_status,history:status_history}
  }catch{return null}
 }
 const old=parse(before),fresh=parse(after)
 if(!old||!fresh||old.text!==fresh.text||!equal(old.fields,fresh.fields)||old.status===fresh.status||!Array.isArray(fresh.history))return NaN
 return timestamp(fresh.history.findLast(event=>event?.to===fresh.status)?.at)
}

function reconcileOverlays(db,tables,excluded,hold){
 const key=(table,row)=>table==='production_batch_orders'?row.order_id:row.id
 const overlays=db.exec("SELECT 1 FROM sqlite_master WHERE type='table' AND name='snapshot_edits'")
 if(!overlays.length)return {unresolved:[],rows:tables}
 const unresolved=[],rows={...tables},indexed=new Map()
 const edits=db.exec('SELECT table_name,record_id,fields_json,updated_at FROM snapshot_edits')[0]?.values||[]
 for(const [table,id,json,editedAt] of edits){
  if(!Object.hasOwn(tables,table)||excluded.has(table))continue
  if(!indexed.has(table)){
   rows[table]=[...tables[table]]
   const stored=db.exec('SELECT row_json FROM snapshot_rows WHERE table_name=?',[table])[0]?.values||[]
   indexed.set(table,{
    stored:new Map(stored.map(([entry])=>{const row=JSON.parse(entry);return [String(key(table,row)),row]})),
    incoming:new Map(tables[table].map((row,index)=>[String(key(table,row)),index]))
   })
  }
  const {stored,incoming}=indexed.get(table)
  const base=stored.get(String(id)),index=incoming.get(String(id)),cloud=rows[table][index]
  if(hold.has(table+':'+id)){
   if(base&&cloud)rows[table][index]=base
   if(base&&!cloud)rows[table].push(base)
   continue
  }
  if(equal(base,cloud))continue
  const flag=()=>{
   unresolved.push({table,recordId:id})
   if(base&&cloud)rows[table][index]=base
   if(base&&!cloud)rows[table].push(base)
  }
  if(!base||!cloud){flag();continue}
  const local=json===null?null:JSON.parse(json)
  const localTime=timestamp(editedAt)
  if(local===null){
   const cloudTime=timestamp(cloud.updated_at)
   if(!Number.isFinite(localTime)||!Number.isFinite(cloudTime)||localTime===cloudTime){flag();continue}
   if(cloudTime>localTime)db.run('DELETE FROM snapshot_edits WHERE table_name=? AND record_id=?',[table,id])
   continue
  }
  const merged={...cloud}
  let needsReview=false
  for(const field of Object.keys(local)){
   if(equal(local[field],base[field])||equal(local[field],cloud[field]))continue
   if(equal(base[field],cloud[field])){merged[field]=local[field];continue}
   const cloudTime=table==='shipments'&&field==='notes'
    ?shipmentStatusTime(base.notes,cloud.notes)
    :equal(base.updated_at,cloud.updated_at)?NaN:timestamp(cloud.updated_at)
   if(!Number.isFinite(localTime)||!Number.isFinite(cloudTime)||localTime===cloudTime){needsReview=true;break}
   if(localTime>cloudTime)merged[field]=local[field]
  }
  if(needsReview){flag();continue}
  if(equal(merged,cloud))db.run('DELETE FROM snapshot_edits WHERE table_name=? AND record_id=?',[table,id])
  else db.run('UPDATE snapshot_edits SET fields_json=? WHERE table_name=? AND record_id=?',[JSON.stringify(merged),table,id])
 }
 return {unresolved,rows}
}

// Pure, local-only snapshot refresh. Never touches Supabase or local draft tables.
// Call only with a fully validated, authenticated snapshot and a verified backup.
function mergeSnapshotRows(db,tables,{excludedTables=[]}={}){
 if(!db||typeof db.run!=='function'||!tables||typeof tables!=='object'||Array.isArray(tables))throw Error('Validated snapshot required')
 if(!Array.isArray(excludedTables)||excludedTables.some(name=>typeof name!=='string'))throw Error('Invalid exclusions')
 const excluded=new Set(excludedTables)
 const names=Object.keys(tables)
 if(!names.length)throw Error('Empty snapshot refused')
 for(const name of names){
  if(!/^[a-z][a-z0-9_]*$/.test(name)||!Array.isArray(tables[name]))throw Error('Invalid snapshot table')
  for(const row of tables[name]){
   if(!row||typeof row!=='object'||Array.isArray(row))throw Error('Invalid snapshot row')
   if(JSON.stringify(row)===undefined)throw Error('Unserializable snapshot row')
  }
 }
 db.run('CREATE TABLE IF NOT EXISTS snapshot_rows (table_name TEXT NOT NULL,row_index INTEGER NOT NULL,row_json TEXT NOT NULL,PRIMARY KEY(table_name,row_index))')
 db.run('CREATE TABLE IF NOT EXISTS snapshot_manifest (table_name TEXT PRIMARY KEY NOT NULL,row_count INTEGER NOT NULL)')
 db.run('BEGIN TRANSACTION')
 let unresolved
 try{
  const hold=reconcileDocumentEdits(db,Object.fromEntries(Object.entries(tables).filter(([name])=>!excluded.has(name))))
  if(!excluded.has('orders')){
   holdOrderDetails(db,tables,hold)
   reconcileNewJobs(db,excluded.has('jobs')?{orders:tables.orders}:tables,hold)
  }
  if(!excluded.has('suppliers'))holdSupplierEdits(db,tables,hold)
  const acceptedTables=Object.fromEntries(Object.entries(tables).filter(([name])=>!excluded.has(name)))
  reconcilePoMatrices(db,acceptedTables,hold)
  reconcileBuyers(db,acceptedTables,hold)
  reconcileOrderRemovals(db,acceptedTables,hold)
  reconcileOrderCopies(db,acceptedTables)
  reconcileArea3Records(db,acceptedTables,hold)
  reconcilePurchasingRemovals(db,acceptedTables,hold)
  reconcileOperationalChanges(db,acceptedTables,hold)
  const reconciliation=reconcileOverlays(db,tables,excluded,hold)
  unresolved=reconciliation.unresolved
  const incoming=reconciliation.rows
  reconcileUploadedCreates(db,Object.fromEntries(Object.entries(incoming).filter(([table])=>!excluded.has(table))))
  const insert=db.prepare('INSERT INTO snapshot_rows(table_name,row_index,row_json) VALUES (?,?,?)')
  const manifest=db.prepare('INSERT INTO snapshot_manifest(table_name,row_count) VALUES (?,?)')
  try{
   for(const name of names){
    if(excluded.has(name))continue
    db.run('DELETE FROM snapshot_rows WHERE table_name=?',[name])
    db.run('DELETE FROM snapshot_manifest WHERE table_name=?',[name])
    incoming[name].forEach((row,index)=>insert.run([name,index,JSON.stringify(row)]))
    manifest.run([name,incoming[name].length])
   }
  }finally{insert.free();manifest.free()}
  const integrity=db.exec('PRAGMA quick_check')
  if(integrity[0]?.values?.[0]?.[0]!=='ok')throw Error('Snapshot refresh failed SQLite integrity check')
  db.run('COMMIT')
 }catch(error){try{db.run('ROLLBACK')}catch{};throw error}
 return {updatedTables:names.filter(name=>!excluded.has(name)).length,unresolved}
}
module.exports={mergeSnapshotRows}
