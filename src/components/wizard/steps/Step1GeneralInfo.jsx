import React, { useState, useEffect } from 'react'
import { supabase } from '../../../lib/supabase'
import { SHIP_MODES, INCOTERMS, CURRENCIES } from '../../../lib/utils'

export default function Step1GeneralInfo({ orderId, orderData, onSaved }) {
  const [buyers, setBuyers] = useState([])
  const [form, setForm] = useState({
    buyer_id: '', buyer_name: '', merchandiser_name: '',
    factory_ref: '', product_id: '', style_number: '', description: '',
    po_number: '', po_date: '', ship_date: '', planned_date: '',
    ship_mode: 'Sea', incoterms: 'FOB', currency: 'USD', season: '',
    ...orderData,
  })
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    supabase.from('buyers').select('id,name,default_incoterms,default_ship_mode,currency')
      .order('name').then(({ data }) => setBuyers(data || []))
  }, [])

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  const handleBuyerChange = (buyerId) => {
    const buyer = buyers.find(b => b.id === buyerId)
    set('buyer_id', buyerId)
    if (buyer) {
      set('buyer_name', buyer.name)
      if (buyer.default_incoterms) set('incoterms', buyer.default_incoterms)
      if (buyer.default_ship_mode) set('ship_mode', buyer.default_ship_mode)
      if (buyer.currency) set('currency', buyer.currency)
    }
  }

  const handleSave = async () => {
    if (!form.style_number && !form.description) return
    setSaving(true)
    const payload = { ...form }
    let result
    if (orderId) {
      result = await supabase.from('orders').update(payload).eq('id', orderId).select().single()
    } else {
      result = await supabase.from('orders').insert([{ ...payload, status: 'Draft' }]).select().single()
    }
    if (result.data) {
      onSaved(result.data.id, result.data)
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    }
    setSaving(false)
  }

  const required = form.buyer_id && form.style_number

  return (
    <div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 200px', gap: 24 }}>
        <div>
          <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-mid)', marginBottom: 14, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Order Details</div>

          <div className="form-row form-row-2 form-group">
            <div>
              <label>Buyer *</label>
              <select className="select" value={form.buyer_id} onChange={e => handleBuyerChange(e.target.value)}>
                <option value="">Select buyer...</option>
                {buyers.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
              </select>
            </div>
            <div>
              <label>Merchandiser</label>
              <input className="input" value={form.merchandiser_name} onChange={e => set('merchandiser_name', e.target.value)} placeholder="Name" />
            </div>
          </div>

          <div className="form-row form-row-3 form-group">
            <div>
              <label>Style Number *</label>
              <input className="input" value={form.style_number} onChange={e => set('style_number', e.target.value)} placeholder="STY-0000" />
            </div>
            <div>
              <label>Product ID</label>
              <input className="input" value={form.product_id} onChange={e => set('product_id', e.target.value)} />
            </div>
            <div>
              <label>Season</label>
              <input className="input" value={form.season} onChange={e => set('season', e.target.value)} placeholder="SS26" />
            </div>
          </div>

          <div className="form-group">
            <label>Description</label>
            <input className="input" value={form.description} onChange={e => set('description', e.target.value)} placeholder="e.g. Washed Denim Jacket — Relaxed Fit" />
          </div>

          <div className="form-row form-row-2 form-group">
            <div>
              <label>Buyer PO Number</label>
              <input className="input" value={form.po_number} onChange={e => set('po_number', e.target.value)} />
            </div>
            <div>
              <label>PO Date</label>
              <input className="input" type="date" value={form.po_date} onChange={e => set('po_date', e.target.value)} />
            </div>
          </div>

          <div className="form-row form-row-3 form-group">
            <div>
              <label>Ex-Factory Date</label>
              <input className="input" type="date" value={form.ship_date} onChange={e => set('ship_date', e.target.value)} />
            </div>
            <div>
              <label>Planned Date</label>
              <input className="input" type="date" value={form.planned_date} onChange={e => set('planned_date', e.target.value)} />
            </div>
            <div>
              <label>Factory Ref</label>
              <input className="input" value={form.factory_ref} onChange={e => set('factory_ref', e.target.value)} />
            </div>
          </div>

          <div className="form-row form-row-3 form-group">
            <div>
              <label>Ship Mode</label>
              <select className="select" value={form.ship_mode} onChange={e => set('ship_mode', e.target.value)}>
                {SHIP_MODES.map(m => <option key={m}>{m}</option>)}
              </select>
            </div>
            <div>
              <label>Incoterms</label>
              <select className="select" value={form.incoterms} onChange={e => set('incoterms', e.target.value)}>
                {INCOTERMS.map(i => <option key={i}>{i}</option>)}
              </select>
            </div>
            <div>
              <label>Currency</label>
              <select className="select" value={form.currency} onChange={e => set('currency', e.target.value)}>
                {CURRENCIES.map(c => <option key={c}>{c}</option>)}
              </select>
            </div>
          </div>
        </div>

        {/* Assets sidebar */}
        <div>
          <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-mid)', marginBottom: 14, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Assets</div>
          <div style={{ border: '1.5px dashed var(--border-dark)', borderRadius: 8, height: 120, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', marginBottom: 12, cursor: 'pointer', background: '#fafaf8' }}>
            <div style={{ fontSize: 11, color: 'var(--text-light)', textAlign: 'center' }}>Style Image<br /><span style={{ fontSize: 10 }}>Click to upload</span></div>
          </div>
          <div style={{ border: '1.5px dashed var(--border-dark)', borderRadius: 8, height: 80, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', background: '#fafaf8' }}>
            <div style={{ fontSize: 11, color: 'var(--text-light)', textAlign: 'center' }}>Tech Pack<br /><span style={{ fontSize: 10 }}>PDF upload</span></div>
          </div>
        </div>
      </div>

      <div style={{ marginTop: 20, display: 'flex', gap: 10, alignItems: 'center' }}>
        <button
          className="btn btn-accent"
          onClick={handleSave}
          disabled={saving || !required}
        >
          {saving ? 'Saving...' : orderId ? 'Save Changes' : 'Create Order'}
        </button>
        {saved && <span style={{ fontSize: 12, color: 'var(--green)' }}>✓ Saved</span>}
        {!required && <span style={{ fontSize: 11, color: 'var(--text-light)' }}>Buyer and Style Number required</span>}
      </div>
    </div>
  )
}
