import React, { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { Plus, Edit2, Trash2, BookOpen, X } from 'lucide-react'
import { BOM_CATEGORIES } from '../lib/utils'

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
          <input style={inp} type="number" value={form.weight_gsm || ''} onChange={e => set('weight_gsm', e.target.value)} placeholder="320" />
        </div>
        <div className="form-group">
          <label style={{ fontSize: 11, fontWeight: 600, color: '#6b7280', display: 'block', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.4px' }}>Width (inches)</label>
          <input style={inp} type="number" value={form.width_inches || ''} onChange={e => set('width_inches', e.target.value)} placeholder="58" />
        </div>
        <div className="form-group">
          <label style={{ fontSize: 11, fontWeight: 600, color: '#6b7280', display: 'block', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.4px' }}>Shrinkage %</label>
          <input style={inp} type="number" step="0.1" value={form.shrinkage_pct || ''} onChange={e => set('shrinkage_pct', e.target.value)} placeholder="3" />
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

export default function Library() {
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
    if (!confirm('Remove from library?')) return
    await supabase.from('library_items').delete().eq('id', id); load()
  }

  const tabItems = items.filter(i => i.category === activeTab)
  const inp = { height: 32, padding: '0 10px', border: '1px solid #e5e7eb', borderRadius: 6, fontSize: 12, fontFamily: 'Inter,sans-serif', outline: 'none' }

  return (
    <div className="page-content">
      {/* Tabs */}
      <div style={{ display: 'flex', gap: 0, marginBottom: 20, borderBottom: '1px solid var(--border)' }}>
        {BOM_CATEGORIES.map(cat => (
          <button key={cat} onClick={() => setActive(cat)} style={{
            padding: '0 16px', height: 36, background: 'none', border: 'none', cursor: 'pointer',
            fontSize: 13, fontWeight: activeTab === cat ? 600 : 400,
            color: activeTab === cat ? 'var(--text)' : 'var(--text-mid)',
            borderBottom: activeTab === cat ? '2px solid var(--black)' : '2px solid transparent', marginBottom: -1,
          }}>
            {cat === 'Stitching Trim' ? 'Stitching Trims' : cat === 'Packing Trim' ? 'Packing Trims' : 'Fabrics'}
            <span style={{ fontSize: 10, color: 'var(--text-light)', marginLeft: 6 }}>({items.filter(i => i.category === cat).length})</span>
          </button>
        ))}
      </div>

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
                    <td style={{ textAlign: 'right', fontFamily: 'monospace', fontSize: 11 }}>{item.weight_gsm || '—'}</td>
                    <td style={{ textAlign: 'right', fontFamily: 'monospace', fontSize: 11 }}>{item.width_inches ? `${item.width_inches}"` : '—'}</td>
                    <td style={{ textAlign: 'right', fontFamily: 'monospace', fontSize: 11 }}>{item.shrinkage_pct != null ? `${item.shrinkage_pct}%` : '—'}</td>
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

            {/* Name — always present */}
            <div className="form-group" style={{ marginBottom: 16 }}>
              <label style={{ fontSize: 11, fontWeight: 600, color: '#6b7280', display: 'block', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.4px' }}>Name *</label>
              <input
                style={{ width: '100%', height: 32, padding: '0 10px', border: '1px solid #e5e7eb', borderRadius: 6, fontSize: 12, fontFamily: 'Inter,sans-serif', outline: 'none', boxSizing: 'border-box', fontWeight: 600 }}
                value={form.name || ''} onChange={e => set('name', e.target.value)}
                placeholder={activeTab === 'Fabric' ? 'e.g. 14oz Raw Denim' : activeTab === 'Stitching Trim' ? 'e.g. YKK Metal Zipper' : 'e.g. Polybag 12×16"'}
                autoFocus
              />
            </div>

            {/* Category-specific fields */}
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
    </div>
  )
}
