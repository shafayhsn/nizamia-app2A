import React, { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { Plus, Edit2, Trash2, BookOpen, X, Layers, Star } from 'lucide-react'
import { BOM_CATEGORIES } from '../lib/utils'
import { useAppDialogs } from '../components/ui/AppDialogs'

const FABRIC_UNITS = ['yards', 'meters']
const TRIM_UNITS   = ['pcs', 'kg', 'cone', 'set', 'sht', 'ctn', 'roll', 'ltr', 'meters', 'yards']
const PACKING_FORMS = ['Cone', 'Roll', 'Spool', 'Box', 'Bag', 'Carton', 'Reel', 'Bundle', 'Piece']

function FabricForm({ form, set }) {
  const inp = { width: '100%', height: 32, padding: '0 10px', border: '1px solid #e5e7eb', borderRadius: 6, fontSize: 12, fontFamily: 'Inter,sans-serif', outline: 'none', boxSizing: 'border-box' }
  return (
    <>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <div className="form-group">
          <label style={{ fontSize: 11, fontWeight: 600, color: '#6b7280', display: 'block', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.4px' }}>Composition</label>
          <input style={inp} value={form.composition || ''} onChange={e => set('composition', e.target.value)} placeholder="e.g. 98% CO 2% EA" />
        </div>
        <div className="form-group">
          <label style={{ fontSize: 11, fontWeight: 600, color: '#6b7280', display: 'block', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.4px' }}>Colour / Base</label>
          <input style={inp} value={form.colour || ''} onChange={e => set('colour', e.target.value)} placeholder="e.g. Ecru, White, Black" />
        </div>
        <div className="form-group">
          <label style={{ fontSize: 11, fontWeight: 600, color: '#6b7280', display: 'block', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.4px' }}>Weight (GSM)</label>
          <input style={inp} value={form.weight || ''} onChange={e => set('weight', e.target.value)} placeholder="e.g. 12.00 Oz or 320 GSM" />
        </div>
        <div className="form-group">
          <label style={{ fontSize: 11, fontWeight: 600, color: '#6b7280', display: 'block', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.4px' }}>Width (inches)</label>
          <input style={inp} type="number" value={form.width_inches || ''} onChange={e => set('width_inches', e.target.value)} placeholder="58" />
        </div>
        <div className="form-group">
          <label style={{ fontSize: 11, fontWeight: 600, color: '#6b7280', display: 'block', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.4px' }}>Shrinkage %</label>
          <input style={inp} value={form.shrinkage || ''} onChange={e => set('shrinkage', e.target.value)} placeholder="e.g. 2x2" />
        </div>
        <div className="form-group">
          <label style={{ fontSize: 11, fontWeight: 600, color: '#6b7280', display: 'block', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.4px' }}>Weave / Construction</label>
          <input style={inp} value={form.weave_construction || ''} onChange={e => set('weave_construction', e.target.value)} placeholder="e.g. 3×1 RHT, Plain, Twill" />
        </div>
        <div className="form-group">
          <label style={{ fontSize: 11, fontWeight: 600, color: '#6b7280', display: 'block', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.4px' }}>Unit</label>
          <select style={{ ...inp, cursor: 'pointer' }} value={form.unit || 'yards'} onChange={e => set('unit', e.target.value)}>
            {FABRIC_UNITS.map(u => <option key={u}>{u}</option>)}
          </select>
        </div>
        <div className="form-group">
          <label style={{ fontSize: 11, fontWeight: 600, color: '#6b7280', display: 'block', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.4px' }}>Default Wastage %</label>
          <input style={inp} type="number" value={form.default_wastage ?? 8} onChange={e => set('default_wastage', e.target.value)} />
        </div>
      </div>
      <div className="form-group" style={{ marginTop: 4 }}>
        <label style={{ fontSize: 11, fontWeight: 600, color: '#6b7280', display: 'block', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.4px' }}>Notes</label>
        <input style={inp} value={form.notes || ''} onChange={e => set('notes', e.target.value)} placeholder="Any additional notes..." />
      </div>
    </>
  )
}

function TrimForm({ form, set, isSewing }) {
  const inp = { width: '100%', height: 32, padding: '0 10px', border: '1px solid #e5e7eb', borderRadius: 6, fontSize: 12, fontFamily: 'Inter,sans-serif', outline: 'none', boxSizing: 'border-box' }
  return (
    <>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <div className="form-group">
          <label style={{ fontSize: 11, fontWeight: 600, color: '#6b7280', display: 'block', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.4px' }}>Specification</label>
          <input style={inp} value={form.description || ''} onChange={e => set('description', e.target.value)} placeholder={isSewing ? 'e.g. Tex 40, polyester' : 'e.g. #5 brass, antique'} />
        </div>
        <div className="form-group">
          <label style={{ fontSize: 11, fontWeight: 600, color: '#6b7280', display: 'block', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.4px' }}>Packing Form</label>
          <select style={{ ...inp, cursor: 'pointer' }} value={form.packing_form || ''} onChange={e => set('packing_form', e.target.value)}>
            <option value="">—</option>
            {PACKING_FORMS.map(p => <option key={p}>{p}</option>)}
          </select>
        </div>
        <div className="form-group">
          <label style={{ fontSize: 11, fontWeight: 600, color: '#6b7280', display: 'block', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.4px' }}>Unit</label>
          <select style={{ ...inp, cursor: 'pointer' }} value={form.unit || 'pcs'} onChange={e => set('unit', e.target.value)}>
            {TRIM_UNITS.map(u => <option key={u}>{u}</option>)}
          </select>
        </div>
        <div className="form-group">
          <label style={{ fontSize: 11, fontWeight: 600, color: '#6b7280', display: 'block', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.4px' }}>Default Wastage %</label>
          <input style={inp} type="number" value={form.default_wastage ?? 2} onChange={e => set('default_wastage', e.target.value)} />
        </div>
      </div>
      <div className="form-group" style={{ marginTop: 4 }}>
        <label style={{ fontSize: 11, fontWeight: 600, color: '#6b7280', display: 'block', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.4px' }}>Notes</label>
        <input style={inp} value={form.notes || ''} onChange={e => set('notes', e.target.value)} placeholder="Any additional notes..." />
      </div>
    </>
  )
}

function SizeGroupsTab() {
  const [groups, setGroups]       = useState([])
  const [buyers, setBuyers]       = useState([])
  const [modal, setModal]         = useState(false)
  const [editing, setEditing]     = useState(null)
  const [name, setName]           = useState('')
  const [buyerId, setBuyerId]     = useState('')
  const [buyerName, setBuyerName] = useState('')
  const [sizes, setSizes]         = useState([])
  const [baseSize, setBaseSize]   = useState('')
  const [sizeInput, setSizeInput] = useState('')
  const [saving, setSaving]       = useState(false)
  const [error, setError]         = useState('')

  const inp = { height: 32, padding: '0 10px', border: '1px solid #e5e7eb', borderRadius: 6, fontSize: 12, fontFamily: 'Inter,sans-serif', outline: 'none', boxSizing: 'border-box' }
  const lbl = { fontSize: 11, fontWeight: 600, color: '#6b7280', display: 'block', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.4px' }

  useEffect(() => {
    loadGroups()
    supabase.from('buyers').select('id,name').order('name').then(({ data }) => setBuyers(data || []))
  }, [])

  async function loadGroups() {
    const { data, error: err } = await supabase.from('size_group_templates').select('*').order('name')
    if (err) {
      setError('Table not set up yet — please run the migration SQL in your Supabase SQL Editor. See supabase/migration_run_in_supabase.sql.')
    } else {
      setError('')
      setGroups(data || [])
    }
  }

  const openNew = () => {
    setEditing(null)
    setName('')
    setBuyerId('')
    setBuyerName('')
    setSizes([])
    setBaseSize('')
    setSizeInput('')
    setModal(true)
  }

  const openEdit = (g) => {
    setEditing(g)
    setName(g.name)
    setBuyerId(g.buyer_id || '')
    setBuyerName(g.buyer_name || '')
    setSizes(g.sizes || [])
    setBaseSize(g.base_size || '')
    setSizeInput('')
    setModal(true)
  }

  const addSize = () => {
    const s = sizeInput.trim()
    if (!s || sizes.includes(s)) { setSizeInput(''); return }
    const newSizes = [...sizes, s]
    setSizes(newSizes)
    if (!baseSize) setBaseSize(newSizes[0])
    setSizeInput('')
  }

  const removeSize = (sz) => {
    const newSizes = sizes.filter(s => s !== sz)
    setSizes(newSizes)
    if (baseSize === sz) setBaseSize(newSizes[0] || '')
  }

  const handleBuyerChange = (e) => {
    const id = e.target.value
    setBuyerId(id)
    const b = buyers.find(b => b.id === id)
    setBuyerName(b ? b.name : '')
  }

  const handleSave = async () => {
    if (!name.trim() || sizes.length === 0) return
    setSaving(true)
    const payload = {
      name: name.trim(),
      buyer_id: buyerId || null,
      buyer_name: buyerName || null,
      sizes,
      base_size: baseSize || null,
    }
    let err
    if (editing) {
      const res = await supabase.from('size_group_templates').update(payload).eq('id', editing.id)
      err = res.error
    } else {
      const res = await supabase.from('size_group_templates').insert([payload])
      err = res.error
    }
    setSaving(false)
    if (err) {
      alert(`Save failed: ${err.message}\n\nMake sure the size_group_templates table exists in Supabase. Run the SQL in supabase/migration_run_in_supabase.sql.`)
      return
    }
    setModal(false)
    loadGroups()
  }

  const handleDelete = async (id) => {
    if (!await confirm('Remove this size group from library?', { title:'Remove Size Group', confirmText:'Remove', tone:'danger' })) return
    await supabase.from('size_group_templates').delete().eq('id', id)
    loadGroups()
  }

  return (
    <div>
      <div className="section-header">
        <div style={{ fontSize: 13, color: 'var(--text-mid)' }}>{groups.length} size group{groups.length !== 1 ? 's' : ''}</div>
        <button className="btn btn-primary" onClick={openNew}><Plus size={14} /> Add Size Group</button>
      </div>

      {error && (
        <div style={{ background: '#fef3c7', border: '1px solid #f59e0b', borderRadius: 8, padding: '12px 16px', marginBottom: 16, fontSize: 12, color: '#92400e' }}>
          <strong>Setup required:</strong> {error}
        </div>
      )}

      <div className="card">
        {groups.length === 0 && !error ? (
          <div className="empty-state">
            <Layers size={32} />
            <p>No size groups in library yet.</p>
            <p style={{ fontSize: 12, color: 'var(--text-light)', marginTop: -8 }}>Create reusable size sets to quickly apply in PO Matrix.</p>
            <button className="btn btn-primary" onClick={openNew}><Plus size={14} /> Add Size Group</button>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
            {groups.map((g, idx) => (
              <div key={g.id} style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '12px 16px', borderBottom: idx < groups.length - 1 ? '1px solid var(--border)' : 'none' }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontWeight: 600, fontSize: 13 }}>{g.name}</span>
                    {g.buyer_name && <span style={{ fontSize: 10, color: '#6b7280', background: '#f3f4f6', padding: '2px 7px', borderRadius: 10 }}>{g.buyer_name}</span>}
                  </div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 6 }}>
                    {(g.sizes || []).map(sz => (
                      <span key={sz} style={{ fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 4, background: sz === g.base_size ? '#1a1a2e' : '#f0f0ee', color: sz === g.base_size ? '#fff' : '#374151' }}>
                        {sz}{sz === g.base_size ? ' ★' : ''}
                      </span>
                    ))}
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 2, flexShrink: 0 }}>
                  <button className="btn btn-ghost btn-sm" onClick={() => openEdit(g)}><Edit2 size={12} /></button>
                  <button className="btn btn-ghost btn-sm" onClick={() => handleDelete(g.id)}><Trash2 size={12} /></button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {modal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.3)', zIndex: 300, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ background: '#fff', borderRadius: 12, padding: 24, width: 500, maxHeight: '85vh', overflowY: 'auto', boxShadow: '0 16px 48px rgba(0,0,0,0.18)' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
              <div style={{ fontSize: 14, fontWeight: 700 }}>{editing ? 'Edit Size Group' : 'New Size Group'}</div>
              <button onClick={() => setModal(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#9ca3af' }}><X size={16} /></button>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 }}>
              <div className="form-group" style={{ gridColumn: '1 / -1' }}>
                <label style={lbl}>Group Name *</label>
                <input
                  style={{ ...inp, width: '100%' }}
                  value={name}
                  onChange={e => setName(e.target.value)}
                  placeholder="e.g. Tops Standard, Bottoms Numeric, Kids..."
                  autoFocus
                />
              </div>
              <div className="form-group">
                <label style={lbl}>Customer (Buyer)</label>
                <select
                  style={{ ...inp, width: '100%', cursor: 'pointer' }}
                  value={buyerId}
                  onChange={handleBuyerChange}
                >
                  <option value="">All / Not specific</option>
                  {buyers.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                </select>
              </div>
              <div className="form-group">
                <label style={lbl}>Base Size</label>
                <select
                  style={{ ...inp, width: '100%', cursor: 'pointer' }}
                  value={baseSize}
                  onChange={e => setBaseSize(e.target.value)}
                >
                  <option value="">— None —</option>
                  {sizes.map(sz => <option key={sz} value={sz}>{sz}</option>)}
                </select>
              </div>
            </div>

            <div className="form-group" style={{ marginBottom: 16 }}>
              <label style={lbl}>Sizes *</label>
              {sizes.length > 0 && (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginBottom: 8 }}>
                  {sizes.map(sz => (
                    <div key={sz} style={{ display: 'flex', alignItems: 'center', gap: 0, background: sz === baseSize ? '#1a1a2e' : '#f0f0ee', borderRadius: 6, overflow: 'hidden' }}>
                      <button onClick={() => setBaseSize(sz)} title="Set as base size" style={{ padding: '4px 5px', background: 'none', border: 'none', cursor: 'pointer', color: sz === baseSize ? '#fbbf24' : '#9ca3af', display: 'flex' }}>
                        <Star size={9} fill={sz === baseSize ? '#fbbf24' : 'none'} />
                      </button>
                      <span style={{ fontSize: 11, fontWeight: 700, color: sz === baseSize ? '#fff' : '#374151', paddingRight: 4 }}>{sz}</span>
                      <button onClick={() => removeSize(sz)} style={{ padding: '4px 6px', background: 'none', border: 'none', cursor: 'pointer', color: sz === baseSize ? 'rgba(255,255,255,0.6)' : '#9ca3af', display: 'flex' }}>
                        <X size={9} />
                      </button>
                    </div>
                  ))}
                </div>
              )}
              <div style={{ display: 'flex', gap: 8 }}>
                <input
                  style={{ ...inp, flex: 1 }}
                  value={sizeInput}
                  onChange={e => setSizeInput(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && addSize()}
                  placeholder="Type a size and press Enter (e.g. XS, S, M, 28, 30...)"
                />
                <button className="btn btn-secondary" onClick={addSize}><Plus size={14} /> Add</button>
              </div>
              {sizes.length === 0 && <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 6 }}>Add at least one size. Click ★ on a size chip to mark it as the base size.</div>}
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 20 }}>
              <button className="btn btn-secondary" onClick={() => setModal(false)}>Cancel</button>
              <button className="btn btn-primary" onClick={handleSave} disabled={saving || !name.trim() || sizes.length === 0}>
                {saving ? 'Saving...' : 'Save Group'}
              </button>
            </div>
          </div>
        </div>
      )}
      <Dialogs />
    </div>
  )
}

export default function Library() {
  const { alert, confirm, Dialogs } = useAppDialogs()
  const [items,     setItems]   = useState([])
  const [activeTab, setActive]  = useState('Fabric')
  const [modal,     setModal]   = useState(false)
  const [editing,   setEditing] = useState(null)
  const [form,      setForm]    = useState({})
  const [saving,    setSaving]  = useState(false)

  useEffect(() => { load() }, [])

  async function load() {
    const { data } = await supabase.from('library_items').select('*').order('name')
    setItems(data || [])
  }

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  const openNew = () => {
    setEditing(null)
    setForm({
      category: activeTab,
      unit: activeTab === 'Fabric' ? 'yards' : 'pcs',
      default_wastage: activeTab === 'Fabric' ? 8 : 2,
    })
    setModal(true)
  }

  const openEdit = (i) => { setEditing(i); setForm({ ...i }); setModal(true) }

  const handleSave = async () => {
    if (!form.name?.trim()) return
    setSaving(true)
    const payload = { ...form, category: form.category || activeTab }
    if (editing) await supabase.from('library_items').update(payload).eq('id', editing.id)
    else          await supabase.from('library_items').insert([payload])
    setSaving(false); setModal(false); load()
  }

  const handleDelete = async (id) => {
    if (!await confirm('Remove from library?', { title:'Remove Library Item', confirmText:'Remove', tone:'danger' })) return
    await supabase.from('library_items').delete().eq('id', id); load()
  }

  const ALL_TABS = [...BOM_CATEGORIES, 'Size Groups']
  const tabItems = items.filter(i => i.category === activeTab)
  const inp = { height: 32, padding: '0 10px', border: '1px solid #e5e7eb', borderRadius: 6, fontSize: 12, fontFamily: 'Inter,sans-serif', outline: 'none' }

  const tabLabel = (cat) => {
    if (cat === 'Stitching Trim') return 'Stitching Trims'
    if (cat === 'Packing Trim') return 'Packing Trims'
    if (cat === 'Fabric') return 'Fabrics'
    return cat
  }

  return (
    <div className="page-content">
      {/* Tabs */}
      <div style={{ display: 'flex', gap: 0, marginBottom: 20, borderBottom: '1px solid var(--border)' }}>
        {ALL_TABS.map(cat => (
          <button key={cat} onClick={() => setActive(cat)} style={{
            padding: '0 16px', height: 36, background: 'none', border: 'none', cursor: 'pointer',
            fontSize: 13, fontWeight: activeTab === cat ? 600 : 400,
            color: activeTab === cat ? 'var(--text)' : 'var(--text-mid)',
            borderBottom: activeTab === cat ? '2px solid var(--black)' : '2px solid transparent', marginBottom: -1,
          }}>
            {tabLabel(cat)}
            {cat !== 'Size Groups' && (
              <span style={{ fontSize: 10, color: 'var(--text-light)', marginLeft: 6 }}>({items.filter(i => i.category === cat).length})</span>
            )}
          </button>
        ))}
      </div>

      {activeTab === 'Size Groups' ? (
        <SizeGroupsTab />
      ) : (
        <>
          <div className="section-header">
            <div style={{ fontSize: 13, color: 'var(--text-mid)' }}>{tabItems.length} items</div>
            <button className="btn btn-primary" onClick={openNew}><Plus size={14} /> Add Item</button>
          </div>

          <div className="card">
            <div className="table-wrap">
              {tabItems.length === 0 ? (
                <div className="empty-state">
                  <BookOpen size={32} />
                  <p>No {activeTab.toLowerCase()} items in library.</p>
                  <button className="btn btn-primary" onClick={openNew}><Plus size={14} /> Add Item</button>
                </div>
              ) : activeTab === 'Fabric' ? (
                <table>
                  <thead>
                    <tr>
                      <th>Name</th>
                      <th>Composition</th>
                      <th>Colour</th>
                      <th style={{ textAlign: 'right' }}>GSM</th>
                      <th style={{ textAlign: 'right' }}>Width"</th>
                      <th style={{ textAlign: 'right' }}>Shrink%</th>
                      <th>Weave</th>
                      <th>Unit</th>
                      <th style={{ textAlign: 'right' }}>Wastage</th>
                      <th style={{ textAlign: 'right' }}>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {tabItems.map(item => (
                      <tr key={item.id}>
                        <td style={{ fontWeight: 600 }}>{item.name}</td>
                        <td style={{ fontSize: 11, color: 'var(--text-mid)' }}>{item.composition || '—'}</td>
                        <td style={{ fontSize: 11, color: 'var(--text-mid)' }}>{item.colour || '—'}</td>
                        <td style={{ textAlign: 'right', fontFamily: 'monospace', fontSize: 11 }}>{item.weight || '—'}</td>
                        <td style={{ textAlign: 'right', fontFamily: 'monospace', fontSize: 11 }}>{item.width_inches ? `${item.width_inches}"` : '—'}</td>
                        <td style={{ textAlign: 'right', fontFamily: 'monospace', fontSize: 11 }}>{item.shrinkage || '—'}</td>
                        <td style={{ fontSize: 11, color: 'var(--text-mid)' }}>{item.weave_construction || '—'}</td>
                        <td style={{ fontFamily: 'monospace', fontSize: 11 }}>{item.unit}</td>
                        <td style={{ textAlign: 'right', fontFamily: 'monospace', fontSize: 11 }}>{item.default_wastage}%</td>
                        <td style={{ textAlign: 'right' }}>
                          <div style={{ display: 'flex', gap: 2, justifyContent: 'flex-end' }}>
                            <button className="btn btn-ghost btn-sm" onClick={() => openEdit(item)}><Edit2 size={12} /></button>
                            <button className="btn btn-ghost btn-sm" onClick={() => handleDelete(item.id)}><Trash2 size={12} /></button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <table>
                  <thead>
                    <tr>
                      <th>Name</th>
                      <th>Specification</th>
                      <th>Packing Form</th>
                      <th>Unit</th>
                      <th style={{ textAlign: 'right' }}>Wastage</th>
                      <th style={{ textAlign: 'right' }}>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {tabItems.map(item => (
                      <tr key={item.id}>
                        <td style={{ fontWeight: 600 }}>{item.name}</td>
                        <td style={{ fontSize: 11, color: 'var(--text-mid)' }}>{item.description || '—'}</td>
                        <td style={{ fontSize: 11, color: 'var(--text-mid)' }}>{item.packing_form || '—'}</td>
                        <td style={{ fontFamily: 'monospace', fontSize: 11 }}>{item.unit}</td>
                        <td style={{ textAlign: 'right', fontFamily: 'monospace', fontSize: 11 }}>{item.default_wastage}%</td>
                        <td style={{ textAlign: 'right' }}>
                          <div style={{ display: 'flex', gap: 2, justifyContent: 'flex-end' }}>
                            <button className="btn btn-ghost btn-sm" onClick={() => openEdit(item)}><Edit2 size={12} /></button>
                            <button className="btn btn-ghost btn-sm" onClick={() => handleDelete(item.id)}><Trash2 size={12} /></button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>

          {/* Modal */}
          {modal && (
            <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.3)', zIndex: 300, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <div style={{ background: '#fff', borderRadius: 12, padding: 24, width: 560, maxHeight: '85vh', overflowY: 'auto', boxShadow: '0 16px 48px rgba(0,0,0,0.18)' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
                  <div style={{ fontSize: 14, fontWeight: 700 }}>{editing ? 'Edit Library Item' : `New ${activeTab === 'Fabric' ? 'Fabric' : activeTab === 'Stitching Trim' ? 'Stitching Trim' : 'Packing Trim'}`}</div>
                  <button onClick={() => setModal(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#9ca3af' }}><X size={16} /></button>
                </div>

                <div className="form-group" style={{ marginBottom: 16 }}>
                  <label style={{ fontSize: 11, fontWeight: 600, color: '#6b7280', display: 'block', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.4px' }}>Category</label>
                  <select
                    style={{ width: '100%', height: 32, padding: '0 10px', border: '1px solid #e5e7eb', borderRadius: 6, fontSize: 12, fontFamily: 'Inter,sans-serif', outline: 'none', boxSizing: 'border-box', cursor: 'pointer' }}
                    value={form.category || activeTab}
                    onChange={e => set('category', e.target.value)}
                  >
                    <option value="Fabric">Fabric</option>
                    <option value="Stitching Trim">Stitching Trim</option>
                    <option value="Packing Trim">Packing Trim</option>
                  </select>
                </div>

                <div className="form-group" style={{ marginBottom: 16 }}>
                  <label style={{ fontSize: 11, fontWeight: 600, color: '#6b7280', display: 'block', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.4px' }}>Name *</label>
                  <input
                    style={{ width: '100%', height: 32, padding: '0 10px', border: '1px solid #e5e7eb', borderRadius: 6, fontSize: 12, fontFamily: 'Inter,sans-serif', outline: 'none', boxSizing: 'border-box', fontWeight: 600 }}
                    value={form.name || ''} onChange={e => set('name', e.target.value)}
                    placeholder={activeTab === 'Fabric' ? 'e.g. 14oz Raw Denim' : activeTab === 'Stitching Trim' ? 'e.g. YKK Metal Zipper' : 'e.g. Polybag 12×16"'}
                    autoFocus
                  />
                </div>

                {form.category === 'Fabric'
                  ? <FabricForm form={form} set={set} />
                  : <TrimForm form={form} set={set} isSewing={form.category === 'Stitching Trim'} />
                }

                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 20 }}>
                  <button className="btn btn-secondary" onClick={() => setModal(false)}>Cancel</button>
                  <button className="btn btn-primary" onClick={handleSave} disabled={saving || !form.name?.trim()}>
                    {saving ? 'Saving...' : 'Save Item'}
                  </button>
                </div>
              </div>
            </div>
          )}
        </>
      )}
      <Dialogs />
    </div>
  )
}
