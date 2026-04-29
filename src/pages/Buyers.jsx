import React, { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { Plus, Edit2, Trash2, Users } from 'lucide-react'
import { useAppDialogs } from '../components/ui/AppDialogs'

export default function Buyers() {
  const { confirm, Dialogs } = useAppDialogs()
  const [buyers, setBuyers] = useState([])
  const [activeBuyerIds, setActiveBuyerIds] = useState(new Set())
  const [modal, setModal] = useState(false)
  const [editing, setEditing] = useState(null)
  const [form, setForm] = useState({})
  const [saving, setSaving] = useState(false)

  useEffect(() => { load() }, [])

  async function load() {
    const [{ data: buyersData }, { data: ordersData }] = await Promise.all([
      supabase.from('buyers').select('*').order('name'),
      supabase.from('orders').select('buyer_id').not('buyer_id','is',null),
    ])
    setBuyers(buyersData || [])
    setActiveBuyerIds(new Set((ordersData || []).map(o => o.buyer_id).filter(Boolean)))
  }

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  const openNew = () => { setEditing(null); setForm({ currency: 'USD', default_ship_mode: 'Sea', default_incoterms: 'FOB' }); setModal(true) }
  const openEdit = (b) => { setEditing(b); setForm({ ...b }); setModal(true) }

  const handleSave = async () => {
    setSaving(true)
    if (editing) await supabase.from('buyers').update(form).eq('id', editing.id)
    else await supabase.from('buyers').insert([form])
    setSaving(false); setModal(false); load()
  }

  const handleDelete = async (id) => {
    const ok = await confirm('Buyer records cannot be deleted. Deactivate this buyer instead?', { title:'Deactivate Buyer', confirmText:'Deactivate', tone:'danger' })
    if (!ok) return
    await supabase.from('buyers').update({ is_active: false }).eq('id', id)
    load()
  }

  return (
    <div className="page-content">
      <div className="section-header">
        <div style={{ fontSize: 13, color: 'var(--text-mid)' }}>{buyers.length} buyers</div>
        <button className="btn btn-primary" onClick={openNew}><Plus size={14} /> New Buyer</button>
      </div>

      <div className="card">
        <div className="table-wrap">
          {buyers.length === 0 ? (
            <div className="empty-state"><Users size={32} /><p>No buyers yet.</p><button className="btn btn-primary" onClick={openNew}><Plus size={14} /> Add Buyer</button></div>
          ) : (
            <table>
              <thead><tr><th>Name</th><th>Contact</th><th>Country</th><th>Currency</th><th>Default Incoterms</th><th>Ship Mode</th><th style={{ textAlign: 'right' }}>Actions</th></tr></thead>
              <tbody>
                {buyers.map(b => (
                  <tr key={b.id}>
                    <td style={{ fontWeight: 600 }}><span style={{ display:'inline-flex', alignItems:'center', gap:8 }}><span style={{ width:8, height:8, borderRadius:'50%', background: activeBuyerIds.has(b.id) ? '#10B981' : '#D1D5DB', flexShrink:0 }} />{b.name}</span></td>
                    <td style={{ fontSize: 11 }}>{b.contact_person || '—'}</td>
                    <td style={{ fontSize: 11 }}>{b.country || '—'}</td>
                    <td style={{ fontFamily: 'monospace', fontSize: 11 }}>{b.currency}</td>
                    <td style={{ fontSize: 11 }}>{b.default_incoterms || '—'}</td>
                    <td style={{ fontSize: 11 }}>{b.default_ship_mode || '—'}</td>
                    <td style={{ textAlign: 'right' }}>
                      <div style={{ display: 'flex', gap: 2, justifyContent: 'flex-end' }}>
                        <button className="btn btn-ghost btn-sm" onClick={() => openEdit(b)}><Edit2 size={12} /></button>
                        <button className="btn btn-ghost btn-sm" onClick={() => handleDelete(b.id)}><Trash2 size={12} /></button>
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
            <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 18 }}>{editing ? 'Edit Buyer' : 'New Buyer'}</div>
            <div className="form-row form-row-2 form-group"><div><label>Name *</label><input className="input" value={form.name || ''} onChange={e => set('name', e.target.value)} /></div><div><label>Contact Person</label><input className="input" value={form.contact_person || ''} onChange={e => set('contact_person', e.target.value)} /></div></div>
            <div className="form-row form-row-2 form-group"><div><label>Email</label><input className="input" type="email" value={form.email || ''} onChange={e => set('email', e.target.value)} /></div><div><label>Phone</label><input className="input" value={form.phone || ''} onChange={e => set('phone', e.target.value)} /></div></div>
            <div className="form-row form-row-2 form-group"><div><label>Country</label><input className="input" value={form.country || ''} onChange={e => set('country', e.target.value)} /></div><div><label>Currency</label><select className="select" value={form.currency || 'USD'} onChange={e => set('currency', e.target.value)}>{['USD','EUR','GBP'].map(c => <option key={c}>{c}</option>)}</select></div></div>
            <div className="form-row form-row-2 form-group"><div><label>Default Incoterms</label><select className="select" value={form.default_incoterms || ''} onChange={e => set('default_incoterms', e.target.value)}><option value="">—</option>{['FOB','CIF','EXW','CFR','DDP'].map(i => <option key={i}>{i}</option>)}</select></div><div><label>Default Ship Mode</label><select className="select" value={form.default_ship_mode || ''} onChange={e => set('default_ship_mode', e.target.value)}><option value="">—</option>{['Sea','Air','Courier'].map(m => <option key={m}>{m}</option>)}</select></div></div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 8 }}>
              <button className="btn btn-secondary" onClick={() => setModal(false)}>Cancel</button>
              <button className="btn btn-primary" onClick={handleSave} disabled={saving || !form.name}>{saving ? 'Saving...' : 'Save'}</button>
            </div>
          </div>
        </div>
      )}
      <Dialogs />
    </div>
  )
}
