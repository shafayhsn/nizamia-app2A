'use strict'

// Test-only Electron entry point. It is intentionally omitted from the DMG.
const assert=require('node:assert/strict')
const crypto=require('node:crypto')
const fs=require('node:fs')
const os=require('node:os')
const path=require('node:path')
const {setTimeout:delay}=require('node:timers/promises')
const {app,BrowserWindow,dialog,safeStorage,net}=require('electron')
const {PGlite}=require('@electric-sql/pglite')
const {createDesktopMutationHttp}=require('../server/desktopMutationHttp.cjs')
const {issueDesktopSyncToken}=require('../server/desktopSyncToken.cjs')

assert.equal(process.platform,'darwin')
assert.equal(process.arch,'x64')
assert.equal(app.isPackaged,false)
const profile=fs.mkdtempSync(path.join(os.homedir(),'app2a-box2-ci-'))
app.setPath('userData',profile)
const db=new PGlite()
const [actor,buyer,source,target,material]=Array.from({length:5},()=>crypto.randomUUID())
const key=crypto.randomBytes(32)
const token=issueDesktopSyncToken(key,actor)
const snapshotToken=Buffer.from(JSON.stringify({
 id:actor,scope:'desktop-snapshot',exp:Date.now()+60*60*1000,
})).toString('base64url')+'.fixture'
const names=['orders','buyers','suppliers','size_groups','size_group_colors','order_queues','bom_items','samples','sample_comments','parcels','parcel_status_history']
let online=true
let uploads=0
let failure
const pdfPath=path.join(profile,'acceptance-print.pdf')
dialog.showSaveDialog=async()=>({canceled:false,filePath:pdfPath})
// The hosted runner has no unlocked user keychain. Encrypted tokens have separate tests.
safeStorage.isEncryptionAvailable=()=>false
net.isOnline=()=>online
dialog.showErrorBox=(title,message)=>{failure=Error(title+' '+message)}
dialog.showMessageBox=async(...args)=>{
 const details=args.at(-1)
 if(details.type==='warning')failure=Error(details.message)
 return {response:0}
}

const fixture=(async()=>{
 await db.exec(`
  create role anon; create role authenticated; create role service_role;
  create schema desktop_private; grant usage on schema desktop_private to service_role;
  create table users(id uuid primary key,role text,is_active bool,is_restricted bool);
  create table orders(id uuid primary key,buyer_id uuid,style_number text,step_bom boolean,step_sampling boolean);
  create table buyers(id uuid primary key,name text);
   create table buyer_addresses(id uuid primary key,buyer_id uuid,recipient text,label text,address_line1 text,address_line2 text,city text,region text,postal_code text,country text,phone text,email text);
   create table buyer_contacts(id uuid primary key,buyer_id uuid,name text,phone text,email text);
   create table parcel_invoice_snapshots(parcel_id text primary key,buyer_id uuid,address_id uuid,contact_id uuid,consignee jsonb);
  create table suppliers(id uuid primary key,name text);
  create table size_groups(id uuid primary key,order_id uuid,group_name text);
  create table size_group_colors(id uuid primary key,size_group_id uuid,color_name text);
  create table order_queues(id uuid primary key,order_id uuid);
  create table bom_items(id uuid primary key,order_id uuid,name text);
  create table samples(id uuid primary key,order_id uuid,sample_number text unique,sample_type text,size_group_id uuid,
   parent_sample_id uuid,root_sample_id uuid,version_no int,version_label text,stage text,approval_status text,dispatch_status text,
   last_comment_at timestamptz,last_comment_by text);
  create table sample_comments(id uuid primary key,sample_id uuid,root_sample_id uuid,sam_number text,version_label text,
   comment_type text,comment_text text,comment_by text,comment_date timestamptz,is_internal boolean,created_at timestamptz default now());
  create table sample_logs(sample_id uuid,root_sample_id uuid);
  create table parcels(id text primary key,status text,dispatch_date date,courier text,tracking_no text,notes text,items jsonb,
   custom_items jsonb,tracking_url text,updated_at timestamptz,dispatched_at timestamptz,delivered_at timestamptz,received_by text);
  create table parcel_status_history(id uuid default gen_random_uuid(),parcel_id text,old_status text,new_status text,note text);
  create table counters(key text primary key,value int);
  grant select,insert,update,delete on all tables in schema public to service_role;
 `)
 await db.exec(fs.readFileSync(path.join(__dirname,'../server/migrations/20261118_desktop_order_section_copy.sql'),'utf8'))
 for(const name of ['parcel_transition','sampling_parcels'])
  await db.exec(fs.readFileSync(path.join(__dirname,'../server/migrations/20261118_desktop_'+name+'.sql'),'utf8'))
 await db.exec('set role service_role')
 await db.query("insert into users values($1,'admin',true,false)",[actor])
 await db.query("insert into buyers values($1,'Intel QA buyer')",[buyer])
 await db.query("insert into orders(id,buyer_id,style_number,step_bom) values($1,$3,'Intel QA style',true),($2,$3,'Intel QA style',false)",[source,target,buyer])
 await db.query("insert into bom_items values($1,$2,'Intel QA denim')",[material,source])
 await db.exec("insert into parcels(id,status,items,custom_items) values('intel-area3-parcel','Draft','[]','[]')")
})()

const mutations=createDesktopMutationHttp({key,db:{async rpc(name,args){
 if(name==='desktop_change_sampling_parcel'){
  const {rows}=await db.query('select desktop_change_sampling_parcel($1,$2,$3,$4,$5,$6::jsonb,$7::jsonb) as outcome',
   [args.actor,args.operation,args.kind,args.verb,args.target,JSON.stringify(args.patch),JSON.stringify(args.expected)])
  return {data:rows[0].outcome}
 }
 if(name==='desktop_transition_parcel'){
  const {rows}=await db.query('select desktop_transition_parcel($1,$2,$3,$4::jsonb) as outcome',
   [args.actor,args.operation,args.target_parcel,JSON.stringify(args.payload)])
  return {data:rows[0].outcome}
 }
 assert.equal(name,'desktop_copy_order_sections')
 const {rows}=await db.query('select desktop_copy_order_sections($1,$2,$3,$4,$5::jsonb) as outcome',
  [args.actor,args.operation,args.source_order,args.target_order,JSON.stringify(args.sections)]).catch(error=>{console.error('QA PostgreSQL error',error.code,error.message);throw error})
 return {data:rows[0].outcome}
}}})
global.fetch=async(url,options)=>{
 const route=new URL(url)
 assert.equal(route.origin,'https://app.nizamia.com')
 if(!online)throw Error('Acceptance transport disconnected')
 await fixture
 switch(route.pathname){
  case '/api/oms': {
   const login=JSON.parse(options.body)
   assert.equal(login.identifier,'box2-fixture')
   assert.equal(login.password,'box2-local-test-password')
   return Response.json({ok:true,desktopSnapshotToken:snapshotToken,desktopSyncToken:token,
    desktopUser:{id:actor,username:'box2-fixture',email:'box2-fixture@example.invalid',role:'admin',is_active:true,permissions:{}}})
  }
  case '/api/desktop/snapshot': {
   assert.equal(options.headers.authorization,'Bearer '+snapshotToken)
   const tables=Object.fromEntries(await Promise.all(names.map(async name=>
    [name,(await db.query('select to_jsonb(t) as row from '+name+' t order by id')).rows.map(row=>row.row)])))
   return Response.json({backup_metadata:{table_count:names.length,table_row_counts:
    Object.fromEntries(names.map(name=>[name,tables[name].length]))},tables})
  }
  case '/api/desktop/mutations': {
   const result=await mutations({method:'POST',headers:{authorization:options.headers.Authorization},body:options.body})
   uploads++
   console.log('QA upload acknowledgement',result.body.results?.map(row=>row.outcome).join(',')||result.status)
   return Response.json(result.body,{status:result.status})
  }
  default: throw Error('Unexpected cloud request to '+route.pathname)
 }
}

require('./main.cjs')
async function until(check,message){
 const deadline=Date.now()+45000
 while(Date.now()<deadline){
  if(failure)throw failure
  const result=await check()
  if(result)return result
  await delay(180)
 }
 throw Error(message)
}
const findWindow=()=>BrowserWindow.getAllWindows().find(w=>w.webContents.getURL().startsWith('app2a://local/'))
const request=(win,route,body)=>win.webContents.executeJavaScript(
 `(async()=>{const response=await fetch(${JSON.stringify(route)},${JSON.stringify(body===undefined?{}:{
  method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)
 })});const data=await response.json();if(!response.ok)throw Error(data.error||response.status);return data})()`)
const login=win=>request(win,'/api/offline/auth',{action:'login',username:'box2-fixture',password:'box2-local-test-password'})
const records=async(win,table)=>(await request(win,'/api/offline/records?table='+table)).data

async function check(){
 await fixture
 let win=await until(findWindow,'App-2A renderer did not launch')
 assert.equal((await login(win)).data.authenticated,true)
 await until(async()=> (await records(win,'orders')).some(row=>row.id===target),'Initial cloud snapshot did not arrive')
 online=false
 await request(win,'/api/offline/auth',{action:'logout'})
 win.destroy()
 app.emit('activate')
 win=await until(findWindow,'App-2A renderer did not reopen offline')
 assert.equal((await login(win)).data.authenticated,true)
 assert.equal((await records(win,'buyers'))[0].name,'Intel QA buyer')
 await request(win,'/api/offline/order-copy',{sourceId:source,targetIds:[target],sections:['bom_items']})
 const cached=(await records(win,'bom_items')).find(row=>row.order_id===target)
 assert.equal(cached.name,'Intel QA denim')
 assert.equal(cached._local_only,true)
 const queued=async(body)=>(await request(win,'/api/offline/sampling-parcels',body)).data
 const [sample]=await queued({table:'samples',action:'create',rows:[{order_id:target,sample_type:'Fit',stage:'Ready'}]})
 await queued({table:'sample_comments',action:'create',rows:[{sample_id:sample.id,comment_type:'Approval',
  comment_text:'Approved on Intel',comment_date:'2026-01-02T12:00:00Z'}]})
 assert.match((await records(win,'samples')).find(s=>s.id===sample.id).sample_number,/^OFFLINE-/)
 assert.equal((await request(win,'/api/offline/pdf',{html:'<html><body>Area 3 offline print</body></html>',
  filename:'Area 3 offline print'})).ok,true)
 assert.equal(fs.readFileSync(pdfPath).subarray(0,5).toString(),'%PDF-')
 assert.equal(uploads,0)
 online=true
 assert.equal((await login(win)).data.authenticated,true)
 try{
  await until(async()=> (await records(win,'bom_items')).some(row=>row.id===cached.id&&row._local_only===false),
   'Reconnect did not upload and refresh the linked order section')
 }catch(error){
  const {data}=await request(win,'/api/offline/pending-status')
  console.error('QA reconnect diagnostics',JSON.stringify({uploads,state:data.cloudSync,mutations:data.mutationStates}))
  throw error
 }
 assert.ok(uploads>0)
 assert.equal((await db.query('select count(*)::int as count from bom_items where order_id=$1',[target])).rows[0].count,1)
 await until(async()=> (await records(win,'samples')).some(row=>row.id===sample.id&&row.approval_status==='Approved'
  && /^SAM-/.test(row.sample_number)),'Reconnect did not publish the sample and its approval')
 online=false
 await request(win,'/api/offline/parcel-transition',{id:'intel-area3-parcel',status:'Dispatched',
  details:{courier:'Intel carrier',tracking_no:'Intel-123',dispatch_date:'2026-01-02',items:[{sampleId:sample.id}]}})
 assert.equal((await records(win,'parcels'))[0].status,'Dispatched')
 assert.equal((await db.query("select status from parcels where id='intel-area3-parcel'")).rows[0].status,'Draft')
 online=true
 await login(win)
 await until(async()=> (await records(win,'parcel_status_history')).some(row=>row.new_status==='Dispatched'),
  'Reconnect did not publish linked parcel dispatch history')
 assert.equal((await db.query("select tracking_no from parcels where id='intel-area3-parcel'")).rows[0].tracking_no,'Intel-123')
 console.log('Intel Electron acceptance passed: offline reopen, section copy, sample and approval, parcel dispatch, reconnect and cloud readback.')
}
check().then(async()=>{
 await db.close()
 fs.rmSync(profile,{recursive:true,force:true})
 app.exit(0)
},error=>{
 console.error(error)
 fs.rmSync(profile,{recursive:true,force:true})
 app.exit(1)
})
