'use strict'
const {test}=require('node:test')
const assert=require('node:assert/strict')
const fs=require('node:fs'),os=require('node:os'),path=require('node:path')
const {PGlite}=require('@electric-sql/pglite')
const sqlite=require('../desktop/node_modules/sql.js')
const {queueBuyer,submitPendingMutations,listCombinedRecords}=require('../desktop/standaloneRecords.cjs')
const {applyCloudSnapshot}=require('../desktop/applyCloudSnapshot.cjs')
const {createDesktopMutationHttp}=require('./desktopMutationHttp.cjs')
const {issueDesktopSyncToken}=require('./desktopSyncToken.cjs')

test('buyer profile, addresses and contacts save atomically and retain conflicting edits',async()=>{
 const ownerId='00000000-0000-4000-8000-000000000001'
 const db=new PGlite(),directory=fs.mkdtempSync(path.join(os.tmpdir(),'app2a-buyer-'))
 try{
  await db.exec(`
   create role anon; create role authenticated; create role service_role;
   create schema desktop_private; grant usage on schema desktop_private to service_role;
   create table users(id uuid primary key,role text,is_active bool,is_restricted bool);
   create table buyers(id uuid primary key,name text not null,contact_person text,email text,phone text,address text,country text,
    currency text,default_incoterms text,default_ship_mode text,notes text,is_active bool,payment_terms_days int,updated_at timestamptz);
   create table buyer_addresses(id uuid primary key,buyer_id uuid references buyers(id),label text,recipient text,address_line1 text,
    address_line2 text,city text,region text,postal_code text,country text,phone text,email text,is_default bool);
   create table buyer_contacts(id uuid primary key,buyer_id uuid references buyers(id),name text,designation text,department text,
    phone text,email text,is_default bool);
   create unique index on buyer_addresses(buyer_id) where is_default;
   create unique index on buyer_contacts(buyer_id) where is_default;
   grant select,insert,update,delete on all tables in schema public to service_role;
   insert into users values('${ownerId}','admin',true,false);
  `)
  await db.exec(fs.readFileSync(path.join(__dirname,'migrations/20261118_desktop_buyer.sql'),'utf8'))
  await db.exec('set role service_role')
  const SQL=await sqlite(),local=new SQL.Database()
  fs.writeFileSync(path.join(directory,'nizamia-app2a.sqlite'),Buffer.from(local.export()))
  local.close()
  const pull=async()=>Object.fromEntries(await Promise.all(['buyers','buyer_addresses','buyer_contacts'].map(async name=>
   [name,(await db.query('select to_jsonb(t) as row from '+name+' t')).rows.map(row=>row.row)])))
  const refresh=async()=>applyCloudSnapshot({directory,tables:await pull()})
  const owner={ownerId,isCurrent:()=>true},key='fixture-buyer-signer'
  const handle=createDesktopMutationHttp({key,db:{async rpc(name,args){
   assert.equal(name,'desktop_save_buyer')
   return {data:(await db.query('select desktop_save_buyer($1,$2,$3,$4::jsonb,$5::jsonb) as outcome',
    [args.actor,args.operation,args.target_buyer,JSON.stringify(args.patch),args.expected&&JSON.stringify(args.expected)])).rows[0].outcome}
  }}})
  const send=operations=>handle({method:'POST',headers:{authorization:'Bearer '+issueDesktopSyncToken(key,ownerId)},body:{operations}})
  const flush=async()=>submitPendingMutations(directory,{...owner,async submit(operations){
   const response=(await send(operations)).body.results
   assert.equal(response[0].outcome,'applied')
   assert.equal((await send(operations)).body.results[0].outcome,'already-applied')
   return response
  }})
  await refresh()
  await queueBuyer(directory,{...owner,fields:{name:'Buyer QA',payment_terms_days:30},
   addresses:[{address_line1:'Street 1',is_default:true}],contacts:[{name:'Contact QA',is_default:true}]})
  const draft=(await listCombinedRecords(directory,'buyers'))[0]
  assert.equal((await listCombinedRecords(directory,'buyer_contacts'))[0].buyer_id,draft.id)
  assert.equal((await flush()).archived,1)
  await refresh()
  const synced=await pull(),buyer=synced.buyers[0],address=synced.buyer_addresses[0]
  assert.equal((await listCombinedRecords(directory,'buyers')).length,1)
  assert.equal((await listCombinedRecords(directory,'buyer_contacts'))[0].buyer_id,buyer.id)
  await queueBuyer(directory,{...owner,buyerId:buyer.id,fields:{payment_terms_days:45},
   addresses:[{...address,is_default:false},{address_line1:'Street 2',is_default:true}],contacts:synced.buyer_contacts})
  assert.equal((await flush()).archived,1)
  await refresh()
  assert.equal((await pull()).buyer_addresses.find(row=>row.id===address.id).is_default,false)
  assert.equal((await pull()).buyers[0].payment_terms_days,45)
  await queueBuyer(directory,{...owner,buyerId:buyer.id,fields:{name:'Local buyer edit'},contacts:[]})
  await db.query("update buyer_contacts set name='Cloud contact' where buyer_id=$1",[buyer.id])
  const conflict=await submitPendingMutations(directory,{...owner,async submit(operations){
   return (await send(operations)).body.results
  }})
  assert.equal(conflict.conflicts,1)
  assert.equal((await pull()).buyers[0].name,'Buyer QA')
  assert.equal((await pull()).buyer_contacts[0].name,'Cloud contact')
  await refresh()
  assert.equal((await listCombinedRecords(directory,'buyers'))[0].name,'Local buyer edit')
 }finally{
  await db.close()
  fs.rmSync(directory,{recursive:true,force:true})
 }
})
