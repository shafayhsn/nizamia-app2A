'use strict'
// Standalone local-only business records. Never mutates imported cloud snapshot
// rows and never implies these records have been synchronized.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto')
const initSqlJs=require('sql.js')
const TABLES=new Set(['orders','tasks','buyers','suppliers','purchase_orders','purchase_order_items','samples','parcels','shipments','shipment_lines','production_daily_entries','costing','pp_meetings','production_plans','jobs','order_queues','bom_items','washing','embellishments','finishing','work_orders','buyer_addresses','buyer_contacts','supplier_contacts','size_groups','size_group_colors','size_group_breakdown','order_processes','work_order_items','payment_settlements','production_batches','production_batch_orders','sample_comments','finishing_packs','fitting_blocks','library_items','sample_logs','fitting','work_order_changelog','shipping_bookings','shipping_booking_lines','shipping_booking_shipments','parcel_invoice_snapshots','testing_requirements','testing_orders','feature_assets','feature_certificates','parcel_status_history'])
const DB_NAME='nizamia-app2a.sqlite'
const {normalizeForm,FORMS}=require('./standaloneForms.cjs')
const queues=new Map()
const {createMutationIntent,updateMutationIntent}=require('./offlineMutationPlan.cjs')
const {stageMutation,assertUnqueued,pendingMutations,recordMutationOutcome}=require('./offlineMutationOutbox.cjs')
const {isShipmentStatusChange}=require('./shipmentStatusMutation.cjs')
const {isOrderDetailsPatch}=require('./orderDetailsMutation.cjs')
const cloudId=/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i
function queueProductionCreate(db,ownerId,table,id,fields,stamp){
 if(ownerId&&table==='production_daily_entries'&&[fields.order_id,fields.size_group_id,fields.color_id].every(id=>cloudId.test(id||'')))
  stageMutation(db,ownerId,createMutationIntent(table,id,fields,stamp,stamp))
}

function queueOrderStatus(db,ownerId,table,id,base,fields,stamp){
 if(ownerId&&table==='orders'&&cloudId.test(id)&&Object.keys(fields).join()==='status'&&
    ['Draft','Active','Booked','Shipped','Cancelled'].includes(fields.status)&&Object.hasOwn(base,'status')&&base.status!==fields.status)
  stageMutation(db,ownerId,updateMutationIntent(table,id,{status:fields.status},{status:base.status},stamp))
}
function queueOrderDetails(db,ownerId,table,id,base,previous,fields,stamp){
 if(table!=='orders'||!cloudId.test(id)||!isOrderDetailsPatch(fields))return
 if(!ownerId)throw Error('Administrator access is required to synchronize these order changes.')
 const changed=Object.keys(fields).filter(key=>fields[key]!==previous[key])
 if(!changed.length||Object.keys(fields).join()==='status'&&fields.status!==null)return
 if(changed.some(key=>!Object.hasOwn(base,key)||base[key]!==previous[key]))
  throw Error('Refresh this order or review its earlier local edits before saving.')
 const values=source=>Object.fromEntries(changed.map(key=>[key,source[key]]))
 if(!stageMutation(db,ownerId,updateMutationIntent(table,id,values(fields),values(base),stamp)))
  throw Error('This order already has a queued change.')
}
function queueShipmentStatus(db,ownerId,table,id,base,previous,fields,stamp){
 if(ownerId&&table==='shipments'&&cloudId.test(id)&&Object.keys(fields).join()==='notes'&&
    base.notes===previous.notes&&isShipmentStatusChange(base.notes,fields.notes))
  stageMutation(db,ownerId,updateMutationIntent(table,id,{notes:fields.notes},{notes:base.notes},stamp))
}
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
async function mutateLocalRecord(directory,{action,table,id,fields,ownerId,sampleStage=false}){
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
   if(action!=='create')assertUnqueued(db,table,id)
   if(action!=='create'&&!id.startsWith('local-')){
    if(!db.exec("SELECT 1 FROM sqlite_master WHERE type='table' AND name='snapshot_rows'").length)throw Error('Imported snapshot unavailable')
    const stmt=db.prepare('SELECT row_json FROM snapshot_rows WHERE table_name=?')
    let imported=null
    try{stmt.bind([table]);while(stmt.step()){const row=JSON.parse(stmt.get()[0]);if(String(row.id)===id){imported=row;break}}}finally{stmt.free()}
    if(!imported)throw Error('Imported record not found')
    const prior=db.exec('SELECT fields_json FROM snapshot_edits WHERE table_name=? AND record_id=?',[table,id])
    if(prior.length&&prior[0].values[0][0]===null)throw Error('Imported record already deleted')
    const previous=prior.length&&prior[0].values[0][0]?JSON.parse(prior[0].values[0][0]):imported
    if(action==='update'){
     queueOrderDetails(db,ownerId,table,id,imported,previous,fields,stamp)
     queueOrderStatus(db,ownerId,table,id,imported,fields,stamp)
     queueShipmentStatus(db,ownerId,table,id,imported,previous,fields,stamp)
     if(ownerId&&table==='purchase_orders'&&cloudId.test(id)&&Object.keys(fields).join()==='status'&&
        ['draft','approved'].includes(fields.status)&&Object.hasOwn(imported,'status')){
      if(previous.status!==imported.status)throw Error('This purchase order has a prior local status edit awaiting review.')
      if(imported.status!==fields.status&&!stageMutation(db,ownerId,
        updateMutationIntent(table,id,{status:fields.status},{status:imported.status},stamp)))
       throw Error('Purchase order already has a queued change.')
     }
    }
    if(sampleStage){
     if(!ownerId||action!=='update'||table!=='samples'||!cloudId.test(id)||
        Object.keys(fields).join()!=='stage'||!['Not Started','Pattern','Cutting','Stitching','Washing','Finishing','Ready'].includes(fields.stage)||
        !Object.hasOwn(imported,'stage'))throw Error('A synchronized sample and a valid stage are required')
     if(previous.stage!==imported.stage)throw Error('This sample has a prior local stage edit awaiting review.')
     if(imported.stage!==fields.stage)stageMutation(db,ownerId,updateMutationIntent(table,id,{stage:fields.stage},{stage:imported.stage},stamp))
    }

    db.run('INSERT OR REPLACE INTO snapshot_edits (table_name,record_id,fields_json,updated_at) VALUES (?,?,?,?)',[table,id,action==='delete'?null:JSON.stringify({...previous,...fields,id}),stamp])
   }else if(action==='create'){
    id='local-'+crypto.randomUUID()
    db.run('INSERT INTO standalone_records VALUES (?,?,?,?,?)',[id,table,JSON.stringify(fields),stamp,stamp])
    queueProductionCreate(db,ownerId,table,id,fields,stamp)
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

async function createLocalRecordBatch(directory,{table,rows,ownerId}){
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
    queueProductionCreate(db,ownerId,table,id,fields,stamp)
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

async function mutateLocalRecordBatch(directory,{action,table,ids,fields,ownerId}){
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
     assertUnqueued(db,table,id)
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
      if(action==='update'){
       queueOrderDetails(db,ownerId,table,id,source,previous,fields,stamp)
       queueOrderStatus(db,ownerId,table,id,source,fields,stamp)
       queueShipmentStatus(db,ownerId,table,id,source,previous,fields,stamp)
      }
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
  const completeKeys=rows.filter(row=>keys.every(key=>row[key]!==undefined&&row[key]!==null)).map(row=>JSON.stringify(keys.map(key=>String(row[key]))))
  if(new Set(completeKeys).size!==completeKeys.length)throw Error('Duplicate upsert conflict keys in batch')
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
      assertUnqueued(db,table,found.id)
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
async function submitPendingMutations(directory,{ownerId,submit,isCurrent}){
 const SQL=await sql()
 const file=assertFile(directory)
 let db=new SQL.Database(fs.readFileSync(file))
 let operations
 try{operations=pendingMutations(db,ownerId)}finally{db.close()}
 let size=32
 operations=operations.map(({operationId,intent})=>({
  operationId,intent:{
   operation:intent.operation,table:intent.table,id:intent.id,
   fields:intent.fields,changes:intent.changes,expected:intent.expected,
   ...(intent.document?{document:{lines:intent.document.lines,...(intent.operation==='update'?{lineIds:intent.document.localLines.map(line=>line.id.slice(6))}:{})}}:{})
  }
 })).filter(item=>{
  const bytes=Buffer.byteLength(JSON.stringify(item))+1
  if(size+bytes>128*1024)return false
  size+=bytes
  return true
 })
 if(!operations.length||!isCurrent())return {archived:0,conflicts:0,retained:0}
 const results=await submit(operations)
 const expected=new Set(operations.map(item=>item.operationId))
 if(!Array.isArray(results)||results.length!==expected.size||
    results.some(item=>!expected.delete(item?.operationId)||(item.resourceId!=null&&!/^[a-z0-9_-]{1,128}$/i.test(item.resourceId))||
      !['applied','already-applied','conflict','retry','invalid','unauthorized','unsupported'].includes(item.outcome)))
  throw Error('Invalid desktop mutation acknowledgement')

 return serialize(directory,async()=>{
  if(!isCurrent())return {archived:0,conflicts:0,retained:operations.length}
  const current=assertFile(directory),before=fs.readFileSync(current)
  db=new SQL.Database(Buffer.from(before))
  const summary={archived:0,conflicts:0,retained:0}
  try{
   for(const {operationId,outcome,resourceId} of results){
    if(!recordMutationOutcome(db,ownerId,operationId,outcome,resourceId))continue
    if(['applied','already-applied'].includes(outcome))summary.archived++
    else if(outcome==='retry')summary.retained++
    else summary.conflicts++
   }
   const temp=current+'.'+crypto.randomUUID()+'.tmp'
   try{
    fs.writeFileSync(temp,Buffer.from(db.export()),{flag:'wx',mode:0o600})
    if(!fs.readFileSync(current).equals(before))throw Error('Database changed during upload acknowledgement')
    fs.renameSync(temp,current)
   }finally{fs.rmSync(temp,{force:true})}
   return summary
  }finally{db.close()}
 })
}

async function reviewSavedChanges(directory,{ownerId,approval,isCurrent=()=>true}={}){
 const SQL=await sql()
 return serialize(directory,async()=>{
  const file=assertFile(directory),before=fs.readFileSync(file)
  const db=new SQL.Database(Buffer.from(before))
  try{
   if(db.exec('PRAGMA integrity_check')[0]?.values?.[0]?.[0]!=='ok')throw Error('Database integrity failure')
   const {reviewLegacyMutations}=require('./legacyMutationReview.cjs')
   const plan=reviewLegacyMutations(db)
   const summary={approval:plan.approval,operations:plan.staged.length,linked:plan.linked,skipped:plan.skipped.length}
   if(!approval)return summary
   if(!ownerId||!isCurrent())throw Error('Administrator session required')
   if(approval!==plan.approval)throw Error('Local changes have changed. Open the review again.')
   if(!plan.staged.length)return summary
   for(const intent of plan.staged){
    if(!stageMutation(db,ownerId,intent))throw Error('A record is already queued. Open the review again.')
    if(intent.table==='shipments'){
     db.run("UPDATE snapshot_edits SET fields_json=json_set(fields_json,'$.notes',?) WHERE table_name=? AND record_id=?",
      [intent.changes.notes,intent.table,intent.id])
    }
   }
   const temp=file+'.'+crypto.randomUUID()+'.tmp'
   try{
    fs.writeFileSync(temp,Buffer.from(db.export()),{flag:'wx',mode:0o600})
    if(!isCurrent()||!fs.readFileSync(file).equals(before))throw Error('Database or session changed during staging')
    fs.renameSync(temp,file)
   }finally{fs.rmSync(temp,{force:true})}
   return summary
  }finally{db.close()}
 })
}

async function queueParcelTransition(directory,{id,status,deliveryDate,receivedBy,ownerId,isCurrent}){
 if(!ownerId||typeof id!=='string'||id.startsWith('local-')||!/^[a-z0-9_-]{1,128}$/i.test(id)||
    !['Dispatched','Delivered'].includes(status))throw Error('A synchronized parcel is required.')
 return serialize(directory,async()=>{
  if(!isCurrent())throw Error('Administrator session required.')
  const file=assertFile(directory),SQL=await sql(),before=fs.readFileSync(file)
  const db=new SQL.Database(Buffer.from(before))
  try{
   schema(db)
   const getBase=(table,id)=>{
    const rows=db.exec("SELECT row_json FROM snapshot_rows WHERE table_name=? AND json_extract(row_json,'$.id')=?",[table,id])[0]?.values||[]
    if(rows.length!==1)throw Error('A linked record is missing from the cloud snapshot.')
    return JSON.parse(rows[0][0])
   }
   const getRecord=(table,id)=>{
    assertUnqueued(db,table,id)
    const row=getBase(table,id)
    const saved=db.exec('SELECT fields_json FROM snapshot_edits WHERE table_name=? AND record_id=?',[table,id])[0]?.values?.[0]
    if(saved?.[0]===null)throw Error('A linked record was deleted locally.')
    return {row,local:saved?JSON.parse(saved[0]):row}
   }
   const {row,local}=getRecord('parcels',id)
   const sameCloudFields=['status','dispatch_date','courier','tracking_no','updated_at'].every(field=>local[field]===row[field])
   if(!sameCloudFields||JSON.stringify(local.items)!==JSON.stringify(row.items)||
      !Object.hasOwn(row,'updated_at')||!Array.isArray(row.items)||row.items.length>500||
      ['Delivered','Cancelled'].includes(row.status)||row.status===status)
    throw Error('This parcel has changes awaiting review.')
   const stamp=new Date().toISOString()
   const changes={status}
   const overlay={...local,status}
   if(status==='Dispatched'){
    if(row.status!=='Draft'||!row.courier?.trim()||!row.tracking_no?.trim()||!row.dispatch_date)
     throw Error('Courier, tracking number and dispatch date are required.')
    overlay.dispatched_at=stamp
   }else{
    const today=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Karachi',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date())
    if(row.status==='Draft'||typeof deliveryDate!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(deliveryDate)||
       !Number.isFinite(Date.parse(deliveryDate))||new Date(deliveryDate).toISOString().slice(0,10)!==deliveryDate||
       deliveryDate>today||(row.dispatch_date&&deliveryDate<row.dispatch_date)||
       (receivedBy!=null&&(typeof receivedBy!=='string'||receivedBy.length>200)))
     throw Error('Enter a valid delivery date and recipient.')
    changes.delivery_date=deliveryDate
    changes.received_by=receivedBy?.trim()||null
    overlay.delivered_at=deliveryDate+'T12:00:00Z'
    overlay.received_by=changes.received_by
   }
   const writeOverlay=(table,id,record)=>db.run(
    'INSERT OR REPLACE INTO snapshot_edits (table_name,record_id,fields_json,updated_at) VALUES (?,?,?,?)',
    [table,id,JSON.stringify(record),stamp])
   for(const sampleId of new Set(row.items.map(item=>item.sampleId))){
    if(!cloudId.test(sampleId||''))throw Error('This parcel contains an unsynchronized sample.')
    const sample=getRecord('samples',sampleId)
    if(sample.local.dispatch_status!==sample.row.dispatch_status||
       (status==='Dispatched'&&sample.local.dispatch_status==='Delivered'))
     throw Error('A linked sample has a newer dispatch status.')
    writeOverlay('samples',sampleId,{...sample.local,dispatch_status:status})
   }
   const intent=updateMutationIntent('parcels',id,changes,{status:row.status,updated_at:row.updated_at},stamp)
   if(!stageMutation(db,ownerId,intent))throw Error('Parcel already has a queued change.')
   writeOverlay('parcels',id,overlay)
   const temp=file+'.'+crypto.randomUUID()+'.tmp'
   try{
    fs.writeFileSync(temp,Buffer.from(db.export()),{flag:'wx',mode:0o600})
    if(!isCurrent()||!fs.readFileSync(file).equals(before))throw Error('Database or sign-in changed during parcel save')
    fs.renameSync(temp,file)
   }finally{fs.rmSync(temp,{force:true})}
   return overlay
  }finally{db.close()}
 })
}

async function queuePurchasingDocument(directory,{table,fields,lines,ownerId,isCurrent,documentId}){
 if(!ownerId||!['purchase_orders','work_orders'].includes(table)||
    !Array.isArray(lines)||!lines.length||lines.length>200)throw Error('Supplier and valid document lines are required.')
 const purchase=table==='purchase_orders'
 const childTable=purchase?'purchase_order_items':'work_order_items'
 const parentField=purchase?'po_id':'wo_id'
 const numberField=purchase?'po_number':'wo_number'
 const nameField=purchase?'description':'process_name'
 const vendor=fields?.[purchase?'supplier_id':'vendor_id']
 if(!cloudId.test(vendor||'')||fields.order_id&&!cloudId.test(fields.order_id)||
    (!documentId&&fields.status!=='Draft')||lines.some(line=>typeof line?.[nameField]!=='string'||!line[nameField].trim()))
  throw Error('Use a synchronized supplier, order and valid line descriptions.')
 const header={...fields}
 delete header[numberField]
 for(const field of ['order_id','delivery_date','po_date','issue_date','start_date','complete_by'])
  if(header[field]==='')header[field]=null
 validateFields(header)
 lines.forEach(validateFields)
 return serialize(directory,async()=>{
  if(!isCurrent())throw Error('Administrator session required.')
  const file=assertFile(directory),SQL=await sql(),before=fs.readFileSync(file)
  const db=new SQL.Database(Buffer.from(before))
  try{
   schema(db)
   const stamp=new Date().toISOString(),id='local-'+crypto.randomUUID()
   let expected
   if(documentId){
    if(!cloudId.test(documentId))throw Error('Wait for this document to synchronize before editing it.')
    assertUnqueued(db,table,documentId)
    const base=db.exec("SELECT row_json FROM snapshot_rows WHERE table_name=? AND json_extract(row_json,'$.id')=?",
     [table,documentId])[0]?.values?.[0]?.[0]
    if(!base)throw Error('Synchronized document required.')
    const current=JSON.parse(base)
    const children=db.exec("SELECT row_json FROM snapshot_rows WHERE table_name=? AND json_extract(row_json,?)=?",
     [childTable,'$.'+parentField,documentId])[0]?.values?.map(([json])=>JSON.parse(json))||[]
    for(const [name,key] of [[table,documentId],...children.map(line=>[childTable,line.id])]){
     assertUnqueued(db,name,key)
     if(db.exec('SELECT 1 FROM snapshot_edits WHERE table_name=? AND record_id=?',[name,key]).length)
      throw Error('This document has a saved local edit awaiting review.')
    }
    if(!current.updated_at)throw Error('Refresh this document before editing.')
    expected={updated_at:current.updated_at,header:Object.fromEntries(Object.keys(header).map(key=>[key,current[key]??null])),lines:children}
    for(const line of children)db.run('INSERT INTO snapshot_edits VALUES (?,?,?,?)',[childTable,line.id,null,stamp])
    db.run('INSERT INTO snapshot_edits VALUES (?,?,?,?)',[table,documentId,JSON.stringify({...current,...header}),stamp])
   }
   const localHeader={...header,[numberField]:'OFFLINE-'+id.slice(6)}
   if(!documentId)db.run('INSERT INTO standalone_records VALUES (?,?,?,?,?)',[id,table,JSON.stringify(localHeader),stamp,stamp])
   const localLines=lines.map(line=>{
    const lineId='local-'+crypto.randomUUID()
    db.run('INSERT INTO standalone_records VALUES (?,?,?,?,?)',
     [lineId,childTable,JSON.stringify({...line,[parentField]:documentId||id}),stamp,stamp])
    return {id:lineId,table:childTable,parentField}
   })
   const intent=documentId
    ?updateMutationIntent(table,documentId,header,expected,stamp,null,{lines,localLines})
    :createMutationIntent(table,id,header,stamp,stamp,{lines,localLines})
   if(Buffer.byteLength(JSON.stringify(intent))>120000)throw Error('Document too large for offline sync.')
   if(!stageMutation(db,ownerId,intent))
    throw Error('Could not queue purchasing document.')
   const temp=file+'.'+crypto.randomUUID()+'.tmp'
   try{
    fs.writeFileSync(temp,Buffer.from(db.export()),{flag:'wx',mode:0o600})
    if(!isCurrent()||!fs.readFileSync(file).equals(before))throw Error('Database or sign-in changed during purchasing save')
    fs.renameSync(temp,file)
   }finally{fs.rmSync(temp,{force:true})}
   return {id,...localHeader}
  }finally{db.close()}
 })
}

async function queueParcelCreate(directory,{items,customItems,addressId,contactId,ownerId,isCurrent}){
 if(!ownerId||!cloudId.test(addressId||'')||contactId&&!cloudId.test(contactId)||
    !Array.isArray(items)||!Array.isArray(customItems)||items.length+customItems.length<1||items.length+customItems.length>500||
    items.some(item=>!cloudId.test(item?.sampleId||''))||
    new Set(items.map(item=>item.sampleId)).size!==items.length)
  throw Error('Select a synchronized address and valid parcel items.')
 validateFields({items,custom_items:customItems})
 return serialize(directory,async()=>{
  if(!isCurrent())throw Error('Administrator session required.')
  const file=assertFile(directory),SQL=await sql(),before=fs.readFileSync(file)
  const db=new SQL.Database(Buffer.from(before))
  try{
   schema(db)
   const readCloud=(table,id)=>db.exec("SELECT row_json FROM snapshot_rows WHERE table_name=? AND json_extract(row_json,'$.id')=?",
    [table,id])[0]?.values?.map(([json])=>JSON.parse(json))?.[0]
   const address=readCloud('buyer_addresses',addressId)
   const contact=contactId?readCloud('buyer_contacts',contactId):null
   const buyer=address&&readCloud('buyers',address.buyer_id)
   if(!buyer||contactId&&contact?.buyer_id!==buyer.id)throw Error('Address or contact could not be verified.')
   for(const {sampleId} of items){
    const sample=readCloud('samples',sampleId)
    const order=sample&&readCloud('orders',sample.order_id)
    if(String(sample?.stage).toLowerCase()!=='ready'||order?.buyer_id!==buyer.id)
     throw Error('Every sample must be synchronized, ready, and assigned to this buyer.')
   }
   const stamp=new Date().toISOString(),id='local-'+crypto.randomUUID(),snapshotId='local-'+crypto.randomUUID()
   const fields={items,custom_items:customItems,address_id:addressId,contact_id:contactId||null}
   const localFields={items,custom_items:customItems,status:'Draft',created_at:stamp}
   const consignee={name:address.recipient||buyer.name||'',label:address.label||'',
    address_line1:address.address_line1||'',address_line2:address.address_line2||'',
    city:address.city||'',region:address.region||'',postal_code:address.postal_code||'',country:address.country||'',
    contact_name:contact?.name||buyer.contact_person||'',phone:contact?.phone||address.phone||'',email:contact?.email||''}
   const snapshot={parcel_id:id,buyer_id:buyer.id,address_id:addressId,contact_id:contactId||null,consignee,updated_at:stamp}
   db.run('INSERT INTO standalone_records VALUES (?,?,?,?,?),(?,?,?,?,?)',
    [id,'parcels',JSON.stringify(localFields),stamp,stamp,
     snapshotId,'parcel_invoice_snapshots',JSON.stringify(snapshot),stamp,stamp])
   const document={localLines:[{id:snapshotId,table:'parcel_invoice_snapshots',parentField:'parcel_id'}]}
   if(!stageMutation(db,ownerId,createMutationIntent('parcels',id,fields,stamp,stamp,document)))
    throw Error('Could not queue parcel.')
   const temp=file+'.'+crypto.randomUUID()+'.tmp'
   try{
    fs.writeFileSync(temp,Buffer.from(db.export()),{flag:'wx',mode:0o600})
    if(!isCurrent()||!fs.readFileSync(file).equals(before))throw Error('Database or sign-in changed during parcel save')
    fs.renameSync(temp,file)
   }finally{fs.rmSync(temp,{force:true})}
   return {id,...localFields}
  }finally{db.close()}
 })
}

module.exports={queueParcelCreate,queuePurchasingDocument,queueParcelTransition,reviewSavedChanges,submitPendingMutations,TABLES,validateFields,listLocalRecords,listCombinedRecords,mutateLocalRecord,createLocalRecordBatch,mutateLocalRecordBatch,upsertLocalRecordBatch,readLocalRows:read}
