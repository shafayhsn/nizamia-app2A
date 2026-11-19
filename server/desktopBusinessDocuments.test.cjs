'use strict'
const {test}=require('node:test')
const assert=require('node:assert/strict')
const fs=require('node:fs'),os=require('node:os'),path=require('node:path')
const {randomUUID}=require('node:crypto')
const {PGlite}=require('@electric-sql/pglite')
const sqlite=require('../desktop/node_modules/sql.js')
const {applyCloudSnapshot}=require('../desktop/applyCloudSnapshot.cjs')
const {queueOperationalChange,submitPendingMutations,listCombinedRecords}=require('../desktop/standaloneRecords.cjs')
const {createDesktopMutationHttp}=require('./desktopMutationHttp.cjs')
const {issueDesktopSyncToken}=require('./desktopSyncToken.cjs')
test('offline tasks, trim packages, costings, invoices and meetings reconnect with linked records and revisions',async t=>{
 const directory=fs.mkdtempSync(path.join(os.tmpdir(),'desktop-documents-'))
 const db=new PGlite(),ownerId=randomUUID(),buyer=randomUUID(),order=randomUUID(),trim=randomUUID()
 t.after(async()=>{await db.close();fs.rmSync(directory,{recursive:true,force:true})})
 const owner={ownerId,isCurrent:()=>true}
 const file=name=>fs.readFileSync(path.join(__dirname,name),'utf8')
 await db.exec(`create role anon;create role authenticated;create role service_role;
 create table users(id uuid primary key,role text,is_active boolean,is_restricted boolean);
 create table orders(id uuid primary key);create table buyers(id uuid primary key);
 create table library_items(id uuid primary key,category text);
 create table bom_presets(id uuid primary key,buyer_id uuid,name text);
 create table bom_preset_items(id uuid primary key,preset_id uuid references bom_presets,library_item_id uuid references library_items);
 create table app_tasks(id uuid primary key,title text,created_by uuid,assignee_id uuid,status text,due_date date,created_at timestamptz default now());
 create table app_task_comments(id uuid primary key,task_id uuid references app_tasks,user_id uuid,body text,created_at timestamptz default now());
 create schema desktop_private;create table desktop_private.operational_receipts(operation_id uuid primary key,actor_id uuid,kind text,verb text,target uuid,payload jsonb,expected jsonb);
 insert into users values('${ownerId}','admin',true,false);insert into buyers values('${buyer}');insert into orders values('${order}');insert into library_items values('${trim}','Packing Trim');`)
 await db.exec(file('fixtures/desktopBusinessDocuments.sql'))
 for(const migration of ['catalog_records','business_documents'])await db.exec(file('migrations/20261119_desktop_'+migration+'.sql'))
 await db.exec('grant usage on schema desktop_private to service_role;grant select,insert on desktop_private.operational_receipts to service_role;grant select,insert,update,delete on all tables in schema public to service_role;grant usage on all sequences in schema public to service_role;set role service_role')
 const SQL=await sqlite(),local=new SQL.Database()
 fs.writeFileSync(path.join(directory,'nizamia-app2a.sqlite'),Buffer.from(local.export()));local.close()
 const names=['buyers','orders','library_items','bom_presets','bom_preset_items','app_tasks','app_task_comments','pp_meetings','costing_batches','costing_sheets','costing_sheet_versions','proforma_invoices','proforma_invoice_revisions']
 const refresh=async()=>{const tables={};for(const name of names)tables[name]=(await db.query('select to_jsonb(t) as r from '+name+' t')).rows.map(r=>r.r);await applyCloudSnapshot({directory,tables})}
 const handler=createDesktopMutationHttp({key:'testsecret',db:{async rpc(name,args){
  const values=['actor','operation','kind','verb','target','payload','expected'].map(k=>typeof args[k]==='object'?JSON.stringify(args[k]):args[k])
  return {data:(await db.query('select '+name+'($1,$2,$3,$4,$5,$6,$7) as result',values)).rows[0].result}
 }}})
 const send=async operations=>(await handler({method:'POST',headers:{authorization:'Bearer '+issueDesktopSyncToken('testsecret',ownerId)},body:{operations}})).body.results
 const flush=async()=>submitPendingMutations(directory,{...owner,submit:async ops=>{
  const first=await send(ops)
  assert.ok(first.every(r=>r.outcome==='applied'),JSON.stringify(first))
  assert.ok((await send(ops)).every(r=>r.outcome==='already-applied'))
  return first
 }})
 const change=(kind,input)=>queueOperationalChange(directory,{...owner,input:{action:'save',kind,...input}})
 const read=table=>listCombinedRecords(directory,table)
 await refresh()
 const task=await change('app_tasks',{fields:{title:'Inspection',assignee_id:ownerId,due_date:'2026-12-01'}})
 await change('app_task_comments',{fields:{task_id:task.id,body:'Check wash'}})
 const pkg=await change('trimPackage',{name:'Test trims',buyer_id:buyer,items:[trim]})
 const batch=await change('costing_batches',{fields:{name:'QA'}})
 const costing=await change('costing',{document:{type:'woven',style:'Test',customer:'QA'}})
 const snapshot={buyer:{id:buyer},form:{number:'Pending sync',terms:'FOB',shipmentDate:'2026-12-01',paymentTerms:'Net 60'},lines:[{job_number:'NZ-1',total_qty:5,total_value_usd:50}]}
 const pi=await change('proforma',{snapshot})
 const ppm=await change('meeting',{orderId:order})
 assert.equal((await read('costing_sheets'))[0].document.style,'Test')
 assert.equal((await read('bom_preset_items'))[0].preset_id,pkg.id)
 await flush();await flush();await refresh()
 const invoice=(await read('proforma_invoices'))[0]
 assert.match(invoice.pi_number,/^PI-NZ-1-/);assert.equal(invoice._local_only,false)
 assert.equal(invoice.snapshot.form.number,invoice.pi_number)
 assert.equal((await read('app_task_comments'))[0].user_id,ownerId)
 assert.match((await read('pp_meetings'))[0].ppm_number,/^PPM-/)
 await change('costing',{id:costing.id,expected_version:1,document:{customer:'Updated',type:'woven'}})
 await change('proforma',{id:pi.id,revision:1,status:'issued'})
 await change('pp_meetings',{id:ppm.id,fields:{status:'Completed',decision:'Ready for production'}})
 await change('trimPackage',{id:pkg.id,action:'delete'})
 await flush();await refresh()
 assert.equal((await read('costing_sheet_versions'))[0].document.customer,'QA')
 assert.equal((await read('proforma_invoice_revisions')).length,2)
 assert.equal((await read('bom_presets')).length,0)
 assert.equal((await read('pp_meetings'))[0].status,'Completed')
 await change('costingAssignment',{ids:[costing.id],batch_id:batch.id})
 await change('proforma',{id:pi.id,revision:2,status:'accepted',emailFrom:'qa@example.com',emailDate:'2026-11-19',emailReference:'QA'})
 await flush();await refresh()
 assert.equal((await read('costing_sheets'))[0].batch_id,batch.id)
 assert.equal((await read('proforma_invoices'))[0].status,'accepted')
 await db.query('update app_tasks set title=$1 where id=$2',['From cloud',task.id]);await refresh()
 assert.equal((await read('app_tasks'))[0].title,'From cloud')
})
