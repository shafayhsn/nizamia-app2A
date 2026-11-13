import React, { useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'
import './offlineDesktop.css'

const PAGE_SIZE = 25
// Snapshot navigation mirrors the existing web app; these are read-only data views,
// not replacements for the live pages or their workflow forms.
const MODULES = [
  { key: 'dashboard', label: 'Dashboard', match: n => /^(orders|tasks|production_daily_entries|purchase_orders)$/.test(n) },
  { key: 'orders', label: 'Orders', match: n => /(^orders$|^order_|_orders$|^size_group|^bom_items$|^styles$)/.test(n) },
  { key: 'purchasing', label: 'Purchasing', match: n => /purchas|supplier|bom_|material|fabric|trim|inventory/i.test(n) },
  { key: 'sampling', label: 'Sampling & Approvals', match: n => /sampl|fitting|approval|embellish/i.test(n) },
  { key: 'parcels', label: 'Parcels', match: n => /parcel|courier|dispatch/i.test(n) },
  { key: 'shipping', label: 'Booking & Shipping', match: n => /ship|booking|container|vessel|freight/i.test(n) },
  { key: 'reports', label: 'Reports', match: n => /report|quality|inspection|production_daily_entries/i.test(n) },
  { key: 'tasks', label: 'Tasks', match: n => /task|todo|reminder/i.test(n) },
  { key: 'production', label: 'Production', match: n => /production|cutting|sewing|washing|finishing|packing|batch|line_output|quality|inspection/i.test(n) },
  { key: 'buyers', label: 'Buyers', match: n => /buyer|customer/i.test(n) },
  { key: 'suppliers', label: 'Suppliers', match: n => /supplier|vendor/i.test(n) },
  { key: 'library', label: 'Library', match: n => /library|document|attachment|file|media/i.test(n) },
  { key: 'all', label: 'All tables', match: () => true }
]
function App() {
  const [summary, setSummary] = useState(null)
  const [workspace, setWorkspace] = useState(null)
  const [passphrase, setPassphrase] = useState('')
  const [drafts, setDrafts] = useState([])
  const [draftPreview, setDraftPreview] = useState(null)
  const [authBusy, setAuthBusy] = useState(false)
  const [workspaceError, setWorkspaceError] = useState('')
  const [recoveryMessage, setRecoveryMessage] = useState('')
  const [tables, setTables] = useState([])
  const [search, setSearch] = useState('')
  const [module, setModule] = useState('dashboard')
  const [selected, setSelected] = useState(null)
  const [offset, setOffset] = useState(0)
  const [rows, setRows] = useState([])
  const [visibleColumns, setVisibleColumns] = useState(null)
  const [sortBy, setSortBy] = useState('')
  const [descending, setDescending] = useState(false)
  const [columnEditor, setColumnEditor] = useState(false)
  const [presetMessage, setPresetMessage] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [overview, setOverview] = useState(null)
  const [recordQuery, setRecordQuery] = useState('')
  const [debouncedQuery, setDebouncedQuery] = useState('')
  const [department, setDepartment] = useState('')
  const [departments, setDepartments] = useState([])
  const [filteredTotal, setFilteredTotal] = useState(null)
  const [detail, setDetail] = useState(null)
  const [personalNote, setPersonalNote] = useState('')
  const [noteMessage, setNoteMessage] = useState('')
  const [noteBusy, setNoteBusy] = useState(false)
  const [businessEdit, setBusinessEdit] = useState({ notes: '', remarks: '' })
  const [businessEditMessage, setBusinessEditMessage] = useState('')
  const [related, setRelated] = useState(null)
  const [exporting, setExporting] = useState(false)
  const [exportMessage, setExportMessage] = useState('')
  useEffect(() => {
    const api = window.localSnapshot
    if (!api) { setError('Local SQLite bridge is unavailable. Open this screen from the desktop Database menu.'); return }
    api.workspaceStatus?.().then(setWorkspace).catch(e => setWorkspaceError(e.message))
    Promise.all([api.summary(), api.tables()]).then(([s, t]) => {
      setSummary(s); setTables(t)
    }).catch(e => setError(e.message))
  }, [])
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedQuery(recordQuery), 250)
    return () => clearTimeout(timer)
  }, [recordQuery])
  useEffect(() => {
    if (!selected?.name || !window.localSnapshot?.reportPresetGet) return
    let cancelled = false
    window.localSnapshot.reportPresetGet(selected.name).then(layout => {
      if (cancelled || !layout) return
      setVisibleColumns(layout.columns)
      setSortBy(layout.sortBy)
      setDescending(layout.descending)
      setOffset(0)
    }).catch(e => { if (!cancelled) setError(e.message) })
    return () => { cancelled = true }
  }, [selected?.name])
  async function saveReportPreset() {
    if (!selected) return
    setPresetMessage('')
    try {
      await window.localSnapshot.reportPresetSave(selected.name, { columns: visibleColumns, sortBy, descending })
      setPresetMessage('Report layout saved on this Mac for ' + selected.name.replaceAll('_', ' ') + '.')
    } catch (e) { setError(e.message) }
  }
  async function resetReportPreset() {
    if (!selected) return
    try {
      await window.localSnapshot.reportPresetRemove(selected.name)
      setVisibleColumns(null); setSortBy(''); setDescending(false); setOffset(0)
      setPresetMessage('Saved report layout cleared.')
    } catch (e) { setError(e.message) }
  }
  useEffect(() => {
    if (!selected) return
    let cancelled = false
    setLoading(true); setError('')
    window.localSnapshot.filteredRows(selected.name, offset, debouncedQuery, department, { sortBy, descending }).then(data => {
      if (!cancelled) { setRows(data.rows); setFilteredTotal(data.total); setDepartments(data.departments) }
    }).catch(e => { if (!cancelled) setError(e.message) }).finally(() => {
      if (!cancelled) setLoading(false)
    })
    return () => { cancelled = true }
  }, [selected, offset, debouncedQuery, department, sortBy, descending])
  useEffect(() => {
    if (module === 'all' || !window.localSnapshot?.moduleOverview) { setOverview(null); return }
    let cancelled = false
    setOverview(null)
    window.localSnapshot.moduleOverview(module).then(data => { if (!cancelled) setOverview(data) }).catch(e => { if (!cancelled) setError(e.message) })
    return () => { cancelled = true }
  }, [module])
  useEffect(() => {
    setBusinessEdit({ notes: typeof detail?.notes === 'string' ? detail.notes : '', remarks: typeof detail?.remarks === 'string' ? detail.remarks : '' })
    setBusinessEditMessage('')
  }, [detail, selected?.name])
  async function saveBusinessDraft() {
    if (!selected || detail?.id == null) return
    setBusinessEditMessage('')
    try {
      const changes = Object.fromEntries(['notes','remarks'].filter(key => businessEdit[key] !== (detail[key] ?? '')).map(key => [key,businessEdit[key]]))
      if (!Object.keys(changes).length) { setBusinessEditMessage('No changes to save.'); return }
      const result = await window.localSnapshot.workspaceStageDraft(selected.name, detail.id, changes)
      setBusinessEditMessage('Draft ' + result.draftId + ' saved locally. Not synchronized.')
      setDrafts(await window.localSnapshot.workspaceDrafts())
    } catch (e) { setBusinessEditMessage(e.message) }
  }
  useEffect(() => {
    if (!detail || !selected?.name || detail.id == null) { setPersonalNote(''); setNoteMessage(''); return }
    let cancelled = false
    setPersonalNote(''); setNoteMessage('')
    window.localSnapshot.personalNoteGet(selected.name, detail.id).then(note => {
      if (!cancelled) setPersonalNote(note.body)
    }).catch(e => { if (!cancelled) setNoteMessage(e.message) })
    return () => { cancelled = true }
  }, [detail, selected?.name])
  async function backupPersonalNotes() {
    setNoteBusy(true); setNoteMessage('')
    try {
      const result = await window.localSnapshot.personalNotesExport()
      setNoteMessage(result.cancelled ? 'Backup cancelled.' : 'Backed up ' + result.exported + ' personal notes to ' + result.file + '. Keep this unencrypted file private.')
    } catch (e) { setNoteMessage(e.message) }
    finally { setNoteBusy(false) }
  }
  async function savePersonalNote() {
    if (!selected?.name || detail?.id == null) return
    setNoteBusy(true); setNoteMessage('')
    try {
      await window.localSnapshot.personalNoteSave(selected.name, detail.id, personalNote)
      setNoteMessage('Saved on this Mac only. Not part of the business record or cloud sync.')
    } catch (e) { setNoteMessage(e.message) }
    finally { setNoteBusy(false) }
  }
  useEffect(() => {
    if (!detail?.id || selected?.name !== 'orders') { setRelated(null); return }
    let cancelled = false
    window.localSnapshot.relatedRows(detail.id).then(data => { if (!cancelled) setRelated(data) }).catch(e => { if (!cancelled) setError(e.message) })
    return () => { cancelled = true }
  }, [detail, selected])
  async function loginOffline(event) {
    event.preventDefault()
    setAuthBusy(true); setWorkspaceError('')
    try {
      const result = await window.localSnapshot.workspaceLogin(passphrase)
      setPassphrase('')
      if (!result.authenticated) {
        setWorkspaceError('Offline sign-in denied: ' + (result.reason || 'invalid credentials'))
      }
      const status = await window.localSnapshot.workspaceStatus()
      setWorkspace(status)
      if (status.authenticated) setDrafts(await window.localSnapshot.workspaceDrafts())
    } catch (e) { setWorkspaceError(e.message); setPassphrase('') }
    finally { setAuthBusy(false) }
  }
  async function logoutOffline() {
    try {
      await window.localSnapshot.workspaceLogout()
      setWorkspace(await window.localSnapshot.workspaceStatus())
      setDrafts([]); setDraftPreview(null)
    } catch (e) { setWorkspaceError(e.message) }
  }
  async function exportDraftRecovery() {
    setWorkspaceError(''); setRecoveryMessage('')
    try {
      const result = await window.localSnapshot.workspaceExportRecovery()
      if (!result.cancelled) setRecoveryMessage('Saved ' + result.exported + ' draft(s) to ' + result.file + '. Keep this private JSON file secure.')
    } catch (e) { setWorkspaceError(e.message) }
  }
  async function showDraftPreview(table, recordId) {
    setWorkspaceError('')
    try { setDraftPreview(await window.localSnapshot.workspacePreviewDrafts(table, recordId)) }
    catch (e) { setWorkspaceError(e.message) }
  }
  async function cancelOfflineDraft(draftId) {
    if (!window.confirm('Discard this unsynchronized local draft? This cannot be undone.')) return
    try {
      await window.localSnapshot.workspaceCancelDraft(draftId)
      setDrafts(await window.localSnapshot.workspaceDrafts())
    } catch (e) { setWorkspaceError(e.message) }
  }
  async function exportSelected() {
    if (!selected || !window.localSnapshot?.exportCsv || exporting) return
    setExporting(true); setError(''); setExportMessage('')
    try {
      const result = await window.localSnapshot.exportCsv(selected.name, debouncedQuery, department, { columns: visibleColumns, sortBy, descending })
      if (!result.cancelled) setExportMessage('Exported ' + result.exported.toLocaleString() + ' records to ' + result.file)
    } catch (e) { setError(e.message || 'Offline export failed') }
    finally { setExporting(false) }
  }
  const snapshotAgeDays = summary?.importedAt && Number.isFinite(Date.parse(summary.importedAt)) ? Math.max(0, Math.floor((Date.now() - Date.parse(summary.importedAt)) / 86400000)) : null
  const availableColumns = [...new Set(rows.flatMap(row => Object.keys(row || {})))]
  const columns = visibleColumns ? availableColumns.filter(c => visibleColumns.includes(c)) : availableColumns
  const fmt = v => v == null ? '' : typeof v === 'object' ? JSON.stringify(v) : String(v)
  return <div className="app">
    <header><div><h1>Nizamia App-2A</h1><p>Local records · Offline · Read only</p></div><div className="totals">{summary ? <><strong>{summary.tables} tables</strong><strong>{summary.records.toLocaleString()} records</strong></> : 'Opening SQLite…'}</div></header>
    <div className="notice" role="status">These sections mirror the web app navigation but only browse tables present in the imported snapshot. They do not provide the live page forms or workflows. CSV export is available for saved records. Offline sign-in and draft queue are available only for previously verified enrollments. New enrollment, editing and cloud synchronization are not enabled. Access to this local copy must be protected by your Mac account.{snapshotAgeDays !== null && <strong> Snapshot imported {snapshotAgeDays === 0 ? 'today' : `${snapshotAgeDays} day${snapshotAgeDays === 1 ? '' : 's'} ago`}.{snapshotAgeDays >= 7 ? ' The saved data may be significantly outdated.' : ''}</strong>}{snapshotAgeDays === null && summary && <strong> Snapshot import date unavailable; freshness cannot be verified.</strong>}</div>
    <section className="notice" aria-label="Offline workspace">
      <strong>Offline workspace</strong>{workspace?.authenticated ? <>
        <span> Signed in locally as {workspace.identity}. Pending drafts: {drafts.length}. Cloud sync is not enabled.</span>
        <button onClick={logoutOffline}>Sign out</button> <button onClick={exportDraftRecovery}>Export draft recovery JSON</button>
        {drafts.map(d => <div key={d.draftId}><span>{d.table} · {d.recordId} · {d.state} · {d.createdAt}</span> <button onClick={() => showDraftPreview(d.table, d.recordId)}>Compare local changes</button> <button onClick={() => cancelOfflineDraft(d.draftId)} disabled={d.state !== 'pending'}>Discard draft</button></div>)}
        {draftPreview && <div className="recorddetail"><button onClick={() => setDraftPreview(null)}>Close comparison</button><h3>Local changes — not synchronized</h3><dl>{Object.keys(draftPreview.preview).filter(key => draftPreview.original[key] !== draftPreview.preview[key]).map(key => <React.Fragment key={key}><dt>{key}</dt><dd>Saved: {String(draftPreview.original[key] ?? '')}</dd><dt>Pending</dt><dd>{String(draftPreview.preview[key] ?? '')}</dd></React.Fragment>)}</dl><p>{draftPreview.pending.length} draft(s) associated with this record. Original snapshot data is unchanged.</p></div>}
      </> : <span> {workspace?.unavailable ? 'Secure storage unavailable: ' + workspace.unavailable :
        workspace?.enrolled ? 'Existing offline enrollment detected. Sign in to view your draft queue.' :
        'Offline editing requires a verified enrollment from the server. Enrollment is not yet available in this build.'}</span>}
      {!workspace?.authenticated && workspace?.enrolled && <form onSubmit={loginOffline}>
        <input type="password" autoComplete="off" aria-label="Offline passphrase" placeholder="Offline passphrase" value={passphrase} onChange={e => setPassphrase(e.target.value)} required />
        <button disabled={authBusy}>{authBusy ? 'Signing in…' : 'Sign in'}</button>
      </form>}
      {workspaceError && <p role="alert">{workspaceError}</p>}{recoveryMessage && <p role="status">{recoveryMessage}</p>}
    </section>
    <div className="modules" role="tablist" aria-label="Offline business modules">{MODULES.map(m => <button key={m.key} role="tab" aria-selected={module === m.key} className={module === m.key ? 'active' : ''} onClick={() => { setModule(m.key); setSelected(null); setRows([]); setOffset(0); setSearch(''); setDetail(null); setRecordQuery(''); setDepartment('') }}>{m.label}</button>)}</div>
    <div className="layout">
      <aside><input aria-label="Search tables" placeholder="Search tables…" value={search} onChange={e => setSearch(e.target.value)}/><nav>{tables.filter(t => MODULES.find(m => m.key === module).match(t.name) && t.name.toLowerCase().includes(search.toLowerCase())).map(t => <button key={t.name} className={selected?.name === t.name ? 'active' : ''} onClick={() => {setSelected(t);setPresetMessage('');setOffset(0);setRows([]);setDetail(null);setRecordQuery('');setDepartment('');setDepartments([]);setVisibleColumns(null);setSortBy('');setDescending(false);setColumnEditor(false)}}><span>{t.name.replaceAll('_',' ')}</span><span>{t.count}</span></button>)}</nav></aside>
      <main>{error && <div className="error" role="alert">{error}</div>}{exportMessage && <div className="notice" role="status">{exportMessage}</div>}{presetMessage && <div className="notice" role="status">{presetMessage}</div>}
        {selected ? <><div className="toolbar"><div><h2>{selected.name.replaceAll('_',' ')}</h2><small>{filteredTotal == null ? selected.count.toLocaleString() : filteredTotal.toLocaleString()} matching records</small></div><div className="pages"><button onClick={saveReportPreset}>Save layout</button><button onClick={resetReportPreset}>Reset layout</button><button onClick={() => setColumnEditor(!columnEditor)}>{columnEditor ? 'Close columns' : 'Choose columns'}</button><button disabled={exporting || loading} onClick={exportSelected}>{exporting ? 'Exporting…' : 'Export CSV'}</button><button disabled={loading || offset === 0} onClick={() => setOffset(Math.max(0,offset-PAGE_SIZE))}>Previous</button><span>{(filteredTotal ?? selected.count) ? offset+1 : 0}–{Math.min(offset+PAGE_SIZE,filteredTotal ?? selected.count)}</span><button disabled={loading || offset+PAGE_SIZE >= (filteredTotal ?? selected.count)} onClick={() => setOffset(offset+PAGE_SIZE)}>Next</button></div></div>
          {columnEditor && <section className="notice" aria-label="Report columns"><strong>Report columns (also applied to CSV export)</strong> <button onClick={() => setVisibleColumns(null)}>Show all</button><div style={{display:'flex',flexWrap:'wrap',gap:'10px'}}>{availableColumns.map(c => <label key={c}><input type="checkbox" checked={!visibleColumns || visibleColumns.includes(c)} onChange={e => { const current = visibleColumns || availableColumns; const next = e.target.checked ? [...current,c] : current.filter(x => x !== c); if (next.length) setVisibleColumns(next) }}/>{c.replaceAll('_',' ')}</label>)}</div></section>}
          <div className="filters"><label>Sort <select aria-label="Sort column" value={sortBy} onChange={e => {setSortBy(e.target.value);setOffset(0)}}><option value="">Original order</option>{availableColumns.map(c => <option key={c} value={c}>{c.replaceAll('_',' ')}</option>)}</select></label><label><input type="checkbox" checked={descending} onChange={e => {setDescending(e.target.checked);setOffset(0)}}/>Descending</label><input aria-label="Search records" placeholder="Search records…" value={recordQuery} onChange={e => {setRecordQuery(e.target.value);setOffset(0)}} />{module === 'production' && departments.length > 0 && <select aria-label="Department" value={department} onChange={e => {setDepartment(e.target.value);setOffset(0)}}><option value="">All departments</option>{departments.map(d => <option key={d} value={d}>{d}</option>)}</select>}</div>
          <div className="tablewrap"><table><thead><tr>{columns.map(c => <th key={c}>{c.replaceAll('_',' ')}</th>)}</tr></thead><tbody>{rows.map((row,i) => <tr key={i} className="recordrow" onClick={() => setDetail(row)}>{columns.map(c => <td key={c} title={fmt(row[c])}>{fmt(row[c])}</td>)}</tr>)}</tbody></table></div>{loading && <p>Reading local records…</p>}{detail && <section className="recorddetail"><button onClick={() => setDetail(null)}>Close details</button><h3>Record details</h3>{detail.id != null && ['orders','production_daily_entries'].includes(selected.name) && <section className="notice"><h3>Business notes / remarks — offline draft</h3><p>Official changes require verified enrollment and trusted edit permissions. Pending drafts do not change the original snapshot or synchronize automatically.</p>{['notes','remarks'].map(field => <label key={field} style={{display:'block',marginBottom:8}}>{field}<textarea rows={2} maxLength={2000} style={{width:'100%'}} disabled={!workspace?.authenticated || !workspace?.permissions?.includes('offline:draft:' + selected.name)} value={businessEdit[field]} onChange={e => setBusinessEdit(old => ({...old,[field]:e.target.value}))}/></label>)}<button disabled={!workspace?.authenticated || !workspace?.permissions?.includes('offline:draft:' + selected.name)} onClick={saveBusinessDraft}>Save business draft</button>{businessEditMessage && <p role="status">{businessEditMessage}</p>}</section>}{detail.id != null && <section className="notice"><h3>Personal offline note</h3><p>Stored separately on this Mac. Does not change the order or production record and will not synchronize.</p><textarea aria-label="Personal offline note" rows={4} maxLength={4000} style={{width:'100%'}} value={personalNote} onChange={e => setPersonalNote(e.target.value)}/><button disabled={noteBusy} onClick={savePersonalNote}>{noteBusy ? 'Saving…' : 'Save personal note'}</button><button disabled={noteBusy} onClick={backupPersonalNotes}>Back up all personal notes</button>{noteMessage && <p role="status">{noteMessage}</p>}</section>}<dl>{Object.entries(detail).map(([key,value]) => <React.Fragment key={key}><dt>{key.replaceAll('_',' ')}</dt><dd>{fmt(value)}</dd></React.Fragment>)}</dl>{related && <><h3>Related saved records</h3>{Object.entries(related).filter(([, items]) => items.length).map(([name, items]) => <details key={name} className="relatedgroup"><summary>{name.replaceAll('_', ' ')}: {items.length} matching records{items.length === 100 ? ' (first 100)' : ''}</summary>{items.map((item, index) => <details key={item.id ?? index} className="relatedrecord"><summary>{item.job_number || item.po_number || item.style_number || item.size_group_name || item.name || item.id || `Record ${index + 1}`}</summary><dl>{Object.entries(item).map(([field, value]) => <React.Fragment key={field}><dt>{field.replaceAll('_', ' ')}</dt><dd>{fmt(value)}</dd></React.Fragment>)}</dl></details>)}</details>)}{!Object.values(related).some(items => items.length) && <p>No related records found in this snapshot.</p>}</>}</section>}</> :
          <div className="welcome"><h2>{MODULES.find(m => m.key === module).label} · Local snapshot</h2>{overview && <div className="overview">{Object.entries(overview).map(([name, data]) => <div key={name}><strong>{data.count.toLocaleString()}</strong><span>{name.replaceAll('_', ' ')}</span></div>)}{!Object.keys(overview).length && <p>No matching module tables were included in this snapshot.</p>}</div>}{overview?.orders?.records?.length > 0 && <div className="recent"><h3>Saved orders preview (first 10)</h3>{overview.orders.records.slice(0, 10).map((o,i) => <div key={o.id || i}><strong>{o.job_number || o.po_number || o.factory_ref || 'Order'}</strong><span>{o.buyer_name || o.store_name || '—'}</span><span>{Number(o.total_qty || 0).toLocaleString()} pcs</span></div>)}</div>}<p>Choose a table on the left to browse saved records. If a module has no matching tables, its data was not included in this snapshot. This is a read-only data view, not the cloud workflow or its editing forms.</p>{summary?.importedAt && <p>Snapshot imported: {new Date(summary.importedAt).toLocaleString()}</p>}</div>}
      </main>
    </div>
  </div>
}
createRoot(document.getElementById('root')).render(<App />)
