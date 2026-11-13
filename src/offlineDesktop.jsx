import React, { useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'
import './offlineDesktop.css'

const PAGE_SIZE = 25
const MODULES = [
  { key: 'orders', label: 'Orders', match: name => /(^orders$|^order_|_orders$|^buyers$|^styles$|^order_items$)/.test(name) },
  { key: 'production', label: 'Production', match: name => /production|cutting|sewing|washing|finishing|packing|batch|line_output|quality|inspection/i.test(name) },
  { key: 'all', label: 'All tables', match: () => true }
]
function App() {
  const [summary, setSummary] = useState(null)
  const [tables, setTables] = useState([])
  const [search, setSearch] = useState('')
  const [module, setModule] = useState('orders')
  const [selected, setSelected] = useState(null)
  const [offset, setOffset] = useState(0)
  const [rows, setRows] = useState([])
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [overview, setOverview] = useState(null)
  const [recordQuery, setRecordQuery] = useState('')
  const [debouncedQuery, setDebouncedQuery] = useState('')
  const [department, setDepartment] = useState('')
  const [departments, setDepartments] = useState([])
  const [filteredTotal, setFilteredTotal] = useState(null)
  const [detail, setDetail] = useState(null)
  const [related, setRelated] = useState(null)
  useEffect(() => {
    const api = window.localSnapshot
    if (!api) { setError('Local SQLite bridge is unavailable. Open this screen from the desktop Database menu.'); return }
    Promise.all([api.summary(), api.tables()]).then(([s, t]) => {
      setSummary(s); setTables(t)
    }).catch(e => setError(e.message))
  }, [])
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedQuery(recordQuery), 250)
    return () => clearTimeout(timer)
  }, [recordQuery])
  useEffect(() => {
    if (!selected) return
    let cancelled = false
    setLoading(true); setError('')
    window.localSnapshot.filteredRows(selected.name, offset, debouncedQuery, department).then(data => {
      if (!cancelled) { setRows(data.rows); setFilteredTotal(data.total); setDepartments(data.departments) }
    }).catch(e => { if (!cancelled) setError(e.message) }).finally(() => {
      if (!cancelled) setLoading(false)
    })
    return () => { cancelled = true }
  }, [selected, offset, debouncedQuery, department])
  useEffect(() => {
    if (module === 'all' || !window.localSnapshot?.moduleOverview) { setOverview(null); return }
    let cancelled = false
    setOverview(null)
    window.localSnapshot.moduleOverview(module).then(data => { if (!cancelled) setOverview(data) }).catch(e => { if (!cancelled) setError(e.message) })
    return () => { cancelled = true }
  }, [module])
  useEffect(() => {
    if (!detail?.id || selected?.name !== 'orders') { setRelated(null); return }
    let cancelled = false
    window.localSnapshot.relatedRows(detail.id).then(data => { if (!cancelled) setRelated(data) }).catch(e => { if (!cancelled) setError(e.message) })
    return () => { cancelled = true }
  }, [detail, selected])
  const columns = [...new Set(rows.flatMap(row => Object.keys(row || {})))]
  const fmt = v => v == null ? '' : typeof v === 'object' ? JSON.stringify(v) : String(v)
  return <div className="app">
    <header><div><h1>Nizamia App-2A</h1><p>Local records · Offline · Read only</p></div><div className="totals">{summary ? <><strong>{summary.tables} tables</strong><strong>{summary.records.toLocaleString()} records</strong></> : 'Opening SQLite…'}</div></header>
    <div className="notice">This is a saved snapshot, not the live cloud database. Editing, offline sign-in, and automatic synchronization are not enabled. Access to this local copy must be protected by your Mac account.</div>
    <div className="modules" role="tablist" aria-label="Offline business modules">{MODULES.map(m => <button key={m.key} role="tab" aria-selected={module === m.key} className={module === m.key ? 'active' : ''} onClick={() => { setModule(m.key); setSelected(null); setRows([]); setOffset(0); setSearch(''); setDetail(null); setRecordQuery(''); setDepartment('') }}>{m.label}</button>)}</div>
    <div className="layout">
      <aside><input aria-label="Search tables" placeholder="Search tables…" value={search} onChange={e => setSearch(e.target.value)}/><nav>{tables.filter(t => MODULES.find(m => m.key === module).match(t.name) && t.name.toLowerCase().includes(search.toLowerCase())).map(t => <button key={t.name} className={selected?.name === t.name ? 'active' : ''} onClick={() => {setSelected(t);setOffset(0);setRows([]);setDetail(null);setRecordQuery('');setDepartment('');setDepartments([])}}><span>{t.name.replaceAll('_',' ')}</span><span>{t.count}</span></button>)}</nav></aside>
      <main>{error && <div className="error" role="alert">{error}</div>}
        {selected ? <><div className="toolbar"><div><h2>{selected.name.replaceAll('_',' ')}</h2><small>{filteredTotal == null ? selected.count.toLocaleString() : filteredTotal.toLocaleString()} matching records</small></div><div className="pages"><button disabled={loading || offset === 0} onClick={() => setOffset(Math.max(0,offset-PAGE_SIZE))}>Previous</button><span>{(filteredTotal ?? selected.count) ? offset+1 : 0}–{Math.min(offset+PAGE_SIZE,filteredTotal ?? selected.count)}</span><button disabled={loading || offset+PAGE_SIZE >= (filteredTotal ?? selected.count)} onClick={() => setOffset(offset+PAGE_SIZE)}>Next</button></div></div>
          <div className="filters"><input aria-label="Search records" placeholder="Search records…" value={recordQuery} onChange={e => {setRecordQuery(e.target.value);setOffset(0)}} />{module === 'production' && departments.length > 0 && <select aria-label="Department" value={department} onChange={e => {setDepartment(e.target.value);setOffset(0)}}><option value="">All departments</option>{departments.map(d => <option key={d} value={d}>{d}</option>)}</select>}</div>
          <div className="tablewrap"><table><thead><tr>{columns.map(c => <th key={c}>{c.replaceAll('_',' ')}</th>)}</tr></thead><tbody>{rows.map((row,i) => <tr key={i} className="recordrow" onClick={() => setDetail(row)}>{columns.map(c => <td key={c} title={fmt(row[c])}>{fmt(row[c])}</td>)}</tr>)}</tbody></table></div>{loading && <p>Reading local records…</p>}{detail && <section className="recorddetail"><button onClick={() => setDetail(null)}>Close details</button><h3>Record details</h3><dl>{Object.entries(detail).map(([key,value]) => <React.Fragment key={key}><dt>{key.replaceAll('_',' ')}</dt><dd>{fmt(value)}</dd></React.Fragment>)}</dl>{related && <><h3>Related saved records</h3>{Object.entries(related).map(([name,items]) => <p key={name}>{name.replaceAll('_',' ')}: {items.length} matching records{items.length === 100 ? ' (first 100)' : ''}</p>)}</>}</section>}</> :
          <div className="welcome"><h2>{MODULES.find(m => m.key === module).label} · Local snapshot</h2>{overview && <div className="overview">{Object.entries(overview).map(([name, data]) => <div key={name}><strong>{data.count.toLocaleString()}</strong><span>{name.replaceAll('_', ' ')}</span></div>)}{!Object.keys(overview).length && <p>No matching module tables were included in this snapshot.</p>}</div>}{overview?.orders?.records?.length > 0 && <div className="recent"><h3>Saved orders preview (first 10)</h3>{overview.orders.records.slice(0, 10).map((o,i) => <div key={o.id || i}><strong>{o.job_number || o.po_number || o.factory_ref || 'Order'}</strong><span>{o.buyer_name || o.store_name || '—'}</span><span>{Number(o.total_qty || 0).toLocaleString()} pcs</span></div>)}</div>}<p>Choose a related table on the left to browse records stored on this Mac. This is a read-only module view, not the cloud workflow or its editing forms.</p>{summary?.importedAt && <p>Snapshot imported: {new Date(summary.importedAt).toLocaleString()}</p>}</div>}
      </main>
    </div>
  </div>
}
createRoot(document.getElementById('root')).render(<App />)
