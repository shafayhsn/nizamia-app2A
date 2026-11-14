'use strict'
// Standalone local-only business records. Never mutates imported cloud snapshot
// rows and never implies these records have been synchronized.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto')
const initSqlJs=require('sql.js')
const TABLES=new Set(['orders','tasks','buyers','suppliers','purchase_orders','purchase_order_items','samples','parcels','shipments','shipment_lines','production_daily_entries','costing','pp_meetings','production_plans','jobs','order_queues','bom_items','washing','embellishments','finishing','work_orders','buyer_addresses','buyer_contacts','supplier_contacts','size_groups','size_group_colors','size_group_breakdown','order_processes','work_order_items','payment_settlements','production_batches','production_batch_orders','sample_comments','finishing_packs','fitting_blocks','library_items','sample_logs','fitting','work_order_changelog','shipping_bookings','shipping_booking_lines','shipping_booking_shipments'])
const DB_NAME='nizamia-app2a.sqlite'
const {normalizeForm,FORMS}=require('./standaloneForms.cjs')
const queues=new Map()
function validateTable(table){if(!TABLES.has(table))throw Error('Unsupported standalone record table')}
function validateFields(fields){
 if(!fields||typeof fields!=='object'||Array.isArray(fields))throw Error('Invalid record fields')
 const keys=Object.keys(fields)
 if(!keys.length||keys.length>200)throw Error('Record requires 1–200 fields')
 for(const key of keys){
  if(!/^[a-z][a-z0-9_]{0,63}$/.test(key)||['id','_local_only','_local_updated_at','_local_edited'].includes(key)||
     /password|secret|token|credential|api_key|private_key/i.test(key))throw Error('Unsupported record field')
  const value=fields[key]
  if(value!==null&&typeof value==='object'){
   const walk=(item,depth)=>{
    if(depth>8)throw Error('Nested record too deep')
    if(item===null)return
    if(Array.isArray(item)){if(item.length>1000)throw Error('Array too large');for(const entry of item)walk(entry,depth+1);return}
    if(typeof item==='object'){if(Object.keys(item).length>200)throw Error('Object too large');for(const [k,v] of Object.entries(item)){if(/password|secret|token|credential|api_key|private_key/i.test(k))throw Error('Unsupported nested field');walk(v,depth+1)}return}
    if(typeof item==='string'&&item.length<=4000)return
    if(typeof item==='number'&&Number.isFinite(item))return
    if(typeof item==='boolean')return
    throw Error('Unsupported nested record value')
   }
   walk(value,0)
  }else if(value!==null&&typeof value!=='string'&&typeof value!=='number'&&typeof value!=='boolean')throw Error('Unsupported record value')
  if(typeof value==='string'&&value.length>4000)throw Error('Record field too long')
  if(typeof value==='number'&&!Number.isFinite(value))throw Error('Invalid number')
 }
 if(Buffer.byteLength(JSON.stringify(fields),'utf8')>262144)throw Error('Record exceeds size limit')
 return fields
}
function assertFile(directory){
 if(typeof directory!=='string'||!path.isAbsolute(directory))throw Error('Absolute database directory required')
 const dir=fs.lstatSync(directory),file=path.join(directory,DB_NAME)
 if(!dir.isDirectory()||dir.isSymbolicLink())throw Error('Invalid database directory')
 const stat=fs.lstatSync(file)
 if(!stat.isFile()||stat.isSymbolicLink()||stat.size>1024*1024*1024)throw Error('Unsafe database file')
 return file
}
let engine
async function sql(){if(!engine)engine=initSqlJs({locateFile:()=>require.resolve('sql.js/dist/sql-wasm.wasm').replace('app.asar'+path.sep,'app.asar.unpacked'+path.sep)});return engine}
function schema(db){db.run("CREATE TABLE IF NOT EXISTS standalone_records (id TEXT PRIMARY KEY, table_name TEXT NOT NULL, fields_json TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL)");db.run('CREATE TABLE IF NOT EXISTS snapshot_edits (table_name TEXT NOT NULL,record_id TEXT NOT NULL,fields_json TEXT,updated_at TEXT NOT NULL,PRIMARY KEY(table_name,record_id))')}
const REFERENCE_FIELDS={purchase_order_items:['po_id','purchase_orders'],shipment_lines:['shipment_id','shipments'],work_order_items:['wo_id','work_orders'],shipping_booking_lines:['booking_id','shipping_bookings'],shipping_booking_shipments:['booking_id','shipping_bookings'],size_group_colors:['size_group_id','size_groups'],size_group_breakdown:['size_group_id','size_groups'],production_batch_orders:['batch_id','production_batches']}
function assertParentReference(db,table,fields){
 const link=REFERENCE_FIELDS[table]
 if(!link)return
 const [field,parentTable]=link,id=fields[field]
 if(id==null||id==='')return
 if(typeof id!=='string'||!id.startsWith('local-'))return
 if(!read(db,parentTable).some(row=>row.id===id))throw Error('Linked standalone '+parentTable+' record does not exist')
}
function assertOrderReference(db,table,fields){
 if(!['production_daily_entries','purchase_orders','samples','shipments','costing','pp_meetings','production_plans'].includes(table)||!fields.order_id)return
 const id=String(fields.order_id).trim()
 if(!id)throw Error('Order reference is required')
 if(!id.startsWith('local-'))return // Imported order references are read-only and may use non-UUID identifiers.
 const orders=read(db,'orders')
 if(!orders.some(row=>row.id===id))throw Error('Linked standalone order does not exist')
}
function assertNoChildren(db,table,id){
 const dependent=Object.entries(REFERENCE_FIELDS).filter(([,value])=>value[1]===table)
 for(const [child,[field]] of dependent){
  if(read(db,child).some(row=>String(row[field]||'')===id))throw Error('Cannot delete '+table+': linked '+child+' records exist')
 }
}
function read(db,table){
 validateTable(table)
 if(!db.exec("SELECT 1 FROM sqlite_master WHERE type='table' AND name='standalone_records'").length)return []
 const stmt=db.prepare('SELECT id,fields_json,updated_at FROM standalone_records WHERE table_name=? ORDER BY created_at DESC')
 const rows=[]
 try{stmt.bind([table]);while(stmt.step()){const [id,json,updatedAt]=stmt.get();rows.push({id,...JSON.parse(json),_local_only:true,_local_updated_at:updatedAt})}}finally{stmt.free()}
 return rows
}
async function listCombinedRecords(directory,table){
 const file=assertFile(directory),SQL=await sql(),db=new SQL.Database(fs.readFileSync(file))
 try{
  if(db.exec('PRAGMA integrity_check')[0]?.values?.[0]?.[0]!=='ok')throw Error('Database integrity failure')
  const local=TABLES.has(table)?read(db,table):[]
  // Imported Supabase business rows are available to the original UI, but
  // remain immutable. Standalone records are stored in a separate table.
  const snapshot=[]
  if(!/^[a-z][a-z0-9_]{0,63}$/.test(table)||/^(users|permissions|roles|app_database_sync_status|notification_reads|app_task_reads)$/.test(table))throw Error('Unsupported offline business table')
  if(db.exec("SELECT 1 FROM sqlite_master WHERE type='table' AND name='snapshot_rows'").length){
    const stmt=db.prepare('SELECT row_json FROM snapshot_rows WHERE table_name=? ORDER BY row_index')
    try{
      stmt.bind([table])
      while(stmt.step()){
        const row=JSON.parse(stmt.get()[0])
        if(row&&typeof row==='object'&&!Array.isArray(row))snapshot.push({...row,_local_only:false})
      }
    }finally{stmt.free()}
  }
  const edits=new Map()
  if(db.exec("SELECT 1 FROM sqlite_master WHERE type='table' AND name='snapshot_edits'").length){const stmt=db.prepare('SELECT record_id,fields_json FROM snapshot_edits WHERE table_name=?');try{stmt.bind([table]);while(stmt.step()){const [id,json]=stmt.get();edits.set(String(id),json===null?null:JSON.parse(json))}}finally{stmt.free()}}
  return [...local,...snapshot.filter(row=>!edits.has(String(row.id))||edits.get(String(row.id))!==null).map(row=>edits.has(String(row.id))?{...row,...edits.get(String(row.id)),_local_only:false,_local_edited:true}:row)]
}finally{db.close()}
}
function serialize(directory,task){
 const key=path.resolve(directory),prior=queues.get(key)||Promise.resolve()
 const next=prior.catch(()=>{}).then(task),settled=next.catch(()=>{})
 queues.set(key,settled)
 settled.finally(()=>{if(queues.get(key)===settled)queues.delete(key)})
 return next
}
async function mutateLocalRecord(directory,{action,table,id,fields}){
 return serialize(directory,async()=>{
  validateTable(table)
  if(!['create','update','delete'].includes(action))throw Error('Unsupported local record operation')
  if(action!=='delete'){
   // Imported rows use the original Supabase schema, not the simplified starter forms.
   // Preserve those fields and validate them without requiring unrelated form inputs.
   if(action==='update'&&typeof id==='string'&&!id.startsWith('local-'))validateFields(fields)
   else {fields=FORMS[table]?normalizeForm(table,fields):validateFields(fields);validateFields(fields)}
  }
  if(action!=='create'&&(typeof id!=='string'||id.length>256||!id))throw Error('Valid record ID required')
  const file=assertFile(directory),original=crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex')
  const SQL=await sql(),db=new SQL.Database(fs.readFileSync(file))
  try{
   if(db.exec('PRAGMA integrity_check')[0]?.values?.[0]?.[0]!=='ok')throw Error('Database integrity failure')
   schema(db)
   if(action!=='delete'){assertOrderReference(db,table,fields);assertParentReference(db,table,fields)}
   const stamp=new Date().toISOString()
   if(action!=='create'&&!id.startsWith('local-')){
    if(!db.exec("SELECT 1 FROM sqlite_master WHERE type='table' AND name='snapshot_rows'").length)throw Error('Imported snapshot unavailable')
    const stmt=db.prepare('SELECT row_json FROM snapshot_rows WHERE table_name=?')
    let imported=null
    try{stmt.bind([table]);while(stmt.step()){const row=JSON.parse(stmt.get()[0]);if(String(row.id)===id){imported=row;break}}}finally{stmt.free()}
    if(!imported)throw Error('Imported record not found')
    const prior=db.exec('SELECT fields_json FROM snapshot_edits WHERE table_name=? AND record_id=?',[table,id])
    if(prior.length&&prior[0].values[0][0]===null)throw Error('Imported record already deleted')
    const previous=prior.length&&prior[0].values[0][0]?JSON.parse(prior[0].values[0][0]):imported
    db.run('INSERT OR REPLACE INTO snapshot_edits (table_name,record_id,fields_json,updated_at) VALUES (?,?,?,?)',[table,id,action==='delete'?null:JSON.stringify({...previous,...fields,id}),stamp])
   }else if(action==='create'){
    id='local-'+crypto.randomUUID()
    db.run('INSERT INTO standalone_records VALUES (?,?,?,?,?)',[id,table,JSON.stringify(fields),stamp,stamp])
   }else{
    const existing=db.exec('SELECT 1 FROM standalone_records WHERE id=? AND table_name=?',[id,table])
    if(!existing.length)throw Error('Standalone record not found')
    if(action==='delete'){
     assertNoChildren(db,table,id)
     if(table==='orders'){
      const linked=['production_daily_entries','purchase_orders','samples','shipments','costing','pp_meetings','production_plans','order_queues','bom_items','washing','embellishments','finishing','size_groups','order_processes','work_orders','production_batch_orders']
      const dependencies=linked.flatMap(name=>read(db,name).filter(row=>String(row.order_id||'')===id).map(row=>name+': '+row.id))
      if(dependencies.length)throw Error('Cannot delete order: '+dependencies.length+' linked production, purchasing, sampling or shipping record(s) exist')
     }
     db.run('DELETE FROM standalone_records WHERE id=? AND table_name=?',[id,table])
    }
    else db.run('UPDATE standalone_records SET fields_json=?,updated_at=? WHERE id=? AND table_name=?',[JSON.stringify(fields),stamp,id,table])
   }
   if(crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex')!==original)throw Error('Database changed during edit')
   const temp=file+'.'+crypto.randomUUID()+'.tmp'
   try{fs.writeFileSync(temp,Buffer.from(db.export()),{flag:'wx',mode:0o600});fs.renameSync(temp,file)}finally{try{fs.unlinkSync(temp)}catch(e){if(e.code!=='ENOENT')throw e}}
   return {id,table,action,localOnly:true}
  }finally{db.close()}
 })
}

async function createLocalRecordBatch(directory,{table,rows}){
 return serialize(directory,async()=>{
  validateTable(table)
  if(!Array.isArray(rows)||rows.length<1||rows.length>500)throw Error('Batch requires 1–500 records')
  const normalized=rows.map(fields=>{const result=FORMS[table]?normalizeForm(table,fields):validateFields(fields);validateFields(result);return result})
  const file=assertFile(directory),original=crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex')
  const SQL=await sql(),db=new SQL.Database(fs.readFileSync(file))
  try{
   if(db.exec('PRAGMA integrity_check')[0]?.values?.[0]?.[0]!=='ok')throw Error('Database integrity failure')
   schema(db)
   const stamp=new Date().toISOString(),created=[]
   db.run('BEGIN TRANSACTION')
   try{
    for(const fields of normalized){
     assertOrderReference(db,table,fields);assertParentReference(db,table,fields)
     const id='local-'+crypto.randomUUID()
     db.run('INSERT INTO standalone_records VALUES (?,?,?,?,?)',[id,table,JSON.stringify(fields),stamp,stamp])
     created.push({id,table,action:'create',localOnly:true})
    }
    db.run('COMMIT')
   }catch(error){db.run('ROLLBACK');throw error}
   if(crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex')!==original)throw Error('Database changed during batch edit')
   const temp=file+'.'+crypto.randomUUID()+'.tmp'
   try{fs.writeFileSync(temp,Buffer.from(db.export()),{flag:'wx',mode:0o600});fs.renameSync(temp,file)}finally{try{fs.unlinkSync(temp)}catch(e){if(e.code!=='ENOENT')throw e}}
   return created
  }finally{db.close()}
 })
}

async function mutateLocalRecordBatch(directory,{action,table,ids,fields}){
 return serialize(directory,async()=>{
  validateTable(table)
  if(!['update','delete'].includes(action))throw Error('Unsupported batch action')
  if(!Array.isArray(ids)||ids.length<1||ids.length>500||new Set(ids).size!==ids.length||ids.some(id=>typeof id!=='string'||!id||id.length>256))throw Error('Batch requires 1–500 unique record IDs')
  if(action==='update')validateFields(fields)
  const file=assertFile(directory),before=fs.readFileSync(file),original=crypto.createHash('sha256').update(before).digest('hex')
  const SQL=await sql(),db=new SQL.Database(before)
  try{
   if(db.exec('PRAGMA integrity_check')[0]?.values?.[0]?.[0]!=='ok')throw Error('Database integrity failure')
   schema(db)
   const stamp=new Date().toISOString(),results=[]
   db.run('BEGIN TRANSACTION')
   try{
    const imported=new Map()
    if(db.exec("SELECT 1 FROM sqlite_master WHERE type='table' AND name='snapshot_rows'").length){
     const stmt=db.prepare('SELECT row_json FROM snapshot_rows WHERE table_name=?')
     try{stmt.bind([table]);while(stmt.step()){const row=JSON.parse(stmt.get()[0]);imported.set(String(row.id),row)}}finally{stmt.free()}
    }
    for(const id of ids){
     if(id.startsWith('local-')){
      const existing=read(db,table).find(row=>row.id===id)
      if(!existing)throw Error('Standalone batch record not found: '+id)
      if(action==='delete'){
       assertNoChildren(db,table,id)
       if(table==='orders'){
        const linked=['production_daily_entries','purchase_orders','samples','shipments','costing','pp_meetings','production_plans','order_queues','bom_items','washing','embellishments','finishing','size_groups','order_processes','work_orders','production_batch_orders']
        if(linked.some(name=>read(db,name).some(row=>String(row.order_id||'')===id)))throw Error('Cannot delete order with linked records')
       }
       db.run('DELETE FROM standalone_records WHERE id=? AND table_name=?',[id,table])
      }else{
       const next={...existing,...fields}
       for(const key of ['id','_local_only','_local_updated_at','_local_edited'])delete next[key]
       validateFields(next);assertOrderReference(db,table,next);assertParentReference(db,table,next)
       db.run('UPDATE standalone_records SET fields_json=?,updated_at=? WHERE id=? AND table_name=?',[JSON.stringify(next),stamp,id,table])
      }
     }else{
      const source=imported.get(id)
      if(!source)throw Error('Imported batch record not found: '+id)
      const prior=db.exec('SELECT fields_json FROM snapshot_edits WHERE table_name=? AND record_id=?',[table,id])
      if(prior.length&&prior[0].values[0][0]===null)throw Error('Imported batch record already deleted: '+id)
      const previous=prior.length&&prior[0].values[0][0]?JSON.parse(prior[0].values[0][0]):source
      const next=action==='delete'?null:{...previous,...fields,id}
      if(next){const clean={...next};delete clean.id;validateFields(clean);assertOrderReference(db,table,clean);assertParentReference(db,table,clean)}
      db.run('INSERT OR REPLACE INTO snapshot_edits (table_name,record_id,fields_json,updated_at) VALUES (?,?,?,?)',[table,id,next===null?null:JSON.stringify(next),stamp])
     }
     results.push({id,table,action,localOnly:id.startsWith('local-')})
    }
    db.run('COMMIT')
   }catch(error){db.run('ROLLBACK');throw error}
   if(crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex')!==original)throw Error('Database changed during batch edit')
   const temp=file+'.'+crypto.randomUUID()+'.tmp'
   try{fs.writeFileSync(temp,Buffer.from(db.export()),{flag:'wx',mode:0o600});fs.renameSync(temp,file)}finally{try{fs.unlinkSync(temp)}catch(e){if(e.code!=='ENOENT')throw e}}
   return results
  }finally{db.close()}
 })
}


async function upsertLocalRecordBatch(directory,{table,rows,onConflict}){
 return serialize(directory,async()=>{
  validateTable(table)
  if(!Array.isArray(rows)||rows.length<1||rows.length>500)throw Error('Upsert requires 1–500 records')
  const keys=String(onConflict||'id').split(',').map(k=>k.trim())
  if(!keys.length||keys.some(k=>!/^[a-z][a-z0-9_]{0,63}$/.test(k)))throw Error('Invalid conflict columns')
  if(rows.some(row=>!row||typeof row!=='object'||Array.isArray(row)))throw Error('Invalid upsert row')
  const file=assertFile(directory),before=fs.readFileSync(file),original=crypto.createHash('sha256').update(before).digest('hex')
  const SQL=await sql(),db=new SQL.Database(before)
  try{
   if(db.exec('PRAGMA integrity_check')[0]?.values?.[0]?.[0]!=='ok')throw Error('Database integrity failure')
   schema(db)
   const stamp=new Date().toISOString(),result=[]
   db.run('BEGIN TRANSACTION')
   try{
    const imported=[]
    if(db.exec("SELECT 1 FROM sqlite_master WHERE type='table' AND name='snapshot_rows'").length){
     const stmt=db.prepare('SELECT row_json FROM snapshot_rows WHERE table_name=?')
     try{stmt.bind([table]);while(stmt.step())imported.push(JSON.parse(stmt.get()[0]))}finally{stmt.free()}
    }
    const edits=new Map(),stmt=db.prepare('SELECT record_id,fields_json FROM snapshot_edits WHERE table_name=?')
    try{stmt.bind([table]);while(stmt.step()){const [id,json]=stmt.get();edits.set(String(id),json===null?null:JSON.parse(json))}}finally{stmt.free()}
    const available=()=>[...read(db,table),...imported.filter(row=>!edits.has(String(row.id))||edits.get(String(row.id))!==null).map(row=>edits.has(String(row.id))?{...row,...edits.get(String(row.id))}:row)]
    for(const raw of rows){
     const fields={...raw}
     for(const key of ['_local_only','_local_updated_at','_local_edited'])delete fields[key]
     const id=fields.id
     delete fields.id
     validateFields(fields)
     const matches=keys.every(key=>raw[key]!==undefined&&raw[key]!==null)?available().filter(row=>keys.every(key=>row[key]!==undefined&&row[key]!==null&&String(row[key])===String(raw[key]))):[]
     if(matches.length>1)throw Error('Ambiguous upsert conflict')
     if(id!==undefined&&keys.includes('id')&&!matches.length)throw Error('Upsert ID not found; cannot create arbitrary offline record ID')
     const found=matches[0]
     if(found){
      if(id!==undefined&&String(id)!==String(found.id))throw Error('Upsert ID conflict')
      const next={...found,...fields}
      for(const key of ['id','_local_only','_local_updated_at','_local_edited'])delete next[key]
      validateFields(next);assertOrderReference(db,table,next);assertParentReference(db,table,next)
      if(String(found.id).startsWith('local-'))db.run('UPDATE standalone_records SET fields_json=?,updated_at=? WHERE id=? AND table_name=?',[JSON.stringify(next),stamp,found.id,table])
      else db.run('INSERT OR REPLACE INTO snapshot_edits (table_name,record_id,fields_json,updated_at) VALUES (?,?,?,?)',[table,found.id,JSON.stringify({...next,id:found.id}),stamp])
      result.push({id:found.id,table,action:'update'})
     }else{
      if(id!==undefined)throw Error('Cannot create arbitrary offline record ID')
      const normalized=FORMS[table]?normalizeForm(table,fields):fields
      validateFields(normalized);assertOrderReference(db,table,normalized);assertParentReference(db,table,normalized)
      const newId='local-'+crypto.randomUUID()
      db.run('INSERT INTO standalone_records VALUES (?,?,?,?,?)',[newId,table,JSON.stringify(normalized),stamp,stamp])
      result.push({id:newId,table,action:'create'})
     }
    }
    db.run('COMMIT')
   }catch(error){db.run('ROLLBACK');throw error}
   if(crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex')!==original)throw Error('Database changed during upsert')
   const temp=file+'.'+crypto.randomUUID()+'.tmp'
   try{fs.writeFileSync(temp,Buffer.from(db.export()),{flag:'wx',mode:0o600});fs.renameSync(temp,file)}finally{try{fs.unlinkSync(temp)}catch(e){if(e.code!=='ENOENT')throw e}}
   return result
  }finally{db.close()}
 })
}

async function listLocalRecords(directory,table){
 const file=assertFile(directory),SQL=await sql(),db=new SQL.Database(fs.readFileSync(file))
 try{if(db.exec('PRAGMA integrity_check')[0]?.values?.[0]?.[0]!=='ok')throw Error('Database integrity failure');return read(db,table)}finally{db.close()}
}
module.exports={TABLES,validateFields,listLocalRecords,listCombinedRecords,mutateLocalRecord,createLocalRecordBatch,mutateLocalRecordBatch,upsertLocalRecordBatch,readLocalRows:read}
