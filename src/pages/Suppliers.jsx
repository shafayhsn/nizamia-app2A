import React, { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { Plus, Edit2, Trash2, Truck } from 'lucide-react'

const CATEGORIES = ['Fabric', 'Trims', 'Packing', 'CMT', 'Wash', 'Print', 'Embroidery', 'Contractors', 'Other']

export default function Suppliers() {
  const [suppliers, setSuppliers] = useState([])
  const [modal, setModal] = useState(false)
  const [editing, setEditing] = useState(null)
  const [form, setForm] = useState({})
  const [saving, setSaving] = useState(false)

  useEffect(() => { load() }, [])
  async function load() {
    const { data } = await supabase.from('suppliers').select('*').order('name')
    setSuppliers(data || [])
  }
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))
  const openNew = () => { setEditing(null); setForm({ category: 'Fabric' }); setModal(true) }
  const openEdit = (s) => { setEditing(s); setForm({ ...s }); setModal(true) }
  const handleSave = async () => {
    setSaving(true)
    if (editing) await supabase.from('suppliers').update(form).eq('id', editing.id)
    else await supabase.from('suppliers').insert([form])
    setSaving(false); setModal(false); load()
  }
  const handleDelete = async (id) => {
    if (!confirm('Delete this supplier?')) return
    await supabase.from('suppliers').delete().eq('id', id)
    load()
  }

  return (
    <div className="page-content">
      <div className="section-header">
        <div style={{ fontSize: 13, color: 'var(--text-mid)' }}>{suppliers.length} suppliers</div>
        <button className="btn btn-primary" onClick={openNew}><Plus size={14} /> New Supplier</button>
      </div>
      <div className="card">
        <div className="table-wrap">
          {suppliers.length === 0 ? (
            <div className="empty-state"><Truck size={32} /><p>No suppliers yet.</p><button className="btn btn-primary" onClick={openNew}><Plus size={14} /> Add Supplier</button></div>
          ) : (
            <table>
              <thead><tr><th>Name</th><th>Category</th><th>Process</th><th>Contact</th><th>Phone</th><th>Lead Time</th><th style={{ textAlign: 'right' }}>Actions</th></tr></thead>
              <tbody>
                {suppliers.map(s => (
                  <tr key={s.id}>
                    <td style={{ fontWeight: 600 }}>{s.name}</td>
                    <td><span className="tag">{s.category}</span></td>
                    <td style={{ fontSize: 11, color: s.process ? '#374151' : '#d1d5db' }}>{s.process || '—'}</td>
                    <td style={{ fontSize: 11 }}>{s.contact_person || '—'}</td>
                    <td style={{ fontSize: 11, fontFamily: 'monospace' }}>{s.phone || '—'}</td>
                    <td style={{ fontSize: 11 }}>{s.lead_time_days ? `${s.lead_time_days} days` : '—'}</td>
                    <td style={{ textAlign: 'right' }}>
                      <div style={{ display: 'flex', gap: 2, justifyContent: 'flex-end' }}>
                        <button className="btn btn-ghost btn-sm" onClick={() => openEdit(s)}><Edit2 size={12} /></button>
                        <button className="btn btn-ghost btn-sm" onClick={() => handleDelete(s.id)}><Trash2 size={12} /></button>
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
          <div style={{ background: '#fff', borderRadius: 10, padding: 24, width: 480, boxShadow: '0 10px 40px rgba(0,0,0,0.15)' }}>
            <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 18 }}>{editing ? 'Edit Supplier' : 'New Supplier'}</div>
            <div className="form-row form-row-2 form-group"><div><label>Name *</label><input className="input" value={form.name || ''} onChange={e => set('name', e.target.value)} /></div><div><label>Category</label><select className="select" value={form.category || 'Fabric'} onChange={e => set('category', e.target.value)}>{CATEGORIES.map(c => <option key={c}>{c}</option>)}</select></div></div>
            <div className="form-row form-row-2 form-group"><div><label>Contact Person</label><input className="input" value={form.contact_person || ''} onChange={e => set('contact_person', e.target.value)} /></div><div><label>Phone</label><input className="input" value={form.phone || ''} onChange={e => set('phone', e.target.value)} /></div></div>
            <div className="form-row form-row-2 form-group"><div><label>Email</label><input className="input" type="email" value={form.email || ''} onChange={e => set('email', e.target.value)} /></div><div><label>Lead Time (days)</label><input className="input" type="number" value={form.lead_time_days || ''} onChange={e => set('lead_time_days', e.target.value)} /></div></div>
            {form.category === 'Contractors' && (
              <div className="form-group"><label>Process / Service</label><input className="input" value={form.process || ''} onChange={e => set('process', e.target.value)} placeholder="e.g. CMT, Embroidery, Washing, Printing..." /></div>
            )}
            <div className="form-group"><label>Address</label><textarea className="textarea" style={{ minHeight: 52 }} value={form.address || ''} onChange={e => set('address', e.target.value)} /></div>
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
