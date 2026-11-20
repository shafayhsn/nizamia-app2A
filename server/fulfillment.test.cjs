const assert = require('node:assert/strict')
const { readFileSync } = require('node:fs')
const { join } = require('node:path')
const { test } = require('node:test')
const { PGlite } = require('@electric-sql/pglite')

const id = value => '00000000-0000-4000-8000-' + String(value).padStart(12, '0')
const migration = name => readFileSync(join(__dirname, 'migrations', name + '.sql'), 'utf8')

async function fixture(t) {
  const db = new PGlite()
  t.after(() => db.close())
  await db.exec(`
    CREATE ROLE anon;
    CREATE ROLE authenticated;
    CREATE ROLE service_role BYPASSRLS;
    CREATE SCHEMA desktop_private;
    GRANT USAGE ON SCHEMA desktop_private TO service_role;
    CREATE TABLE users(id uuid PRIMARY KEY, username text, role text, role_id uuid, is_active boolean,
      is_restricted boolean, deleted_at timestamptz);
    CREATE TABLE roles(id uuid PRIMARY KEY,name text NOT NULL);
    CREATE TABLE permissions(role_id uuid, module text, can_view boolean, can_create boolean, can_edit boolean DEFAULT false, can_delete boolean DEFAULT false);
    CREATE TABLE suppliers(id uuid PRIMARY KEY, name text);
    CREATE TABLE purchase_orders(id uuid PRIMARY KEY, po_number text, supplier_id uuid, status text, delivery_date date);
    CREATE TABLE purchase_order_items(id uuid PRIMARY KEY, po_id uuid REFERENCES purchase_orders,
      description text, specification text, qty numeric, unit text, unit_rate numeric, amount numeric, sort_order integer);
    CREATE TABLE po_approval_requests(po_id uuid PRIMARY KEY, approved_at timestamptz, document_version jsonb);
    INSERT INTO users VALUES
      ('${id(1)}','Admin','admin',NULL,true,false,NULL),
      ('${id(2)}','Writer','staff','${id(12)}',true,false,NULL),
      ('${id(3)}','Reader','staff','${id(13)}',true,false,NULL),
      ('${id(4)}','Restricted','admin',NULL,true,true,NULL),
      ('${id(5)}','Other','staff',NULL,true,false,NULL),
      ('${id(6)}','Former','admin',NULL,true,false,now());
    INSERT INTO permissions(role_id,module,can_view,can_create) VALUES ('${id(12)}','purchasing',true,true),('${id(13)}','purchasing',true,false);
    INSERT INTO suppliers VALUES ('${id(9)}','Denim supplier');
    INSERT INTO purchase_orders VALUES
      ('${id(10)}','PO-100','${id(9)}','Issued',NULL),
      ('${id(20)}','PO-200','${id(9)}','Issued',NULL);
    INSERT INTO purchase_order_items VALUES
      ('${id(11)}','${id(10)}','Denim','Blue',50,'m',1,50,0),
      ('${id(21)}','${id(20)}','Hidden denim','Blue',50,'m',1,50,0);
    INSERT INTO po_approval_requests
      SELECT p.id,now(),jsonb_build_array(to_jsonb(p)-'status',jsonb_build_array(to_jsonb(i)))
      FROM purchase_orders p JOIN purchase_order_items i ON p.id=i.po_id WHERE p.id='${id(10)}';
    CREATE TABLE work_orders(id uuid PRIMARY KEY, wo_number text, vendor_id uuid, status text, complete_by date);
    CREATE TABLE work_order_items(id uuid PRIMARY KEY, wo_id uuid REFERENCES work_orders,
      process_name text, dept_info text, qty numeric, unit text);
    INSERT INTO work_orders VALUES ('${id(30)}','WO-300','${id(9)}','Issued',NULL),
      ('${id(40)}','WO-400','${id(9)}','Draft',NULL);
    INSERT INTO work_order_items VALUES ('${id(31)}','${id(30)}','Washing','Deep Blue',100,'pcs'),
      ('${id(32)}','${id(30)}','Fabric','',100,'m'),
      ('${id(41)}','${id(40)}','Washing','',100,'pcs');
    INSERT INTO permissions(role_id,module,can_view,can_create) VALUES ('${id(12)}','production',true,false),('${id(13)}','production',true,true);
    ALTER TABLE work_orders ADD COLUMN updated_at timestamptz DEFAULT now(), ADD COLUMN order_id uuid,
      ADD COLUMN vendor_type text, ADD COLUMN vendor_phone text, ADD COLUMN factory_ref text, ADD COLUMN issue_date date,
      ADD COLUMN start_date date, ADD COLUMN daily_output int, ADD COLUMN payment_terms text, ADD COLUMN color text,
      ADD COLUMN qty int, ADD COLUMN notes text;
    ALTER TABLE work_order_items ADD COLUMN order_process_id uuid, ADD COLUMN rate numeric, ADD COLUMN amount numeric,
      ADD COLUMN sort_order int;
    GRANT SELECT,INSERT,UPDATE,DELETE ON ALL TABLES IN SCHEMA public TO service_role;
  `)
  await db.exec(migration('20261119_po_visibility'))
  await db.exec(migration('20261120_store_receipts'))
  await db.exec(migration('20261120_work_order_tracking'))
  await db.exec(migration('20261120_z_hr_attendance'))
  await db.exec(migration('20261120_zz_operations_workflows'))
  return db
}

test('store receipts preserve delivery history and enforce PO release, role and quantity rules', async t => {
  const db = await fixture(t)
  await db.exec('SET ROLE service_role')
  const read = async (actor, query = '', target = null) => (await db.query(
    'SELECT read_store_receipts($1,$2,NULL,$3) AS value', [id(actor), query, target]
  )).rows[0].value
  const post = async (actor, entry, line = 11, quantity = '20.5', accepted = '12', rejected = '3') => (await db.query(
    "SELECT post_store_receipt($1,$2,$3,'2026-01-01','DC-1',$4,$5,$6,'Checked') AS value",
    [id(actor), id(entry), id(line), quantity, accepted, rejected]
  )).rows[0].value

  const register = await read(2)
  assert.equal(register.can_post, true)
  assert.deepEqual(register.rows.map(row => row.id), [id(11)])
  assert.equal((await read(1, 'PO-200')).rows[0].open, false)
  assert.equal((await read(3)).can_post, false)
  await assert.rejects(post(3, 101), { code: '42501' })
  await assert.rejects(read(4), { code: '42501' })
  await assert.rejects(read(5), { code: '42501' })
  await assert.rejects(post(6, 101), { code: '42501' })
  assert.equal(await post(2, 101, 21), 'conflict')
  await assert.rejects(post(2, 101, 11, '10', '8', '3'), { code: '23514' })
  assert.equal(await post(2, 101), 'applied')
  assert.equal(await post(2, 101), 'already-applied')
  assert.equal(await post(2, 101, 11, '21'), 'conflict')
  assert.equal(await post(2, 102, 11, '40', '40', '0'), 'applied')
  const [line] = (await read(3, 'denim supplier')).rows
  assert.deepEqual([line.delivered, line.accepted, line.held, line.rejected, line.pending], [60.5, 52, 5.5, 3, 0])
  const { history } = await read(3, '', id(11))
  assert.equal(history.length, 2)
  assert.equal(history[0].recorded_by, 'Writer')
  assert.deepEqual((await read(2, '', id(21))).history, [])
  await db.exec('RESET ROLE; SET ROLE authenticated')
  await assert.rejects(read(1), { code: '42501' })
  await assert.rejects(post(1, 103), { code: '42501' })
})

test('work order postings enforce Production permissions and balance partial returns and rework', async t => {
  const db = await fixture(t)
  await db.exec('SET ROLE service_role')
  const read = async (actor, target = null) => (await db.query(
    "SELECT read_work_order_tracking($1,'WO-300',NULL,$2) AS value", [id(actor), target]
  )).rows[0].value
  const post = async (actor, entry, movement, quantity, line = 31) => (await db.query(
    "SELECT post_work_order_movement($1,$2,$3,'2026-01-01',' Gate pass 1 ',$4,$5,'') AS value",
    [id(actor), id(entry), id(line), quantity, movement]
  )).rows[0].value

  assert.equal((await read(2)).can_post, false)
  assert.equal((await read(3)).can_post, true)
  await assert.rejects(post(2, 201, 'dispatch', 20), { code: '42501' })
  await assert.rejects(read(4), { code: '42501' })
  await assert.rejects(read(5), { code: '42501' })
  assert.equal(await post(3, 201, 'dispatch', 20, 41), 'conflict')
  assert.equal(await post(3, 201, 'dispatch', 20, 32), 'conflict')
  assert.equal(await post(3, 201, 'dispatch', 101), 'conflict')
  assert.equal(await post(3, 201, 'accept', 1), 'conflict')
  assert.equal(await post(3, 201, 'dispatch', 70), 'applied')
  assert.equal(await post(3, 201, 'dispatch', 70), 'already-applied')
  assert.equal(await post(3, 201, 'dispatch', 69), 'conflict')
  assert.equal(await post(3, 202, 'accept', 50), 'applied')
  assert.equal(await post(3, 203, 'rework', 10), 'applied')
  assert.equal(await post(3, 204, 'dispatchRework', 11), 'conflict')
  assert.equal(await post(3, 204, 'dispatchRework', 6), 'applied')
  assert.equal(await post(3, 205, 'reject', 3), 'applied')
  const { summarizeWorkOrder } = await import('../src/lib/fulfillmentBalances.mjs')
  const expected = summarizeWorkOrder(100, [
    { type: 'dispatch', quantity: 70 }, { type: 'accept', quantity: 50 },
    { type: 'rework', quantity: 10 }, { type: 'dispatchRework', quantity: 6 }, { type: 'reject', quantity: 3 }
  ])
  const [line] = (await read(2)).rows
  assert.deepEqual(Object.fromEntries(Object.keys(expected).map(key => [key, line[key]])), expected)
  const { history } = await read(2, id(31))
  assert.equal(history.length, 5)
  assert.equal(history[0].recorded_by, 'Reader')
  await assert.rejects(db.exec(`UPDATE work_order_items SET qty=1 WHERE id='${id(31)}'`), { code: '23514' })
  const edit = async (actor, lines) => (await db.query(
    `SELECT edit_tracked_work_order($1, w.id, w.updated_at, to_jsonb(w)||'{"status":"Completed"}', $2) AS value
      FROM work_orders w WHERE w.id=$3`, [id(actor), lines, id(30)]
  )).rows[0].value
  await assert.rejects(edit(2, null), { code: '42501' })
  assert.equal(await edit(1, []), 'tracked')
  assert.equal((await read(2)).rows[0].status, 'Issued')
  assert.equal(await edit(1, null), 'applied')
  assert.equal((await read(2)).rows[0].open, false)
  assert.equal(await post(3, 206, 'accept', 1), 'conflict')
  await db.exec('RESET ROLE; SET ROLE anon')
  await assert.rejects(post(1, 206, 'accept', 1), { code: '42501' })
})

test('the authenticated API supplies the actor and rejects fractional work order quantities', async () => {
  const { fulfillment } = await import('./fulfillment.js')
  const calls = []
  const db = { rpc: async (...args) => { calls.push(args); return { data: 'applied' } } }
  const response = () => ({
    code: 200,
    status(code) { this.code = code; return this },
    json(payload) { this.payload = payload; return this },
  })
  const body = { actor: id(1), operation: id(100), target: id(31), date: '2026-01-01',
    reference: 'WO-300 slip', movement: 'dispatch', quantity: '2.5' }
  const user = { id: id(3) }
  const submit = (fields, res) => fulfillment({ method: 'POST', body: fields }, res, db, user, 'postWorkOrderMovement')
  assert.equal((await submit(body, response())).code, 400)
  assert.equal(calls.length, 0)
  assert.deepEqual((await submit({ ...body, quantity: '2' }, response())).payload, { ok: true })
  assert.equal(calls[0][0], 'post_work_order_movement')
  assert.equal(calls[0][1].actor, user.id)
})

test('a PO receipt posts atomically, can be retried, and date searches preserve all-time balances', async t => {
  const db = await fixture(t)
  await db.exec('SET ROLE service_role')
  const read = async (query = '', from = null, to = null, target = null) => (await db.query(
    'SELECT read_po_receiving($1,$2,NULL,$3,$4,$5) AS value',[id(2),target,query,from,to]
  )).rows[0].value
  const line = (operation, quantity, lineId = 11) =>
    ({ operation:id(operation),line_id:id(lineId),quantity,accepted:quantity,rejected:0 })
  const post = (date, reference, lines) => db.query(
    "SELECT post_po_receiving($1,$2,$3,$4,'', $5) AS value",[id(2),id(10),date,reference,lines])
  assert.equal((await read()).rows.length,0)
  assert.equal((await read('',null,null,id(10))).rows[0].open,true)
  await assert.rejects(post('2026-01-01','DC-01',[line(301,20),line(302,20,21)]),{code:'23514'})
  assert.equal((await read('',null,null,id(10))).rows[0].lines[0].received,0)
  await post('2026-01-01','DC-01',[line(301,20)])
  await post('2026-01-01','DC-01',[line(301,20)])
  await post('2026-01-02','DC-02',[line(302,15)])
  const [po]=(await read('DC-01','2026-01-01','2026-01-01')).rows
  assert.deepEqual([po.lines[0].ordered,po.lines[0].received,po.lines[0].balance],[50,35,15])
  assert.equal((await read('DC-01','2026-01-02','2026-01-02')).rows.length,0)
  assert.equal((await read(id(302))).rows[0].id,id(10))
  assert.equal((await read('',null,null,id(10))).rows[0].lines[0].history.length,2)
  const {rows}= (await db.query("SELECT read_work_order_tracking($1,'WO-400',NULL,NULL) AS value",[id(3)])).rows[0].value
  assert.equal(rows[0].number,'WO-400')
  assert.equal(rows[0].open,false)
})

test('dedicated staff can act within their role without broad module grants', async t => {
  const db = await fixture(t)
  await db.exec(`
    CREATE FUNCTION desktop_private.team_permission(actor uuid, area text, verb text)
    RETURNS boolean LANGUAGE sql AS $$
      SELECT EXISTS(SELECT FROM public.users u JOIN public.permissions p ON p.role_id=u.role_id
        WHERE u.id=actor AND p.module=area AND p.can_view AND p.can_create AND verb='create')
    $$;
    CREATE SCHEMA nzos_private;
    CREATE TABLE nzos_private.edit_sessions(user_id uuid, proof_hash bytea, expires_at timestamptz);
    GRANT USAGE ON SCHEMA nzos_private TO service_role;
    GRANT SELECT ON nzos_private.edit_sessions TO service_role;
    CREATE TABLE orders(id uuid PRIMARY KEY,job_number text,buyer_name text,style_number text,po_number text,store_name text,status text);
    CREATE TABLE size_groups(id uuid PRIMARY KEY,order_id uuid,group_name text);
    CREATE TABLE size_group_colors(id uuid PRIMARY KEY,size_group_id uuid,color_name text);
    CREATE TABLE production_daily_entries(
      id uuid PRIMARY KEY, order_id uuid,size_group_id uuid,color_id uuid,job_number text,buyer_name text,style_number text,
      po_number text,store_name text,wash_name text,size_group_name text,department text,movement text,production_date date,
      production_at text,quantity int,created_by uuid);
    CREATE TABLE samples(id uuid PRIMARY KEY,stage text,dispatch_status text,root_sample_id uuid,sample_number text,version_label text);
    CREATE TABLE sample_comments(id uuid PRIMARY KEY,sample_id uuid,root_sample_id uuid,sam_number text,version_label text,
      comment_type text,comment_text text,comment_date timestamptz,is_internal boolean);
    INSERT INTO users VALUES
      ('${id(7)}','Storekeeper','storekeeper','${id(77)}',true,false,NULL),
      ('${id(8)}','Production','production_incharge',NULL,true,false,NULL),
      ('${id(14)}','Sample','sample_room',NULL,true,false,NULL),
      ('${id(15)}','HR','hr',NULL,true,false,NULL);
    INSERT INTO permissions(role_id,module,can_view,can_create,can_edit)
      VALUES ('${id(77)}','purchasing',true,true,true);
    INSERT INTO nzos_private.edit_sessions VALUES ('${id(7)}',sha256(convert_to('test-proof','UTF8')),now()+interval '1 hour');
    INSERT INTO orders VALUES ('${id(100)}','JOB-1','Buyer','Style-1','BUYER-PO','Store','Active');
    INSERT INTO size_groups VALUES ('${id(101)}','${id(100)}','Adult');
    INSERT INTO size_group_colors VALUES ('${id(102)}','${id(101)}','Indigo');
    INSERT INTO samples VALUES ('${id(200)}','Pattern',NULL,NULL,'SAM-1','V1'),
      ('${id(201)}','Ready','Dispatched',NULL,'SAM-2','V1');
    GRANT SELECT,INSERT,UPDATE,DELETE ON ALL TABLES IN SCHEMA public TO service_role;
  `)
  await db.exec(migration('20261118_desktop_production_create'))
  await db.exec(migration('20261119_staff_sample_stage'))
  await db.exec(migration('20261120_zzz_staff_workspaces'))
  const value=async (sql,args)=>(await db.query(sql,args)).rows[0]?.value
  const entry={order_id:id(100),size_group_id:id(101),color_id:id(102),department:'Stitching',
    movement:'completed',production_date:'2026-01-01',production_at:null,quantity:10}
  await db.exec('SET ROLE service_role')

  assert.equal(await value('SELECT id AS value FROM staff_production_list($1,NULL)',[id(8)]),id(102))
  assert.equal(await value('SELECT desktop_create_production_entry($1,$2,$3) AS value',[id(8),id(300),entry]),'applied')
  assert.equal(await value('SELECT desktop_create_production_entry($1,$2,$3) AS value',[id(8),id(300),entry]),'already-applied')
  assert.equal(await value('SELECT desktop_create_production_entry($1,$2,$3) AS value',[id(7),id(301),entry]),'unauthorized')
  await assert.rejects(db.query('SELECT * FROM staff_production_list($1,NULL)',[id(14)]),{code:'42501'})

  assert.equal(await value("SELECT desktop_update_sample_stage($1,$2,$3,'Pattern','Cutting') AS value",[id(14),id(301),id(200)]),'applied')
  assert.equal(await value("SELECT desktop_update_sample_stage($1,$2,$3,'Ready','Finishing') AS value",[id(14),id(302),id(201)]),'conflict')
  assert.equal(await value("SELECT desktop_update_sample_stage($1,$2,$3,'Pattern','Ready') AS value",[id(7),id(303),id(200)]),'unauthorized')

  assert.deepEqual((await db.query('SELECT id FROM staff_receiving_list($1,NULL)',[id(7)])).rows,[{id:id(10)}])
  await assert.rejects(db.query('SELECT * FROM staff_receiving_list($1,NULL)',[id(15)]),{code:'42501'})
  await assert.rejects(db.query('SELECT * FROM read_purchase_order_page($1,NULL,NULL)',[id(7)]),{code:'42501'})
  const doc=await value('SELECT document AS value FROM read_purchase_order_page($1,NULL,$2)',[id(7),id(10)])
  assert.deepEqual(Object.keys(doc).sort(),['approval_verified','details_hidden','id'])
  const unapproved=await value("SELECT read_po_receiving($1,$2,NULL,'',NULL,NULL) AS value",[id(7),id(20)])
  assert.deepEqual(unapproved.rows,[])
  const lines=[{operation:id(304),line_id:id(11),quantity:12,accepted:12,rejected:0}]
  assert.equal(await value("SELECT post_po_receiving($1,$2,'2026-01-01','DN-001','',$3) AS value",[id(7),id(10),lines]),'applied')
  await assert.rejects(db.query("SELECT read_po_receiving($1,NULL,NULL,'',NULL,NULL)",[id(7)]),{code:'42501'})
  await db.exec("SELECT set_config('request.headers','{\"x-nzos-edit-proof\":\"test-proof\"}',false)")
  await db.exec('SET ROLE anon')
  assert.equal(await value("SELECT team_can_access('purchasing','create') AS value"),false)
  await assert.rejects(db.query('SELECT * FROM staff_receiving_list($1,NULL)',[id(7)]),{code:'42501'})
})

test('restricted workspace handlers reject other roles and ignore client-supplied actor IDs', async () => {
  const {staffWorkspace}=await import('./staffWorkspaces.js')
  const calls=[]
  const db={rpc:async(name,args)=>{calls.push({name,args});return {data:'applied'}}}
  const setup=(role,action,body={})=>{
    const res={code:200,status(code){this.code=code;return this},json(data){this.data=data;return this}}
    return staffWorkspace({method:'POST',body},res,db,{id:id(7),role},action)
  }
  for(const role of ['hr','production_incharge','sample_room','storekeeper']){
    for(const action of ['accountCreate','editSession','readPOPage','postStoreReceipt','postWorkOrderMovement'])
      assert.equal((await setup(role,action)).code,403)
  }
  assert.equal((await setup('sample_room','staffProductionLog')).code,403)
  assert.equal((await setup('production_incharge','staffSampleStage')).code,403)
  assert.equal((await setup('storekeeper','readPoReceiving')).code,400)
  assert.equal((await setup('sample_room','staffSampleStage',{
    actor:id(1),operation:id(500),sampleId:id(200),previousStage:'Pattern',stage:'Cutting'
  })).code,200)
  assert.equal(calls.at(-1).args.actor,id(7))
  assert.equal(calls.at(-1).name,'desktop_update_sample_stage')
  assert.equal((await setup('production_incharge','staffProductionLog',{
    operation:id(501),orderId:id(100),groupId:id(101),colorId:id(102),
    department:'Stitching',movement:'completed',date:'2026-01-01',place:'Floor',quantity:1.5
  })).code,400)
})
