'use strict'
const {test}=require('node:test')
const assert=require('node:assert/strict')
const fs=require('node:fs'), path=require('node:path'), os=require('node:os')
const {PGlite}=require('@electric-sql/pglite')
const sqlite=require('../desktop/node_modules/sql.js')
const {applyCloudSnapshot}=require('../desktop/applyCloudSnapshot.cjs')
const {queueTasksLibrary,submitPendingMutations,listCombinedRecords}=require('../desktop/standaloneRecords.cjs')
const {issueDesktopSyncToken}=require('./desktopSyncToken.cjs')
const {createDesktopMutationHttp}=require('./desktopMutationHttp.cjs')

test('Tasks and Library preserve assignments, links and complete offline edits on reconnect',async()=>{
 const fixtureId=n=>'00000000-0000-4000-8000-'+String(n).padStart(12,'0')
 const admin=fixtureId(1),other=fixtureId(2),buyer=fixtureId(3),oldTrim=fixtureId(4)
 const owner={ownerId:admin,isCurrent:()=>true},key='fixture-tasks-library-signing-key'
 const db=new PGlite(), directory=fs.mkdtempSync(path.join(os.tmpdir(),'tasks-library-sync-test-'))
 try{
  await db.exec(`
   create role anon; create role authenticated; create role service_role;
   create table users(id uuid primary key,role text,is_active boolean,is_restricted boolean,username text,password_hash text);
   create table buyers(id uuid primary key,name text);
   create table app_tasks(id uuid primary key,title text not null,assignee_id uuid references users,created_by uuid not null references users,
    due_date date not null,priority text default 'Normal',status text default 'Pending',description text default '',
    related_record text default '',completed_at timestamptz,created_at timestamptz default now());
   create table app_task_comments(id uuid primary key,task_id uuid references app_tasks,user_id uuid references users,
    body text,created_at timestamptz default now());
   create table library_items(id uuid primary key,name text,category text,unit text,notes text,default_wastage numeric,
    updated_at timestamptz default now(),created_at timestamptz default now());
   create table size_group_templates(id uuid primary key,name text,sizes text[],buyer_id uuid references buyers,
    buyer_name text,base_size text,created_at timestamptz default now());
   create table bom_presets(id uuid primary key,name text,buyer_id uuid references buyers,description text,created_at timestamptz default now());
   create table bom_preset_items(id uuid primary key,preset_id uuid references bom_presets on delete cascade,
    library_item_id uuid references library_items,notes text,wastage numeric);
   insert into users values ('${admin}','admin',true,false,'Admin','Fixture password'),
    ('${other}','merchandiser',true,false,'Assignee','Fixture password');
   insert into buyers values ('${buyer}','Fixture buyer');
   insert into library_items(id,name,unit,category) values ('${oldTrim}','Fixture packing trim','pcs','Packing Trim');
   grant select,insert,update,delete on all tables in schema public to service_role;
  `)
  await db.exec(fs.readFileSync(path.join(__dirname,'migrations/20261118_desktop_tasks_library.sql'),'utf8'))
  assert.equal((await db.query("select has_function_privilege('authenticated','public.desktop_change_tasks_library(uuid,uuid,text,uuid,text,jsonb,jsonb)','execute') as allowed")).rows[0].allowed,false)
  await db.exec('set role service_role')
  const SQL=await sqlite(),local=new SQL.Database()
  fs.writeFileSync(path.join(directory,'nizamia-app2a.sqlite'),Buffer.from(local.export()))
  local.close()
  const pull=async()=>{
   const tables=Object.fromEntries(await Promise.all(['buyers','app_tasks','app_task_comments','library_items','size_group_templates','bom_presets','bom_preset_items'].map(async table=>[
    table,(await db.query('select to_jsonb(t) as row from '+table+' t')).rows.map(r=>r.row)
   ])))
   tables.task_people=(await db.query('select id,username,is_active from users where is_active and is_restricted is not true')).rows
   return tables
  }
  const refresh=async()=>applyCloudSnapshot({directory,tables:await pull()})
  const endpoint=createDesktopMutationHttp({key,db:{async rpc(name,a){
   assert.equal(name,'desktop_change_tasks_library')
   const {rows}=await db.query('select desktop_change_tasks_library($1,$2,$3,$4,$5,$6::jsonb,$7::jsonb) as outcome',
    [a.actor,a.operation,a.kind,a.target,a.verb,JSON.stringify(a.patch),JSON.stringify(a.expected)])
   return {data:rows[0].outcome}
  }}})
  const send=(operations,user=admin)=>endpoint({method:'POST',headers:{authorization:'Bearer '+issueDesktopSyncToken(key,user)},body:{operations}})
  const flush=()=>submitPendingMutations(directory,{...owner,async submit(operations){
   const results=(await send(operations)).body.results
   assert.deepEqual((await send(operations)).body.results.map(r=>r.outcome),results.map(r=>r.outcome==='applied'?'already-applied':r.outcome))
   assert.ok(!results.some(r=>r.outcome==='retry'),JSON.stringify(results))
   return results
  }})
  const read=table=>listCombinedRecords(directory,table)
  const queue=(table,action,fields,id)=>queueTasksLibrary(directory,{...owner,table,action,id,fields})
  await refresh()
  const people=await read('task_people')
  assert.ok(people.some(person=>person.id===other))
  assert.ok(people.every(person=>!Object.hasOwn(person,'password_hash')))
  await assert.rejects(()=>read('users'),/Unsupported offline/)
  const task=await queue('app_tasks','create',{title:'Fit review',assignee_id:other,created_by:other,due_date:'2026-11-23',
   priority:'High',related_record:'NZ-2605 / Fit sample'})
  assert.equal(task.created_by,admin)
  await queue('app_tasks','update',{status:'In Progress',completed_at:null},task.id)
  await queue('app_tasks','update',{status:'Completed',completed_at:'2026-11-23T11:58:30.000Z'},task.id)
  await queue('app_task_comments','create',{task_id:task.id,user_id:other,body:'Fit confirmed'})
  const trim=await queue('library_items','create',{name:'Fixture stitch trim',category:'Stitching Trim',unit:'pcs',default_wastage:'2'})
  const group=await queue('size_group_templates','create',{name:'Fixture size group',sizes:['M','L'],base_size:'M',buyer_id:buyer,buyer_name:'Fixture buyer'})
  await queue('size_group_templates','update',{sizes:['M','L','XL'],base_size:'L'},group.id)
  const pack=await queue('bom_presets','create',{name:'Fixture package',buyer_id:buyer,members:[oldTrim,trim.id]})
  assert.equal((await read('app_tasks'))[0].status,'Completed')
  assert.equal((await read('app_task_comments'))[0].body,'Fit confirmed')
  assert.equal((await read('bom_preset_items')).length,2)
  assert.equal((await pull()).app_tasks.length,0)
  const offlineFailure=await submitPendingMutations(directory,{...owner,async submit(){throw Error('Connection lost')}}).catch(err=>err.message)
  assert.equal(offlineFailure,'Connection lost')
  assert.equal((await flush()).archived,3)
  assert.equal((await flush()).archived,3)
  assert.equal((await flush()).archived,1)
  assert.equal((await flush()).archived,1)
  await refresh()
  const cloud=await pull()
  assert.deepEqual(cloud.app_tasks.map(r=>[r.id,r.status,r.created_by,r.assignee_id,r.related_record]),[[task.id,'Completed',admin,other,'NZ-2605 / Fit sample']])
  assert.equal(cloud.app_task_comments[0].user_id,admin)
  assert.equal((await read('app_tasks'))[0]._local_only,false)
  assert.equal((await read('app_task_comments'))[0]._local_only,false)
  assert.deepEqual((await read('size_group_templates'))[0].sizes,['M','L','XL'])
  assert.equal(cloud.bom_preset_items.length,2)
  const retained=cloud.bom_preset_items.find(row=>row.library_item_id===trim.id)
  await db.query("update bom_preset_items set notes='Cloud notes' where id=$1",[retained.id])
  await queue('bom_presets','update',{name:'Local package edit',buyer_id:buyer,members:[trim.id]},pack.id)
  assert.equal((await flush()).conflicts,1)
  await refresh()
  assert.equal((await pull()).bom_presets[0].name,'Fixture package')
  assert.equal((await read('bom_presets'))[0].name,'Local package edit')
  assert.equal((await pull()).bom_preset_items.length,2)
  const healthy=await queue('bom_presets','create',{name:'Second fixture package',buyer_id:buyer,members:[oldTrim,trim.id]})
  assert.equal((await flush()).archived,1)
  await refresh()
  const secondRetained=(await pull()).bom_preset_items.find(row=>row.preset_id===healthy.id&&row.library_item_id===trim.id)
  await db.query("update bom_preset_items set notes='Keep this trace' where id=$1",[secondRetained.id])
  await refresh()
  await queue('bom_presets','update',{name:'Edited package',buyer_id:buyer,members:[trim.id]},healthy.id)
  assert.equal((await flush()).archived,1)
  await refresh()
  assert.equal((await read('bom_preset_items')).find(row=>row.id===secondRetained.id).notes,'Keep this trace')
  assert.equal((await read('bom_preset_items')).filter(row=>row.preset_id===healthy.id).length,1)
  await queue('bom_presets','delete',undefined,healthy.id)
  await queue('size_group_templates','update',{is_active:false},group.id)
  await queue('library_items','update',{is_active:false},trim.id)
  assert.equal((await flush()).archived,3)
  await db.query("update app_tasks set title='New title from web' where id=$1",[task.id])
  await refresh()
  assert.equal((await read('app_tasks'))[0].title,'New title from web')
  assert.equal((await read('library_items')).find(row=>row.id===trim.id).is_active,false)
  assert.equal((await read('size_group_templates'))[0].is_active,false)
  assert.ok(!(await read('bom_presets')).some(row=>row.id===healthy.id))
  const draft=await queue('bom_presets','create',{name:'Offline package draft',buyer_id:buyer,members:[oldTrim]})
  await queue('bom_presets','update',{name:'Offline revised package',buyer_id:buyer,members:[oldTrim]},draft.id)
  assert.equal((await read('bom_presets')).find(row=>row.id===draft.id).name,'Offline revised package')
  await queue('bom_presets','delete',undefined,draft.id)
  assert.ok(!(await read('bom_presets')).some(row=>row.id===draft.id))
  assert.equal((await flush()).archived,1)
  assert.equal((await flush()).archived,1)
  assert.equal((await flush()).archived,1)
  await refresh()
  assert.ok(!(await read('bom_presets')).some(row=>row.id===draft.id))
  assert.ok(!(await read('bom_preset_items')).some(row=>row.preset_id===draft.id))
  const unauthorised=(await send([{operationId:fixtureId(66),intent:{operation:'create',table:'app_task_comments',
   id:fixtureId(67),fields:{area4:{task_id:task.id,body:'Forbidden'}}}}],other)).body.results
  assert.equal(unauthorised[0].outcome,'unauthorized')
 }finally{
  await db.close()
  fs.rmSync(directory,{force:true,recursive:true})
 }
})
