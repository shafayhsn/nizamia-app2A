import React, { useEffect, useState } from 'react'
import './hrAttendance.css'

const today = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Karachi' }).format(new Date())
const time = value => value?.slice(0, 5) || ''
const salary = new Intl.NumberFormat('en-PK', { style: 'currency', currency: 'PKR' })
const blankEmployee = { employee_code: '', name: '', department: '', shift_start: '09:00', shift_end: '18:00',
  monthly_salary: '', overtime_allowed: false }

async function hrRequest(command, fields) {
  const url = location.protocol === 'app2a:' ? '/api/offline/hr-attendance' : '/api/oms'
  const response = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' },
    credentials: 'same-origin', body: JSON.stringify({ action: 'hrAttendance', command, fields }) })
  const result = await response.json()
  if (!response.ok) throw Error(result.error || 'HR request failed.')
  return result
}

export default function HrAttendance({ readOnly = false }) {
  const [tab, setTab] = useState('employees')
  const [date, setDate] = useState(today)
  const [data, setData] = useState(null)
  const [error, setError] = useState('')
  const [employee, setEmployee] = useState(null)
  const [entry, setEntry] = useState(null)
  const [removal, setRemoval] = useState(null)
  const [busy, setBusy] = useState(false)
  const [revision, setRevision] = useState(0)

  useEffect(() => {
    let current = true
    hrRequest('list', { date }).then(result => {
      if (current) setData(result)
    }).catch(err => { if (current) setError(err.message) })
    return () => { current = false }
  }, [date, revision])

  async function save(command, fields) {
    if (busy) return
    setError('')
    setBusy(true)
    try {
      await hrRequest(command, fields)
      setEmployee(null)
      setEntry(null)
      setRemoval(null)
      setRevision(value => value + 1)
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  const employees = data?.employees || []
  const recorded = new Map((data?.attendance || []).map(row => [row.employee_id, row]))
  const attendance = [
    ...employees.map(row => ({ ...row, ...recorded.get(row.id), employee_id: row.id })),
    ...[...recorded.values()].filter(row => row.archived),
  ]

  return <section className="hr-page">
    {!readOnly && <h1 className="app-page-title">HR &amp; Attendance</h1>}
    <div className="hr-toolbar">
      <button className="btn btn-secondary" aria-pressed={tab === 'employees'} disabled={busy} onClick={() => setTab('employees')}>Employees</button>
      <button className="btn btn-secondary" aria-pressed={tab === 'attendance'} disabled={busy} onClick={() => setTab('attendance')}>Attendance</button>
      {tab === 'employees' && !readOnly && <button className="btn btn-primary" disabled={busy}
        onClick={() => { setRemoval(null); setEmployee({ ...blankEmployee, id: crypto.randomUUID() }) }}>Add employee</button>}
      {tab === 'attendance' && <label>Date <input type="date" value={date} max={today()} disabled={busy} onChange={event => {
        if (!event.target.value) return
        setData(null)
        setError('')
        setEntry(null)
        setDate(event.target.value)
      }} /></label>}
    </div>
    {error && <p role="alert" className="hr-error">{error}</p>}
    {!data && !error && <p role="status">Loading HR records…</p>}
    {tab === 'employees' && employee && <form className="hr-form" onSubmit={event => {
      event.preventDefault()
      save('saveEmployee', employee)
    }}>
      {[['employee_code', 'Employee number'], ['name', 'Name'], ['department', 'Department'],
        ['shift_start', 'Shift starts', 'time'], ['shift_end', 'Shift ends', 'time'], ['monthly_salary', 'Monthly salary (PKR)', 'number']
      ].map(([key, label, type]) => <label key={key}>{label}
        <input type={type || 'text'} required={key !== 'department'} value={employee[key]}
          min={type === 'number' ? '0' : undefined} step={type === 'number' ? '0.01' : undefined}
          onChange={event => setEmployee({ ...employee, [key]: event.target.value })} />
      </label>)}
      <label className="hr-checkbox"><input type="checkbox" checked={employee.overtime_allowed}
        onChange={event => setEmployee({ ...employee, overtime_allowed: event.target.checked })} /> Eligible for overtime</label>
      <button className="btn btn-primary" disabled={busy}>Save employee</button>
      <button className="btn btn-secondary" type="button" disabled={busy} onClick={() => setEmployee(null)}>Cancel</button>
    </form>}
    {tab === 'employees' && removal && <div role="alert" className="hr-form">
      <span>Remove {removal.name} from the active employee list? Their attendance history will be kept.</span>
      <button className="btn btn-primary" disabled={busy} onClick={() => save('archiveEmployee', { id: removal.id })}>Remove employee</button>
      <button className="btn btn-secondary" disabled={busy} onClick={() => setRemoval(null)}>Cancel</button>
    </div>}
    {tab === 'attendance' && entry && <form className="hr-form" onSubmit={event => {
      event.preventDefault()
      save('saveAttendance', { ...entry, date })
    }}>
      <strong>{entry.name}</strong>
      <label>Clock in<input type="time" required value={entry.clock_in} onChange={event => setEntry({ ...entry, clock_in: event.target.value })} /></label>
      <label>Clock out<input type="time" value={entry.clock_out} onChange={event => setEntry({ ...entry, clock_out: event.target.value })} /></label>
      <button className="btn btn-primary" disabled={busy}>Save attendance</button>
      <button className="btn btn-secondary" type="button" disabled={busy} onClick={() => setEntry(null)}>Cancel</button>
    </form>}
    {data && <div className="hr-table-wrap"><table className="fulfillment-table">
      <thead><tr>{['Employee number', 'Name', ...(tab === 'employees'
        ? ['Department', 'Shift', 'Overtime eligible', 'Monthly salary']
        : ['Shift', 'Clock in', 'Clock out', 'Arrival', 'Overtime']), ...(!readOnly ? ['Actions'] : [])]
        .map(label => <th key={label} scope="col">{label}</th>)}</tr></thead>
      <tbody>{tab === 'employees' ? employees.map(row => <tr key={row.id}>
        <td>{row.employee_code}</td><td>{row.name}</td><td>{row.department || '—'}</td>
        <td>{time(row.shift_start)}–{time(row.shift_end)}</td><td>{row.overtime_allowed ? 'Yes' : 'No'}</td>
        <td>{salary.format(row.monthly_salary)}</td>
        {!readOnly && <td><button className="btn btn-ghost btn-sm" disabled={busy} onClick={() => {
          setRemoval(null)
          setEmployee({ ...row, shift_start: time(row.shift_start), shift_end: time(row.shift_end) })
        }}>Edit</button><button className="btn btn-ghost btn-sm" disabled={busy}
          onClick={() => { setEmployee(null); setRemoval(row) }}>Remove</button></td>}
      </tr>) : attendance.map(row => <tr key={row.employee_id}>
        <td>{row.employee_code}</td><td>{row.name}{row.archived && ' (removed)'}</td>
        <td>{time(row.shift_start)}–{time(row.shift_end)}</td><td>{time(row.clock_in) || '—'}</td><td>{time(row.clock_out) || '—'}</td>
        <td>{row.clock_in ? row.late ? 'Late' : 'On time' : 'Unrecorded'}</td>
        <td>{row.clock_out ? `${row.overtime_minutes} min` : '—'}</td>
        {!readOnly && <td>{!row.archived && <button className="btn btn-ghost btn-sm" disabled={busy} onClick={() =>
          setEntry({ id: row.employee_id, name: row.name, clock_in: time(row.clock_in), clock_out: time(row.clock_out) })
        }>{row.clock_in ? 'Edit' : 'Record'}</button>}</td>}
      </tr>)}</tbody>
    </table>
    {(tab === 'employees' ? employees : attendance).length === 0 && <p>No employee records to show.</p>}
    </div>}
  </section>
}
