import React, { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { Plus, Edit2, Trash2, Truck, X } from 'lucide-react'

const CATEGORIES = ['Fabric', 'Trims', 'Washing', 'Embellishment', 'CMT', 'Contractors']
const TABS = ['All', ...CATEGORIES]

const catColor = {
  Fabric:        { bg: '#eff6ff', color: '#2563eb' },
  Trims:         { bg: '#fff7ed', color: '#d97706' },
  Washing:       { bg: '#ecfeff', color: '#0891b2' },
  Embellishment: { bg: '#fdf2f8', color: '#be185d' },
  CMT:           { bg: '#f5f3ff', color: '#7c3aed' },
  Contractors:   { bg: '#f0fdf4', color: '#16a34a' },
}

export default function Suppliers() {
  const [suppliers,  setSuppliers]  = useState([])
  const [poCounts,   setPoCounts]   = useState({})
  const [woCounts,   setWoCounts]   = useState({})
  const [tab,        setTab]        = useState('All')
  const [modal,      setModal]      = useState(false)
  const [editing,    setEditing]    = useState(null)
  const [form,       setForm]       = useState({})
  const [saving,     setSaving]     = useState(false)
  const [search,     setSearch]     = useState('')

  useEffect(() => { load() }, [])

  async function load() {
    const [{ data: sups }, { data: pos }, { data: wos }] = await Promise.all([
      supabase.from('suppliers').select('*').order('name'),
      supabase.from('purchase_orders').select('supplier_id'),
      supabase.from('work_orders').select('vendor_id'),
    ])
    setSuppliers(sups || [])
    // Build count maps
    const pm = {}
    ;(pos || []).forEach(p => { if (p.supplier_id) pm[p.supplier_id] = (pm[p.supplier_id] || 0) + 1 })
    setPoCounts(pm)
    const wm = {}
    ;(wos || []).forEach(w => { if (w.vendor_id) wm[w.vendor_id] = (wm[w.vendor_id] || 0) + 1 })
    setWoCounts(wm)
  }

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))
  const openNew  = () => { setEditing(null); setForm({ category: 'Fabric' }); setModal(true) }
  const openEdit = (s) => { setEditing(s); setForm({ ...s }); setModal(true) }

  const handleSave = async () => {
    setSaving(true)
    const payload = { ...form }
    if (form.category !== 'Contractors') payload.process = null
    if (editing) await supabase.from('suppliers').update(payload).eq('id', editing.id)
    else await supabase.from('suppliers').insert([payload])
    setSaving(false); setModal(false); load()
  }

  const handleDelete = async (id) => {
    if (!confirm('Delete this supplier?')) return
    await supabase.from('suppliers').delete().eq('id', id)
    load()
  }

  const tabCounts = {}
  suppliers.forEach(s => { tabCounts[s.category] = (tabCounts[s.category] || 0) + 1 })

  const filtered = suppliers.filter(s => {
    const matchTab = tab === 'All' || s.category === tab
    const q = search.toLowerCase()
    const matchSearch = !q || [s.name, s.contact_person, s.phone, s.process].some(f => f?.toLowerCase().includes(q))
    return matchTab && matchSearch
  })

  const isContractorsTab = tab === 'Contractors'

  const inp = { width: '100%', height: 34, padding: '0 10px', border: '1px solid #e5e7eb', borderRadius: 6, fontSize: 12, fontFamily: 'Inter,sans-serif', outline: 'none', background: '#fff', boxSizing: 'border-box' }
  const lbl = { fontSize: 11, fontWeight: 500, color: '#6b7280', display: 'block', marginBottom: 4 }

  return (
    <div className="page-content">

      {/* Header */}
      <div className="section-header">
        <div style={{ fontSize: 13, color: 'var(--text-mid)' }}>{suppliers.length} suppliers</div>
        <button className="btn btn-primary" onClick={openNew}><Plus size={14} /> New Supplier</button>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 0, borderBottom: '1px solid #e5e7eb', marginBottom: 16, overflowX: 'auto' }}>
        {TABS.map(t => {
          const count = t === 'All' ? suppliers.length : (tabCounts[t] || 0)
          const active = tab === t
          return (
            <button key={t} onClick={() => setTab(t)} style={{
              padding: '8px 14px', background: 'none', border: 'none', cursor: 'pointer',
              fontSize: 12, fontWeight: active ? 700 : 400,
              color: active ? '#0d0d0d' : '#6b7280',
              borderBottom: `2px solid ${active ? '#0d0d0d' : 'transparent'}`,
              marginBottom: -1, whiteSpace: 'nowrap', display: 'flex', alignItems: 'center', gap: 6,
              fontFamily: 'Inter,sans-serif',
            }}>
              {t}
              <span style={{ fontSize: 10, fontWeight: 700, padding: '1px 6px', borderRadius: 10,
                background: active ? '#0d0d0d' : '#f0f0ee',
                color: active ? '#fff' : '#9ca3af' }}>
                {count}
              </span>
            </button>
          )
        })}
        {/* Search */}
        <div style={{ marginLeft: 'auto', padding: '6px 0', display: 'flex', alignItems: 'center' }}>
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search..."
            style={{ ...inp, width: 200, height: 30, fontSize: 11 }} />
        </div>
      </div>

      {/* Table */}
      <div className="card">
        <div className="table-wrap">
          {filtered.length === 0 ? (
            <div className="empty-state">
              <Truck size={32} />
              <p>{suppliers.length === 0 ? 'No suppliers yet.' : 'No results.'}</p>
              <button className="btn btn-primary" onClick={openNew}><Plus size={14} /> Add Supplier</button>
            </div>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Category</th>
                  {isContractorsTab && <th>Processes</th>}
                  <th>Contact</th>
                  <th>Phone</th>
                  <th>Lead Time</th>
                  <th style={{ textAlign: 'center' }}>POs</th>
                  <th style={{ textAlign: 'center' }}>WOs</th>
                  <th style={{ textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(s => {
                  const cs = catColor[s.category] || { bg: '#f9fafb', color: '#6b7280' }
                  const poCount = poCounts[s.id] || 0
                  const woCount = woCounts[s.id] || 0
                  return (
                    <tr key={s.id}>
                      <td style={{ fontWeight: 600 }}>{s.name}</td>
                      <td>
                        <span style={{ fontSize: 10, fontWeight: 600, padding: '2px 8px', borderRadius: 4, background: cs.bg, color: cs.color }}>
                          {s.category}
                        </span>
                      </td>
                      {isContractorsTab && (
                        <td style={{ fontSize: 11, color: s.process ? '#374151' : '#d1d5db' }}>{s.process || '—'}</td>
                      )}
                      <td style={{ fontSize: 11 }}>{s.contact_person || '—'}</td>
                      <td style={{ fontSize: 11, fontFamily: 'monospace' }}>{s.phone || '—'}</td>
                      <td style={{ fontSize: 11 }}>{s.lead_time_days ? `${s.lead_time_days}d` : '—'}</td>
                      <td style={{ textAlign: 'center' }}>
                        {poCount > 0
                          ? <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 7px', borderRadius: 4, background: '#eff6ff', color: '#2563eb' }}>{poCount}</span>
                          : <span style={{ fontSize: 11, color: '#d1d5db' }}>—</span>}
                      </td>
                      <td style={{ textAlign: 'center' }}>
                        {woCount > 0
                          ? <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 7px', borderRadius: 4, background: '#f5f3ff', color: '#7c3aed' }}>{woCount}</span>
                          : <span style={{ fontSize: 11, color: '#d1d5db' }}>—</span>}
                      </td>
                      <td style={{ textAlign: 'right' }}>
                        <div style={{ display: 'flex', gap: 2, justifyContent: 'flex-end' }}>
                          <button className="btn btn-ghost btn-sm" onClick={() => openEdit(s)}><Edit2 size={12} /></button>
                          <button className="btn btn-ghost btn-sm" onClick={() => handleDelete(s.id)}><Trash2 size={12} /></button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* Modal */}
      {modal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.35)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ background: '#fff', borderRadius: 12, padding: 24, width: 500, boxShadow: '0 16px 48px rgba(0,0,0,0.18)' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
              <div style={{ fontSize: 14, fontWeight: 700 }}>{editing ? 'Edit Supplier' : 'New Supplier'}</div>
              <button onClick={() => setModal(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#9ca3af' }}><X size={16} /></button>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
              <div style={{ gridColumn: '1 / -1' }}>
                <label style={lbl}>Name *</label>
                <input style={inp} value={form.name || ''} onChange={e => set('name', e.target.value)} placeholder="Supplier name" autoFocus />
              </div>
              <div>
                <label style={lbl}>Category</label>
                <select style={{ ...inp, cursor: 'pointer' }} value={form.category || 'Fabric'} onChange={e => set('category', e.target.value)}>
                  {CATEGORIES.map(c => <option key={c}>{c}</option>)}
                </select>
              </div>
              <div>
                <label style={lbl}>Lead Time (days)</label>
                <input style={inp} type="number" value={form.lead_time_days || ''} onChange={e => set('lead_time_days', e.target.value)} placeholder="e.g. 14" />
              </div>
              <div>
                <label style={lbl}>Contact Person</label>
                <input style={inp} value={form.contact_person || ''} onChange={e => set('contact_person', e.target.value)} />
              </div>
              <div>
                <label style={lbl}>Phone</label>
                <input style={inp} value={form.phone || ''} onChange={e => set('phone', e.target.value)} placeholder="03xx-xxxxxxx" />
              </div>
              <div>
                <label style={lbl}>Email</label>
                <input style={inp} type="email" value={form.email || ''} onChange={e => set('email', e.target.value)} />
              </div>
              <div>
                <label style={lbl}>Notes</label>
                <input style={inp} value={form.notes || ''} onChange={e => set('notes', e.target.value)} placeholder="Any notes..." />
              </div>
            </div>

            {form.category === 'Contractors' && (
              <div style={{ marginBottom: 12 }}>
                <label style={lbl}>Processes (Internal Dept)</label>
                <input style={inp} value={form.process || ''} onChange={e => set('process', e.target.value)}
                  placeholder="e.g. Cutting, Stitching, Finishing..." />
                <div style={{ fontSize: 10, color: '#9ca3af', marginTop: 3 }}>Comma-separated list of processes this department handles</div>
              </div>
            )}

            <div style={{ marginBottom: 16 }}>
              <label style={lbl}>Address</label>
              <textarea style={{ ...inp, height: 56, resize: 'vertical', padding: '8px 10px' }}
                value={form.address || ''} onChange={e => set('address', e.target.value)} />
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <button className="btn btn-secondary" onClick={() => setModal(false)}>Cancel</button>
              <button className="btn btn-primary" onClick={handleSave} disabled={saving || !form.name}>
                {saving ? 'Saving...' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
