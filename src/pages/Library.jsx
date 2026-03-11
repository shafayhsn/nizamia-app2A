import React, { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { Plus, Edit2, Trash2, BookOpen } from 'lucide-react'
import { BOM_CATEGORIES } from '../lib/utils'

export default function Library() {
  const [items, setItems] = useState([])
  const [activeTab, setActiveTab] = useState('Fabric')
  const [modal, setModal] = useState(false)
  const [editing, setEditing] = useState(null)
  const [form, setForm] = useState({})
  const [saving, setSaving] = useState(false)

  useEffect(() => { load() }, [])
  async function load() {
    const { data } = await supabase.from('library_items').select('*').order('name')
    setItems(data || [])
  }
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))
  const openNew = () => { setEditing(null); setForm({ category: activeTab, unit: 'yards', default_wastage: 5 }); setModal(true) }
  const openEdit = (i) => { setEditing(i); setForm({ ...i }); setModal(true) }
  const handleSave = async () => {
    setSaving(true)
    if (editing) await supabase.from('library_items').update(form).eq('id', editing.id)
    else await supabase.from('library_items').insert([form])
    setSaving(false); setModal(false); load()
  }
  const handleDelete = async (id) => {
    if (!confirm('Remove from library?')) return
    await supabase.from('library_items').delete().eq('id', id); load()
  }

  const tabItems = items.filter(i => i.category === activeTab)

  return (
    <div className="page-content">
      <div style={{ display: 'flex', gap: 0, marginBottom: 20, borderBottom: '1px solid var(--border)' }}>
        {BOM_CATEGORIES.map(cat => (
          <button key={cat} onClick={() => setActiveTab(cat)} style={{
            padding: '0 16px', height: 36, background: 'none', border: 'none', cursor: 'pointer',
            fontSize: 13, fontWeight: activeTab === cat ? 600 : 400,
            color: activeTab === cat ? 'var(--text)' : 'var(--text-mid)',
            borderBottom: activeTab === cat ? '2px solid var(--black)' : '2px solid transparent', marginBottom: -1,
          }}>
            {cat} <span style={{ fontSize: 10, color: 'var(--text-light)' }}>({items.filter(i => i.category === cat).length})</span>
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
            <div className="empty-state"><BookOpen size={32} /><p>No {activeTab.toLowerCase()} items in library.</p><button className="btn btn-primary" onClick={openNew}><Plus size={14} /> Add Item</button></div>
          ) : (
            <table>
              <thead><tr><th>Name</th><th>Description</th><th>Unit</th><th style={{ textAlign: 'right' }}>Default Wastage</th><th style={{ textAlign: 'right' }}>Actions</th></tr></thead>
              <tbody>
                {tabItems.map(item => (
                  <tr key={item.id}>
                    <td style={{ fontWeight: 600 }}>{item.name}</td>
                    <td style={{ fontSize: 11, color: 'var(--text-mid)' }}>{item.description || '—'}</td>
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

      {modal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.3)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ background: '#fff', borderRadius: 10, padding: 24, width: 440, boxShadow: '0 10px 40px rgba(0,0,0,0.15)' }}>
            <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 18 }}>{editing ? 'Edit Item' : 'New Library Item'}</div>
            <div className="form-group"><label>Name *</label><input className="input" value={form.name || ''} onChange={e => set('name', e.target.value)} /></div>
            <div className="form-row form-row-2 form-group">
              <div><label>Category</label><select className="select" value={form.category || 'Fabric'} onChange={e => set('category', e.target.value)}>{BOM_CATEGORIES.map(c => <option key={c}>{c}</option>)}</select></div>
              <div><label>Unit</label><select className="select" value={form.unit || 'yards'} onChange={e => set('unit', e.target.value)}>{['yards','meters','pcs','kg','cone','set','sht','ctn'].map(u => <option key={u}>{u}</option>)}</select></div>
            </div>
            <div className="form-group"><label>Description</label><input className="input" value={form.description || ''} onChange={e => set('description', e.target.value)} /></div>
            <div className="form-group"><label>Default Wastage %</label><input className="input" type="number" value={form.default_wastage || ''} onChange={e => set('default_wastage', e.target.value)} /></div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 8 }}>
              <button className="btn btn-secondary" onClick={() => setModal(false)}>Cancel</button>
              <button className="btn btn-primary" onClick={handleSave} disabled={saving || !form.name}>{saving ? 'Saving...' : 'Save'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
