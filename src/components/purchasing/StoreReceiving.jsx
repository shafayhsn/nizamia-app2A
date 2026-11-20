import React, { useEffect, useRef, useState } from 'react'
import { ArrowDownUp, Printer, RefreshCw, Search, X } from 'lucide-react'
import { request } from '../FulfillmentRegister'
import { printHTML } from '../PrintReports'
import '../fulfillment.css'

const number = new Intl.NumberFormat(undefined, { maximumFractionDigits: 3 })
export const receivingDate = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Karachi' }).format(new Date())
export function receiptPeriod(period, today = receivingDate()) {
  const date = new Date(today + 'T00:00:00Z')
  if (period === 'all') return {}
  if (period === 'month') date.setUTCDate(1)
  if (period === 'week') date.setUTCDate(date.getUTCDate() - (date.getUTCDay() + 6) % 7)
  if (period === 'yesterday') date.setUTCDate(date.getUTCDate() - 1)
  const startDate = date.toISOString().slice(0, 10)
  return { startDate, endDate: period === 'yesterday' ? startDate : today }
}

const quantity = (value, unit) => value == null ? '—' : [number.format(value), unit].filter(Boolean).join(' ')
function total(lines, key) {
  const units = new Map()
  for (const line of lines) {
    if (line[key] == null) continue
    const unit = line.unit || ''
    units.set(unit, (units.get(unit) || 0) + Number(line[key]))
  }
  return [...units].map(([unit, count]) => quantity(count, unit)).join(' · ') || '—'
}

const escape = value => String(value ?? '').replace(/[&<>"']/g, char =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char])
const historyHead = ['Date', 'Delivery note', 'Delivered', 'Accepted', 'Held', 'Rejected', 'Recorded by', 'Notes']
const historyValues = row => [row.date, row.reference, row.quantity, row.accepted, row.held, row.rejected, row.recordedBy, row.notes]

function printReceipt(po) {
  const lines = po.lines.map(line => '<h2>' + escape(line.label) + '</h2><p>' +
    ['ordered', 'received', 'balance'].map(key => escape(key + ' ' + quantity(line[key], line.unit))).join(' · ') +
    '</p><table><thead><tr>' + historyHead.map(label => '<th>' + label + '</th>').join('') + '</tr></thead><tbody>' +
    line.history.map(row => '<tr>' + historyValues(row).map(value => '<td>' + escape(value) + '</td>').join('') + '</tr>').join('') +
    '</tbody></table>').join('')
  printHTML('<div class="page"><h1>Store Receipts — ' +
    escape(po.po_number) + '</h1><p>' + escape(po.supplier || '—') + ' · ' + escape(po.status || '—') + '</p>' + lines + '</div>',
  null, po.po_number + ' Receipt Breakdown')
}

export function RegisterSearch({ value, onChange, placeholder }) {
  return <label className="operations-search"><Search size={15}/><input type="search" aria-label={placeholder} value={value}
    maxLength={120} placeholder={placeholder} onChange={e => onChange(e.target.value)}/></label>
}

export function PoReceivingDialog({ id, receiving = false, onClose, onSaved }) {
  const [result, setResult] = useState(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [date, setDate] = useState(receivingDate)
  const [reference, setReference] = useState('')
  const [notes, setNotes] = useState('')
  const [amounts, setAmounts] = useState({})
  const pending = useRef(null)
  useEffect(() => {
    let active = true
    request('readPoReceiving', { target: id }).then(data => {
      if (active) setResult(data)
    }).catch(err => { if (active) setError(err.message) })
    return () => { active = false }
  }, [id])
  const po = result?.rows[0]
  const writable = receiving && result?.can_post && po?.open
  async function save(event) {
    event.preventDefault()
    if (busy || !writable) return
    const lines = po.lines.filter(line => Number(amounts[line.id]?.quantity)>0).map(line => {
      const entry = amounts[line.id]
      return { line_id: line.id, quantity: entry.quantity, accepted: entry.accepted ?? entry.quantity, rejected: entry.rejected || '0' }
    })
    if (!lines.length) { setError('Enter a delivered quantity for at least one item.'); return }
    const fields = { target: id, date, reference, notes, lines }
    const fingerprint = JSON.stringify(fields)
    if (pending.current?.fingerprint !== fingerprint)
      pending.current = { fingerprint, lines: lines.map(line => ({ ...line, operation: crypto.randomUUID() })) }
    setBusy(true)
    setError('')
    try {
      await request('postPoReceiving', { ...fields, lines: pending.current.lines })
      onSaved()
    } catch (err) { setError(err.message) }
    finally { setBusy(false) }
  }
  const edit = (line, key, value) =>
    setAmounts(previous => ({ ...previous, [line]: { ...previous[line], [key]: value } }))
  return <div className="operations-overlay"><section className="operations-dialog" role="dialog" aria-modal="true" aria-label={receiving ? 'Receive purchase order' : 'Purchase order receipt breakdown'}>
    <header><div><strong>{receiving ? 'Receive Purchase Order' : 'Receipt Breakdown'}</strong>
      {po && <p>{po.po_number} · {po.supplier || '—'} · {po.status || '—'}</p>}</div>
      <button className="btn btn-ghost" aria-label="Close" type="button" disabled={busy} onClick={onClose}><X size={18}/></button>
    </header>
    <form onSubmit={save}>
      {error && <p className="operations-error" role="alert">{error}</p>}
      {!result && !error && <p className="operations-empty">Loading purchase order…</p>}
      {result && !po && <p className="operations-empty">This purchase order is unavailable.</p>}
      {po && receiving && !writable && <p className="operations-empty">Receiving requires Purchasing create access and an approved, issued PO.</p>}
      {writable && <div className="fulfillment-form">
        <label>Received date<input type="date" required value={date} max={receivingDate()} onChange={e => setDate(e.target.value)}/></label>
        <label>Delivery note<input required maxLength={120} value={reference} onChange={e => setReference(e.target.value)}/></label>
        <label>Notes<input maxLength={500} value={notes} onChange={e => setNotes(e.target.value)}/></label>
      </div>}
      {po && <div className="operations-scroll"><table className="fulfillment-table">
        <thead><tr>{['Item','Total ordered','Received','Balance',...(writable ? ['Delivered now','Accepted now','Rejected now'] : [])]
          .map(label => <th key={label} scope="col">{label}</th>)}</tr></thead>
        <tbody>{po.lines.map(line => <tr key={line.id}><td>{line.label}</td>
          {['ordered','received','balance'].map(key => <td key={key}>{quantity(line[key],line.unit)}</td>)}
          {writable && ['quantity','accepted','rejected'].map(key => <td key={key}><input
            aria-label={line.label + ' ' + key} type="number" min="0" max="999999999" step="0.001"
            value={amounts[line.id]?.[key] ?? (key === 'accepted' ? (amounts[line.id]?.quantity ?? '') : '')}
            onChange={e => edit(line.id,key,e.target.value)}/></td>)}</tr>)}</tbody>
      </table></div>}
      {po && !receiving && po.lines.map(line => <div className="operations-breakdown" key={line.id}>
        <h3>{line.label}</h3>
        {line.history.length ? <div className="operations-scroll"><table className="fulfillment-table"><thead><tr>
          {historyHead.map(label => <th key={label} scope="col">{label}</th>)}</tr></thead>
          <tbody>{line.history.map(row => <tr key={row.id}>{historyValues(row).map((value, i) => <td key={i}>{value ?? '—'}</td>)}</tr>)}</tbody>
        </table></div> : <p>No receipts recorded for this item.</p>}
      </div>)}
      <footer>{writable && <button className="btn btn-primary" disabled={busy}>{busy ? 'Posting…' : 'Post Receipt'}</button>}
        {!receiving && po && <button className="btn btn-primary" type="button" onClick={() => printReceipt(po)}><Printer size={15}/> Print breakdown</button>}
      </footer>
    </form>
  </section></div>
}

export default function StoreReceipts() {
  const [search, setSearch] = useState('')
  const [period, setPeriod] = useState('all')
  const [sort, setSort] = useState('asc')
  const [rows, setRows] = useState(null)
  const [cursor, setCursor] = useState(null)
  const [hasMore, setHasMore] = useState(false)
  const [revision, setRevision] = useState(0)
  const [error, setError] = useState('')
  const [detail, setDetail] = useState(null)
  useEffect(() => {
    let active = true
    const timer = setTimeout(async () => {
      try {
        const page = await request('readPoReceiving', { query: search.trim(), afterId: cursor, ...receiptPeriod(period) })
        if (active) {
          setRows(previous => cursor ? [...(previous || []), ...page.rows.slice(0, 50)] : page.rows.slice(0, 50))
          setHasMore(page.rows.length > 50)
        }
      } catch (err) { if (active) setError(err.message) }
    }, 220)
    return () => { active = false; clearTimeout(timer) }
  }, [search, period, cursor, revision])
  function reset() { setCursor(null); setRows(null); setHasMore(false); setError('') }
  const ordered = [...(rows || [])].sort((a,b) => (sort === 'asc' ? 1 : -1)*String(a.po_number).localeCompare(String(b.po_number)))
  return <section className="operations-register">
    <div className="operations-tray">
      <RegisterSearch value={search} onChange={value => { setSearch(value); reset() }} placeholder="Search PO, delivery note, receipt reference, supplier or item"/>
      <select aria-label="Receipt date" value={period} onChange={e => { setPeriod(e.target.value); reset() }}>
        <option value="all">All Dates</option><option value="today">Today</option><option value="yesterday">Yesterday</option>
        <option value="week">This Week</option><option value="month">This Month</option>
      </select>
      <button className="btn btn-secondary btn-sm" type="button" onClick={() => setSort(sort === 'asc' ? 'desc' : 'asc')}><ArrowDownUp size={14}/> PO {sort === 'asc' ? 'A–Z' : 'Z–A'}</button>
      <button className="btn btn-secondary btn-sm" type="button" onClick={() => { reset(); setRevision(revision + 1) }}><RefreshCw size={14}/> Refresh</button>
    </div>
    {error && <p className="operations-error" role="alert">{error}</p>}
    <div className="operations-scroll"><table className="fulfillment-table"><thead><tr>
      {['PO Number','Supplier','Status','Total Ordered','Received','Balance'].map(label => <th key={label} scope="col">{label}</th>)}
    </tr></thead><tbody>{ordered.map(row => <tr key={row.id} onDoubleClick={() => setDetail(row.id)}>
      <td><button className="btn btn-ghost btn-sm" onClick={() => setDetail(row.id)}>{row.po_number}</button></td>
      <td>{row.supplier || '—'}</td><td>{row.status || '—'}</td>
      {['ordered','received','balance'].map(key => <td key={key}>{total(row.lines,key)}</td>)}
    </tr>)}</tbody></table></div>
    {!error && !ordered.length && <p className="operations-empty">{rows ? 'No store receipts match these filters.' : 'Loading store receipts…'}</p>}
    {hasMore && <button className="btn btn-secondary btn-sm operations-more" onClick={() => setCursor(rows.at(-1).id)}>Load more</button>}
    {detail && <PoReceivingDialog id={detail} onClose={() => setDetail(null)}/>}
  </section>
}
