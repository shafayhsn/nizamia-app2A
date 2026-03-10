import React, { useState, useEffect, useCallback, useRef } from 'react'
import { supabase } from '../../../lib/supabase'
import { Trash2, Check, Upload, X } from 'lucide-react'

const WASH_TYPES = ['Enzyme Wash','Stone Wash','Acid Wash','Bleach Wash','Pigment Wash','Sand Wash','Garment Dye','No Wash','Other']

export default function Step6Washing({ orderId, orderData, onSaved, registerSave }) {
  const [enabled, setEnabled] = useState(false)
  const [rows, setRows] = useState([])
  const [suppliers, setSuppliers] = useState([])
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const fileRefs = useRef({})

  useEffect(() => {
    if (!orderId) return
    supabase.from('suppliers').select('id,name').order('name').then(({data})=>setSuppliers(data||[]))
    // Auto-populate from PO Matrix colors
    supabase.from('size_groups').select('id,group_name').eq('order_id', orderId).order('sort_order')
      .then(async ({data: sgs}) => {
        if (!sgs?.length) return
        const colorRows = []
        for (const sg of sgs) {
          const {data: colors} = await supabase.from('size_group_colors').select('id,color_name').eq('size_group_id', sg.id).order('sort_order')
          colors?.forEach(c => colorRows.push({ color_id:c.id, color_name:c.color_name, size_group:sg.group_name }))
        }
        // Load existing washing records
        const {data: existing} = await supabase.from('washing').select('*').eq('order_id', orderId)
        if (existing?.length) {
          setEnabled(true)
          setRows(existing.map(e => ({
            ...e,
            _tempId: e.id,
            imagePreview: e.wash_image_url || null,
          })))
        } else if (colorRows.length) {
          setRows(colorRows.map(cr => ({
            _tempId: Math.random().toString(36).slice(2),
            order_id: orderId,
            color_id: cr.color_id,
            color_name: cr.color_name,
            size_group: cr.size_group,
            wash_type: 'No Wash', wash_ref: '', recipe: '',
            vendor_id: '', notes: '',
            imagePreview: null, wash_image_base64: '',
          })))
        }
      })
  }, [orderId])

  const upd = (idx, k, v) => setRows(rs => { const n=[...rs]; n[idx]={...n[idx],[k]:v}; return n })

  const handleImageUpload = (idx, file) => {
    if (!file) return
    if (file.size > 2 * 1024 * 1024) return
    const reader = new FileReader()
    reader.onload = (ev) => {
      upd(idx, 'imagePreview', ev.target.result)
      upd(idx, 'wash_image_base64', ev.target.result)
    }
    reader.readAsDataURL(file)
  }

  const doSave = useCallback(async () => {
    if (!orderId) return
    await supabase.from('washing').delete().eq('order_id', orderId)
    if (enabled && rows.length) {
      const insertRows = rows.map(({_tempId, imagePreview, ...rest}) => ({
        ...rest,
        wash_image_url: imagePreview || null,
      }))
      await supabase.from('washing').insert(insertRows)
    }
    await supabase.from('orders').update({step_washing: enabled}).eq('id', orderId)
    onSaved(orderId, {step_washing: enabled})
  }, [orderId, rows, enabled])

  useEffect(() => { if (registerSave) registerSave(doSave) }, [doSave])

  const handleSave = async () => {
    setSaving(true)
    try { await doSave(); setSaved(true); setTimeout(()=>setSaved(false),2000) } catch{}
    setSaving(false)
  }

  const inp = { width:'100%', height:30, padding:'0 8px', border:'1px solid #e5e7eb', borderRadius:5, fontSize:11, fontFamily:'Inter,sans-serif', outline:'none' }
  const sel = { ...inp, cursor:'pointer' }

  return (
    <div>
      <div style={{ display:'flex', alignItems:'center', gap:12, marginBottom:20 }}>
        <div>
          <div style={{ fontSize:14, fontWeight:700 }}>Washing</div>
          <div style={{ fontSize:12, color:'#9ca3af', marginTop:2 }}>Assign wash types and references per colour — auto-populated from PO Matrix</div>
        </div>
        <div style={{ marginLeft:'auto' }}>
          <label style={{ display:'flex', alignItems:'center', gap:8, cursor:'pointer' }}>
            <div onClick={()=>setEnabled(e=>!e)} style={{
              width:36, height:20, borderRadius:10,
              background: enabled ? '#1a1a2e' : '#d1d5db',
              position:'relative', cursor:'pointer', transition:'background 0.2s',
            }}>
              <div style={{ position:'absolute', top:3, left:enabled?18:3, width:14, height:14, borderRadius:'50%', background:'#fff', transition:'left 0.2s' }}/>
            </div>
            <span style={{ fontSize:12, fontWeight:600, color: enabled ? '#1a1a2e' : '#9ca3af' }}>
              {enabled ? 'Enabled' : 'Disabled'}
            </span>
          </label>
        </div>
      </div>

      {!enabled ? (
        <div style={{ textAlign:'center', padding:'40px', color:'#9ca3af', fontSize:12, background:'#fafaf8', borderRadius:8, border:'1px solid #f0f0ee' }}>
          Toggle to enable washing details for this order.
        </div>
      ) : rows.length === 0 ? (
        <div style={{ padding:'24px', textAlign:'center', color:'#9ca3af', fontSize:12, background:'#fafaf8', borderRadius:8 }}>
          Complete the PO Matrix (Step 2) first — colours will appear here automatically.
        </div>
      ) : (
        <div style={{ display:'flex', flexDirection:'column', gap:10, marginBottom:16 }}>
          {rows.map((r, idx) => (
            <div key={r._tempId||idx} style={{ background:'#fff', border:'1px solid #e8e8e6', borderRadius:8, padding:'12px 14px' }}>
              <div style={{ display:'flex', gap:12, alignItems:'flex-start', flexWrap:'wrap' }}>
                {/* Wash image */}
                <div style={{ flexShrink:0 }}>
                  {r.imagePreview ? (
                    <div style={{ position:'relative', width:72, height:72 }}>
                      <img src={r.imagePreview} alt="Wash ref" style={{ width:72, height:72, objectFit:'cover', borderRadius:6, border:'1px solid #e5e7eb' }} />
                      <button onClick={()=>{upd(idx,'imagePreview',null); upd(idx,'wash_image_base64','')}} style={{
                        position:'absolute', top:-5, right:-5, background:'#1a1a2e', border:'none',
                        borderRadius:'50%', width:16, height:16, cursor:'pointer',
                        display:'flex', alignItems:'center', justifyContent:'center',
                      }}>
                        <X size={9} color="#fff"/>
                      </button>
                    </div>
                  ) : (
                    <div onClick={()=>fileRefs.current[idx]?.click()} style={{
                      width:72, height:72, border:'1.5px dashed #d1d5db', borderRadius:6,
                      display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center',
                      cursor:'pointer', background:'#fafafa',
                    }}>
                      <Upload size={14} color="#d1d5db"/>
                      <span style={{ fontSize:9, color:'#9ca3af', marginTop:3 }}>Ref Image</span>
                    </div>
                  )}
                  <input type="file" accept="image/*" style={{ display:'none' }}
                    ref={el=>fileRefs.current[idx]=el}
                    onChange={e=>handleImageUpload(idx, e.target.files?.[0])} />
                </div>

                {/* Fields */}
                <div style={{ flex:1, display:'flex', gap:10, flexWrap:'wrap', alignItems:'center' }}>
                  <div style={{ minWidth:130 }}>
                    <div style={{ fontSize:10, fontWeight:600, color:'#9ca3af', textTransform:'uppercase', marginBottom:3 }}>Colour / Wash</div>
                    <div style={{ fontSize:13, fontWeight:700 }}>{r.color_name}</div>
                    {r.size_group && <div style={{ fontSize:10, color:'#9ca3af' }}>{r.size_group}</div>}
                  </div>
                  <div style={{ flex:'1 1 120px' }}>
                    <div style={{ fontSize:10, fontWeight:600, color:'#9ca3af', textTransform:'uppercase', marginBottom:3 }}>Wash Type</div>
                    <select style={sel} value={r.wash_type||'No Wash'} onChange={e=>upd(idx,'wash_type',e.target.value)}>
                      {WASH_TYPES.map(t=><option key={t}>{t}</option>)}
                    </select>
                  </div>
                  <div style={{ flex:'1 1 100px' }}>
                    <div style={{ fontSize:10, fontWeight:600, color:'#9ca3af', textTransform:'uppercase', marginBottom:3 }}>Wash Ref</div>
                    <input style={inp} value={r.wash_ref||''} onChange={e=>upd(idx,'wash_ref',e.target.value)} placeholder="WB-2024-07" />
                  </div>
                  <div style={{ flex:'1 1 120px' }}>
                    <div style={{ fontSize:10, fontWeight:600, color:'#9ca3af', textTransform:'uppercase', marginBottom:3 }}>Vendor</div>
                    <select style={sel} value={r.vendor_id||''} onChange={e=>upd(idx,'vendor_id',e.target.value)}>
                      <option value="">Unassigned</option>
                      {suppliers.map(s=><option key={s.id} value={s.id}>{s.name}</option>)}
                    </select>
                  </div>
                  <div style={{ flex:'1 1 80px' }}>
                    <div style={{ fontSize:10, fontWeight:600, color:'#9ca3af', textTransform:'uppercase', marginBottom:3 }}>T/A Days</div>
                    <input style={{...inp, width:70}} type="number" value={r.turnaround_days||''} onChange={e=>upd(idx,'turnaround_days',e.target.value)} placeholder="14" />
                  </div>
                  <div style={{ flex:'2 1 160px' }}>
                    <div style={{ fontSize:10, fontWeight:600, color:'#9ca3af', textTransform:'uppercase', marginBottom:3 }}>Notes</div>
                    <input style={inp} value={r.notes||''} onChange={e=>upd(idx,'notes',e.target.value)} placeholder="Any wash notes..." />
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {enabled && (
        <div style={{ display:'flex', gap:10, alignItems:'center' }}>
          <button className="btn btn-primary" onClick={handleSave} disabled={saving||!orderId}>
            {saving?'Saving...':'Save Washing'}
          </button>
          {saved && <span style={{ fontSize:12, color:'#16a34a', display:'flex', alignItems:'center', gap:4 }}><Check size={13}/>Saved</span>}
        </div>
      )}
    </div>
  )
}
