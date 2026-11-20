const { test } = require('node:test')
const assert = require('node:assert/strict')
const { readFileSync } = require('node:fs')
const { join } = require('node:path')
const { PGlite } = require('@electric-sql/pglite')

const id = n => '00000000-0000-4000-8000-' + String(n).padStart(12, '0')
test('HR owns staff records, admin can manage records, and attendance preserves shift and employee history', async t => {
  const db = new PGlite()
  t.after(() => db.close())
  await db.exec(`
    CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;
    CREATE SCHEMA desktop_private;
    GRANT USAGE ON SCHEMA desktop_private TO service_role;
    CREATE TABLE roles(id uuid PRIMARY KEY,name text NOT NULL);
    CREATE TABLE permissions(role_id uuid,module text);
    CREATE TABLE users(id uuid PRIMARY KEY,role text,is_active boolean,is_restricted boolean,deleted_at timestamptz);
    INSERT INTO users VALUES ('${id(1)}','hr',true,false,NULL),('${id(2)}','admin',true,false,NULL),
      ('${id(3)}','staff',true,false,NULL),('${id(4)}','hr',true,true,NULL);
    GRANT SELECT,UPDATE ON users TO service_role;
  `)
  await db.exec(readFileSync(join(__dirname, 'migrations/20261120_z_hr_attendance.sql'), 'utf8'))
  const revised = readFileSync(join(__dirname, 'migrations/20261120_zz_operations_workflows.sql'), 'utf8')
  await db.exec(revised.slice(0,revised.indexOf('CREATE OR REPLACE FUNCTION public.read_work_order_tracking')))

  await db.exec("INSERT INTO permissions SELECT id,'orders' FROM roles WHERE name='hr'")
  assert.equal((await db.query('SELECT count(*) FROM permissions')).rows[0].count, 0)
  await db.exec('SET ROLE service_role')
  const action = async (actor, command, fields) => (await db.query('SELECT hr_attendance_action($1,$2,$3) AS value',
    [id(actor), command, fields])).rows[0].value
  const employee = { id: id(11), employee_code: 'EMP-11', name: 'Test Employee', department: 'Cutting',
    shift_start: '09:00', shift_end: '18:00', monthly_salary: 45000, overtime_allowed: true }
  const date = '2026-01-01'
  assert.equal((await action(1, 'saveEmployee', employee)).result, 'saved')
  assert.equal((await action(2, 'saveEmployee', { ...employee, name: 'Updated by admin' })).result, 'saved')
  await assert.rejects(action(3, 'list', { date }), { code: '42501' })
  await assert.rejects(action(4, 'list', { date }), { code: '42501' })
  assert.equal((await action(2, 'list', { date })).employees[0].monthly_salary, 45000)
  const record = (clock_in, clock_out) => action(1, 'saveAttendance', { id: id(11), date, clock_in, clock_out })
  await record('09:30', '18:00')
  let [entry] = (await action(2, 'list', { date })).attendance
  assert.deepEqual([entry.late, entry.overtime_minutes], [false, 0])
  await action(1, 'saveEmployee', { ...employee, shift_start: '10:00', overtime_allowed: false })
  await record('09:31', '18:01')
  ;[entry] = (await action(1, 'list', { date })).attendance
  assert.deepEqual([entry.late, entry.overtime_minutes], [true, 1])
  const nextDay = '2026-01-02'
  await action(1, 'saveAttendance', { id: id(11), date: nextDay, clock_in: '10:00', clock_out: '19:00' })
  assert.equal((await action(1, 'list', { date: nextDay })).attendance[0].overtime_minutes, 0)
  await assert.rejects(record('10:00', '09:59'), { code: '23514' })
  await action(2, 'archiveEmployee', { id: id(11) })
  const archived = await action(2, 'list', { date })
  assert.equal(archived.employees.length, 0)
  assert.equal(archived.attendance[0].archived, true)
  assert.equal((await record('09:00', '18:00')).result, 'missing')
  await db.exec('RESET ROLE; SET ROLE authenticated')
  await assert.rejects(action(1, 'list', { date }), { code: '42501' })
})
