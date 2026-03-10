import React, { useState, useEffect } from 'react'
import { supabase } from '../../../lib/supabase'
import { SHIP_MODES, INCOTERMS, CURRENCIES } from '../../../lib/utils'
import { Check, AlertCircle } from 'lucide-react'

export default function Step1GeneralInfo({ orderId, orderData, onSaved }) {
  const [buyers, setBuyers] = useState([])
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState(null)

  const [form, setForm] = useState({
    buyer_id: '',
    buyer_name: '',
    merchandiser_name: '',
    factory_ref: '',
    product_id: '',
    style_number: '',
    description: '',
    po_number: '',
    po_date: '',
    ship_date: '',
    planned_date: '',
    ship_mode: 'Sea',
    incoterms: 'FOB',
    currency: 'USD',
    season: 'SS26',
    status: 'Draft',
  })

  useEffect(() => {
    supabase.from('buyers')
      .select('id,name,default_incoterms,default_ship_mode,currency')
      .order('name')
      .then(({ data }) => setBuyers(data || []))
  }, [])

  // Populate form when editing existing order
  useEffect(() => {
    if (orderData?.id) {
      setForm(f => ({
        ...f,
        buyer_id: orderData.buyer_id || '',
        buyer_name: orderData.buyer_name || '',
        merchandiser_name: orderData.merchandiser_name || '',
        factory_ref: orderData.factory_ref || '',
        product_id: orderData.product_id || '',
        style_number: orderData.style_number || '',
        description: orderData.description || '',
        po_number: orderData.po_number || '',
        po_date: orderData.po_date || '',
        ship_date: orderData.ship_date || '',
        planned_date: orderData.planned_date || '',
        ship_mode: orderData.ship_mode || 'Sea',
        incoterms: orderData.incoterms || 'FOB',
        currency: orderData.currency || 'USD',
        season: orderData.season || 'SS26',
        status: orderData.status || 'Draft',
      }))
    }
  }, [orderData?.id])

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  const handleBuyerChange = (buyerId) => {
    const buyer = buyers.find(b => b.id === buyerId)
    setForm(f => ({
      ...f,
      buyer_id: buyerId,
      buyer_name: buyer?.name || '',
      incoterms: buyer?.default_incoterms || f.incoterms,
      ship_mode: buyer?.default_ship_mode || f.ship_mode,
      currency: buyer?.currency || f.currency,
    }))
  }

  const handleSave = async () => {
    if (!form.buyer_id || !form.style_number.trim()) return
    setSaving(true)
    setError(null)

    const payload = {
      buyer_id: form.buyer_id,
      buyer_name: form.buyer_name,
      merchandiser_name: form.merchandiser_name || null,
      factory_ref: form.factory_ref || null,
      product_id: form.product_id || null,
      style_number: form.style_number.trim(),
      description: form.description || null,
      po_number: form.po_number || null,
      po_date: form.po_date || null,
      ship_date: form.ship_date || null,
      planned_date: form.planned_date || null,
      ship_mode: form.ship_mode,
      incoterms: form.incoterms,
      currency: form.currency,
      season: form.season || null,
      status: form.status || 'Draft',
    }

    let data, err
    if (orderId) {
      const res = await supabase.from('orders').update(payload).eq('id', orderId).select().single()
      data = res.data; err = res.error
    } else {
      const res = await supabase.from('orders').insert([payload]).select().single()
      data = res.data; err = res.error
    }

    if (err) {
      console.error('Save error:', err)
      setError(err.message || 'Failed to save. Check console for details.')
      setSaving(false)
      return
    }

    if (data) {
      onSaved(data.id, data)
      setSaved(true)
      setTimeout(() => setSaved(false), 3000)
    }
    setSaving(false)
  }

  const isValid = form.buyer_id && form.style_number.trim()

  const FG = ({ label, children, half, third }) => (
    <div style={{ flex: third ? '1 1 calc(33% - 8px)' : half ? '1 1 calc(50% - 8px)' : '1 1 100%', minWidth: 0 }}>
      <label style={{ fontSize:11, fontWeight:500, color:'#6b7280', display:'block', marginBottom:4 }}>{label}</label>
      {children}
    </div>
  )

  const inputStyle = { width:'100%', height:32, padding:'0 10px', border:'1px solid #e5e7eb', borderRadius:6, fontSize:12, fontFamily:'Inter,sans-serif', outline:'none', color:'#1a1a2e', background:'#fff' }
  const selectStyle = { ...inputStyle, cursor:'pointer', appearance:'none', backgroundImage:"url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%23999' stroke-width='2'%3E%3Cpolyline points='6 9 12 15 18 9'/%3E%3C/svg%3E\")", backgroundRepeat:'no-repeat', backgroundPosition:'right 10px center', paddingRight:28 }

  return (
    <div style={{ display:'grid', gridTemplateColumns:'1fr 190px', gap:28 }}>

      {/* Main form */}
      <div>
        <div style={{ fontSize:10, fontWeight:700, color:'#9ca3af', letterSpacing:'0.8px', textTransform:'uppercase', marginBottom:14 }}>Order Details</div>

        <div style={{ display:'flex', flexWrap:'wrap', gap:12, marginBottom:12 }}>
          <FG label="Buyer *" half>
            <select style={selectStyle} value={form.buyer_id} onChange={e => handleBuyerChange(e.target.value)}>
              <option value="">Select buyer...</option>
              {buyers.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select>
          </FG>
          <FG label="Merchandiser" half>
            <input style={inputStyle} value={form.merchandiser_name} onChange={e => set('merchandiser_name', e.target.value)} placeholder="Name" />
          </FG>
        </div>

        <div style={{ display:'flex', flexWrap:'wrap', gap:12, marginBottom:12 }}>
          <FG label="Style Number *" third>
            <input style={{ ...inputStyle, borderColor: !form.style_number && form.buyer_id ? '#fca5a5' : '#e5e7eb' }} value={form.style_number} onChange={e => set('style_number', e.target.value)} placeholder="e.g. STY-4892" />
          </FG>
          <FG label="Product ID" third>
            <input style={inputStyle} value={form.product_id} onChange={e => set('product_id', e.target.value)} />
          </FG>
          <FG label="Season" third>
            <input style={inputStyle} value={form.season} onChange={e => set('season', e.target.value)} placeholder="SS26" />
          </FG>
        </div>

        <div style={{ marginBottom:12 }}>
          <FG label="Description">
            <input style={inputStyle} value={form.description} onChange={e => set('description', e.target.value)} placeholder="e.g. Washed Denim Jacket — Relaxed Fit" />
          </FG>
        </div>

        <div style={{ display:'flex', flexWrap:'wrap', gap:12, marginBottom:12 }}>
          <FG label="Buyer PO Number" third>
            <input style={inputStyle} value={form.po_number} onChange={e => set('po_number', e.target.value)} />
          </FG>
          <FG label="PO Date" third>
            <input style={inputStyle} type="date" value={form.po_date} onChange={e => set('po_date', e.target.value)} />
          </FG>
          <FG label="Factory Ref" third>
            <input style={inputStyle} value={form.factory_ref} onChange={e => set('factory_ref', e.target.value)} />
          </FG>
        </div>

        <div style={{ display:'flex', flexWrap:'wrap', gap:12, marginBottom:12 }}>
          <FG label="Ex-Factory Date" half>
            <input style={inputStyle} type="date" value={form.ship_date} onChange={e => set('ship_date', e.target.value)} />
          </FG>
          <FG label="Planned Date" half>
            <input style={inputStyle} type="date" value={form.planned_date} onChange={e => set('planned_date', e.target.value)} />
          </FG>
        </div>

        <div style={{ display:'flex', flexWrap:'wrap', gap:12, marginBottom:20 }}>
          <FG label="Ship Mode" third>
            <select style={selectStyle} value={form.ship_mode} onChange={e => set('ship_mode', e.target.value)}>
              {SHIP_MODES.map(m => <option key={m}>{m}</option>)}
            </select>
          </FG>
          <FG label="Incoterms" third>
            <select style={selectStyle} value={form.incoterms} onChange={e => set('incoterms', e.target.value)}>
              {INCOTERMS.map(i => <option key={i}>{i}</option>)}
            </select>
          </FG>
          <FG label="Currency" third>
            <select style={selectStyle} value={form.currency} onChange={e => set('currency', e.target.value)}>
              {CURRENCIES.map(c => <option key={c}>{c}</option>)}
            </select>
          </FG>
        </div>

        {/* Error */}
        {error && (
          <div style={{ display:'flex', alignItems:'center', gap:8, padding:'10px 12px', background:'#fef2f2', border:'1px solid #fecaca', borderRadius:6, marginBottom:14, fontSize:12, color:'#dc2626' }}>
            <AlertCircle size={14} />
            {error}
          </div>
        )}

        {/* Save */}
        <div style={{ display:'flex', alignItems:'center', gap:12 }}>
          <button
            onClick={handleSave}
            disabled={saving || !isValid}
            style={{
              height:38, padding:'0 22px', borderRadius:7,
              background: isValid ? '#2383e2' : '#e5e7eb',
              color: isValid ? '#fff' : '#9ca3af',
              border:'none', cursor: isValid ? 'pointer' : 'not-allowed',
              fontSize:13, fontWeight:600, fontFamily:'Inter,sans-serif',
              display:'flex', alignItems:'center', gap:8,
              transition:'background 0.15s',
            }}
          >
            {saving ? 'Saving...' : orderId ? 'Save Changes' : 'Create Order'}
          </button>

          {saved && (
            <span style={{ display:'flex', alignItems:'center', gap:5, fontSize:12, color:'#16a34a', fontWeight:500 }}>
              <Check size={14} strokeWidth={2.5} />
              Saved — click Next to continue
            </span>
          )}
          {!isValid && (
            <span style={{ fontSize:11, color:'#9ca3af' }}>
              {!form.buyer_id ? 'Select a buyer to continue' : 'Enter a style number to continue'}
            </span>
          )}
        </div>
      </div>

      {/* Assets sidebar */}
      <div>
        <div style={{ fontSize:10, fontWeight:700, color:'#9ca3af', letterSpacing:'0.8px', textTransform:'uppercase', marginBottom:14 }}>Assets</div>
        <div style={{ border:'1.5px dashed #d1d5db', borderRadius:8, height:130, display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', marginBottom:10, cursor:'pointer', background:'#fafafa' }}>
          <div style={{ fontSize:11, color:'#9ca3af', textAlign:'center', lineHeight:1.6 }}>
            Style Image<br/><span style={{ fontSize:10 }}>Click to upload</span>
          </div>
        </div>
        <div style={{ border:'1.5px dashed #d1d5db', borderRadius:8, height:80, display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', cursor:'pointer', background:'#fafafa' }}>
          <div style={{ fontSize:11, color:'#9ca3af', textAlign:'center', lineHeight:1.6 }}>
            Tech Pack<br/><span style={{ fontSize:10 }}>PDF upload</span>
          </div>
        </div>
      </div>
    </div>
  )
}
