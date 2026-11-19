'use strict'

// Test-only Electron entry point. It is intentionally omitted from the DMG.
const assert=require('node:assert/strict')
const {schema:operationalSchema,tables:operationalTables,applyOperation}=require('../server/operationalQaFixture.cjs')
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
const [actor,buyer,source,target,material,queue,group,color]=Array.from({length:8},()=>crypto.randomUUID())
const key=crypto.randomBytes(32)
const token=issueDesktopSyncToken(key,actor)
const snapshotToken=Buffer.from(JSON.stringify({
 id:actor,scope:'desktop-snapshot',exp:Date.now()+60*60*1000,
})).toString('base64url')+'.fixture'
const names=['orders','buyers','suppliers','size_groups','size_group_colors','order_queues','bom_items','samples','sample_comments','parcels','parcel_status_history',
 'order_processes','purchase_orders','purchase_order_items','purchase_order_changelog',
 'work_orders','work_order_items','work_order_changelog','production_daily_entries',...operationalTables,'costing_batches','costing_sheets','costing_sheet_versions','proforma_invoices','proforma_invoice_revisions','pp_meetings']
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
  create table orders(id uuid primary key,buyer_id uuid,style_number text,step_bom boolean,step_sampling boolean,total_qty numeric,job_number text,buyer_name text,po_number text,store_name text,status text);
  create table buyers(id uuid primary key,name text);
   create table buyer_addresses(id uuid primary key,buyer_id uuid,recipient text,label text,address_line1 text,address_line2 text,city text,region text,postal_code text,country text,phone text,email text);
   create table buyer_contacts(id uuid primary key,buyer_id uuid,name text,phone text,email text);
   create table parcel_invoice_snapshots(parcel_id text primary key,buyer_id uuid,address_id uuid,contact_id uuid,consignee jsonb);
  create table suppliers(id uuid primary key,name text);
  create table size_groups(id uuid primary key,order_id uuid,group_name text);
  create table size_group_colors(id uuid primary key,size_group_id uuid,color_name text);
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
  ${operationalSchema}
  create table production_daily_entries(id uuid primary key,order_id uuid,size_group_id uuid,color_id uuid,
   job_number text,buyer_name text,style_number text,po_number text,store_name text,wash_name text,size_group_name text,
   department text,movement text,production_date date,production_at text,quantity int,created_by uuid,created_at timestamptz default now());
  grant select,insert,update,delete on all tables in schema public to service_role;
 `)
 await db.exec(fs.readFileSync(path.join(__dirname,'../server/migrations/20261118_desktop_order_section_copy.sql'),'utf8'))
 for(const name of ['parcel_transition','sampling_parcels','purchasing_create','purchasing_edit','purchase_approval','purchasing_remove','operational_records','production_create'])
  await db.exec(fs.readFileSync(path.join(__dirname,'../server/migrations/20261118_desktop_'+name+'.sql'),'utf8'))
 await db.exec(fs.readFileSync(path.join(__dirname,'../server/fixtures/desktopBusinessDocuments.sql'),'utf8'))
 for(const name of ['catalog_records','business_documents'])await db.exec(fs.readFileSync(path.join(__dirname,'../server/migrations/20261119_desktop_'+name+'.sql'),'utf8'))
 await db.exec('grant select,insert,update,delete on all tables in schema public to service_role; grant usage on all sequences in schema public to service_role; set role service_role')
 await db.query("insert into users values($1,'admin',true,false)",[actor])
 await db.query("insert into buyers values($1,'Intel QA buyer')",[buyer])
 await db.query("insert into orders(id,buyer_id,style_number,step_bom) values($1,$3,'Intel QA style',true),($2,$3,'Intel QA style',false)",[source,target,buyer])
 await db.query("update orders set total_qty=100,job_number='QA Job',status='Active' where id=$1",[target])
 await db.query("insert into order_queues values($1,$2,100,'Active')",[queue,target])
 await db.query("insert into size_groups values($1,$2,'Intel QA group')",[group,target])
 await db.query("insert into size_group_colors values($1,$2,'Intel QA wash')",[color,group])
 await db.query("insert into bom_items values($1,$2,'Intel QA denim')",[material,source])
 await db.query("insert into suppliers values($1,'Intel supplier')",[buyer])
 await db.query('insert into order_processes values($1,$2)',[material,target])
 await db.exec("insert into document_numbering(doc_type,prefix,current_number,next_number,pattern,seq_pad,enabled) values ('po','INTELPO',1,1,'{PREFIX}-{SEQ}',3,true),('wo','INTELWO',1,1,'{PREFIX}-{SEQ}',3,true)")
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
 if(name==='desktop_create_purchasing_document'){
  const {rows}=await db.query('select desktop_create_purchasing_document($1,$2,$3,$4::jsonb,$5::jsonb) as outcome',
   [args.actor,args.operation,args.kind,JSON.stringify(args.header),JSON.stringify(args.lines)])
  return {data:rows[0].outcome}
 }
 if(name==='desktop_edit_purchasing_document'){
  const {rows}=await db.query('select desktop_edit_purchasing_document($1,$2,$3,$4,$5::jsonb,$6::jsonb,$7::jsonb) as outcome',
   [args.actor,args.operation,args.kind,args.target,JSON.stringify(args.header),JSON.stringify(args.expected),JSON.stringify(args.lines)])
  return {data:rows[0].outcome}
 }
 if(name==='desktop_update_purchase_approval'){
  const {rows}=await db.query('select desktop_update_purchase_approval($1,$2,$3,$4,$5) as outcome',
   [args.actor,args.operation,args.target_purchase_order,args.previous_status,args.new_status])
  return {data:rows[0].outcome}
 }
 if(name==='desktop_remove_purchasing_document'){
  const {rows}=await db.query('select desktop_remove_purchasing_document($1,$2,$3,$4,$5::jsonb) as outcome',
   [args.actor,args.operation,args.kind,args.target,JSON.stringify(args.expected)])
  return {data:rows[0].outcome}
 }
 if(['desktop_save_business_document','desktop_save_catalog_record'].includes(name)){
  const values=['actor','operation','kind','verb','target','payload','expected'].map(k=>typeof args[k]==='object'?JSON.stringify(args[k]):args[k])
  return {data:(await db.query('select '+name+'($1,$2,$3,$4,$5,$6,$7) as outcome',values)).rows[0].outcome}
 }
 if(name==='desktop_save_operational_record')return applyOperation(db,args)
 if(name==='desktop_create_production_entry'){
  const {rows}=await db.query('select desktop_create_production_entry($1,$2,$3::jsonb) as outcome',
   [args.actor,args.operation,JSON.stringify(args.payload)])
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
    [name,(await db.query('select to_jsonb(t) as row from '+name+' t order by '+(name==='production_batch_orders'?'order_id':'id'))).rows.map(row=>row.row)])))
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
 const footer=await until(()=>win.webContents.executeJavaScript(
  "document.querySelector('.dl-form footer span')?.textContent"
 ),'Mac login version did not appear')
 assert.equal(footer,'V '+require('./package.json').version.replace(/^(\d+\.\d+)\.0$/,'$1'))
 console.log('Verified rendered Mac login version:',footer)
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
 online=false
 const queuePO=(fields,lines,documentId)=>request(win,'/api/offline/purchasing-create',{table:'purchase_orders',fields,lines,documentId})
 const queueWO=(fields,lines,documentId)=>request(win,'/api/offline/purchasing-create',{table:'work_orders',fields,lines,documentId})
 const poFields={order_id:target,supplier_id:buyer,status:'Draft',currency:'PKR'}
 const woFields={order_id:target,vendor_id:buyer,status:'Draft'}
 const {data:poDraft}=await queuePO(poFields,[{description:'Intel denim',qty:4,unit_rate:10}])
 const {data:woDraft}=await queueWO(woFields,[{process_name:'Intel washing',order_process_id:material,qty:5,rate:12}])
 assert.match(poDraft.po_number,/^OFFLINE-/)
 assert.match(woDraft.wo_number,/^OFFLINE-/)
 assert.equal((await records(win,'purchase_order_items')).find(line=>line.po_id===poDraft.id).qty,4)
 assert.equal((await db.query('select count(*)::int as count from purchase_orders')).rows[0].count,0)
 online=true
 await login(win)
 const po=await until(async()=> (await records(win,'purchase_orders')).find(row=>row.po_number==='INTELPO-001'&&row._local_only===false),
  'PO draft did not receive its official number on reconnect')
 const wo=await until(async()=> (await records(win,'work_orders')).find(row=>row.wo_number==='INTELWO-001'&&row._local_only===false),
  'WO draft did not receive its official number on reconnect')
 online=false
 await request(win,'/api/offline/mutate',{table:'purchase_orders',id:po.id,action:'update',fields:{status:'approved'}})
 await queueWO({...woFields,notes:'Intel revised work'},[{process_name:'Intel washing revised',order_process_id:material,qty:6,rate:12}],wo.id)
 assert.equal((await records(win,'purchase_orders')).find(row=>row.id===po.id).status,'approved')
 online=true
 await login(win)
 await until(async()=> (await records(win,'work_order_items')).some(row=>row.wo_id===wo.id&&row.amount===72&&row._local_only===false),
  'Revised work order and calculated line amount did not upload')
 assert.equal((await db.query('select status from purchase_orders where id=$1',[po.id])).rows[0].status,'approved')
 await db.query("insert into work_order_changelog(id,wo_id,change_description) values($1,$2,'Intel cloud history')",[crypto.randomUUID(),wo.id])
 await login(win)
 await until(async()=> (await records(win,'work_order_changelog')).some(row=>row.wo_id===wo.id),
  'Cloud work order history did not download into SQLite')
 online=false
 await request(win,'/api/offline/purchasing-remove',{table:'work_orders',id:wo.id})
 assert.ok(!(await records(win,'work_order_items')).some(row=>row.wo_id===wo.id))
 assert.ok(!(await records(win,'work_order_changelog')).some(row=>row.wo_id===wo.id))
 online=true
 await login(win)
 await until(async()=> !(await db.query('select id from work_orders where id=$1',[wo.id])).rows.length,
  'Confirmed work order removal did not upload')
 assert.equal((await db.query('select count(*)::int as count from work_order_changelog where wo_id=$1',[wo.id])).rows[0].count,0)
 online=false
 const ops=input=>request(win,'/api/offline/operational-record',input)
 await request(win,'/api/offline/batch',{table:'production_daily_entries',rows:[{order_id:target,size_group_id:group,color_id:color,
  department:'Cutting',movement:'completed',production_date:'2026-01-02',quantity:35}]})
 const {data:batch}=await ops({kind:'batch',action:'save',name:'Intel production batch',orderIds:[target]})
 const {data:booking}=await ops({kind:'booking',action:'save',
  header:{booking_no:'Intel booking',booking_date:'2026-01-02',status:'Confirmed'},
  lines:[{order_id:target,queue_id:queue,qty:75}]})
 const bookingLine=(await records(win,'shipping_booking_lines')).find(line=>line.booking_id===booking.id)
 const {data:shipping}=await ops({kind:'shipment',action:'save',mode:'booked',
  header:{shipment_no:'Intel booked shipment',shipment_date:'2026-01-02',status:'Open'},
  lines:[{order_id:target,queue_id:queue,booking_line_id:bookingLine.id,shipped_qty:35}]})
 assert.equal((await records(win,'shipping_booking_shipments')).find(row=>row.shipment_id===shipping.id).qty,35)
 assert.equal((await records(win,'production_daily_entries'))[0].quantity,35)
 online=true
 await login(win)
 await until(async()=> (await records(win,'shipping_bookings')).some(row=>row.id===booking.id&&row._local_only===false),
  'New booking did not sync')
 await login(win)
 await until(async()=> (await records(win,'shipping_booking_shipments')).some(row=>row.shipment_id===shipping.id&&row._local_only===false),
  'Booking allocation did not upload after the booking')
 const [entry]=(await records(win,'production_daily_entries'))
 assert.equal(entry.quantity,35)
 assert.equal(entry.wash_name,'Intel QA wash')
 assert.equal(entry._local_only,false)
 assert.equal((await records(win,'production_batch_orders')).find(row=>row.order_id===target).batch_id,batch.id)
 const [line]= (await records(win,'shipment_lines')).filter(row=>row.shipment_id===shipping.id)
 assert.equal(bookingLine.qty-line.shipped_qty,40)
 assert.equal((await records(win,'order_queues')).find(row=>row.id===queue).qty-line.shipped_qty,65)
 await db.query('update shipping_bookings set notes=$1 where id=$2',['Intel cloud update',booking.id])
 await login(win)
 await until(async()=> (await records(win,'shipping_bookings')).some(row=>row.id===booking.id&&row.notes==='Intel cloud update'),
  'Cloud booking edit did not reach the Mac')
 online=false
 const {costing}=await request(win,'/api/oms',{action:'saveCosting',document:{type:'woven',style:'Intel denim',customer:'Intel QA'}})
 assert.equal(costing._local_only,true)
 online=true
 await login(win)
 await until(async()=> (await records(win,'costing_sheets')).some(row=>row.id===costing.id&&row._local_only===false),'Costing did not sync')
 await db.query('update costing_sheets set customer=$1 where id=$2',['Cloud QA',costing.id])
 await login(win)
 await until(async()=> (await records(win,'costing_sheets')).some(row=>row.id===costing.id&&row.customer==='Cloud QA'),'Cloud costing edit did not reach SQLite')
 const stageSample=crypto.randomUUID()
 await db.query("insert into samples(id,order_id,sample_number,sample_type,stage) values($1,$2,'SAM-REFRESH','Fit','Stitching')",[stageSample,target])
 await login(win)
 await until(async()=> (await records(win,'samples')).some(row=>row.id===stageSample),'Missing stage fixture')
 await win.loadURL('app2a://local/sampling')
 const displayedStage=()=>win.webContents.executeJavaScript(
  "Array.from(document.querySelectorAll('tr')).find(row=>row.innerText.includes('SAM-REFRESH'))?.querySelector('select')?.value")
 await until(async()=>await displayedStage()==='Stitching','Initial sample stage was not rendered')
 await db.query("update samples set stage='Washing' where id=$1",[stageSample])
 const menu=require('electron').Menu.getApplicationMenu()
 assert.ok(menu.items.some(item=>item.label==='Reports'))
 assert.ok(!menu.items.some(item=>item.label==='Database'))
 await request(win,'/api/offline/refresh',{})
 await until(async()=>await displayedStage()==='Washing','Open Sampling page missed the downloaded stage')
 console.log('Verified cloud stage change in the open Sampling page on Intel.')
 console.log('Intel Electron verified Areas 2 to 6.')

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
