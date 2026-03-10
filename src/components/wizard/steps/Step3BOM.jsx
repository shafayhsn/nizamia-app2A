// Step3BOM.jsx
import React, { useState, useEffect } from 'react'
import { supabase } from '../../../lib/supabase'
import { Plus, Trash2 } from 'lucide-react'
import { BOM_CATEGORIES, USAGE_RULES } from '../../../lib/utils'

export default function Step3BOM({ orderId, orderData, onSaved }) {
  const [items, setItems] = useState([])
  const [library, setLibrary] = useState([])
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [activeTab, setActiveTab] = useState('Fabric')

  useEffect(() => {
    if (orderId) loadItems()
    supabase.from('library_items').select('*').order('name').then(({ data }) => setLibrary(data || []))
  }, [orderId])

  async function loadItems() {
    const { data } = await supabase.from('bom_items').select('*').eq('order_id', orderId).order('sort_order')
    setItems(data || [])
  }

  const addItem = (category) => setItems(i => [...i, {
    _new: true, order_id: orderId, category,
    name: '', specification: '', unit: 'yards', usage_rule: 'Generic',
    base_qty: '', wastage: 5, sort_order: i.length,
  }])

  const updateItem = (idx, k, v) => setItems(items => { const n = [...items]; n[idx] = { ...n[idx], [k]: v }; return n })

  const removeItem = async (idx) => {
    const item = items[idx]
    if (item.id) await supabase.from('bom_items').delete().eq('id', item.id)
    setItems(items.filter((_, i) => i !== idx))
  }

  const handleSave = async () => {
    if (!orderId) return
    setSaving(true)
    for (let idx = 0; idx < items.length; idx++) {
      const { _new, id, ...rest } = items[idx]
      if (id) await supabase.from('bom_items').update({ ...rest, sort_order: idx }).eq('id', id)
      else { const { data } = await supabase.from('bom_items').insert([{ ...rest, sort_order: idx }]).select().single(); if (data) items[idx] = data }
    }
    await supabase.from('orders').update({ step_bom: true }).eq('id', orderId)
    onSaved(orderId, { step_bom: true })
    setSaved(true); setTimeout(() => setSaved(false), 2000)
    setSaving(false)
    loadItems()
  }

  const tabItems = items.filter(i => i.category === activeTab)

  return (
    <div>
      <div style={{ display: 'flex', gap: 0, marginBottom: 16, borderBottom: '1px solid var(--border)' }}>
        {BOM_CATEGORIES.map(cat => (
          <button key={cat} onClick={() => setActiveTab(cat)} style={{
            padding: '8px 14px', background: 'none', border: 'none', cursor: 'pointer',
            fontSize: 12, fontWeight: activeTab === cat ? 600 : 400,
            color: activeTab === cat ? 'var(--text)' : 'var(--text-mid)',
            borderBottom: activeTab === cat ? '2px solid var(--black)' : '2px solid transparent',
            marginBottom: -1,
          }}>
            {cat} <span style={{ fontSize: 10, color: 'var(--text-light)' }}>({items.filter(i => i.category === cat).length})</span>
          </button>
        ))}
      </div>

      <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: 12 }}>
        <thead>
          <tr>
            <th style={{ textAlign: 'left', fontSize: 10, fontWeight: 600, color: 'var(--text-light)', padding: '0 0 8px', textTransform: 'uppercase', letterSpacing: '0.8px' }}>Item Name</th>
            <th style={{ textAlign: 'left', fontSize: 10, fontWeight: 600, color: 'var(--text-light)', padding: '0 8px 8px', textTransform: 'uppercase', letterSpacing: '0.8px' }}>Specification</th>
            <th style={{ textAlign: 'left', fontSize: 10, fontWeight: 600, color: 'var(--text-light)', padding: '0 8px 8px', textTransform: 'uppercase', letterSpacing: '0.8px' }}>Unit</th>
            <th style={{ textAlign: 'left', fontSize: 10, fontWeight: 600, color: 'var(--text-light)', padding: '0 8px 8px', textTransform: 'uppercase', letterSpacing: '0.8px' }}>Usage Rule</th>
            <th style={{ textAlign: 'right', fontSize: 10, fontWeight: 600, color: 'var(--text-light)', padding: '0 8px 8px', textTransform: 'uppercase', letterSpacing: '0.8px' }}>Base Qty</th>
            <th style={{ textAlign: 'right', fontSize: 10, fontWeight: 600, color: 'var(--text-light)', padding: '0 8px 8px', textTransform: 'uppercase', letterSpacing: '0.8px' }}>Wastage %</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {tabItems.map((item, idx) => {
            const realIdx = items.indexOf(item)
            return (
              <tr key={realIdx}>
                <td style={{ padding: '4px 0', borderBottom: '1px solid #f0f0ee' }}>
                  <input className="input" style={{ fontSize: 11 }} value={item.name} onChange={e => updateItem(realIdx, 'name', e.target.value)} placeholder="Item name" />
                </td>
                <td style={{ padding: '4px 8px', borderBottom: '1px solid #f0f0ee' }}>
                  <input className="input" style={{ fontSize: 11 }} value={item.specification || ''} onChange={e => updateItem(realIdx, 'specification', e.target.value)} placeholder="e.g. 98% CO 2% EA" />
                </td>
                <td style={{ padding: '4px 8px', borderBottom: '1px solid #f0f0ee' }}>
                  <select className="select" style={{ fontSize: 11 }} value={item.unit} onChange={e => updateItem(realIdx, 'unit', e.target.value)}>
                    {['yards','meters','pcs','kg','cone','set','sht','ctn'].map(u => <option key={u}>{u}</option>)}
                  </select>
                </td>
                <td style={{ padding: '4px 8px', borderBottom: '1px solid #f0f0ee' }}>
                  <select className="select" style={{ fontSize: 11 }} value={item.usage_rule} onChange={e => updateItem(realIdx, 'usage_rule', e.target.value)}>
                    {USAGE_RULES.map(r => <option key={r}>{r}</option>)}
                  </select>
                </td>
                <td style={{ padding: '4px 8px', borderBottom: '1px solid #f0f0ee' }}>
                  <input className="input" type="number" style={{ fontSize: 11, textAlign: 'right', width: 80 }} value={item.base_qty || ''} onChange={e => updateItem(realIdx, 'base_qty', e.target.value)} placeholder="0" />
                </td>
                <td style={{ padding: '4px 8px', borderBottom: '1px solid #f0f0ee' }}>
                  <input className="input" type="number" style={{ fontSize: 11, textAlign: 'right', width: 60 }} value={item.wastage || ''} onChange={e => updateItem(realIdx, 'wastage', e.target.value)} />
                </td>
                <td style={{ padding: '4px 0 4px 8px', borderBottom: '1px solid #f0f0ee' }}>
                  <button className="btn btn-ghost btn-sm" onClick={() => removeItem(realIdx)}><Trash2 size={12} /></button>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>

      <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginTop: 8 }}>
        <button className="btn btn-secondary btn-sm" onClick={() => addItem(activeTab)}><Plus size={12} /> Add {activeTab} Item</button>
        <div style={{ flex: 1 }} />
        <button className="btn btn-accent" onClick={handleSave} disabled={saving || !orderId}>
          {saving ? 'Saving...' : 'Save BOM'}
        </button>
        {saved && <span style={{ fontSize: 12, color: 'var(--green)' }}>✓ Saved</span>}
      </div>
    </div>
  )
}
