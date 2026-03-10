import React, { useState, useEffect, useCallback } from 'react'
import { supabase } from '../../../lib/supabase'
import { Check } from 'lucide-react'

const FIT_STATUSES = ['Pending','Passed','Failed','Requires Revision']

export default function Step4Fitting({ orderId, orderData, onSaved, registerSave }) {
  const [enabled, setEnabled] = useState(false)
  const [sizeGroups, setSizeGroups] = useState([])
  const [rows, setRows] = useState([])
  const [notes, setNotes] = useState('')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    if (!orderId) return
    // Load size groups from PO Matrix to auto-populate
    supabase.from('size_groups').select('id,group_name,sizes,base_size').eq('order_id', orderId).order('sort_order')
      .then(({data}) => {
        const sgs = data || []
        setSizeGroups(sgs)
        if (sgs.length > 0 && rows.length === 0) {
          setRows(sgs.map(sg => ({
            size_group_id: sg.id,
            group_name: sg.group_name,
            block_spec: '', fit_standard: '', key_measurements: '', notes: '',
            base_size: sg.base_size || 'M',
          })))
        }
      })
    supabase.from('fitting').select('*').eq('order_id', orderId).single()
      .then(({data}) => {
        if (data) {
          setEnabled(true)
          setNotes(data.comments || '')
          if (data.rows) setRows(data.rows)
        }
      })
  }, [orderId])

  const upd = (idx, k, v) => setRows(rs => { const n=[...rs]; n[idx]={...n[idx],[k]:v}; return n })

  const doSave = useCallback(async () => {
    if (!orderId) return
    const payload = { order_id: orderId, comments: notes, rows: JSON.stringify(rows) }
    const {data: existing} = await supabase.from('fitting').select('id').eq('order_id', orderId).single()
    if (existing) {
      await supabase.from('fitting').update(payload).eq('order_id', orderId)
    } else {
      await supabase.from('fitting').insert([payload])
    }
    await supabase.from('orders').update({step_fitting: enabled}).eq('id', orderId)
    onSaved(orderId, {step_fitting: enabled})
  }, [orderId, notes, rows, enabled])

  useEffect(() => { if (registerSave) registerSave(doSave) }, [doSave])

  const handleSave = async () => {
    setSaving(true)
    try { await doSave(); setSaved(true); setTimeout(()=>setSaved(false),2000) } catch{}
    setSaving(false)
  }

  const inp = { width:'100%', height:30, padding:'0 8px', border:'1px solid #e5e7eb', borderRadius:5, fontSize:11, fontFamily:'Inter,sans-serif', outline:'none' }

  return (
    <div>
      <div style={{ display:'flex', alignItems:'center', gap:12, marginBottom:20 }}>
        <div>
          <div style={{ fontSize:14, fontWeight:700 }}>Fitting / Block & Spec Assignment</div>
          <div style={{ fontSize:12, color:'#9ca3af', marginTop:2 }}>Record fit blocks, spec references and key measurements per size group</div>
        </div>
        <div style={{ marginLeft:'auto' }}>
          <label style={{ display:'flex', alignItems:'center', gap:8, cursor:'pointer' }}>
            <div onClick={()=>setEnabled(e=>!e)} style={{
              width:36, height:20, borderRadius:10,
              background: enabled ? '#1a1a2e' : '#d1d5db',
              position:'relative', cursor:'pointer', transition:'background 0.2s',
            }}>
              <div style={{ position:'absolute', top:3, left: enabled?18:3, width:14, height:14, borderRadius:'50%', background:'#fff', transition:'left 0.2s' }}/>
            </div>
            <span style={{ fontSize:12, fontWeight:600, color: enabled ? '#1a1a2e' : '#9ca3af' }}>
              {enabled ? 'Enabled' : 'Disabled'}
            </span>
          </label>
        </div>
      </div>

      {!enabled ? (
        <div style={{ textAlign:'center', padding:'40px', color:'#9ca3af', fontSize:12, background:'#fafaf8', borderRadius:8, border:'1px solid #f0f0ee' }}>
          Toggle to enable fitting details for this order.
        </div>
      ) : (
        <>
          {rows.length === 0 ? (
            <div style={{ padding:'24px', textAlign:'center', color:'#9ca3af', fontSize:12, background:'#fafaf8', borderRadius:8 }}>
              Complete the PO Matrix (Step 2) first — size groups will appear here automatically.
            </div>
          ) : (
            <div style={{ overflowX:'auto' }}>
              <table style={{ width:'100%', borderCollapse:'collapse', minWidth:700, marginBottom:16 }}>
                <thead>
                  <tr>
                    {['Size Group','Base Size','Block / Spec Code','Fit Standard','Key Measurements / Ease','Notes'].map(h => (
                      <th key={h} style={{ textAlign:'left', fontSize:10, fontWeight:600, color:'#9ca3af', padding:'0 6px 8px', textTransform:'uppercase', letterSpacing:'0.6px', whiteSpace:'nowrap' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r, idx) => (
                    <tr key={idx}>
                      <td style={{ padding:'5px 6px', borderBottom:'1px solid #f0f0ee', fontWeight:600, fontSize:12, whiteSpace:'nowrap' }}>{r.group_name}</td>
                      <td style={{ padding:'5px 6px', borderBottom:'1px solid #f0f0ee', width:70 }}>
                        <input style={inp} value={r.base_size||''} onChange={e=>upd(idx,'base_size',e.target.value)} placeholder="M" />
                      </td>
                      <td style={{ padding:'5px 6px', borderBottom:'1px solid #f0f0ee', minWidth:130 }}>
                        <input style={inp} value={r.block_spec||''} onChange={e=>upd(idx,'block_spec',e.target.value)} placeholder="BLK-DJ-04" />
                      </td>
                      <td style={{ padding:'5px 6px', borderBottom:'1px solid #f0f0ee', minWidth:110 }}>
                        <input style={inp} value={r.fit_standard||''} onChange={e=>upd(idx,'fit_standard',e.target.value)} placeholder="Relaxed Fit" />
                      </td>
                      <td style={{ padding:'5px 6px', borderBottom:'1px solid #f0f0ee', minWidth:160 }}>
                        <input style={inp} value={r.key_measurements||''} onChange={e=>upd(idx,'key_measurements',e.target.value)} placeholder="Chest: +4cm, Seat: +2cm" />
                      </td>
                      <td style={{ padding:'5px 6px', borderBottom:'1px solid #f0f0ee', minWidth:120 }}>
                        <input style={inp} value={r.notes||''} onChange={e=>upd(idx,'notes',e.target.value)} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <div style={{ marginBottom:16 }}>
            <label style={{ fontSize:11, fontWeight:500, color:'#6b7280', display:'block', marginBottom:4 }}>Step Notes</label>
            <textarea style={{ width:'100%', height:72, padding:'8px 10px', border:'1px solid #e5e7eb', borderRadius:6, fontSize:12, fontFamily:'Inter,sans-serif', outline:'none', resize:'vertical' }}
              value={notes} onChange={e=>setNotes(e.target.value)} placeholder="Fitting notes or special instructions..." />
          </div>

          <div style={{ display:'flex', gap:10, alignItems:'center' }}>
            <button className="btn btn-primary" onClick={handleSave} disabled={saving||!orderId}>
              {saving?'Saving...':'Save Fitting'}
            </button>
            {saved && <span style={{ fontSize:12, color:'#16a34a', display:'flex', alignItems:'center', gap:4 }}><Check size={13}/>Saved</span>}
          </div>
        </>
      )}
    </div>
  )
}
