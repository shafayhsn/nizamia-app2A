import React, { useEffect, useRef, useState } from 'react'
import { ArrowDownUp, Plus, RefreshCw, Search, X } from 'lucide-react'
import './fulfillment.css'

const receipt = {
  read: 'readStoreReceipts',
  post: 'postStoreReceipt',
  title: 'Store Receipts',
  number: 'PO',
  partner: 'Supplier',
  search: 'PO, item, or supplier',
  reference: 'Delivery note',
  history: 'Receipt history',
  action: 'Record receipt',
  columns: [
    ['ordered', 'Ordered'], ['delivered', 'Delivered'], ['accepted', 'Accepted'],
    ['held', 'On hold'], ['rejected', 'Rejected'], ['pending', 'Pending'], ['excess', 'Over received'],
  ],
}
const workOrder = {
  read: 'readWorkOrderTracking',
  post: 'postWorkOrderMovement',
  title: 'Work Order Tracking',
  number: 'WO',
  partner: 'Vendor',
  search: 'WO, process, or vendor',
  reference: 'Dispatch or return note',
  action: 'Record movement',
  history: 'Movement history',
  columns: [
    ['ordered', 'Ordered'], ['awaitingDispatch', 'To dispatch'], ['out', 'With vendor'],
    ['accepted', 'Accepted'], ['rework', 'For rework'], ['rejected', 'Rejected'],
  ],
}
const movementLabels = {
  dispatch: 'Dispatch', dispatchRework: 'Dispatch for rework',
  accept: 'Return accepted', rework: 'Return for rework', reject: 'Return rejected',
}
const format = new Intl.NumberFormat(undefined, { maximumFractionDigits: 3 })
const today = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Karachi' }).format(new Date())

export async function request(action, fields) {
  const url = location.protocol === 'app2a:' ? '/api/offline/fulfillment' : '/api/oms'
  const response = await fetch(url, {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...fields, action }),
  })
  const result = await response.json()
  if (!response.ok) throw new Error(result.error || 'Register unavailable.')
  return result
}

export default function FulfillmentRegister({ workOrders = false }) {
  const config = workOrders ? workOrder : receipt
  const [search, setSearch] = useState('')
  const [sort, setSort] = useState('due')
  const [status, setStatus] = useState('all')
  const [dialog, setDialog] = useState(false)
  const [filter, setFilter] = useState({ query: '', afterId: null })
  const [page, setPage] = useState(null)
  const [selected, setSelected] = useState(null)
  const [history, setHistory] = useState(null)
  const [historyError, setHistoryError] = useState('')
  const [form, setForm] = useState(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [formError, setFormError] = useState('')
  const pending = useRef(null)

  useEffect(() => {
    let active = true
    setPage(null)
    setError('')
    request(config.read, filter).then(result => {
      if (active) setPage(result)
    }).catch(err => { if (active) setError(err.message) })
    return () => { active = false }
  }, [config, filter])

  useEffect(() => {
    if (!selected) return
    let active = true
    setHistory(null)
    setHistoryError('')
    request(config.read, { target: selected }).then(result => {
      if (active) setHistory(result.history)
    }).catch(err => { if (active) setHistoryError(err.message) })
    return () => { active = false }
  }, [config, selected, filter])

  const source = page?.rows.slice(0, 50) ?? []
  const lines = source.filter(row => status === 'all' || String(row.status).toLowerCase() === status).sort((a,b) =>
    sort === 'due' ? (a.due || '9999').localeCompare(b.due || '9999') || String(a.number).localeCompare(String(b.number))
      : String(a.number).localeCompare(String(b.number)))
  const line = lines.find(row => row.id === selected)
  const reload = () => setFilter(current => ({ ...current }))
  function searchRegister(event) {
    event.preventDefault()
    setSelected(null)
    setForm(null)
    setDialog(false)
    setFilter({ query: search.trim(), afterId: null })
  }

  function startEntry() {
    pending.current = null
    setFormError('')
    setForm({ date: today(), reference: '', quantity: '', notes: '',
      ...(workOrders ? { movement: 'dispatch' } : { accepted: '0', rejected: '0' }) })
  }

  async function save(event) {
    event.preventDefault()
    if (busy || !line || !form) return
    const fields = { ...form, target: line.id }
    const fingerprint = JSON.stringify(fields)
    if (pending.current?.fingerprint !== fingerprint)
      pending.current = { fingerprint, operation: crypto.randomUUID() }
    setBusy(true)
    setFormError('')
    try {
      await request(config.post, { ...fields, operation: pending.current.operation })
      setForm(null)
      reload()
    } catch (err) {
      setFormError(err.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="operations-register">
      <form onSubmit={searchRegister} className="operations-tray">
        <label className="operations-search"><Search size={15}/><input type="search" aria-label="Search work orders"
          placeholder={config.search} value={search} maxLength={120} onChange={event => setSearch(event.target.value)}/></label>
        <button className="btn btn-secondary btn-sm" disabled={busy}>Search</button>
        <select aria-label="Work order status" value={status} onChange={e=>{setStatus(e.target.value);setSelected(null)}}>
          <option value="all">All statuses</option>
          {[...new Set(source.map(row=>String(row.status || '').toLowerCase()).filter(Boolean))].sort().map(value=>
            <option key={value} value={value}>{source.find(row=>String(row.status).toLowerCase()===value)?.status}</option>)}
        </select>
        <button className="btn btn-secondary btn-sm" type="button" onClick={()=>setSort(sort==='due'?'reference':'due')}><ArrowDownUp size={14}/> {sort==='due'?'Due date':'WO number'}</button>
        <button className="btn btn-secondary btn-sm" type="button" disabled={busy} onClick={reload}><RefreshCw size={14}/> Refresh</button>
        <button className="btn btn-primary btn-sm" type="button" disabled={busy || !page?.can_post || !line?.open}
          onClick={()=>{setDialog(true);startEntry()}}><Plus size={14}/> Log Update</button>
      </form>
      {error && <p className="operations-error" role="alert">{error}</p>}
      {!page && !error && <p className="operations-empty" role="status">Loading work orders…</p>}
      {page && !lines.length && <p className="operations-empty">No work orders match these filters.</p>}
      {line && !line.open && <p className="operations-message">Updates can be logged for issued or in-progress work orders with whole-piece lines.</p>}
      {lines.length > 0 && (
        <div style={{ overflowX: 'auto' }}>
          <table className="fulfillment-table">
            <thead><tr>
              {['Select', config.number, 'Line item', config.partner, 'Due', 'Status', ...config.columns.map(([, label]) => label), 'Unit']
                .map(label => <th key={label} scope="col">{label}</th>)}
            </tr></thead>
            <tbody>{lines.map(row => (
              <tr key={row.id} className={row.id === selected ? 'selected' : undefined}
                onClick={event => { if (!event.target.closest('button,input')) setSelected(row.id) }}
                onDoubleClick={() => {setSelected(row.id);setForm(null);setDialog(true)}}>
                <td><input type="checkbox" aria-label={'Select ' + row.number + ' ' + row.label} checked={row.id===selected}
                  onChange={event=>setSelected(event.target.checked ? row.id : null)}/></td>
                <td><button className="btn btn-ghost btn-sm" type="button" disabled={busy}
                  aria-pressed={row.id === selected} onClick={() => { setSelected(row.id); setForm(null) }}>{row.number}</button></td>
                <td>{row.label}{row.detail && <small style={{ display: 'block' }}>{row.detail}</small>}</td>
                <td>{row.partner || '—'}</td><td>{row.due || '—'}</td><td>{row.status || '—'}</td>
                {config.columns.map(([key]) => <td key={key}>{row[key] == null ? '—' : format.format(row[key])}</td>)}
                <td>{row.unit || '—'}</td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      )}
      {(filter.afterId || page?.rows.length > 50) && (
        <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
          {filter.afterId && <button className="btn btn-secondary btn-sm" disabled={busy}
            onClick={() => { setSelected(null); setForm(null); setFilter({ ...filter, afterId: null }) }}>First page</button>}
          {page?.rows.length > 50 && <button className="btn btn-secondary btn-sm" disabled={busy}
            onClick={() => { setSelected(null); setForm(null); setFilter({ ...filter, afterId: source.at(-1).id }) }}>Next page</button>}
        </div>
      )}
      {dialog && line && (
        <div className="operations-overlay"><section className="operations-dialog" role="dialog" aria-modal="true" aria-label="Work order updates">
          <header><div><strong>{line.number} · {line.label}</strong><p>{line.partner || '—'} · {line.status || '—'} · With vendor: {format.format(line.out || 0)}</p></div>
          <button type="button" className="btn btn-ghost" aria-label="Close" disabled={busy} onClick={()=>{setDialog(false);setForm(null)}}><X size={18}/></button></header>
          <div className="operations-breakdown">
          {page.can_post && line.open && !form && <button className="btn btn-primary btn-sm" onClick={startEntry}>{config.action}</button>}
          {form && (
            <form className="fulfillment-form" onSubmit={save}>
              <label>Date<input required type="date" max={today()} value={form.date}
                onChange={event => setForm({ ...form, date: event.target.value })} /></label>
              <label>{config.reference}<input required maxLength={120} value={form.reference}
                onChange={event => setForm({ ...form, reference: event.target.value })} /></label>
              {workOrders && <label>Movement<select value={form.movement}
                onChange={event => setForm({ ...form, movement: event.target.value })}>
                {Object.entries(movementLabels).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
              </select></label>}
              {(workOrders ? [['quantity', 'Pieces']] : [['quantity', 'Delivered'], ['accepted', 'Accepted'], ['rejected', 'Rejected']]).map(([key, label]) =>
                <label key={key}>{label}<input required type="number" min={workOrders ? '1' : key === 'quantity' ? '0.001' : '0'} max="999999999"
                  step={workOrders ? '1' : '0.001'} value={form[key]} onChange={event => setForm({ ...form, [key]: event.target.value })} /></label>)}
              <label>Notes<input maxLength={500} value={form.notes} onChange={event => setForm({ ...form, notes: event.target.value })} /></label>
              <div style={{ display: 'flex', gap: 8 }}>
                <button className="btn btn-primary btn-sm" disabled={busy}>{busy ? 'Saving…' : 'Save'}</button>
                <button className="btn btn-secondary btn-sm" type="button" disabled={busy} onClick={() => setForm(null)}>Cancel</button>
              </div>
              {formError && <p role="alert">{formError}</p>}
            </form>
          )}
          <h4 style={{ marginTop: 16 }}>{config.history}</h4>
          {historyError && <p role="alert">{historyError}</p>}
          {!history && !historyError && <p role="status">Loading history…</p>}
          {history?.length === 0 && <p>No entries recorded.</p>}
          {history?.length > 0 && <div style={{ overflowX: 'auto' }}><table className="fulfillment-table">
            <thead><tr>{['Date', config.reference, ...(workOrders ? ['Movement', 'Pieces'] : ['Delivered', 'Accepted', 'On hold', 'Rejected']),
              'Recorded by', 'Notes']
              .map(label => <th key={label} scope="col">{label}</th>)}</tr></thead>
            <tbody>{history.map(row => <tr key={row.id}>
              <td>{workOrders ? row.moved_on : row.received_on}</td><td>{workOrders ? row.reference : row.delivery_ref}</td>
              {workOrders && <td>{movementLabels[row.movement]}</td>}
              <td>{format.format(row.quantity)}</td>
              {!workOrders && <>
                <td>{format.format(row.accepted)}</td><td>{format.format(Number(row.quantity) - row.accepted - row.rejected)}</td>
                <td>{format.format(row.rejected)}</td>
              </>}
              <td>{row.recorded_by || '—'}</td><td>{row.notes || '—'}</td>
            </tr>)}</tbody>
          </table></div>}
        </div></section></div>
      )}
    </section>
  )
}
