import React, { useState, useEffect, useCallback, useRef } from 'react'
import { supabase } from '../../../lib/supabase'
import { Check } from 'lucide-react'

export default function Step4Fitting({ orderId, onSaved, registerSave }) {
  const orderIdRef = useRef(orderId)
  useEffect(() => { orderIdRef.current = orderId }, [orderId])
  const [enabled, setEnabled] = useState(false)
  const [rows, setRows]       = useState([])
  const [notes, setNotes]     = useState('')
  const [saving, setSaving]   = useState(false)
  const [saved, setSaved]     = useState(false)
  const [loaded, setLoaded]   = useState(false)

  useEffect(() => {
    if (!orderId) return
    loadAll()
  }, [orderId])

  async function loadAll() {
    // Load existing fitting record
    const { data: fit } = await supabase.from('fitting').select('*').eq('order_id', orderId).maybeSingle()
    // Load size groups to auto-populate rows
    const { data: sgs } = await supabase.from('size_groups').select('id,group_name,base_size').eq('order_id', orderId).order('sort_order')

    if (fit) {
      setEnabled(true)
      setNotes(fit.comments || '')
      // rows may be stored as JSON string or array
      const parsedRows = typeof fit.rows === 'string' ? JSON.parse(fit.rows) : (fit.rows || [])
      // Merge current group_name from size_groups in case it wasn't saved
      const sgMap = Object.fromEntries((sgs || []).map(sg => [sg.id, sg]))
      const merged = parsedRows.map(r => ({
        ...r,
        group_name: sgMap[r.size_group_id]?.group_name || r.group_name || '—',
        base_size:  r.base_size || sgMap[r.size_group_id]?.base_size || '',
      }))
      setRows(merged)
    } else if (sgs?.length) {
      setRows(sgs.map(sg => ({
        size_group_id: sg.id,
        group_name:    sg.group_name,
        base_size:     sg.base_size || '',
        block_spec:    '',
        fit_standard:  '',
        key_measurements: '',
        notes:         '',
      })))
    }
    setLoaded(true)
  }

  const upd = (idx, k, v) => setRows(rs => { const n = [...rs]; n[idx] = { ...n[idx], [k]: v }; return n })


  // Refs so doSave always has latest state without re-registering
  const rowsRef = useRef(rows)
  const enabledRef = useRef(enabled)
  const notesRef = useRef(notes)
  useEffect(() => { rowsRef.current = rows }, [rows])
  useEffect(() => { enabledRef.current = enabled }, [enabled])
  useEffect(() => { notesRef.current = notes }, [notes])

  const doSave = useCallback(async () => {
    const oid = orderIdRef.current
    if (!oid) return
    const payload = { order_id: oid, comments: notesRef.current, rows: rowsRef.current }
    const { data: ex } = await supabase.from('fitting').select('id').eq('order_id', oid).maybeSingle()
    if (ex) await supabase.from('fitting').update(payload).eq('order_id', oid)
    else     await supabase.from('fitting').insert([payload])
    await supabase.from('orders').update({ step_fitting: enabledRef.current }).eq('id', oid)
    onSaved(oid, { step_fitting: enabledRef.current })
  }, [])

  useEffect(() => { if (registerSave) registerSave(doSave) }, [doSave])

  const handleSave = async () => {
    setSaving(true)
    try { await doSave(); setSaved(true); setTimeout(() => setSaved(false), 2000) } catch {}
    setSaving(false)
  }

  const inp = { width: '100%', height: 30, padding: '0 8px', border: '1px solid #e5e7eb', borderRadius: 5, fontSize: 11, fontFamily: 'Inter,sans-serif', outline: 'none', background: '#fff' }

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
        <div>
          <div style={{ fontSize: 14, fontWeight: 700 }}>Fitting / Block & Spec Assignment</div>
          <div style={{ fontSize: 12, color: '#9ca3af', marginTop: 2 }}>Record fit blocks, spec references and key measurements per size group</div>
        </div>
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', marginLeft: 'auto' }}>
          <div onClick={() => setEnabled(e => !e)} style={{ width: 36, height: 20, borderRadius: 10, background: enabled ? '#0d0d0d' : '#d1d5db', position: 'relative', cursor: 'pointer', transition: 'background 0.2s' }}>
            <div style={{ position: 'absolute', top: 3, left: enabled ? 18 : 3, width: 14, height: 14, borderRadius: '50%', background: '#fff', transition: 'left 0.2s' }} />
          </div>
          <span style={{ fontSize: 12, fontWeight: 600, color: enabled ? '#0d0d0d' : '#9ca3af' }}>{enabled ? 'Enabled' : 'Disabled'}</span>
        </label>
      </div>

      {!enabled ? (
        <div style={{ textAlign: 'center', padding: '40px', color: '#9ca3af', fontSize: 12, background: '#fafaf8', borderRadius: 8, border: '1px solid #f0f0ee' }}>
          Toggle to enable fitting details for this order.
        </div>
      ) : !loaded ? (
        <div style={{ textAlign: 'center', padding: '40px', color: '#9ca3af', fontSize: 12 }}>Loading...</div>
      ) : rows.length === 0 ? (
        <div style={{ padding: '24px', textAlign: 'center', color: '#9ca3af', fontSize: 12, background: '#fafaf8', borderRadius: 8 }}>
          Complete the PO Matrix (Step 2) first — size groups will appear here automatically.
        </div>
      ) : (
        <>
          <div style={{ overflowX: 'auto', marginBottom: 16 }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 700 }}>
              <thead>
                <tr>
                  {['Size Group', 'Base Size', 'Block / Spec Code', 'Fit Standard', 'Key Measurements / Ease', 'Notes'].map(h => (
                    <th key={h} style={{ textAlign: 'left', fontSize: 10, fontWeight: 600, color: '#9ca3af', padding: '0 6px 10px', textTransform: 'uppercase', letterSpacing: '0.6px', whiteSpace: 'nowrap' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((r, idx) => (
                  <tr key={idx}>
                    <td style={{ padding: '5px 6px', borderBottom: '1px solid #f0f0ee', fontWeight: 700, fontSize: 12, whiteSpace: 'nowrap', color: '#0d0d0d' }}>{r.group_name}</td>
                    <td style={{ padding: '5px 6px', borderBottom: '1px solid #f0f0ee', width: 80 }}>
                      <input style={inp} value={r.base_size || ''} onChange={e => upd(idx, 'base_size', e.target.value)} placeholder="M" />
                    </td>
                    <td style={{ padding: '5px 6px', borderBottom: '1px solid #f0f0ee', minWidth: 130 }}>
                      <input style={inp} value={r.block_spec || ''} onChange={e => upd(idx, 'block_spec', e.target.value)} placeholder="BLK-DJ-04" />
                    </td>
                    <td style={{ padding: '5px 6px', borderBottom: '1px solid #f0f0ee', minWidth: 110 }}>
                      <input style={inp} value={r.fit_standard || ''} onChange={e => upd(idx, 'fit_standard', e.target.value)} placeholder="Relaxed Fit" />
                    </td>
                    <td style={{ padding: '5px 6px', borderBottom: '1px solid #f0f0ee', minWidth: 180 }}>
                      <input style={inp} value={r.key_measurements || ''} onChange={e => upd(idx, 'key_measurements', e.target.value)} placeholder="Chest: +4cm, Seat: +2cm" />
                    </td>
                    <td style={{ padding: '5px 6px', borderBottom: '1px solid #f0f0ee', minWidth: 130 }}>
                      <input style={inp} value={r.notes || ''} onChange={e => upd(idx, 'notes', e.target.value)} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div style={{ marginBottom: 16 }}>
            <label style={{ fontSize: 11, fontWeight: 500, color: '#6b7280', display: 'block', marginBottom: 4 }}>Notes</label>
            <textarea style={{ width: '100%', height: 64, padding: '8px 10px', border: '1px solid #e5e7eb', borderRadius: 6, fontSize: 12, fontFamily: 'Inter,sans-serif', outline: 'none', resize: 'vertical' }}
              value={notes} onChange={e => setNotes(e.target.value)} placeholder="Fitting notes..." />
          </div>


        </>
      )}
    </div>
  )
}
