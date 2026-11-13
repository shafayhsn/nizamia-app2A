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
  useEffect(() => {
    const api = window.localSnapshot
    if (!api) { setError('Local SQLite bridge is unavailable. Open this screen from the desktop Database menu.'); return }
    Promise.all([api.summary(), api.tables()]).then(([s, t]) => {
      setSummary(s); setTables(t)
    }).catch(e => setError(e.message))
  }, [])
  useEffect(() => {
    if (!selected) return
    let cancelled = false
    setLoading(true); setError('')
    window.localSnapshot.rows(selected.name, offset).then(data => {
      if (!cancelled) setRows(data)
    }).catch(e => { if (!cancelled) setError(e.message) }).finally(() => {
      if (!cancelled) setLoading(false)
    })
    return () => { cancelled = true }
  }, [selected, offset])
  const columns = [...new Set(rows.flatMap(row => Object.keys(row || {})))]
  const fmt = v => v == null ? '' : typeof v === 'object' ? JSON.stringify(v) : String(v)
  return <div className="app">
    <header><div><h1>Nizamia App-2A</h1><p>Local records · Offline · Read only</p></div><div className="totals">{summary ? <><strong>{summary.tables} tables</strong><strong>{summary.records.toLocaleString()} records</strong></> : 'Opening SQLite…'}</div></header>
    <div className="notice">This is a saved snapshot, not the live cloud database. Editing, offline sign-in, and automatic synchronization are not enabled. Access to this local copy must be protected by your Mac account.</div>
    <div className="modules" role="tablist" aria-label="Offline business modules">{MODULES.map(m => <button key={m.key} role="tab" aria-selected={module === m.key} className={module === m.key ? 'active' : ''} onClick={() => { setModule(m.key); setSelected(null); setRows([]); setOffset(0); setSearch('') }}>{m.label}</button>)}</div>
    <div className="layout">
      <aside><input aria-label="Search tables" placeholder="Search tables…" value={search} onChange={e => setSearch(e.target.value)}/><nav>{tables.filter(t => MODULES.find(m => m.key === module).match(t.name) && t.name.toLowerCase().includes(search.toLowerCase())).map(t => <button key={t.name} className={selected?.name === t.name ? 'active' : ''} onClick={() => {setSelected(t);setOffset(0);setRows([])}}><span>{t.name.replaceAll('_',' ')}</span><span>{t.count}</span></button>)}</nav></aside>
      <main>{error && <div className="error" role="alert">{error}</div>}
        {selected ? <><div className="toolbar"><div><h2>{selected.name.replaceAll('_',' ')}</h2><small>{selected.count.toLocaleString()} records</small></div><div className="pages"><button disabled={loading || offset === 0} onClick={() => setOffset(Math.max(0,offset-PAGE_SIZE))}>Previous</button><span>{selected.count ? offset+1 : 0}–{Math.min(offset+PAGE_SIZE,selected.count)}</span><button disabled={loading || offset+PAGE_SIZE >= selected.count} onClick={() => setOffset(offset+PAGE_SIZE)}>Next</button></div></div>
          <div className="tablewrap"><table><thead><tr>{columns.map(c => <th key={c}>{c.replaceAll('_',' ')}</th>)}</tr></thead><tbody>{rows.map((row,i) => <tr key={i}>{columns.map(c => <td key={c} title={fmt(row[c])}>{fmt(row[c])}</td>)}</tr>)}</tbody></table></div>{loading && <p>Reading local records…</p>}</> :
          <div className="welcome"><h2>{MODULES.find(m => m.key === module).label} · Local snapshot</h2><p>Choose a related table on the left to browse records stored on this Mac. This is a read-only module view, not the cloud workflow or its editing forms.</p>{summary?.importedAt && <p>Snapshot imported: {new Date(summary.importedAt).toLocaleString()}</p>}</div>}
      </main>
    </div>
  </div>
}
createRoot(document.getElementById('root')).render(<App />)
