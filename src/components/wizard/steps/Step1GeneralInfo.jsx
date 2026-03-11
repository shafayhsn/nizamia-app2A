import React, { useState, useEffect, useRef } from 'react'
import { supabase } from '../../../lib/supabase'
import { SHIP_MODES, INCOTERMS, CURRENCIES } from '../../../lib/utils'
import { Check, AlertCircle, X, Image } from 'lucide-react'

const STATUS_OPTIONS = ['Draft', 'Confirmed', 'Cancelled']

export default function Step1GeneralInfo({ orderId, orderData, onSaved, registerSave }) {
  const [buyers, setBuyers]         = useState([])
  const [saving, setSaving]         = useState(false)
  const [saved,  setSaved]          = useState(false)
  const [error,  setError]          = useState(null)
  const [status, setStatus]         = useState(orderData?.status || 'Draft')
  const [imgPreview, setImgPreview] = useState(orderData?.style_image_base64 || null)
  const [imgLoading, setImgLoading] = useState(false)
  const imgBase64Ref = useRef(orderData?.style_image_base64 || '')
  const fileRef      = useRef()

  // One DOM ref per field — no controlled state, no re-renders on keystroke
  const r = {
    buyer_id:          useRef(), agent_name:        useRef(),
    merchandiser_name: useRef(), style_number:      useRef(),
    product_id:        useRef(), season:            useRef(),
    factory_ref:       useRef(), description:       useRef(),
    po_number:         useRef(), po_date:           useRef(),
    currency:          useRef(), ship_date:         useRef(),
    in_store_date:     useRef(), planned_date:      useRef(),
    ship_mode:         useRef(), incoterms:         useRef(),
    port_of_loading:   useRef(), port_of_discharge: useRef(),
    notes:             useRef(),
  }

  useEffect(() => {
    supabase.from('buyers')
      .select('id,name,default_incoterms,default_ship_mode,currency')
      .order('name')
      .then(({ data }) => setBuyers(data || []))
  }, [])

  // Populate fields when editing an existing order
  useEffect(() => {
    if (!orderData?.id) return
    const o = orderData
    const s = (ref, v) => { if (ref.current) ref.current.value = v || '' }
    s(r.buyer_id, o.buyer_id); s(r.agent_name, o.agent_name)
    s(r.merchandiser_name, o.merchandiser_name); s(r.style_number, o.style_number)
    s(r.product_id, o.product_id); s(r.season, o.season || 'SS26')
    s(r.factory_ref, o.factory_ref); s(r.description, o.description)
    s(r.po_number, o.po_number); s(r.po_date, o.po_date)
    s(r.currency, o.currency || 'USD'); s(r.ship_date, o.ship_date)
    s(r.in_store_date, o.in_store_date); s(r.planned_date, o.planned_date)
    s(r.ship_mode, o.ship_mode || 'Sea'); s(r.incoterms, o.incoterms || 'FOB')
    s(r.port_of_loading, o.port_of_loading); s(r.port_of_discharge, o.port_of_discharge)
    s(r.notes, o.notes)
    setStatus(o.status || 'Draft')
    if (o.style_image_base64) { setImgPreview(o.style_image_base64); imgBase64Ref.current = o.style_image_base64 }
  }, [orderData?.id])

  // Register save once — reads DOM refs at save time
  useEffect(() => { if (registerSave) registerSave(doSave) }, [])

  const doSave = async () => {
    const v = (ref) => ref.current?.value || ''
    const buyerId = v(r.buyer_id)
    const styleNo = v(r.style_number).trim()
    if (!buyerId || !styleNo) throw new Error('Select a buyer and enter a style number')
    const buyer = buyers.find(b => b.id === buyerId)
    const payload = {
      buyer_id: buyerId, buyer_name: buyer?.name || '',
      merchandiser_name: v(r.merchandiser_name) || null,
      agent_name:        v(r.agent_name)        || null,
      factory_ref:       v(r.factory_ref)       || null,
      product_id:        v(r.product_id)        || null,
      style_number:      styleNo,
      description:       v(r.description)       || null,
      po_number:         v(r.po_number)          || null,
      po_date:           v(r.po_date)            || null,
      ship_date:         v(r.ship_date)          || null,
      planned_date:      v(r.planned_date)       || null,
      in_store_date:     v(r.in_store_date)      || null,
      ship_mode:         v(r.ship_mode),
      incoterms:         v(r.incoterms),
      currency:          v(r.currency),
      season:            v(r.season)             || null,
      status,
      port_of_loading:   v(r.port_of_loading)   || null,
      port_of_discharge: v(r.port_of_discharge) || null,
      notes:             v(r.notes)             || null,
      style_image_base64: imgBase64Ref.current  || null,
    }
    let data, err
    if (orderId) {
      const res = await supabase.from('orders').update(payload).eq('id', orderId).select().single()
      data = res.data; err = res.error
    } else {
      const res = await supabase.from('orders').insert([payload]).select().single()
      data = res.data; err = res.error
    }
    if (err) throw new Error(err.message)
    if (data) onSaved(data.id, data)
  }

  const handleSave = async () => {
    setError(null); setSaving(true)
    try { await doSave(); setSaved(true); setTimeout(() => setSaved(false), 3000) }
    catch (e) { setError(e.message) }
    setSaving(false)
  }

  const handleBuyerChange = (e) => {
    const b = buyers.find(x => x.id === e.target.value)
    if (b) {
      if (r.incoterms.current && b.default_incoterms) r.incoterms.current.value = b.default_incoterms
      if (r.ship_mode.current && b.default_ship_mode)  r.ship_mode.current.value  = b.default_ship_mode
      if (r.currency.current  && b.currency)           r.currency.current.value   = b.currency
    }
  }

  const handleImageUpload = (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    if (file.size > 3 * 1024 * 1024) { setError('Image must be under 3MB'); return }
    setImgLoading(true)
    const reader = new FileReader()
    reader.onload = (ev) => { imgBase64Ref.current = ev.target.result; setImgPreview(ev.target.result); setImgLoading(false) }
    reader.readAsDataURL(file)
  }

  const clearImage = () => { setImgPreview(null); imgBase64Ref.current = ''; if (fileRef.current) fileRef.current.value = '' }

  // ── Styles ──
  const inp = { width: '100%', height: 32, padding: '0 10px', border: '1px solid #e5e7eb', borderRadius: 6, fontSize: 12, fontFamily: 'Inter,sans-serif', outline: 'none', color: '#1a1a2e', background: '#fff', boxSizing: 'border-box' }
  const sel = { ...inp, cursor: 'pointer', appearance: 'none', backgroundImage: "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%23999' stroke-width='2'%3E%3Cpolyline points='6 9 12 15 18 9'/%3E%3C/svg%3E\")", backgroundRepeat: 'no-repeat', backgroundPosition: 'right 10px center', paddingRight: 28 }
  const lbl = { fontSize: 11, fontWeight: 500, color: '#6b7280', display: 'block', marginBottom: 4 }
  const SL  = { fontSize: 10, fontWeight: 700, color: '#9ca3af', letterSpacing: '0.8px', textTransform: 'uppercase', marginBottom: 12 }
  const FG  = ({ label, children, w }) => <div style={{ flex: w || '1 1 0', minWidth: 0 }}><label style={lbl}>{label}</label>{children}</div>
  const Row = ({ children }) => <div style={{ display: 'flex', gap: 12, marginBottom: 12 }}>{children}</div>

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '200px 1fr', gap: 28 }}>

      {/* Assets sidebar */}
      <div>
        <div style={SL}>Assets</div>
        <div style={{ marginBottom: 10 }}>
          <label style={lbl}>Style Image</label>
          {imgPreview ? (
            <div style={{ position: 'relative', borderRadius: 8, overflow: 'hidden', border: '1px solid #e5e7eb' }}>
              <img src={imgPreview} alt="Style" style={{ width: '100%', height: 160, objectFit: 'cover', display: 'block' }} />
              <button onClick={clearImage} style={{ position: 'absolute', top: 6, right: 6, background: 'rgba(0,0,0,0.6)', border: 'none', borderRadius: '50%', width: 22, height: 22, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <X size={11} color="#fff" />
              </button>
            </div>
          ) : (
            <div onClick={() => fileRef.current?.click()}
              style={{ border: '1.5px dashed #d1d5db', borderRadius: 8, height: 160, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', background: '#fafafa' }}
              onMouseEnter={e => e.currentTarget.style.borderColor = '#1a1a2e'}
              onMouseLeave={e => e.currentTarget.style.borderColor = '#d1d5db'}
            >
              {imgLoading ? <span style={{ fontSize: 11, color: '#9ca3af' }}>Loading...</span> : (
                <><Image size={22} color="#d1d5db" style={{ marginBottom: 6 }} /><span style={{ fontSize: 11, color: '#9ca3af', textAlign: 'center', lineHeight: 1.5 }}>Click to upload<br /><span style={{ fontSize: 10 }}>JPG, PNG · max 3MB</span></span></>
              )}
            </div>
          )}
          <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" style={{ display: 'none' }} onChange={handleImageUpload} />
        </div>
        <div>
          <label style={lbl}>Tech Pack</label>
          <div style={{ border: '1.5px dashed #e5e7eb', borderRadius: 8, height: 52, display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#fafafa' }}>
            <span style={{ fontSize: 10, color: '#c4b5fd' }}>PDF upload — coming soon</span>
          </div>
        </div>
        <div style={{ marginTop: 16 }}>
          <label style={lbl}>Order Status</label>
          <div style={{ display: 'flex', gap: 4 }}>
            {STATUS_OPTIONS.map(s => (
              <button key={s} onClick={() => setStatus(s)} style={{ flex: 1, height: 28, borderRadius: 5, border: '1px solid', fontSize: 10, fontWeight: 600, cursor: 'pointer', fontFamily: 'Inter,sans-serif', borderColor: status === s ? '#1a1a2e' : '#e5e7eb', background: status === s ? '#1a1a2e' : '#fff', color: status === s ? '#fff' : '#9ca3af' }}>{s}</button>
            ))}
          </div>
        </div>
      </div>

      {/* Main form */}
      <div>
        <div style={SL}>Order Details</div>
        <Row>
          <FG label="Buyer *">
            <select ref={r.buyer_id} style={sel} defaultValue={orderData?.buyer_id || ''} onChange={handleBuyerChange}>
              <option value="">Select buyer...</option>
              {buyers.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select>
          </FG>
          <FG label="Agent"><input ref={r.agent_name} style={inp} defaultValue={orderData?.agent_name || ''} placeholder="Agent name" /></FG>
          <FG label="Merchandiser"><input ref={r.merchandiser_name} style={inp} defaultValue={orderData?.merchandiser_name || ''} placeholder="Name" /></FG>
        </Row>
        <Row>
          <FG label="Style Number *"><input ref={r.style_number} style={inp} defaultValue={orderData?.style_number || ''} placeholder="e.g. STY-4892" /></FG>
          <FG label="Product ID"><input ref={r.product_id} style={inp} defaultValue={orderData?.product_id || ''} /></FG>
          <FG label="Season"><input ref={r.season} style={inp} defaultValue={orderData?.season || 'SS26'} /></FG>
          <FG label="Factory Ref"><input ref={r.factory_ref} style={inp} defaultValue={orderData?.factory_ref || ''} /></FG>
        </Row>
        <Row>
          <FG label="Description"><input ref={r.description} style={inp} defaultValue={orderData?.description || ''} placeholder="e.g. Washed Denim Jacket — Relaxed Fit" /></FG>
        </Row>
        <Row>
          <FG label="Buyer PO Number"><input ref={r.po_number} style={inp} defaultValue={orderData?.po_number || ''} /></FG>
          <FG label="PO Date"><input ref={r.po_date} style={inp} type="date" defaultValue={orderData?.po_date || ''} /></FG>
          <FG label="Currency">
            <select ref={r.currency} style={sel} defaultValue={orderData?.currency || 'USD'}>{CURRENCIES.map(c => <option key={c}>{c}</option>)}</select>
          </FG>
        </Row>
        <Row>
          <FG label="Ex-Factory Date"><input ref={r.ship_date} style={inp} type="date" defaultValue={orderData?.ship_date || ''} /></FG>
          <FG label="In-Store Date"><input ref={r.in_store_date} style={inp} type="date" defaultValue={orderData?.in_store_date || ''} /></FG>
          <FG label="Planned Date"><input ref={r.planned_date} style={inp} type="date" defaultValue={orderData?.planned_date || ''} /></FG>
        </Row>
        <Row>
          <FG label="Ship Mode">
            <select ref={r.ship_mode} style={sel} defaultValue={orderData?.ship_mode || 'Sea'}>{SHIP_MODES.map(m => <option key={m}>{m}</option>)}</select>
          </FG>
          <FG label="Incoterms">
            <select ref={r.incoterms} style={sel} defaultValue={orderData?.incoterms || 'FOB'}>{INCOTERMS.map(i => <option key={i}>{i}</option>)}</select>
          </FG>
          <FG label="Port of Loading"><input ref={r.port_of_loading} style={inp} defaultValue={orderData?.port_of_loading || ''} placeholder="e.g. Karachi" /></FG>
          <FG label="Port of Discharge"><input ref={r.port_of_discharge} style={inp} defaultValue={orderData?.port_of_discharge || ''} placeholder="e.g. Rotterdam" /></FG>
        </Row>
        <Row>
          <FG label="Notes / Special Instructions">
            <textarea ref={r.notes} style={{ ...inp, height: 64, padding: '8px 10px', resize: 'vertical' }} defaultValue={orderData?.notes || ''} placeholder="Any special notes..." />
          </FG>
        </Row>

        {error && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 12px', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 6, marginBottom: 14, fontSize: 12, color: '#dc2626' }}>
            <AlertCircle size={14} /> {error}
          </div>
        )}

        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <button onClick={handleSave} disabled={saving} style={{ height: 36, padding: '0 20px', borderRadius: 7, background: '#1a1a2e', color: '#fff', border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 600, fontFamily: 'Inter,sans-serif' }}>
            {saving ? 'Saving...' : orderId ? 'Save Changes' : 'Create Order'}
          </button>
          {saved && <span style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12, color: '#16a34a', fontWeight: 500 }}><Check size={14} strokeWidth={2.5} /> Saved</span>}
        </div>
      </div>
    </div>
  )
}
