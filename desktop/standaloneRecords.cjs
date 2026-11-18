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
const {stageMutation,assertUnqueued,assertOrderSectionAvailable,pendingMutations,recordMutationOutcome}=require('./offlineMutationOutbox.cjs')
const {isShipmentStatusChange}=require('./shipmentStatusMutation.cjs')
const {isOrderDetailsPatch,isOrderJobPatch}=require('./orderDetailsMutation.cjs')
const cloudId=/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i
function queueProductionCreate(db,ownerId,table,id,fields,stamp){
 if(ownerId&&table==='production_daily_entries'&&[fields.order_id,fields.size_group_id,fields.color_id].every(id=>cloudId.test(id||'')))
  stageMutation(db,ownerId,createMutationIntent(table,id,fields,stamp,stamp))
}

const supplierFields=new Set(['name','contact_person','email','phone','address','category','lead_time_days','notes','process','tags','is_active'])
function prepareSupplierFields(fields){
 const result=Object.fromEntries(Object.entries(fields||{}).filter(([key])=>supplierFields.has(key)))
 if(result.lead_time_days==='')result.lead_time_days=null
 if(Object.hasOwn(result,'lead_time_days')&&result.lead_time_days!==null){
  result.lead_time_days=Number(result.lead_time_days)
  if(!Number.isSafeInteger(result.lead_time_days)||result.lead_time_days<0)throw Error('Lead time must be a nonnegative whole number.')
 }
 if(Object.hasOwn(result,'name')&&(typeof result.name!=='string'||!result.name.trim()))throw Error('Enter a supplier name.')
 return result
}

function queueOrderStatus(db,ownerId,table,id,base,fields,stamp){
 if(ownerId&&table==='orders'&&cloudId.test(id)&&Object.keys(fields).join()==='status'&&
    ['Draft','Active','Booked','Shipped','Cancelled'].includes(fields.status)&&Object.hasOwn(base,'status')&&base.status!==fields.status)
  stageMutation(db,ownerId,updateMutationIntent(table,id,{status:fields.status},{status:base.status},stamp))
}
function queueOrderDetails(db,ownerId,table,id,base,previous,fields,stamp){
 const jobChange=isOrderJobPatch(fields)
 if(table!=='orders'||!cloudId.test(id)||!jobChange&&!isOrderDetailsPatch(fields))return
 if(!ownerId)throw Error('Administrator access is required to synchronize these order changes.')
 let changed=Object.keys(fields).filter(key=>fields[key]!==previous[key])
 if(!changed.length||Object.keys(fields).join()==='status'&&fields.status!==null)return
 if(jobChange){
  changed=['job_id','job_number']
  const row=fields.job_id&&db.exec("SELECT row_json FROM snapshot_rows WHERE table_name='jobs' AND json_extract(row_json,'$.id')=?",
   [fields.job_id])[0]?.values?.[0]?.[0]
  const job=row&&JSON.parse(row)
  if(fields.job_id?(!job||job.buyer_id!==previous.buyer_id||job.job_number!==fields.job_number):fields.job_number!==null)
   throw Error('Choose a synchronized job for the same buyer.')
 }
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
  if(table==='orders'&&db.exec("SELECT 1 FROM sqlite_master WHERE type='table' AND name='offline_order_section_overlays'").length){
   const byOrder=new Map([...snapshot,...local].map(row=>[row.id,row]))
   const overlays=db.exec('SELECT order_id,changes FROM offline_order_section_overlays ORDER BY updated_at,section')[0]?.values||[]
   for(const [id,json] of overlays){
    if(!byOrder.has(id)||edits.get(id)===null)continue
    edits.set(id,{...byOrder.get(id),...edits.get(id),...JSON.parse(json)})
   }
  }
  const localIds=new Set(local.map(row=>row.id))
  return [...local.map(row=>edits.get(row.id)||row),...snapshot.filter(row=>!localIds.has(row.id)&&(!edits.has(String(row.id))||edits.get(String(row.id))!==null)).map(row=>edits.has(String(row.id))?{...row,...edits.get(String(row.id)),_local_only:false,_local_edited:true}:row)]
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
  if(table==='suppliers'&&ownerId&&action!=='delete'){
   fields=prepareSupplierFields(fields)
   validateFields(fields)
   if(action==='create'&&!fields.name)throw Error('Enter a supplier name.')
  }else if(action!=='delete'){
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
     if(table==='suppliers'&&ownerId){
      const changed=Object.keys(fields).filter(key=>JSON.stringify(fields[key])!==JSON.stringify(previous[key]))
      if(!changed.length)return {id,table,action,localOnly:false}
      if(changed.some(key=>!Object.hasOwn(imported,key)||JSON.stringify(imported[key])!==JSON.stringify(previous[key])))
       throw Error('Refresh this supplier or review its earlier changes before saving.')
      const select=source=>Object.fromEntries(changed.map(key=>[key,source[key]]))
      if(!stageMutation(db,ownerId,updateMutationIntent(table,id,select(fields),select(imported),stamp)))
       throw Error('This supplier already has a queued change.')
     }
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
    if(table==='suppliers'&&ownerId&&!stageMutation(db,ownerId,createMutationIntent(table,id,fields,stamp,stamp)))
     throw Error('Could not queue supplier.')

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
   ...(intent.document?.lines?{document:{lines:intent.document.lines,childTable:intent.document.childTable,finishingHeader:intent.document.finishingHeader,...(intent.operation==='update'?{lineIds:intent.document.localLines.map(line=>line.id.replace(/^local-/,''))}:{})}}:{})
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

const orderGeneralFields=new Set(['buyer_id', 'buyer_name', 'merchandiser_name', 'agent_name', 'factory_ref', 'product_id', 'style_number', 'store_name', 'brand_name', 'description', 'po_number', 'po_date', 'ship_date', 'planned_date', 'ship_mode', 'incoterms', 'currency', 'status', 'port_of_loading', 'port_of_discharge', 'style_image_base64'])

async function queueOrderImport(directory,{rows,ownerId,isCurrent}){
 if(!ownerId||!Array.isArray(rows)||!rows.length||rows.length>500)
  throw Error('Import requires 1–500 valid order rows.')
 const allowed=new Set([...orderGeneralFields,'notes','in_store_date'])
 const orders=rows.map(row=>{
  if(!row||typeof row.style_number!=='string'||!row.style_number.trim()||
     typeof row.buyer_name!=='string'||!row.buyer_name.trim()||row.buyer_id!==null&&!cloudId.test(row.buyer_id||'')||
     Object.entries(row).some(([key,value])=>!allowed.has(key)||value!==null&&(typeof value!=='string'||value.length>4000)))
   throw Error('Invalid CSV order.')
  return {...row,id:crypto.randomUUID(),status:'Draft'}
 })
 return serialize(directory,async()=>{
  if(!isCurrent())throw Error('Administrator session required.')
  const file=assertFile(directory),SQL=await sql(),before=fs.readFileSync(file),db=new SQL.Database(Buffer.from(before))
  try{
   schema(db)
   const stamp=new Date().toISOString(),ids=orders.map(row=>row.id)
   const intent=createMutationIntent('orders',ids[0],{importRows:orders},stamp,stamp,
    {clonedRows:ids.slice(1).map(id=>({table:'orders',id}))})
   if(Buffer.byteLength(JSON.stringify(intent))>115000)throw Error('CSV import is too large for offline sync.')
   for(const row of orders)
    db.run('INSERT INTO standalone_records VALUES (?,?,?,?,?)',[row.id,'orders',JSON.stringify({...row,created_at:stamp}),stamp,stamp])
   if(!stageMutation(db,ownerId,intent))throw Error('Could not queue CSV import.')
   const temp=file+'.'+crypto.randomUUID()+'.tmp'
   try{
    fs.writeFileSync(temp,Buffer.from(db.export()),{flag:'wx',mode:0o600})
    if(!isCurrent()||!fs.readFileSync(file).equals(before))throw Error('Database or sign-in changed during CSV import.')
    fs.renameSync(temp,file)
   }finally{fs.rmSync(temp,{force:true})}
   return orders.length
  }finally{db.close()}
 })
}

async function queueOrderGeneral(directory,{orderId,cloneOrderId,fields,ownerId,isCurrent}){
 if(!ownerId||(orderId&&!cloudId.test(orderId))||!fields||typeof fields!=='object'||
    Object.entries(fields).some(([key,value])=>!orderGeneralFields.has(key)||
     value!==null&&(typeof value!=='string'||value.length>(key==='style_image_base64'?100000:4000))))
  throw Error('Valid General Info is required.')
 if(!orderId&&(!cloudId.test(fields.buyer_id||'')||!fields.style_number?.trim()))throw Error('Select a synchronized buyer and enter a style number.')
 return serialize(directory,async()=>{
  if(!isCurrent())throw Error('Administrator session required.')
  const file=assertFile(directory),SQL=await sql(),before=fs.readFileSync(file),db=new SQL.Database(Buffer.from(before))
  try{
   schema(db)
   if(!orderId){
    const buyer=db.exec("SELECT 1 FROM snapshot_rows WHERE table_name='buyers' AND json_extract(row_json,'$.id')=?",[fields.buyer_id]).length
    if(!buyer)throw Error('Select a synchronized buyer before creating this order.')
    const id=crypto.randomUUID(),stamp=new Date().toISOString()
    const header={...fields,status:'Draft'}
    const copied={}
    let document
    if(cloneOrderId){
     if(!cloudId.test(cloneOrderId))throw Error('Select a synchronized source order.')
     const load=(table,key,value)=>db.exec('SELECT row_json FROM snapshot_rows WHERE table_name=? AND json_extract(row_json,?)=?',
      [table,'$.'+key,value])[0]?.values?.map(([row])=>JSON.parse(row))||[]
     const source=load('orders','id',cloneOrderId)[0]
     if(!source||source.buyer_id!==fields.buyer_id)throw Error('Refresh the source order before duplicating.')
     const select=(row,keys)=>Object.fromEntries(keys.map(key=>[key,row[key]??null]))
     const project=(table,row,keys,links)=>{
      assertUnqueued(db,table,row.id)
      if(db.exec('SELECT 1 FROM snapshot_edits WHERE table_name=? AND record_id=?',[table,row.id]).length)
       throw Error('Sync existing edits before copying this order.')
      return {...select(row,keys),...links,id:crypto.randomUUID()}
     }
     assertUnqueued(db,'orders',cloneOrderId)
     copied.size_groups=[]
     copied.size_group_colors=[]
     for(const row of load('size_groups','order_id',cloneOrderId)){
      const copy=project('size_groups',row,['group_name','unit_price','currency','sizes','base_size','sort_order'],{order_id:id})
      copied.size_groups.push(copy)
      for(const color of load('size_group_colors','size_group_id',row.id))
       copied.size_group_colors.push(project('size_group_colors',color,['color_name','sort_order'],{size_group_id:copy.id}))
     }
     copied.bom_items=load('bom_items','order_id',cloneOrderId).map(row=>project('bom_items',row,
      ['library_item_id','name','category','detail','specification','unit','supplier_id','usage_rule','usage_data','base_qty','wastage','notes','sort_order','use_cutting_qty'],
      {order_id:id}))
     document={clonedRows:Object.entries(copied).flatMap(([table,rows])=>rows.map(row=>({table,id:row.id})))}
    }
    const intent=createMutationIntent('orders',id,cloneOrderId?{header,copied}:header,stamp,stamp,document)
    if(Buffer.byteLength(JSON.stringify(intent))>115000)throw Error('This order image is too large for offline sync.')
    db.run('INSERT INTO standalone_records VALUES (?,?,?,?,?)',[id,'orders',JSON.stringify({...header,created_at:stamp}),stamp,stamp])
    for(const [table,rows] of Object.entries(copied))for(const row of rows)
     db.run('INSERT INTO standalone_records VALUES (?,?,?,?,?)',[row.id,table,JSON.stringify(row),stamp,stamp])
    if(!stageMutation(db,ownerId,intent))throw Error('Could not queue new order.')
    const temp=file+'.'+crypto.randomUUID()+'.tmp'
    try{
     fs.writeFileSync(temp,Buffer.from(db.export()),{flag:'wx',mode:0o600})
     if(!isCurrent()||!fs.readFileSync(file).equals(before))throw Error('Database or sign-in changed during order save.')
     fs.renameSync(temp,file)
    }finally{fs.rmSync(temp,{force:true})}
    return {id,...header,created_at:stamp}
   }
   const raw=db.exec("SELECT row_json FROM snapshot_rows WHERE table_name='orders' AND json_extract(row_json,'$.id')=?",
    [orderId])[0]?.values?.[0]?.[0]
   if(!raw){
    const local=read(db,'orders').find(row=>row.id===orderId)
    if(local&&Object.entries(fields).every(([key,value])=>(local[key]??null)===value))return local
    throw Error(local?'Wait for this new order to sync before editing it.':'Refresh this order before saving.')
   }
   const base=JSON.parse(raw)
   const saved=db.exec("SELECT fields_json FROM snapshot_edits WHERE table_name='orders' AND record_id=?",[orderId])[0]?.values?.[0]
   if(saved?.[0]===null)throw Error('This order is pending deletion.')
   const current=saved?JSON.parse(saved[0]):base
   const changed=Object.entries(fields).filter(([key,value])=>value!==(current[key]??null))
   if(!changed.length)return current
   assertUnqueued(db,'orders',orderId)
   if(saved)throw Error('This order has a local edit awaiting synchronization or review.')
   const general=Object.fromEntries(changed)
   if(general.status==='Confirmed'&&!(base.step_po_matrix&&base.step_bom&&base.style_number&&base.buyer_name))
    throw Error('Sync General Info, PO Matrix and BOM before confirming the order.')

   const expected=Object.fromEntries(changed.map(([key])=>[key,base[key]??null]))
   const stamp=new Date().toISOString(),next={...base,...general}
   const intent=updateMutationIntent('orders',orderId,{general_info:general},{general_info:expected},stamp)
   if(Buffer.byteLength(JSON.stringify(intent))>115000)throw Error('This order image is too large for offline sync.')
   db.run('INSERT INTO snapshot_edits VALUES (?,?,?,?)',['orders',orderId,JSON.stringify(next),stamp])
   if(!stageMutation(db,ownerId,intent))throw Error('Could not queue General Info.')
   const temp=file+'.'+crypto.randomUUID()+'.tmp'
   try{
    fs.writeFileSync(temp,Buffer.from(db.export()),{flag:'wx',mode:0o600})
    if(!isCurrent()||!fs.readFileSync(file).equals(before))throw Error('Database or sign-in changed during order save.')
    fs.renameSync(temp,file)
   }finally{fs.rmSync(temp,{force:true})}
   return next
  }finally{db.close()}
 })
}

const buyerProfileFields=['name','contact_person','email','phone','address','country','currency','default_incoterms','default_ship_mode','notes','is_active','payment_terms_days']
const buyerDetailFields={
 buyer_addresses:['label','recipient','address_line1','address_line2','city','region','postal_code','country','phone','email','is_default'],
 buyer_contacts:['name','designation','department','phone','email','is_default'],
}

async function queueBuyer(directory,{buyerId,fields,addresses,contacts,ownerId,isCurrent}){
 if(!ownerId||buyerId&&!cloudId.test(buyerId)||!fields||typeof fields!=='object'||Array.isArray(fields))
  throw Error('A valid buyer profile is required.')
 const header=Object.fromEntries(Object.entries(fields).filter(([key])=>buyerProfileFields.includes(key)))
 validateFields(header)
 if((!buyerId||Object.hasOwn(header,'name'))&&(typeof header.name!=='string'||!header.name.trim()))
  throw Error('Enter a buyer name.')
 const details={buyer_addresses:addresses,buyer_contacts:contacts}
 for(const rows of Object.values(details)){
  if(rows===undefined&&buyerId)continue
  if(!Array.isArray(rows)||rows.length>100||rows.some(row=>!row||typeof row!=='object')||
     rows.length&&rows.filter(row=>row.is_default===true).length!==1)
   throw Error('Select one default address and contact where applicable.')
 }
 return serialize(directory,async()=>{
  if(!isCurrent())throw Error('Administrator session required.')
  const file=assertFile(directory),SQL=await sql(),before=fs.readFileSync(file),db=new SQL.Database(Buffer.from(before))
  try{
   schema(db)
   const stamp=new Date().toISOString(),localId=buyerId||'local-'+crypto.randomUUID()
   const find=(table,key,value)=>db.exec('SELECT row_json FROM snapshot_rows WHERE table_name=? AND json_extract(row_json,?)=?',
    [table,'$.'+key,value])[0]?.values?.map(([row])=>JSON.parse(row))||[]
   const ensureReady=(table,id)=>{
    assertUnqueued(db,table,id)
    if(db.exec('SELECT 1 FROM snapshot_edits WHERE table_name=? AND record_id=?',[table,id]).length)
     throw Error('This buyer has a local change awaiting synchronization or review.')
   }
   const baseline=buyerId?find('buyers','id',buyerId)[0]:null
   if(buyerId&&!baseline)throw Error('Refresh this buyer before saving.')
   if(buyerId)ensureReady('buyers',buyerId)
   const expected=baseline?{header:Object.fromEntries(Object.keys(header).map(key=>[key,baseline[key]??null])),details:{}}:null
   const patch={header,details:{}},edits=[],creates=[]
   if(baseline)edits.push({table:'buyers',id:buyerId,value:{...baseline,...header}})
   else creates.push({table:'buyers',id:localId,value:{is_active:true,...header}})
   for(const [table,rows] of Object.entries(details)){
    if(rows===undefined)continue
    const original=buyerId?find(table,'buyer_id',buyerId):[]
    if(expected)expected.details[table]=original
    const old=new Map(original.map(row=>[row.id,row]))
    const ids=rows.filter(row=>row.id).map(row=>row.id)
    if(new Set(ids).size!==ids.length||ids.some(id=>!old.has(id)))throw Error('Refresh this buyer’s addresses and contacts.')
    const next=new Map()
    patch.details[table]=rows.map(row=>{
     const id=row.id||'local-'+crypto.randomUUID()
     const values=Object.fromEntries(buyerDetailFields[table].map(key=>[key,key==='is_default'?row[key]===true:row[key]??'']))
     validateFields(values)
     const local={id,buyer_id:localId,...values}
     next.set(id,local)
     if(!row.id)creates.push({table,id,value:local})
     return {...values,id:row.id||id.slice(6)}
    })
    for(const row of original){
     ensureReady(table,row.id)
     edits.push({table,id:row.id,value:next.has(row.id)?{...row,...next.get(row.id)}:null})
    }
   }
   const document={buyer:{edits:edits.map(({table,id,value})=>({table,id,removed:value===null})),
    creates:creates.map(({table,id})=>({table,id}))}}
   const intent=buyerId?updateMutationIntent('buyers',buyerId,patch,expected,stamp,null,document)
    :createMutationIntent('buyers',localId,patch,stamp,stamp,document)
   if(Buffer.byteLength(JSON.stringify(intent))>115000)throw Error('Buyer profile is too large for offline sync.')
   for(const {table,id,value} of edits)db.run('INSERT INTO snapshot_edits VALUES (?,?,?,?)',[table,id,value===null?null:JSON.stringify(value),stamp])
   for(const {table,id,value} of creates)db.run('INSERT INTO standalone_records VALUES (?,?,?,?,?)',[id,table,JSON.stringify(value),stamp,stamp])
   if(!stageMutation(db,ownerId,intent))throw Error('Could not queue buyer changes.')
   const temp=file+'.'+crypto.randomUUID()+'.tmp'
   try{
    fs.writeFileSync(temp,Buffer.from(db.export()),{flag:'wx',mode:0o600})
    if(!isCurrent()||!fs.readFileSync(file).equals(before))throw Error('Database or sign-in changed during buyer save.')
    fs.renameSync(temp,file)
   }finally{fs.rmSync(temp,{force:true})}
  }finally{db.close()}
 })
}

function pendingOrderCreation(db,ownerId,orderId){
 if(!db.exec("SELECT 1 FROM sqlite_master WHERE type='table' AND name='offline_mutation_outbox'").length)return null
 return db.exec(`SELECT operation_id FROM offline_mutation_outbox WHERE owner_id=? AND table_name='orders' AND record_id=?
  AND json_extract(intent_json,'$.operation')='create' AND json_type(intent_json,'$.fields.buyer_id')='text'
  AND state IN ('pending','applied')`,[ownerId,orderId])[0]?.values?.[0]?.[0]||null
}
function initializeOrderSectionOverlays(db){
 db.run(`CREATE TABLE IF NOT EXISTS offline_order_section_overlays (
  order_id TEXT NOT NULL,section TEXT NOT NULL,changes TEXT NOT NULL,updated_at TEXT NOT NULL,PRIMARY KEY(order_id,section))`)
}

const orderSections={
 bom_items:{flag:'step_bom'},
 washing:{flag:'step_washing'},
 embellishments:{flag:'step_embellishment'},
 order_processes:{flag:'step_processes',notes:true},
 fitting_blocks:{flag:'step_fitting',stable:true},
 order_queues:{flag:'queue_split_rule',rule:true},
 finishing_packs:{flag:'step_finishing',finishing:true},
}

function queueBom(directory,input){
 return queueOrderSection(directory,{...input,table:'bom_items',enabled:true})
}

async function queueOrderSection(directory,{orderId,table,enabled,notes,rule,rows,finishing,ownerId,isCurrent}){
 const config=Object.hasOwn(orderSections,table)?orderSections[table]:null
 if(!config||typeof enabled!=='boolean'||(config.notes&&typeof notes!=='string')||(config.rule&&(typeof rule!=='string'||!rule.trim())))
  throw Error('Invalid order section.')
 const changes={ [config.flag]:config.rule?rule:enabled,...(config.notes?{notes}:{}) }
 if(!ownerId||!cloudId.test(orderId||'')||!Array.isArray(rows)||rows.length>300)
  throw Error('A synchronized order and valid section rows are required.')
 const retainedIds=[]
 rows=rows.map(input=>{
  const {id,...row}=input||{}
  if(id&&!config.stable)throw Error('Unexpected order section row ID.')
  retainedIds.push(id||null)
  validateFields(row)
  if(row.order_id!==orderId||table==='bom_items'&&(typeof row.name!=='string'||!row.name.trim()))throw Error('Invalid order section row.')
  return row
 })
 return serialize(directory,async()=>{
  if(!isCurrent())throw Error('Administrator session required.')
  const file=assertFile(directory),SQL=await sql(),before=fs.readFileSync(file),db=new SQL.Database(Buffer.from(before))
  try{
   schema(db)
   const order=db.exec("SELECT row_json FROM snapshot_rows WHERE table_name='orders' AND json_extract(row_json,'$.id')=?",
    [orderId])[0]?.values?.[0]?.[0]
   const creation=order?null:pendingOrderCreation(db,ownerId,orderId)
   if(!order&&!creation)throw Error('Refresh the order before saving this section.')
   const base=order?JSON.parse(order):{[config.flag]:false,notes:null}
   let finishingHeader,previousFinishing
   if(config.finishing){
    if(!finishing||typeof finishing.use_cutting_qty!=='boolean'||!Number.isSafeInteger(finishing.total_qty)||finishing.total_qty<0)
     throw Error('Invalid Finishing settings.')
    const heads=db.exec("SELECT row_json FROM snapshot_rows WHERE table_name='finishing' AND json_extract(row_json,'$.order_id')=?",
     [orderId])[0]?.values||[]
    if(heads.length>1)throw Error('More than one Finishing record exists for this order.')
    previousFinishing=heads.length?JSON.parse(heads[0][0]):null
    if(previousFinishing){
     assertUnqueued(db,'finishing',previousFinishing.id)
     if(db.exec("SELECT 1 FROM snapshot_edits WHERE table_name='finishing' AND record_id=?",[previousFinishing.id]).length)
      throw Error('Review the earlier Finishing edit before saving packing.')
    }
    finishingHeader={id:previousFinishing?.id||crypto.randomUUID(),order_id:orderId,
     use_cutting_qty:finishing.use_cutting_qty,total_qty:finishing.total_qty}
    rows=rows.map(row=>({...row,finishing_id:finishingHeader.id}))
   }
   const original=db.exec(`SELECT row_json FROM snapshot_rows WHERE table_name=? AND
    (json_extract(row_json,'$.order_id')=? OR json_extract(row_json,'$.finishing_id')=?)`,
    [table,orderId,previousFinishing?.id||null])[0]?.values?.map(([row])=>JSON.parse(row))||[]
   initializeOrderSectionOverlays(db)
   assertOrderSectionAvailable(db,orderId,table,creation)
   if(db.exec('SELECT 1 FROM offline_order_section_overlays WHERE order_id=? AND section=?',[orderId,table]).length)
    throw Error('This section is waiting for a cloud refresh.')
   for(const [name,id] of original.map(row=>[table,row.id])){
    assertUnqueued(db,name,id)
    if(db.exec('SELECT 1 FROM snapshot_edits WHERE table_name=? AND record_id=?',[name,id]).length)
     throw Error('This order section has an earlier local change awaiting synchronization or review.')
   }
   const stamp=new Date().toISOString()
   const chosen=retainedIds.filter(Boolean)
   if(new Set(chosen).size!==chosen.length||chosen.some(id=>!original.some(row=>row.id===id)))
    throw Error('Refresh the existing fitting blocks before saving.')
   const localLines=rows.map((_,index)=>({table,id:retainedIds[index]||'local-'+crypto.randomUUID(),parentField:'order_id'}))
   const matrix=['washing','order_queues'].includes(table)&&db.exec("SELECT 1 FROM sqlite_master WHERE type='table' AND name='offline_mutation_outbox'").length
    ?db.exec(`SELECT operation_id,state,intent_json FROM offline_mutation_outbox WHERE owner_id=? AND record_id=?
       AND state IN ('pending','conflict')`,[ownerId,orderId+':po_matrix'])[0]?.values?.[0]:null
   if(matrix?.[1]==='conflict')throw Error('Resolve the PO Matrix conflict before saving Washing.')
   if(config.finishing&&db.exec("SELECT 1 FROM offline_order_section_overlays WHERE order_id=? AND section IN ('po_matrix','order_queues')",[orderId]).length)
    throw Error('Sync PO Matrix and queues before changing their packing allocations.')
   const dependency=matrix?.[0]||creation
   const matrixRule=matrix?JSON.parse(matrix[2]).document.matrix.summary.queue_split_rule:null
   const expected={...Object.fromEntries(Object.keys(changes).map(key=>[key,base[key]??null])),lines:original}
   if(config.rule){
    const currentRule=matrixRule??base.queue_split_rule
    if(currentRule!==rule)throw Error('Save the selected split rule in PO Matrix first.')
    expected.queue_split_rule=currentRule
   }
   if(finishingHeader)expected.finishing=previousFinishing
   const intent=updateMutationIntent('orders',orderId,changes,expected,stamp,null,
    {childTable:table,lines:rows,localLines,independentOrderSection:true,...(finishingHeader?{finishingHeader}:{}),...(dependency?{afterOperation:dependency}:{})})
   if(Buffer.byteLength(JSON.stringify(intent))>116000)throw Error('Order section is too large for offline sync.')
   db.run('INSERT INTO offline_order_section_overlays VALUES (?,?,?,?)',[orderId,table,JSON.stringify(changes),stamp])
   if(finishingHeader){
    if(previousFinishing)db.run('INSERT INTO snapshot_edits VALUES (?,?,?,?)',
     ['finishing',finishingHeader.id,JSON.stringify({...previousFinishing,...finishingHeader}),stamp])
    else db.run('INSERT INTO standalone_records VALUES (?,?,?,?,?)',
     [finishingHeader.id,'finishing',JSON.stringify(finishingHeader),stamp,stamp])
   }
   for(const row of original){
    const index=retainedIds.indexOf(row.id)
    const next=index<0?null:JSON.stringify({...row,...rows[index]})
    db.run('INSERT INTO snapshot_edits VALUES (?,?,?,?)',[table,row.id,next,stamp])
   }
   localLines.forEach(({id},index)=>{
    if(id.startsWith('local-'))db.run('INSERT INTO standalone_records VALUES (?,?,?,?,?)',
     [id,table,JSON.stringify(rows[index]),stamp,stamp])
   })
   if(!stageMutation(db,ownerId,intent))throw Error('Could not queue the order section.')
   const temp=file+'.'+crypto.randomUUID()+'.tmp'
   try{
    fs.writeFileSync(temp,Buffer.from(db.export()),{flag:'wx',mode:0o600})
    if(!isCurrent()||!fs.readFileSync(file).equals(before))throw Error('Database or sign-in changed during section save.')
    fs.renameSync(temp,file)
   }finally{fs.rmSync(temp,{force:true})}
   return localLines.map(({id},index)=>({id,...rows[index]}))
  }finally{db.close()}
 })
}

async function queuePoMatrix(directory,{payload,ownerId,isCurrent}){
 const {p_order_id:orderId,p_groups:groups,p_total_qty:qty,p_total_value_usd:value,
  p_excess_cutting_pct:excess,p_queue_split_rule:rule}=payload||{}
 if(!ownerId||!cloudId.test(orderId||'')||!Array.isArray(groups)||groups.length>100||
    !Number.isSafeInteger(qty)||qty<0||!Number.isFinite(value)||!Number.isFinite(excess)||typeof rule!=='string')
  throw Error('A synchronized order and a valid PO Matrix are required.')
 const {matrixRows,matrixTables,summaryFields}=require('./poMatrixSync.cjs')
 return serialize(directory,async()=>{
  if(!isCurrent())throw Error('Administrator session required.')
  const file=assertFile(directory),SQL=await sql(),before=fs.readFileSync(file),db=new SQL.Database(Buffer.from(before))
  try{
   schema(db)
   const load=table=>db.exec('SELECT row_json FROM snapshot_rows WHERE table_name=?',[table])[0]?.values?.map(([row])=>JSON.parse(row))||[]
   const order=load('orders').find(row=>row.id===orderId)
   const creation=order?null:pendingOrderCreation(db,ownerId,orderId)
   if(!order&&!creation)throw Error('Refresh this order before saving its PO Matrix.')
   const base=order||{step_po_matrix:false,excess_cutting_pct:0}
   initializeOrderSectionOverlays(db)
   const staged=db.exec("SELECT 1 FROM sqlite_master WHERE type='table' AND name='offline_mutation_outbox'").length?
    db.exec(`SELECT intent_json,state FROM offline_mutation_outbox WHERE owner_id=? AND record_id=?
      ORDER BY rowid DESC LIMIT 1`,[ownerId,orderId+':po_matrix'])[0]?.values?.[0]:null
   if(staged?.[1]==='pending'){
    const prior=JSON.parse(staged[0]).changes.po_matrix
    const comparable=value=>JSON.stringify(value,(key,part)=>key==='desktop_id'?undefined:part)
    if(comparable(prior)===comparable(payload))return
   }
   assertOrderSectionAvailable(db,orderId,'po_matrix',creation)
   if(db.exec("SELECT 1 FROM offline_order_section_overlays WHERE order_id=? AND section IN ('washing','order_queues')",[orderId]).length)
    throw Error('Sync the earlier Washing or Queue edit before changing this PO Matrix.')
   const expected=matrixRows(Object.fromEntries(matrixTables.map(table=>[table,load(table)])),orderId)
   const previous=Object.fromEntries(summaryFields.map(key=>[key,base[key]??null]))
   const summary={step_po_matrix:true,total_qty:qty,total_value_usd:value,excess_cutting_pct:excess,queue_split_rule:rule}
   const rows={size_groups:[],size_group_colors:[],size_group_breakdown:[]}
   const creates=[],edits=[],stamp=new Date().toISOString()
   const assertReady=(table,id)=>{
    assertUnqueued(db,table,id)
    if(db.exec('SELECT 1 FROM snapshot_edits WHERE table_name=? AND record_id=?',[table,id]).length)
     throw Error('A record in this PO Matrix already has a local edit awaiting review.')
   }
   for(const table of matrixTables)for(const row of expected[table])assertReady(table,row.id)
   let total=0,amount=0
   const key=()=> 'local-'+crypto.randomUUID()
   const prepared=groups.map((group,gi)=>{
    if(!group||typeof group.group_name!=='string'||!Array.isArray(group.sizes)||group.sizes.some(size=>typeof size!=='string')||
       new Set(group.sizes).size!==group.sizes.length||!Array.isArray(group.colors)||
       (group.id&&!expected.size_groups.some(row=>row.id===group.id))||
       (group.unit_price!==null&&!Number.isFinite(group.unit_price)))throw Error('Invalid PO Matrix size group.')
    const gid=group.id||crypto.randomUUID()
    rows.size_groups.push({id:gid,order_id:orderId,group_name:group.group_name,unit_price:group.id?group.unit_price:group.unit_price??0,
     currency:group.currency||'USD',sizes:group.sizes,base_size:group.base_size??null,sort_order:gi})
    const colors=group.colors.map((color,ci)=>{
     if(!color||typeof color.color_name!=='string'||!color.color_name.trim()||!Array.isArray(color.quantities)||
        (color.id&&!expected.size_group_colors.some(row=>row.id===color.id&&row.size_group_id===gid)))
      throw Error('Invalid PO Matrix colour.')
     const cid=color.id||crypto.randomUUID()
     rows.size_group_colors.push({id:cid,size_group_id:gid,color_name:color.color_name,sort_order:ci,
      ratio_override:color.ratio_override??null,ratio_locked:!!color.ratio_locked})
     if(new Set(color.quantities.map(cell=>cell?.size)).size!==color.quantities.length)throw Error('Duplicate PO Matrix quantity.')
     for(const cell of color.quantities){
      if(!cell||!group.sizes.includes(cell.size)||!Number.isSafeInteger(cell.qty)||cell.qty<0)
       throw Error('Invalid PO Matrix quantity.')
      rows.size_group_breakdown.push({id:key(),size_group_id:gid,color_id:cid,size:cell.size,qty:cell.qty})
      total+=cell.qty
      amount+=cell.qty*(group.unit_price||0)
     }
     return {...color,...(!color.id?{desktop_id:cid}:{})}
    })
    return {...group,colors,...(!group.id?{desktop_id:gid}:{})}
   })
   if(total!==qty||Math.abs(amount-value)>0.01||matrixTables.some(table=>new Set(rows[table].map(row=>row.id)).size!==rows[table].length))
    throw Error('PO Matrix totals or record IDs are invalid.')
   const retainedColors=new Set(rows.size_group_colors.map(color=>color.id))
   const existingColors=new Set(expected.size_group_colors.map(color=>color.id))
   if(load('washing').some(row=>existingColors.has(row.color_id)&&!retainedColors.has(row.color_id)))
    throw Error('Cannot remove a colour linked to Washing. Update Washing first.')
   for(const table of matrixTables){
    const next=new Map(rows[table].map(row=>[row.id,row]))
    for(const base of expected[table])edits.push({table,id:base.id,value:next.has(base.id)?{...base,...next.get(base.id)}:null})
    for(const row of rows[table])if(!expected[table].some(old=>old.id===row.id))creates.push({table,id:row.id,value:row})
   }
   const intent=updateMutationIntent('orders',orderId,{po_matrix:{...payload,p_groups:prepared}},{summary:previous,...expected},stamp,null,
    {childTable:'po_matrix',independentOrderSection:true,...(creation?{afterOperation:creation}:{}),matrix:{summary,rows,edits:edits.map(({table,id})=>({table,id})),creates:creates.map(({table,id})=>({table,id}))}})
   if(Buffer.byteLength(JSON.stringify({payload:{...payload,p_groups:prepared},expected,previous}))>115000)throw Error('PO Matrix is too large for offline sync.')
   db.run('INSERT INTO offline_order_section_overlays VALUES (?,?,?,?)',[orderId,'po_matrix',JSON.stringify(summary),stamp])
   for(const {table,id,value} of edits)db.run('INSERT INTO snapshot_edits VALUES (?,?,?,?)',[table,id,value===null?null:JSON.stringify(value),stamp])
   for(const {table,id,value} of creates)db.run('INSERT INTO standalone_records VALUES (?,?,?,?,?)',[id,table,JSON.stringify(value),stamp,stamp])
   if(!stageMutation(db,ownerId,intent))throw Error('Could not queue PO Matrix.')
   const temp=file+'.'+crypto.randomUUID()+'.tmp'
   try{
    fs.writeFileSync(temp,Buffer.from(db.export()),{flag:'wx',mode:0o600})
    if(!isCurrent()||!fs.readFileSync(file).equals(before))throw Error('Database or sign-in changed during PO Matrix save.')
    fs.renameSync(temp,file)
   }finally{fs.rmSync(temp,{force:true})}
  }finally{db.close()}
 })
}

async function queueNewJob(directory,{orderIds,ownerId,isCurrent}){
 if(!ownerId||!Array.isArray(orderIds)||orderIds.length<1||orderIds.length>500||
    new Set(orderIds).size!==orderIds.length||orderIds.some(id=>!cloudId.test(id||'')))
  throw Error('Select synchronized orders for the new job.')
 return serialize(directory,async()=>{
  if(!isCurrent())throw Error('Administrator session required.')
  const file=assertFile(directory),SQL=await sql(),before=fs.readFileSync(file),db=new SQL.Database(Buffer.from(before))
  try{
   schema(db)
   const stamp=new Date().toISOString(),id='local-'+crypto.randomUUID()
   const jobNumber='OFFLINE-'+id.slice(6,14)
   const orders=orderIds.map(orderId=>{
    assertUnqueued(db,'orders',orderId)
    if(db.exec("SELECT 1 FROM snapshot_edits WHERE table_name='orders' AND record_id=?",[orderId]).length)
     throw Error('An order already has a saved local edit awaiting review.')
    const row=db.exec("SELECT row_json FROM snapshot_rows WHERE table_name='orders' AND json_extract(row_json,'$.id')=?",
     [orderId])[0]?.values?.[0]?.[0]
    if(!row)throw Error('Refresh the selected orders before creating a job.')
    return JSON.parse(row)
   })
   const buyerId=orders[0].buyer_id
   if(!cloudId.test(buyerId||'')||orders.some(order=>order.buyer_id!==buyerId||
      !Object.hasOwn(order,'job_id')||!Object.hasOwn(order,'job_number')))
    throw Error('All selected orders must have the same synchronized buyer.')
   const fields={buyer_id:buyerId,orders:orders.map(({id,job_id,job_number})=>({id,job_id,job_number}))}
   if(Buffer.byteLength(JSON.stringify(fields))>120000)throw Error('Too many order links for offline job sync.')
   const local={buyer_id:buyerId,job_number:jobNumber,created_at:stamp}
   db.run('INSERT INTO standalone_records VALUES (?,?,?,?,?)',[id,'jobs',JSON.stringify(local),stamp,stamp])
   for(const order of orders)
    db.run('INSERT INTO snapshot_edits VALUES (?,?,?,?)',
     ['orders',order.id,JSON.stringify({...order,job_id:id,job_number:jobNumber}),stamp])
   if(!stageMutation(db,ownerId,createMutationIntent('jobs',id,fields,stamp,stamp)))
    throw Error('Could not queue the new job.')
   const temp=file+'.'+crypto.randomUUID()+'.tmp'
   try{
    fs.writeFileSync(temp,Buffer.from(db.export()),{flag:'wx',mode:0o600})
    if(!isCurrent()||!fs.readFileSync(file).equals(before))throw Error('Database or sign-in changed during job save')
    fs.renameSync(temp,file)
   }finally{fs.rmSync(temp,{force:true})}
   return {id,...local}
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

module.exports={queueOrderImport,queueOrderSection,queueOrderGeneral,queueBuyer,queueBom,queuePoMatrix,queueNewJob,queueParcelCreate,queuePurchasingDocument,queueParcelTransition,reviewSavedChanges,submitPendingMutations,TABLES,validateFields,listLocalRecords,listCombinedRecords,mutateLocalRecord,createLocalRecordBatch,mutateLocalRecordBatch,upsertLocalRecordBatch,readLocalRows:read}
