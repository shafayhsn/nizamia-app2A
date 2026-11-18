'use strict'
const {test}=require('node:test')
const assert=require('node:assert/strict')
const fs=require('node:fs'), path=require('node:path'), os=require('node:os')
const {PGlite}=require('@electric-sql/pglite')
const sqlite=require('../desktop/node_modules/sql.js')
const {applyCloudSnapshot}=require('../desktop/applyCloudSnapshot.cjs')
const {queueArea3Records,queueParcelInvoice,queueParcelTransition,submitPendingMutations,listCombinedRecords}=require('../desktop/standaloneRecords.cjs')
const {issueDesktopSyncToken}=require('./desktopSyncToken.cjs')
const {createDesktopMutationHttp}=require('./desktopMutationHttp.cjs')

test('Sampling, Approvals and Parcels survive reconnect and preserve concurrent changes',async()=>{
 const id=n=>'00000000-0000-4000-8000-'+String(n).padStart(12,'0')
 const owner={ownerId:id(1),isCurrent:()=>true},key='area3-fixture-signing-key'
 const db=new PGlite(), directory=fs.mkdtempSync(path.join(os.tmpdir(),'area3-sync-'))
 try{
  await db.exec(`
   create role anon; create role authenticated; create role service_role;
   create table users(id uuid primary key,role text,is_active boolean,is_restricted boolean);
   create table orders(id uuid primary key,step_sampling boolean,buyer_id uuid);
   create table buyers(id uuid primary key,name text,contact_person text);
   create table buyer_addresses(id uuid primary key,buyer_id uuid,recipient text,label text,address_line1 text,address_line2 text,city text,region text,postal_code text,country text,phone text,email text);
   create table buyer_contacts(id uuid primary key,buyer_id uuid,name text,phone text,email text);
   create table parcel_invoice_snapshots(parcel_id text primary key,buyer_id uuid,address_id uuid,contact_id uuid,consignee jsonb);
   create table size_groups(id uuid primary key,order_id uuid);
   create table samples(id uuid primary key,order_id uuid,sample_number text unique,sample_type text,size_group_id uuid,
    parent_sample_id uuid,root_sample_id uuid,version_no int,version_label text,stage text,due_date date,
    approval_status text,dispatch_status text,last_comment_at timestamptz,last_comment_by text);
   create table sample_comments(id uuid primary key,sample_id uuid,root_sample_id uuid,sam_number text,version_label text,
    comment_type text,comment_text text,comment_by text,comment_date timestamptz,is_internal boolean,meta jsonb,
    created_at timestamptz default now());
   create table sample_logs(sample_id uuid,root_sample_id uuid);
   create table parcels(id text primary key,status text,dispatch_date date,courier text,tracking_no text,notes text,items jsonb,
    custom_items jsonb,tracking_url text,updated_at timestamptz,dispatched_at timestamptz,delivered_at timestamptz,received_by text);
   create table parcel_status_history(id uuid default gen_random_uuid(),parcel_id text,old_status text,new_status text,note text);
   create table counters(key text primary key,value int);
   insert into users values ('${id(1)}','admin',true,false);
   insert into orders values ('${id(2)}',false,'${id(4)}');
   insert into buyers(id,name) values ('${id(4)}','Buyer');
   insert into buyer_addresses(id,buyer_id,recipient) values ('${id(5)}','${id(4)}','Recipient');
   insert into size_groups values ('${id(3)}','${id(2)}');
   insert into parcels(id,status,items,custom_items) values ('parcel-1','Draft','[]','[]'), ('parcel-2','Draft','[]','[]');
   grant select,insert,update,delete on all tables in schema public to service_role;
  `)
  for(const name of ['parcel_transition','sampling_parcels'])
   await db.exec(fs.readFileSync(path.join(__dirname,'migrations/20261118_desktop_'+name+'.sql'),'utf8'))
  await db.exec('set role service_role')
  const SQL=await sqlite(),local=new SQL.Database()
  fs.writeFileSync(path.join(directory,'nizamia-app2a.sqlite'),Buffer.from(local.export()))
  local.close()
  const pull=async()=>Object.fromEntries(await Promise.all(['orders','size_groups','samples','sample_comments','parcels','parcel_status_history','parcel_invoice_snapshots','buyers','buyer_addresses','buyer_contacts'].map(async table=>[
   table,(await db.query('select to_jsonb(t) as row from '+table+' t')).rows.map(x=>x.row)
  ])))
  const refresh=async()=>applyCloudSnapshot({directory,tables:await pull()})
  const endpoint=createDesktopMutationHttp({key,db:{async rpc(name,a){
   const area3=name==='desktop_change_sampling_parcel'
   const args=area3?[a.actor,a.operation,a.kind,a.verb,a.target,JSON.stringify(a.patch),JSON.stringify(a.expected)]:
    [a.actor,a.operation,a.target_parcel,JSON.stringify(a.payload)]
   const placeholders=area3?'$1,$2,$3,$4,$5,$6::jsonb,$7::jsonb':'$1,$2,$3,$4::jsonb'
   assert.ok(area3||name==='desktop_transition_parcel')
   return {data:(await db.query('select '+name+'('+placeholders+') as outcome',args)).rows[0].outcome}
  }}})
  const send=operations=>endpoint({method:'POST',headers:{authorization:'Bearer '+issueDesktopSyncToken(key,id(1))},body:{operations}})
  const flush=()=>submitPendingMutations(directory,{...owner,async submit(operations){
   const results=(await send(operations)).body.results
   const replay=(await send(operations)).body.results
   assert.deepEqual(replay.map(r=>r.outcome),results.map(r=>r.outcome==='applied'?'already-applied':r.outcome))
   return results
  }})
  const read=table=>listCombinedRecords(directory,table)
  const queue=(table,action,rows,ids)=>queueArea3Records(directory,{...owner,table,action,rows,ids})
  await refresh()
  const [sample]=await queue('samples','create',[{order_id:id(2),size_group_id:id(3),sample_type:'Fit',stage:'Ready'}])
  const [comment]=await queue('sample_comments','create',[{sample_id:sample.id,comment_type:'Revision',comment_date:'2026-01-01T12:00:00Z',comment_text:'Check fit'}])
  assert.match((await read('samples'))[0].sample_number,/^OFFLINE-/)
  assert.equal((await pull()).samples.length,0)
  assert.equal((await flush()).archived,1)
  assert.equal((await flush()).archived,1)
  await refresh()
  const [saved]=await read('samples')
  assert.equal(saved.id,sample.id)
  assert.match(saved.sample_number,/^SAM-/)
  assert.equal(saved.approval_status,'Revision Required')
  assert.equal((await read('orders'))[0].step_sampling,true)
  assert.equal((await read('sample_comments'))[0].sam_number,saved.sample_number)
  await queue('sample_comments','update',[{comment_type:'Approval',comment_text:'Fit approved'}],[comment.id])
  await queue('samples','create',[{order_id:id(2),sample_type:'Fit',parent_sample_id:saved.id}])
  assert.equal((await flush()).archived,2)
  await refresh()
  assert.equal((await pull()).samples.find(s=>s.id===saved.id).approval_status,'Approved')
  assert.equal((await pull()).samples.find(s=>s.parent_sample_id===saved.id).sample_number,saved.sample_number+'-V2')
  await queue('samples','update',[{due_date:'2026-01-06'}],[saved.id])
  await db.query('update samples set due_date=$1 where id=$2',['2026-01-07',saved.id])
  assert.equal((await flush()).conflicts,1)
  await refresh()
  assert.equal((await read('samples')).find(s=>s.id===saved.id).due_date,'2026-01-06')
  assert.equal((await pull()).samples.find(s=>s.id===saved.id).due_date,'2026-01-07')
  const revision=(await pull()).samples.find(s=>s.parent_sample_id===saved.id)
  await queueParcelTransition(directory,{...owner,id:'parcel-1',status:'Dispatched',details:{
   courier:'Fixture courier',tracking_no:'Fixture tracking',dispatch_date:'2026-01-02',items:[{sampleId:revision.id}]
  }})
  assert.equal((await read('parcels')).find(p=>p.id==='parcel-1').status,'Dispatched')
  assert.equal((await pull()).parcels.find(p=>p.id==='parcel-1').status,'Draft')
  assert.equal((await flush()).archived,1)
  await refresh()
  assert.equal((await pull()).parcels.find(p=>p.id==='parcel-1').tracking_no,'Fixture tracking')
  await queue('parcels','update',[{status:'In-Transit'}],['parcel-1'])
  await queue('parcels','delete',[],['parcel-2'])
  assert.equal((await flush()).archived,2)
  await refresh()
  assert.equal((await read('parcels')).length,1)
  await queueParcelTransition(directory,{...owner,id:'parcel-1',status:'Delivered',deliveryDate:'2026-01-03',receivedBy:'Receiver'})
  assert.equal((await flush()).archived,1)
  await refresh()
  const final=await pull()
  assert.equal(final.samples.find(s=>s.id===revision.id).dispatch_status,'Delivered')
  assert.equal(final.parcels[0].received_by,'Receiver')
  assert.equal(final.parcel_status_history.length,3)
  const invoice=await queueParcelInvoice(directory,{...owner,parcelId:'parcel-1',addressId:id(5)})
  assert.equal(invoice.consignee.name,'Recipient')
  assert.equal((await pull()).parcel_invoice_snapshots.length,0)
  assert.equal((await flush()).archived,1)
  await refresh()
  assert.equal((await read('parcel_invoice_snapshots')).length,1)
  assert.equal((await read('parcel_invoice_snapshots'))[0].consignee.name,'Recipient')
 }finally{
  await db.close()
  fs.rmSync(directory,{force:true,recursive:true})
 }
})
