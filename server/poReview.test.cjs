const test=require('node:test')
const assert=require('node:assert/strict')
const {PGlite}=require('@electric-sql/pglite')
const {readFileSync}=require('node:fs')
const path=require('node:path')

test('a PO review belongs to its chosen active admin and the submitted document',async()=>{
 const db=new PGlite()
 const id=n=>'00000000-0000-4000-8000-'+String(n).padStart(12,'0')
 try {
  await db.exec(`
   create role anon; create role authenticated; create role service_role bypassrls;
   create table users(id uuid primary key,role text,role_id uuid,is_active boolean,is_restricted boolean);
   create table permissions(role_id uuid,module text,can_create boolean,can_view boolean,can_edit boolean,can_delete boolean);
   create table purchase_orders(id uuid primary key,po_number text,status text,supplier_id uuid,job_id uuid,updated_at timestamptz,order_id uuid);
   create table purchase_order_items(id uuid primary key,po_id uuid references purchase_orders,description text,qty numeric,unit text,unit_rate numeric,amount numeric,sort_order int,source_id uuid,source_type text);
   create table app_tasks(id uuid primary key default gen_random_uuid(),title text,assignee_id uuid,created_by uuid,due_date date,priority text,status text check(status in ('Pending','Completed')),related_record text,completed_at timestamptz,description text);
   create table purchase_order_changelog(id uuid primary key,po_id uuid,change_description text);
   grant select,insert,update,delete on all tables in schema public to service_role;
  `)
  await db.exec(readFileSync(path.join(__dirname,'migrations/20261119_po_review.sql'),'utf8'))
  await db.exec(readFileSync(path.join(__dirname,'migrations/20261119_po_visibility.sql'),'utf8'))
  await db.exec(readFileSync(path.join(__dirname,'migrations/20261119_po_revision.sql'),'utf8'))
  await db.exec(readFileSync(path.join(__dirname,'migrations/20261119_protected_po_operations.sql'),'utf8'))
  for(const [n,role,active] of [[1,'merchandiser',true],[2,'admin',true],[3,'admin',true],[4,'admin',false],[5,'other',true]]){
   await db.query('insert into users values($1,$2,$3,$4,false)',[id(n),role,id(10+n),active])
  }
  await db.query("insert into permissions values($1,'purchasing',true,true,true,false)",[id(11)])
  await db.query("insert into purchase_orders values($1,'PO-TEST','Draft',$2,$3,now())",[id(6),id(8),id(9)])
  await db.query("insert into purchase_order_items values($1,$2,'Custom patch',10,'pcs',2,20,0,null)",[id(7),id(6)])
  const call=async(actor,selected,approve)=>(await db.query('select review_purchase_order($1,$2,$3,$4) as task',[id(actor),id(6),id(selected),approve])).rows[0].task
  const read=async actor=>(await db.query('select document from read_purchase_order_page($1,null,$2)',[id(actor),id(6)])).rows[0].document
  await db.exec('set role anon')
  await assert.rejects(read(1),/permission denied/)
  await assert.rejects(call(1,2,false),/permission denied/)
  await db.exec('set role service_role')
  await assert.rejects(read(5))
  assert.equal((await read(2)).supplier_id,id(8))
  const draft=await read(1)
  assert.equal(draft.details_hidden,true)
  assert.equal(draft.supplier_id,undefined)
  assert.equal(draft.job_id,undefined)
  assert.equal(draft.purchase_order_items[0].source_id,undefined)
  await db.query("update purchase_orders set status='approved'")
  assert.equal((await read(1)).approval_verified,false)
  await db.query("update purchase_orders set status='Draft'")
  await assert.rejects(call(5,2,false))
  await assert.rejects(call(1,4,false),/active admin/)
  const task=await call(1,2,false)
  assert.equal(await call(1,2,false),task)
  await assert.rejects(call(1,3,false),/different admin/)
  await assert.rejects(call(3,3,true))
  await assert.rejects(call(1,2,true))
  await db.query('update purchase_order_items set qty=12 where id=$1',[id(7)])
  await assert.rejects(call(2,2,true),/PO changed/)
  assert.equal(await call(1,2,false),task)
  assert.equal(await call(2,2,true),task)
  assert.equal(await call(2,2,true),task)
  assert.deepEqual((await db.query('select assignee_id,status from app_tasks')).rows,[{assignee_id:id(2),status:'Completed'}])
  assert.equal((await db.query('select status from purchase_orders')).rows[0].status,'approved')
  const stage = () => db.query("select set_reviewed_po_stage($1,$2,(select updated_at from purchase_orders where id=$2),'Issued')",[id(1),id(6)])
  await stage()
  await db.query("insert into purchase_order_changelog values($1,$2,'changed')",[id(20),id(6)])
  const history=()=>db.query('select * from read_po_history($1,$2,null)',[id(1),[id(6)]])
  assert.equal((await history()).rows.length,1)
  const approved=await read(1)
  assert.equal(approved.approval_verified,true)
  assert.equal(approved.supplier_id,id(8))
  assert.equal(approved.job_id,id(9))
  await db.query('update purchase_order_items set qty=15')
  assert.equal((await read(1)).supplier_id,undefined)
  assert.equal((await history()).rows.length,0)
  await assert.rejects(stage())
  assert.equal((await db.query('select status from purchase_orders')).rows[0].status,'Draft')
  assert.deepEqual((await db.query('select status from app_tasks')).rows,[{status:'Pending'}])
  await assert.rejects(call(2,2,true),/PO changed/)
  assert.equal(await call(1,2,false),task)
  assert.equal(await call(2,2,true),task)
  assert.equal((await read(1)).approval_verified,true)
  const remove=actor=>db.query('select remove_po_records($1,$2,null,(select updated_at from purchase_orders where id=$2))',[id(actor),id(6)])
  await assert.rejects(remove(1))
  await remove(2)
  assert.equal((await db.query('select count(*)::int n from purchase_orders')).rows[0].n,0)
 }finally{await db.close()}
})
