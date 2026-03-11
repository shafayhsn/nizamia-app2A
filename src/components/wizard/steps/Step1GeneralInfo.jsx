import React, { useState, useEffect, useRef, useCallback } from 'react'
import { supabase } from '../../../lib/supabase'
import { SHIP_MODES, INCOTERMS, CURRENCIES } from '../../../lib/utils'
import { Check, AlertCircle, Upload, X, Image } from 'lucide-react'

const STATUS_OPTIONS = ['Draft', 'Confirmed', 'Cancelled']

const EMPTY = {
  buyer_id: '', buyer_name: '', merchandiser_name: '', agent_name: '',
  factory_ref: '', product_id: '', style_number: '', description: '',
  po_number: '', po_date: '', ship_date: '', planned_date: '',
  in_store_date: '', ship_mode: 'Sea', incoterms: 'FOB', currency: 'USD',
  season: 'SS26', status: 'Draft',
  port_of_loading: '', port_of_discharge: '', notes: '',
  style_image_base64: '',
}

export default function Step1GeneralInfo({ orderId, orderData, onSaved, registerSave }) {
  const [buyers, setBuyers]   = useState([])
  const [saving, setSaving]   = useState(false)
  const [saved, setSaved]     = useState(false)
  const [error, setError]     = useState(null)
  const [imgPreview, setImgPreview] = useState(null)
  const [imgLoading, setImgLoading] = useState(false)
  const fileRef = useRef()

  // All form state is LOCAL — never flows back up on every keystroke
  const [form, setForm] = useState(EMPTY)
  const formRef = useRef(form)
  useEffect(() => { formRef.current = form }, [form])

  // Populate only once on mount / when order changes
  useEffect(() => {
    supabase.from('buyers')
      .select('id,name,default_incoterms,default_ship_mode,currency')
      .order('name')
      .then(({ data }) => setBuyers(data || []))
  }, [])

  useEffect(() => {
    if (orderData?.id) {
      setForm({
        buyer_id:            orderData.buyer_id            || '',
        buyer_name:          orderData.buyer_name          || '',
        merchandiser_name:   orderData.merchandiser_name   || '',
        agent_name:          orderData.agent_name          || '',
        factory_ref:         orderData.factory_ref         || '',
        product_id:          orderData.product_id          || '',
        style_number:        orderData.style_number        || '',
        description:         orderData.description         || '',
        po_number:           orderData.po_number           || '',
        po_date:             orderData.po_date             || '',
        ship_date:           orderData.ship_date           || '',
        planned_date:        orderData.planned_date        || '',
        in_store_date:       orderData.in_store_date       || '',
        ship_mode:           orderData.ship_mode           || 'Sea',
        incoterms:           orderData.incoterms           || 'FOB',
        currency:            orderData.currency            || 'USD',
        season:              orderData.season              || 'SS26',
        status:              orderData.status              || 'Draft',
        port_of_loading:     orderData.port_of_loading     || '',
        port_of_discharge:   orderData.port_of_discharge   || '',
        notes:               orderData.notes               || '',
        style_image_base64:  orderData.style_image_base64  || '',
      })
      if (orderData.style_image_base64) setImgPreview(orderData.style_image_base64)
    }
  }, [orderData?.id])

  // Register save function once — uses formRef.current so always has latest values
  useEffect(() => {
    if (registerSave) registerSave(doSave)
  }, [])

  const set = (k) => (e) => setForm(f => ({ ...f, [k]: e.target.value }))

  const handleBuyerChange = (buyerId) => {
    const b = buyers.find(x => x.id === buyerId)
    setForm(f => ({
      ...f,
      buyer_id:   buyerId,
      buyer_name: b?.name                  || '',
      incoterms:  b?.default_incoterms     || f.incoterms,
      ship_mode:  b?.default_ship_mode     || f.ship_mode,
      currency:   b?.currency              || f.currency,
    }))
  }

  const handleImageUpload = (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    if (file.size > 3 * 1024 * 1024) {
      setError('Image must be under 3MB')
      return
    }
    setImgLoading(true)
    const reader = new FileReader()
    reader.onload = (ev) => {
      const b64 = ev.target.result // data:image/...;base64,...
      setImgPreview(b64)
      setForm(f => ({ ...f, style_image_base64: b64 }))
      setImgLoading(false)
    }
    reader.readAsDataURL(file)
  }

  const clearImage = () => {
    setImgPreview(null)
    setForm(f => ({ ...f, style_image_base64: '' }))
    if (fileRef.current) fileRef.current.value = ''
  }

  const doSave = async () => {
    const form = formRef.current
    if (!form.buyer_id || !form.style_number.trim()) throw new Error('Missing required fields')
    const payload = {
      buyer_id: form.buyer_id, buyer_name: form.buyer_name,
      merchandiser_name: form.merchandiser_name || null,
      agent_name:        form.agent_name        || null,
      factory_ref:       form.factory_ref       || null,
      product_id:        form.product_id        || null,
      style_number:      form.style_number.trim(),
      description:       form.description       || null,
      po_number:         form.po_number         || null,
      po_date:           form.po_date           || null,
      ship_date:         form.ship_date         || null,
      planned_date:      form.planned_date      || null,
      in_store_date:     form.in_store_date     || null,
      ship_mode:         form.ship_mode,
      incoterms:         form.incoterms,
      currency:          form.currency,
      season:            form.season            || null,
      status:            form.status            || 'Draft',
      port_of_loading:   form.port_of_loading   || null,
      port_of_discharge: form.port_of_discharge || null,
      notes:             form.notes             || null,
      style_image_base64: form.style_image_base64 || null,
    }
    let data, err
    if (orderId) {
      const r = await supabase.from('orders').update(payload).eq('id', orderId).select().single()
      data = r.data; err = r.error
    } else {
      const r = await supabase.from('orders').insert([payload]).select().single()
      data = r.data; err = r.error
    }
    if (err) throw new Error(err.message)
    if (data) onSaved(data.id, data)
  }

  const handleSave = async () => {
    setError(null)
    setSaving(true)
    try {
      await doSave()
      setSaved(true)
      setTimeout(() => setSaved(false), 3000)
    } catch (e) {
      setError(e.message)
    }
    setSaving(false)
  }

  const isValid = form.buyer_id && form.style_number.trim()

  // ── Styled helpers ──
  const inp = {
    width: '100%', height: 32, padding: '0 10px',
    border: '1px solid #e5e7eb', borderRadius: 6,
    fontSize: 12, fontFamily: 'Inter,sans-serif',
    outline: 'none', color: '#1a1a2e', background: '#fff',
  }
  const sel = {
    ...inp, cursor: 'pointer', appearance: 'none',
    backgroundImage: "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%23999' stroke-width='2'%3E%3Cpolyline points='6 9 12 15 18 9'/%3E%3C/svg%3E\")",
    backgroundRepeat: 'no-repeat', backgroundPosition: 'right 10px center', paddingRight: 28,
  }
  const lbl = { fontSize: 11, fontWeight: 500, color: '#6b7280', display: 'block', marginBottom: 4 }

  const FG = ({ label, children, w }) => (
    <div style={{ flex: w || '1 1 0', minWidth: 0 }}>
      <label style={lbl}>{label}</label>
      {children}
    </div>
  )

  const Row = ({ children, gap }) => (
    <div style={{ display: 'flex', gap: gap || 12, marginBottom: 12 }}>{children}</div>
  )

  const SL = { fontSize: 10, fontWeight: 700, color: '#9ca3af', letterSpacing: '0.8px', textTransform: 'uppercase', marginBottom: 12 }

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '200px 1fr', gap: 28 }}>

      {/* ── Assets sidebar (LEFT) ── */}
      <div>
        <div style={SL}>Assets</div>

        {/* Style image */}
        <div style={{ marginBottom: 10 }}>
          <label style={lbl}>Style Image</label>
          {imgPreview ? (
            <div style={{ position: 'relative', borderRadius: 8, overflow: 'hidden', border: '1px solid #e5e7eb' }}>
              <img src={imgPreview} alt="Style" style={{ width: '100%', height: 160, objectFit: 'cover', display: 'block' }} />
              <button onClick={clearImage} style={{
                position: 'absolute', top: 6, right: 6,
                background: 'rgba(0,0,0,0.6)', border: 'none',
                borderRadius: '50%', width: 22, height: 22,
                cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                <X size={11} color="#fff" />
              </button>
            </div>
          ) : (
            <div
              onClick={() => fileRef.current?.click()}
              style={{
                border: '1.5px dashed #d1d5db', borderRadius: 8, height: 160,
                display: 'flex', flexDirection: 'column', alignItems: 'center',
                justifyContent: 'center', cursor: 'pointer', background: '#fafafa',
                transition: 'border-color 0.15s',
              }}
              onMouseEnter={e => e.currentTarget.style.borderColor = '#1a1a2e'}
              onMouseLeave={e => e.currentTarget.style.borderColor = '#d1d5db'}
            >
              {imgLoading ? (
                <span style={{ fontSize: 11, color: '#9ca3af' }}>Loading...</span>
              ) : (
                <>
                  <Image size={22} color="#d1d5db" style={{ marginBottom: 6 }} />
                  <span style={{ fontSize: 11, color: '#9ca3af', textAlign: 'center', lineHeight: 1.5 }}>
                    Click to upload<br />
                    <span style={{ fontSize: 10 }}>JPG, PNG · max 3MB</span>
                  </span>
                </>
              )}
            </div>
          )}
          <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp"
            style={{ display: 'none' }} onChange={handleImageUpload} />
        </div>

        {/* Tech Pack — placeholder */}
        <div>
          <label style={lbl}>Tech Pack</label>
          <div style={{
            border: '1.5px dashed #e5e7eb', borderRadius: 8, height: 52,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: '#fafafa',
          }}>
            <span style={{ fontSize: 10, color: '#c4b5fd' }}>PDF upload — coming soon</span>
          </div>
        </div>

        {/* Order status */}
        <div style={{ marginTop: 16 }}>
          <label style={lbl}>Order Status</label>
          <div style={{ display: 'flex', gap: 4 }}>
            {STATUS_OPTIONS.map(s => (
              <button key={s} onClick={() => setForm(f => ({ ...f, status: s }))} style={{
                flex: 1, height: 28, borderRadius: 5, border: '1px solid',
                fontSize: 10, fontWeight: 600, cursor: 'pointer',
                fontFamily: 'Inter,sans-serif',
                borderColor: form.status === s ? '#1a1a2e' : '#e5e7eb',
                background: form.status === s ? '#1a1a2e' : '#fff',
                color: form.status === s ? '#fff' : '#9ca3af',
                transition: 'all 0.1s',
              }}>{s}</button>
            ))}
          </div>
        </div>
      </div>

      {/* ── Main form ── */}
      <div>
        <div style={SL}>Order Details</div>

        <Row>
          <FG label="Buyer *">
            <select style={{ ...sel, borderColor: !form.buyer_id ? '#fca5a5' : '#e5e7eb' }}
              value={form.buyer_id} onChange={e => handleBuyerChange(e.target.value)}>
              <option value="">Select buyer...</option>
              {buyers.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select>
          </FG>
          <FG label="Agent">
            <input style={inp} value={form.agent_name} onChange={set('agent_name')} placeholder="Agent name" />
          </FG>
          <FG label="Merchandiser">
            <input style={inp} value={form.merchandiser_name} onChange={set('merchandiser_name')} placeholder="Name" />
          </FG>
        </Row>

        <Row>
          <FG label="Style Number *">
            <input style={{ ...inp, borderColor: !form.style_number && form.buyer_id ? '#fca5a5' : '#e5e7eb' }}
              value={form.style_number} onChange={set('style_number')} placeholder="e.g. STY-4892" />
          </FG>
          <FG label="Product ID">
            <input style={inp} value={form.product_id} onChange={set('product_id')} />
          </FG>
          <FG label="Season">
            <input style={inp} value={form.season} onChange={set('season')} placeholder="SS26" />
          </FG>
          <FG label="Factory Ref">
            <input style={inp} value={form.factory_ref} onChange={set('factory_ref')} />
          </FG>
        </Row>

        <Row>
          <FG label="Description">
            <input style={inp} value={form.description} onChange={set('description')} placeholder="e.g. Washed Denim Jacket — Relaxed Fit" />
          </FG>
        </Row>

        <Row>
          <FG label="Buyer PO Number">
            <input style={inp} value={form.po_number} onChange={set('po_number')} />
          </FG>
          <FG label="PO Date">
            <input style={inp} type="date" value={form.po_date} onChange={set('po_date')} />
          </FG>
          <FG label="Currency">
            <select style={sel} value={form.currency} onChange={set('currency')}>
              {CURRENCIES.map(c => <option key={c}>{c}</option>)}
            </select>
          </FG>
        </Row>

        <Row>
          <FG label="Ex-Factory Date">
            <input style={inp} type="date" value={form.ship_date} onChange={set('ship_date')} />
          </FG>
          <FG label="In-Store Date">
            <input style={inp} type="date" value={form.in_store_date} onChange={set('in_store_date')} />
          </FG>
          <FG label="Planned Date">
            <input style={inp} type="date" value={form.planned_date} onChange={set('planned_date')} />
          </FG>
        </Row>

        <Row>
          <FG label="Ship Mode">
            <select style={sel} value={form.ship_mode} onChange={set('ship_mode')}>
              {SHIP_MODES.map(m => <option key={m}>{m}</option>)}
            </select>
          </FG>
          <FG label="Incoterms">
            <select style={sel} value={form.incoterms} onChange={set('incoterms')}>
              {INCOTERMS.map(i => <option key={i}>{i}</option>)}
            </select>
          </FG>
          <FG label="Port of Loading">
            <input style={inp} value={form.port_of_loading} onChange={set('port_of_loading')} placeholder="e.g. Karachi" />
          </FG>
          <FG label="Port of Discharge">
            <input style={inp} value={form.port_of_discharge} onChange={set('port_of_discharge')} placeholder="e.g. Rotterdam" />
          </FG>
        </Row>

        <Row>
          <FG label="Notes / Special Instructions">
            <textarea
              style={{ ...inp, height: 64, padding: '8px 10px', resize: 'vertical' }}
              value={form.notes} onChange={set('notes')}
              placeholder="Any special notes for this order..."
            />
          </FG>
        </Row>

        {/* Error */}
        {error && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 12px', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 6, marginBottom: 14, fontSize: 12, color: '#dc2626' }}>
            <AlertCircle size={14} /> {error}
          </div>
        )}

        {/* Save row */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <button onClick={handleSave} disabled={saving || !isValid} style={{
            height: 36, padding: '0 20px', borderRadius: 7,
            background: isValid ? '#1a1a2e' : '#e5e7eb',
            color: isValid ? '#fff' : '#9ca3af',
            border: 'none', cursor: isValid ? 'pointer' : 'not-allowed',
            fontSize: 13, fontWeight: 600, fontFamily: 'Inter,sans-serif',
            display: 'flex', alignItems: 'center', gap: 8,
          }}>
            {saving ? 'Saving...' : orderId ? 'Save Changes' : 'Create Order'}
          </button>

          {saved && (
            <span style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12, color: '#16a34a', fontWeight: 500 }}>
              <Check size={14} strokeWidth={2.5} /> Saved
            </span>
          )}
          {!isValid && !saving && (
            <span style={{ fontSize: 11, color: '#9ca3af' }}>
              {!form.buyer_id ? 'Select a buyer to continue' : 'Enter a style number to continue'}
            </span>
          )}
        </div>
      </div>
    </div>
  )
}
