'use strict'
const {test}=require('node:test')
const assert=require('node:assert/strict')
const fs=require('node:fs'),os=require('node:os'),path=require('node:path')
const {PGlite}=require('@electric-sql/pglite')
const sqlite=require('../desktop/node_modules/sql.js')
const {queuePurchasingRemoval,queuePurchasingDocument,mutateLocalRecord,submitPendingMutations,listCombinedRecords}=require('../desktop/standaloneRecords.cjs')
const {applyCloudSnapshot}=require('../desktop/applyCloudSnapshot.cjs')
const {createDesktopMutationHttp}=require('./desktopMutationHttp.cjs')
const {issueDesktopSyncToken}=require('./desktopSyncToken.cjs')

test('offline purchasing assigns cloud numbers and commits the header, lines and receipt together',async()=>{
 const id=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`
 const db=new PGlite()
 const folder=fs.mkdtempSync(path.join(os.tmpdir(),'app2a-purchasing-sync-'))
 try{
  await db.exec(`
   create role anon;create role authenticated;create role service_role bypassrls;
   create table users(id uuid primary key,role text,is_active boolean,is_restricted boolean);
   create table suppliers(id uuid primary key);
   create table orders(id uuid primary key);
   create table order_processes(id uuid primary key,order_id uuid);
   create table document_numbering(doc_type text primary key,prefix text,current_number int,next_number int,format text,pattern text,seq_pad int,enabled bool,updated_at timestamp);
   create table purchase_orders(id uuid primary key,po_number text unique not null,order_id uuid,supplier_id uuid,po_date date,delivery_date date,currency text,payment_terms text,status text,notes text,updated_at timestamptz default now());
   create table purchase_order_items(id uuid primary key default gen_random_uuid(),po_id uuid references purchase_orders(id),
    description text not null check(description<>'Reject'),specification text,qty numeric,unit text,unit_rate numeric,amount numeric,sort_order int,source_type text,source_id uuid);
   create table work_orders(id uuid primary key,wo_number text unique not null,order_id uuid,vendor_id uuid,vendor_type text,vendor_phone text,factory_ref text,issue_date date,start_date date,complete_by date,daily_output int,payment_terms text,color text,qty int,status text,notes text,updated_at timestamptz default now());
   create table work_order_items(id uuid primary key default gen_random_uuid(),wo_id uuid references work_orders(id),
    order_process_id uuid,process_name text not null,dept_info text,qty numeric,unit text,rate numeric,amount numeric,sort_order int);
   create table purchase_order_changelog(id uuid primary key,po_id uuid references purchase_orders(id),change_description text);
   create table work_order_changelog(id uuid primary key,wo_id uuid references work_orders(id),change_description text);
   insert into users values ('${id(1)}','admin',true,false);
   insert into suppliers values ('${id(2)}');
   insert into orders values ('${id(3)}');
   insert into order_processes values ('${id(4)}','${id(3)}');
   insert into document_numbering values ('po','NZP',1,1,null,'{PREFIX}-{SEQ}',3,true,null),
    ('wo','NZW',1,1,null,'{PREFIX}-{SEQ}',3,true,null);
   insert into purchase_orders(id,po_number) values ('${id(5)}','NZP-001');
   grant select,insert,update,delete on all tables in schema public to service_role;
  `)
  await db.exec(fs.readFileSync(path.join(__dirname,'migrations/20261118_desktop_purchasing_create.sql'),'utf8'))
  await db.exec(fs.readFileSync(path.join(__dirname,'migrations/20261118_desktop_purchase_approval.sql'),'utf8'))
  await db.exec(fs.readFileSync(path.join(__dirname,'migrations/20261118_desktop_purchasing_edit.sql'),'utf8'))
  await db.exec(fs.readFileSync(path.join(__dirname,'migrations/20261118_desktop_purchasing_remove.sql'),'utf8'))
  await db.exec('set role service_role')
  const sql=await sqlite(),dbLocal=new sql.Database()
  fs.writeFileSync(path.join(folder,'nizamia-app2a.sqlite'),Buffer.from(dbLocal.export()))
  dbLocal.close()
  const owner={ownerId:id(1),isCurrent:()=>true},key='fixture-purchase-signer'
  const endpoint=createDesktopMutationHttp({key,db:{async rpc(name,args){
   if(name==='desktop_update_purchase_approval')return {data:(await db.query(
    'select desktop_update_purchase_approval($1,$2,$3,$4,$5) as result',
    [args.actor,args.operation,args.target_purchase_order,args.previous_status,args.new_status])).rows[0].result}
   if(name==='desktop_edit_purchasing_document')return {data:(await db.query(
    'select desktop_edit_purchasing_document($1,$2,$3,$4,$5::jsonb,$6::jsonb,$7::jsonb) as result',
    [args.actor,args.operation,args.kind,args.target,JSON.stringify(args.header),JSON.stringify(args.expected),JSON.stringify(args.lines)])).rows[0].result}
   if(name==='desktop_remove_purchasing_document')return {data:(await db.query(
    'select desktop_remove_purchasing_document($1,$2,$3,$4,$5::jsonb) as result',
    [args.actor,args.operation,args.kind,args.target,JSON.stringify(args.expected)])).rows[0].result}
   assert.equal(name,'desktop_create_purchasing_document')
   return {data:(await db.query('select desktop_create_purchasing_document($1,$2,$3,$4::jsonb,$5::jsonb) as result',
    [args.actor,args.operation,args.kind,JSON.stringify(args.header),JSON.stringify(args.lines)])).rows[0].result}
  }}})
  const send=operations=>endpoint({method:'POST',headers:{authorization:'Bearer '+issueDesktopSyncToken(key,id(1))},body:{operations}})
  const po=fields=>queuePurchasingDocument(folder,{...owner,table:'purchase_orders',
   fields:{supplier_id:id(2),order_id:null,status:'Draft'},lines:[fields]})
  const saved=await po({description:'Custom denim patches',qty:4,unit_rate:2.5,sort_order:0,source_type:null,source_id:null})
  assert.match(saved.po_number,/^OFFLINE-/)
  assert.equal((await listCombinedRecords(folder,'purchase_order_items'))[0].po_id,saved.id)
  await queuePurchasingDocument(folder,{...owner,table:'work_orders',
   fields:{vendor_id:id(2),order_id:id(3),status:'Draft'},lines:[{process_name:'Wash',order_process_id:id(4),qty:3,rate:4}]})
  const result=await submitPendingMutations(folder,{...owner,async submit(operations){
   const applied=(await send(operations)).body.results
   assert.deepEqual(applied.map(x=>x.outcome),['applied','applied'])
   assert.deepEqual((await send(operations)).body.results.map(x=>x.outcome),['already-applied','already-applied'])
   return applied
  }})
  assert.equal(result.archived,2)
  const pull=async()=>Object.fromEntries(await Promise.all(['purchase_orders','purchase_order_items','work_orders','work_order_items','purchase_order_changelog','work_order_changelog'].map(async table=>[
   table,(await db.query('select to_jsonb(t) as row from '+table+' t')).rows.map(r=>r.row)
  ])))
  const tables=await pull()
  assert.ok(tables.purchase_orders.some(x=>x.po_number==='NZP-002'))
  assert.equal(tables.purchase_orders.find(row=>row.po_number==='NZP-002').order_id,null)
  assert.equal(tables.purchase_order_items[0].description,'Custom denim patches')
  assert.equal(tables.purchase_order_items[0].source_id,null)
  assert.equal(tables.purchase_order_items[0].amount,10)
  assert.equal(tables.work_orders[0].wo_number,'NZW-001')
  await applyCloudSnapshot({directory:folder,tables})
  assert.equal((await listCombinedRecords(folder,'purchase_order_items')).length,1)
  assert.equal((await listCombinedRecords(folder,'work_orders')).length,1)
  const editId=tables.work_orders[0].id
  await queuePurchasingDocument(folder,{...owner,table:'work_orders',documentId:editId,
   fields:{vendor_id:id(2),order_id:id(3),status:'Draft',notes:'Updated offline'},
   lines:[{process_name:'Wash revised',order_process_id:id(4),qty:4,rate:4}]})
  assert.deepEqual((await listCombinedRecords(folder,'work_order_items')).map(row=>row.process_name),['Wash revised'])
  await applyCloudSnapshot({directory:folder,tables:await pull()})
  const edit=await submitPendingMutations(folder,{...owner,async submit(operations){
   const applied=(await send(operations)).body.results
   assert.equal(applied[0].outcome,'applied')
   assert.equal((await send(operations)).body.results[0].outcome,'already-applied')
   return applied
  }})
  assert.equal(edit.archived,1)
  await applyCloudSnapshot({directory:folder,tables:await pull()})
  const editedLines=await listCombinedRecords(folder,'work_order_items')
  assert.equal(editedLines.length,1)
  assert.equal(editedLines[0].amount,16)
  assert.doesNotMatch(editedLines[0].id,/^local-/)
  const remove=async(table,id,expectedOutcome)=>{
   await queuePurchasingRemoval(folder,{...owner,table,id})
   assert.ok(!(await listCombinedRecords(folder,table)).some(row=>row.id===id))
   return submitPendingMutations(folder,{...owner,async submit(operations){
    const accepted=(await send(operations)).body.results
    assert.equal(accepted[0].outcome,expectedOutcome)
    assert.equal((await send(operations)).body.results[0].outcome,expectedOutcome==='applied'?'already-applied':expectedOutcome)
    return accepted
   }})
  }
  await db.query("insert into work_order_changelog values($1,$2,'Earlier WO history')",[id(10),editId])
  await applyCloudSnapshot({directory:folder,tables:await pull()})
  assert.equal((await remove('work_orders',editId,'applied')).archived,1)
  await applyCloudSnapshot({directory:folder,tables:await pull()})
  for(const table of ['work_orders','work_order_items','work_order_changelog']){
   assert.equal((await listCombinedRecords(folder,table)).length,0)
   assert.equal((await pull())[table].length,0)
  }
  const untouchedPo=id(5)
  await db.query("insert into purchase_order_changelog values($1,$2,'New cloud history')",[id(11),untouchedPo])
  assert.equal((await remove('purchase_orders',untouchedPo,'conflict')).conflicts,1)
  await applyCloudSnapshot({directory:folder,tables:await pull()})
  assert.ok((await listCombinedRecords(folder,'purchase_orders')).some(row=>row.id===untouchedPo))
  assert.equal((await listCombinedRecords(folder,'purchase_order_changelog')).length,1)
  const approvedId=tables.purchase_orders.find(row=>row.po_number==='NZP-002').id
  await queuePurchasingDocument(folder,{...owner,table:'purchase_orders',documentId:approvedId,
   fields:{supplier_id:id(2),order_id:id(3),status:'Draft',notes:'PO revised offline'},
   lines:[{description:'Fabric revised',qty:5,unit_rate:2.5,sort_order:0}]})
  const revised=await submitPendingMutations(folder,{...owner,async submit(operations){
   return (await send(operations)).body.results
  }})
  assert.equal(revised.archived,1)
  await applyCloudSnapshot({directory:folder,tables:await pull()})
  assert.equal((await listCombinedRecords(folder,'purchase_order_items')).find(row=>row.po_id===approvedId).amount,12.5)
  await mutateLocalRecord(folder,{...owner,action:'update',table:'purchase_orders',id:approvedId,fields:{status:'approved'}})
  assert.equal((await listCombinedRecords(folder,'purchase_orders')).find(row=>row.id===approvedId).status,'approved')
  const approval=await submitPendingMutations(folder,{...owner,async submit(operations){
   const accepted=(await send(operations)).body.results
   assert.equal(accepted[0].outcome,'applied')
   assert.equal((await send(operations)).body.results[0].outcome,'already-applied')
   return accepted
  }})
  assert.equal(approval.archived,1)
  await applyCloudSnapshot({directory:folder,tables:await pull()})
  assert.equal((await pull()).purchase_orders.find(row=>row.id===approvedId).status,'approved')
  await mutateLocalRecord(folder,{...owner,action:'update',table:'purchase_orders',id:approvedId,fields:{status:'draft'}})
  await db.query("update purchase_orders set status='Delivered' where id=$1",[approvedId])
  const conflict=await submitPendingMutations(folder,{...owner,async submit(operations){
   return (await send(operations)).body.results
  }})
  assert.equal(conflict.conflicts,1)
  assert.equal((await pull()).purchase_orders.find(row=>row.id===approvedId).status,'Delivered')
  assert.equal((await listCombinedRecords(folder,'purchase_orders')).find(row=>row.id===approvedId).status,'draft')


  await po({description:'Reject',qty:1,unit_rate:2,sort_order:0})
  const failed=await submitPendingMutations(folder,{...owner,async submit(operations){
   return (await send(operations)).body.results
  }})
  assert.equal(failed.conflicts,1)
  assert.equal((await pull()).purchase_orders.length,2)
  assert.equal((await db.query("select next_number from document_numbering where doc_type='po'")).rows[0].next_number,3)
 }finally{
  await db.close();fs.rmSync(folder,{recursive:true,force:true})
 }
})
