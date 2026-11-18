'use strict'
const {test}=require('node:test')
const assert=require('node:assert/strict')
const fs=require('node:fs'),path=require('node:path'),os=require('node:os')
const {PGlite}=require('@electric-sql/pglite')
const sqlite=require('../desktop/node_modules/sql.js')
const {applyCloudSnapshot}=require('../desktop/applyCloudSnapshot.cjs')
const {queueParcelCreate,queueParcelTransition,submitPendingMutations,listCombinedRecords}=require('../desktop/standaloneRecords.cjs')
const {createDesktopMutationHttp}=require('./desktopMutationHttp.cjs')
const {issueDesktopSyncToken}=require('./desktopSyncToken.cjs')

test('dispatch and delivery update a parcel, its samples and history in one transaction',async()=>{
 const id=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`
 const db=new PGlite()
 const directory=fs.mkdtempSync(path.join(os.tmpdir(),'app2a-parcel-sync-'))
 try{
  await db.exec(`
   create role anon;create role authenticated;create role service_role bypassrls;
   create table users(id uuid primary key,role text,is_active boolean,is_restricted boolean);
   create table samples(id uuid primary key,dispatch_status text,stage text,order_id uuid);
   create table parcels(id text primary key,status text,items jsonb,courier text,tracking_no text,
    dispatch_date date,updated_at timestamptz,dispatched_at timestamptz,delivered_at timestamptz,received_by text,custom_items jsonb);
   create table parcel_status_history(parcel_id text,old_status text,new_status text,note text check (note is distinct from 'Delivered on 2026-01-02 · Received by Reject'));
   create table buyers(id uuid primary key,name text,contact_person text);
   create table orders(id uuid primary key,buyer_id uuid);
   create table buyer_addresses(id uuid primary key,buyer_id uuid,recipient text,label text,address_line1 text,address_line2 text,city text,region text,postal_code text,country text,phone text,email text);
   create table buyer_contacts(id uuid primary key,buyer_id uuid,name text,phone text,email text);
   create table parcel_invoice_snapshots(parcel_id text primary key,buyer_id uuid,address_id uuid,contact_id uuid,consignee jsonb);
   create function public.allocate_parcel_number_2026() returns text language sql as 'select ''PAR-26-001''::text';
   insert into buyers(id,name) values ('${id(3)}','Fixture Buyer');
   insert into orders values ('${id(4)}','${id(3)}');
   insert into buyer_addresses(id,buyer_id,recipient) values ('${id(5)}','${id(3)}','Fixture Recipient');
   grant insert on public.parcels,public.parcel_invoice_snapshots to service_role;
   insert into users values ('${id(1)}','admin',true,false);
   insert into samples values ('${id(2)}','Ready','Ready','${id(4)}'),('${id(6)}','Ready','Ready','${id(4)}');
   insert into parcels values ('parcel-1','Draft','[{"sampleId":"${id(2)}"}]','Carrier','Tracking','2026-01-01',null,null,null,null,'[]');
   grant select,update on all tables in schema public to service_role;
   grant insert on public.parcel_status_history to service_role;
  `)
  await db.exec(fs.readFileSync(path.join(__dirname,'migrations/20261118_desktop_parcel_transition.sql'),'utf8'))
  await db.exec(fs.readFileSync(path.join(__dirname,'migrations/20261118_desktop_parcel_create.sql'),'utf8'))
  await db.exec('set role service_role')
  const sql=await sqlite(),local=new sql.Database()
  fs.writeFileSync(path.join(directory,'nizamia-app2a.sqlite'),Buffer.from(local.export()))
  local.close()
  const pull=async()=>Object.fromEntries(await Promise.all(['parcels','samples','orders','buyers','buyer_addresses','buyer_contacts','parcel_invoice_snapshots'].map(async table=>[
   table,(await db.query('select to_jsonb(t) as row from '+table+' t')).rows.map(r=>r.row)
  ])))
  const refresh=async()=>applyCloudSnapshot({directory,tables:await pull()})
  const owner={ownerId:id(1),isCurrent:()=>true}
  const key='fixture-parcel-signer'
  const endpoint=createDesktopMutationHttp({key,db:{async rpc(name,args){
   if(name==='desktop_create_parcel')return {data:(await db.query(
    'select desktop_create_parcel($1,$2,$3::jsonb) as result',
    [args.actor,args.operation,JSON.stringify(args.payload)])).rows[0].result}
   assert.equal(name,'desktop_transition_parcel')
   return {data:(await db.query('select desktop_transition_parcel($1,$2,$3,$4::jsonb) as result',
    [args.actor,args.operation,args.target_parcel,JSON.stringify(args.payload)])).rows[0].result}
  }}})
  const send=operations=>endpoint({method:'POST',headers:{authorization:'Bearer '+issueDesktopSyncToken(key,id(1))},body:{operations}})
  await refresh()
  await queueParcelTransition(directory,{...owner,id:'parcel-1',status:'Dispatched'})
  assert.equal((await listCombinedRecords(directory,'samples'))[0].dispatch_status,'Dispatched')
  assert.equal((await pull()).parcels[0].status,'Draft')
  const result=await submitPendingMutations(directory,{...owner,async submit(operations){
   const applied=(await send(operations)).body.results
   assert.equal(applied[0].outcome,'applied')
   assert.equal((await send(operations)).body.results[0].outcome,'already-applied')
   return applied
  }})
  assert.equal(result.archived,1)
  await refresh()
  assert.equal((await pull()).samples.find(row=>row.id===id(2)).dispatch_status,'Dispatched')
  await queueParcelTransition(directory,{...owner,id:'parcel-1',status:'Delivered',deliveryDate:'2026-01-02',receivedBy:'Reject'})
  const retry=await submitPendingMutations(directory,{...owner,async submit(operations){
   return (await send(operations)).body.results
  }})
  assert.equal(retry.retained,1)
  assert.equal((await pull()).parcels[0].status,'Dispatched')
  assert.equal((await pull()).samples.find(row=>row.id===id(2)).dispatch_status,'Dispatched')
  assert.equal((await listCombinedRecords(directory,'parcels'))[0].status,'Delivered')
  assert.equal((await db.query('select count(*)::int as count from parcel_status_history')).rows[0].count,1)
  const draft=await queueParcelCreate(directory,{...owner,items:[{sampleId:id(6),qty:1,unitValue:1}],
   customItems:[],addressId:id(5)})
  assert.ok(draft.id.startsWith('local-'))
  assert.equal((await listCombinedRecords(directory,'parcel_invoice_snapshots'))[0].parcel_id,draft.id)
  const create=await submitPendingMutations(directory,{...owner,async submit(operations){
   const result=(await send(operations)).body.results
   const created=result.find(x=>x.outcome==='applied')
   assert.equal(created.resourceId,'PAR-26-001')
   const replay=(await send(operations)).body.results.find(x=>x.operationId===created.operationId)
   assert.equal(replay.outcome,'already-applied')
   assert.equal(replay.resourceId,created.resourceId)
   return result
  }})
  assert.equal(create.archived,1)
  await refresh()
  const parcels=await listCombinedRecords(directory,'parcels')
  assert.ok(parcels.some(row=>row.id==='PAR-26-001'))
  assert.ok(!parcels.some(row=>row.id===draft.id))
  assert.equal((await listCombinedRecords(directory,'parcel_invoice_snapshots')).length,1)

 }finally{
  await db.close()
  fs.rmSync(directory,{recursive:true,force:true})
 }
})
