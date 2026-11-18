'use strict'
const {test}=require('node:test')
const assert=require('node:assert/strict')
const fs=require('node:fs'),os=require('node:os'),path=require('node:path')
const {PGlite}=require('@electric-sql/pglite')
const sqlite=require('../desktop/node_modules/sql.js')
const {queuePurchasingDocument,mutateLocalRecord,submitPendingMutations,listCombinedRecords}=require('../desktop/standaloneRecords.cjs')
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
   create table purchase_orders(id uuid primary key,po_number text unique not null,order_id uuid,supplier_id uuid,po_date date,delivery_date date,currency text,payment_terms text,status text,notes text);
   create table purchase_order_items(id uuid primary key default gen_random_uuid(),po_id uuid references purchase_orders(id),
    description text not null check(description<>'Reject'),specification text,qty numeric,unit text,unit_rate numeric,amount numeric,sort_order int,source_type text,source_id uuid);
   create table work_orders(id uuid primary key,wo_number text unique not null,order_id uuid,vendor_id uuid,vendor_type text,vendor_phone text,factory_ref text,issue_date date,start_date date,complete_by date,daily_output int,payment_terms text,color text,qty int,status text,notes text);
   create table work_order_items(id uuid primary key default gen_random_uuid(),wo_id uuid references work_orders(id),
    order_process_id uuid,process_name text not null,dept_info text,qty numeric,unit text,rate numeric,amount numeric,sort_order int);
   insert into users values ('${id(1)}','admin',true,false);
   insert into suppliers values ('${id(2)}');
   insert into orders values ('${id(3)}');
   insert into order_processes values ('${id(4)}','${id(3)}');
   insert into document_numbering values ('po','NZP',1,1,null,'{PREFIX}-{SEQ}',3,true,null),
    ('wo','NZW',1,1,null,'{PREFIX}-{SEQ}',3,true,null);
   insert into purchase_orders(id,po_number) values ('${id(5)}','NZP-001');
   grant select,insert,update on all tables in schema public to service_role;
  `)
  await db.exec(fs.readFileSync(path.join(__dirname,'migrations/20261118_desktop_purchasing_create.sql'),'utf8'))
  await db.exec(fs.readFileSync(path.join(__dirname,'migrations/20261118_desktop_purchase_approval.sql'),'utf8'))
  await db.exec('set role service_role')
  const sql=await sqlite(),dbLocal=new sql.Database()
  fs.writeFileSync(path.join(folder,'nizamia-app2a.sqlite'),Buffer.from(dbLocal.export()))
  dbLocal.close()
  const owner={ownerId:id(1),isCurrent:()=>true},key='fixture-purchase-signer'
  const endpoint=createDesktopMutationHttp({key,db:{async rpc(name,args){
   if(name==='desktop_update_purchase_approval')return {data:(await db.query(
    'select desktop_update_purchase_approval($1,$2,$3,$4,$5) as result',
    [args.actor,args.operation,args.target_purchase_order,args.previous_status,args.new_status])).rows[0].result}
   assert.equal(name,'desktop_create_purchasing_document')
   return {data:(await db.query('select desktop_create_purchasing_document($1,$2,$3,$4::jsonb,$5::jsonb) as result',
    [args.actor,args.operation,args.kind,JSON.stringify(args.header),JSON.stringify(args.lines)])).rows[0].result}
  }}})
  const send=operations=>endpoint({method:'POST',headers:{authorization:'Bearer '+issueDesktopSyncToken(key,id(1))},body:{operations}})
  const po=fields=>queuePurchasingDocument(folder,{...owner,table:'purchase_orders',
   fields:{supplier_id:id(2),order_id:id(3),status:'Draft'},lines:[fields]})
  const saved=await po({description:'Fabric',qty:4,unit_rate:2.5,sort_order:0})
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
  const pull=async()=>Object.fromEntries(await Promise.all(['purchase_orders','purchase_order_items','work_orders','work_order_items'].map(async table=>[
   table,(await db.query('select to_jsonb(t) as row from '+table+' t')).rows.map(r=>r.row)
  ])))
  const tables=await pull()
  assert.ok(tables.purchase_orders.some(x=>x.po_number==='NZP-002'))
  assert.equal(tables.purchase_order_items[0].amount,10)
  assert.equal(tables.work_orders[0].wo_number,'NZW-001')
  await applyCloudSnapshot({directory:folder,tables})
  assert.equal((await listCombinedRecords(folder,'purchase_order_items')).length,1)
  assert.equal((await listCombinedRecords(folder,'work_orders')).length,1)
  const approvedId=tables.purchase_orders.find(row=>row.po_number==='NZP-002').id
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
