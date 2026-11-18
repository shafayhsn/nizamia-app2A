'use strict'
const {test}=require('node:test')
const assert=require('node:assert/strict')
const fs=require('node:fs'),os=require('node:os'),path=require('node:path')
const {PGlite}=require('@electric-sql/pglite')
const sqlite=require('../desktop/node_modules/sql.js')
const {queueOrderCopy,submitPendingMutations,listCombinedRecords}=require('../desktop/standaloneRecords.cjs')
const {applyCloudSnapshot}=require('../desktop/applyCloudSnapshot.cjs')
const {createDesktopMutationHttp}=require('./desktopMutationHttp.cjs')
const {issueDesktopSyncToken}=require('./desktopSyncToken.cjs')

test('copies linked sections to an empty destination with remapped references and replay protection',async()=>{
 const ownerId='00000000-0000-4000-8000-000000000001'
 const db=new PGlite(),directory=fs.mkdtempSync(path.join(os.tmpdir(),'app2a-order-copy-'))
 try{
  await db.exec(`
   create role anon; create role authenticated; create role service_role;
   create schema desktop_private; grant usage on schema desktop_private to service_role;
   create table users(id uuid primary key,role text,is_active bool,is_restricted bool);
   create table orders(id uuid primary key,buyer_id uuid,style_number text,step_bom bool,step_sampling bool,step_washing bool,step_finishing bool);
   create table bom_items(id uuid primary key,order_id uuid,name text);
   create table samples(id uuid primary key,order_id uuid,size_group_id uuid,sample_number text unique,root_sample_id uuid);
   create table size_groups(id uuid primary key,order_id uuid,group_name text);
   create table size_group_colors(id uuid primary key,size_group_id uuid,color_name text);
   create table order_queues(id uuid primary key,order_id uuid,q_number text,label text,sort_order int,qty int);
   create table washing(id uuid primary key,order_id uuid,color_id uuid,wash_type text);
   create table finishing(id uuid primary key,order_id uuid);
   create table finishing_packs(id uuid primary key,order_id uuid,finishing_id uuid,pack_type text,config jsonb);
   create table counters(key text primary key,value int);
   grant select,insert,update,delete on all tables in schema public to service_role;
   insert into users values('${ownerId}','admin',true,false);
  `)
  await db.exec(fs.readFileSync(path.join(__dirname,'migrations/20261118_desktop_order_section_copy.sql'),'utf8'))
  await db.exec('set role service_role')
  const SQL=await sqlite(),local=new SQL.Database()
  fs.writeFileSync(path.join(directory,'nizamia-app2a.sqlite'),Buffer.from(local.export()))
  local.close()
  const names=['orders','bom_items','samples','size_groups','size_group_colors','order_queues','washing','finishing','finishing_packs']
  const pull=async()=>Object.fromEntries(await Promise.all(names.map(async name=>
   [name,(await db.query('select to_jsonb(t) as row from '+name+' t')).rows.map(row=>row.row)])))
  const refresh=async()=>applyCloudSnapshot({directory,tables:await pull()})
  const owner={ownerId,isCurrent:()=>true},key='fixture-copy-signer'
  const handle=createDesktopMutationHttp({key,db:{async rpc(name,args){
   assert.equal(name,'desktop_copy_order_sections')
   return {data:(await db.query('select desktop_copy_order_sections($1,$2,$3,$4,$5::jsonb) as outcome',
    [args.actor,args.operation,args.source_order,args.target_order,JSON.stringify(args.sections)])).rows[0].outcome}
  }}})
  const send=operations=>handle({method:'POST',headers:{authorization:'Bearer '+issueDesktopSyncToken(key,ownerId)},body:{operations}})
  const flush=async()=>submitPendingMutations(directory,{...owner,async submit(operations){
   const response=(await send(operations)).body.results
   assert.equal(response[0].outcome,'applied')
   assert.equal((await send(operations)).body.results[0].outcome,'already-applied')
   return response
  }})
  const seed=async name=>{const result=await db.query('select gen_random_uuid() as id');return [name,result.rows[0].id]}
  const keys=Object.fromEntries(await Promise.all(['source','target','race','buyer','group1','group2','color1','color2'].map(seed)))
  for(const id of [keys.source,keys.target,keys.race])await db.query("insert into orders(id,buyer_id,style_number) values($1,$2,'Style A')",[id,keys.buyer])
  await db.query("insert into size_groups values($1,$2,'Adult'),($3,$4,'Adult')",[keys.group1,keys.source,keys.group2,keys.target])
  await db.query("insert into size_group_colors values($1,$2,'Blue'),($3,$4,'Blue')",[keys.color1,keys.group1,keys.color2,keys.group2])
  await db.query("insert into samples(id,order_id,size_group_id,sample_number) values(gen_random_uuid(),$1,$2,'SOURCE-SAMPLE')",[keys.source,keys.group1])
  await db.query("insert into washing values(gen_random_uuid(),$1,$2,'Stone wash')",[keys.source,keys.color1])
  await db.query("insert into bom_items values(gen_random_uuid(),$1,'Denim')",[keys.source])
  const sourceQueue=await db.query("insert into order_queues values(gen_random_uuid(),$1,'Q-1','Adults',0,6) returning id",[keys.source])
  const targetQueue=await db.query("insert into order_queues values(gen_random_uuid(),$1,'Q-2','Adults',0,6) returning id",[keys.target])
  const header=await db.query('insert into finishing values(gen_random_uuid(),$1) returning id',[keys.source])
  await db.query("insert into finishing_packs values(gen_random_uuid(),$1,$2,'By Q#',$3::jsonb)",
   [keys.source,header.rows[0].id,JSON.stringify({lines:[{key:sourceQueue.rows[0].id,qty:6}]})])
  await refresh()
  const [copy]=await queueOrderCopy(directory,{...owner,sourceId:keys.source,targetIds:[keys.target],sections:['bom_items','samples','washing','finishing']})
  assert.equal(copy.copied.length,4)
  const cached=(await listCombinedRecords(directory,'samples')).find(row=>row.order_id===keys.target)
  assert.match(cached.sample_number,/^OFFLINE-/)
  assert.equal(cached.size_group_id,keys.group2)
  assert.equal((await flush()).archived,1)
  await refresh()
  const data=await pull()
  assert.match(data.samples.find(row=>row.id===cached.id).sample_number,/^SAM-/)
  assert.equal(data.washing.find(row=>row.order_id===keys.target).color_id,keys.color2)
  assert.equal(data.finishing_packs.find(row=>row.order_id===keys.target).config.lines[0].key,targetQueue.rows[0].id)
  assert.equal((await listCombinedRecords(directory,'samples')).filter(row=>row.id===cached.id).length,1)
  const [skip]=await queueOrderCopy(directory,{...owner,sourceId:keys.source,targetIds:[keys.target],sections:['bom_items']})
  assert.deepEqual(skip.skipped,['bom_items'])
  await queueOrderCopy(directory,{...owner,sourceId:keys.source,targetIds:[keys.race],sections:['bom_items']})
  await db.query("insert into bom_items values(gen_random_uuid(),$1,'Concurrent BOM')",[keys.race])
  const race=await submitPendingMutations(directory,{...owner,async submit(operations){
   return (await send(operations)).body.results
  }})
  assert.equal(race.conflicts,1)
  assert.deepEqual((await pull()).bom_items.filter(row=>row.order_id===keys.race).map(row=>row.name),['Concurrent BOM'])
 }finally{
  await db.close()
  fs.rmSync(directory,{recursive:true,force:true})
 }
})
