import React, { useState, useEffect, useCallback, useRef } from 'react'
import { supabase } from '../../../lib/supabase'
import { Plus, Trash2, ChevronDown, ChevronUp, Package } from 'lucide-react'
import { generateSampleNumber, SAMPLE_TYPES } from '../../../lib/utils'

const STATUS_COLORS = { Pending: '#f59e0b', Requested: '#3b82f6', Received: '#8b5cf6', Approved: '#16a34a', Rejected: '#dc2626' }

// ── Request Sample Modal ──────────────────────────────────────────────────────
function RequestModal({ orderId, onClose, onCreated }) {
  const [sizeGroups,  setSizeGroups]  = useState([])
  const [selGroup,    setSelGroup]    = useState(null)
  const [selColours,  setSelColours]  = useState([])
  const [selSizes,    setSelSizes]    = useState([])
  const [baseSize,    setBaseSize]    = useState('')
  const [sampleType,  setSampleType]  = useState('Proto')
  const [dueDate,     setDueDate]     = useState('')
  const [reqPcs,      setReqPcs]      = useState('')
  const [notes,       setNotes]       = useState('')
  const [bomData,     setBomData]     = useState({ fabrics: [], stitching: [], packing: [] })
  const [washData,    setWashData]    = useState([])
  const [embData,     setEmbData]     = useState([])
  const [saving,      setSaving]      = useState(false)
  const [loadingBom,  setLoadingBom]  = useState(false)

  // Load size groups
  useEffect(() => {
    if (!orderId) return
    supabase.from('size_groups').select('*').eq('order_id', orderId).order('sort_order')
      .then(async ({ data: sgs }) => {
        if (!sgs?.length) return
        const sgIds = sgs.map(g => g.id)
        const { data: allColors } = await supabase.from('size_group_colors').select('*').in('size_group_id', sgIds).order('sort_order')
        const enriched = sgs.map(sg => ({ ...sg, colours: (allColors || []).filter(c => c.size_group_id === sg.id) }))
        setSizeGroups(enriched)
      })
  }, [orderId])

  // When group changes, reset selections
  const handleGroupChange = (sg) => {
    setSelGroup(sg)
    setSelColours([])
    setSelSizes(sg?.sizes || [])
    setBaseSize(sg?.base_size || sg?.sizes?.[0] || '')
    setBomData({ fabrics: [], stitching: [], packing: [] })
    setWashData([])
    setEmbData([])
  }

  // When colours selected, load BOM/wash/emb data
  useEffect(() => {
    if (!selGroup || selColours.length === 0) return
    setLoadingBom(true)

    Promise.all([
      supabase.from('bom_items').select('*').eq('order_id', orderId).order('sort_order'),
      supabase.from('washing').select('*').eq('order_id', orderId),
      supabase.from('embellishments').select('*').eq('order_id', orderId),
    ]).then(([{ data: bom }, { data: wash }, { data: emb }]) => {
      setBomData({
        fabrics:   (bom || []).filter(b => b.category === 'Fabric'),
        stitching: (bom || []).filter(b => b.category === 'Stitching Trim'),
        packing:   (bom || []).filter(b => b.category === 'Packing Trim'),
      })
      setWashData((wash || []).filter(w => selColours.includes(w.color_name)))
      setEmbData((emb || []).filter(e => {
        const applies = e.applies_to || ['All']
        return applies.includes('All') || selColours.some(c => applies.includes(c))
      }))
      setLoadingBom(false)
    })
  }, [selColours.join(',')])

  const toggleColour = (name) => setSelColours(c => c.includes(name) ? c.filter(x => x !== name) : [...c, name])
  const toggleSize   = (sz)   => setSelSizes(s => s.includes(sz) ? s.filter(x => x !== sz) : [...s, sz])

  const handleCreate = async () => {
    if (!selGroup || selColours.length === 0) return
    setSaving(true)
    try {
      const num = await generateSampleNumber()
      await supabase.from('samples').insert([{
        order_id:        orderId,
        sample_number:   num,
        sample_type:     sampleType,
        size_group_id:   selGroup.id,
        size_group_name: selGroup.group_name,
        colours:         selColours,
        sizes:           selSizes,
        base_size:       baseSize,
        req_pcs:         parseInt(reqPcs),
        due_date:        dueDate || null,
        comments:        notes || null,
        status:          'Pending',
        bom_snapshot:    bomData,
        wash_snapshot:   washData,
        emb_snapshot:    embData,
      }])
      await supabase.from('orders').update({ step_sampling: true }).eq('id', orderId)
      onCreated()
      onClose()
    } catch (e) { console.error(e) }
    setSaving(false)
  }

  const inp = { height: 32, padding: '0 10px', border: '1px solid #e5e7eb', borderRadius: 6, fontSize: 12, fontFamily: 'Inter,sans-serif', outline: 'none', width: '100%', boxSizing: 'border-box' }
  const sel = { ...inp, cursor: 'pointer' }

  const canCreate = selGroup && selColours.length > 0 && selSizes.length > 0 && reqPcs !== '' && parseInt(reqPcs) > 0

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 500, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
      <div style={{ background: '#fff', borderRadius: 12, width: '100%', maxWidth: 700, maxHeight: 'calc(100vh - 80px)', display: 'flex', flexDirection: 'column', boxShadow: '0 24px 80px rgba(0,0,0,0.22)', overflow: 'hidden' }}>

        {/* Header */}
        <div style={{ padding: '14px 20px', borderBottom: '1px solid #f0f0ee', flexShrink: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 700 }}>Request Sample</div>
          <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 1 }}>Select variant — BOM and linked details auto-populate</div>
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: '16px 20px' }}>

          {/* Type + Due */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 }}>
            <div>
              <label style={{ fontSize: 11, fontWeight: 600, color: '#6b7280', display: 'block', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.4px' }}>Sample Type</label>
              <select style={sel} value={sampleType} onChange={e => setSampleType(e.target.value)}>
                {SAMPLE_TYPES.map(t => <option key={t}>{t}</option>)}
              </select>
            </div>
            <div>
              <label style={{ fontSize: 11, fontWeight: 600, color: '#6b7280', display: 'block', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.4px' }}>Due Date</label>
              <input style={inp} type="date" value={dueDate} onChange={e => setDueDate(e.target.value)} />
            </div>
          </div>

          {/* Size Group */}
          <div style={{ marginBottom: 14 }}>
            <label style={{ fontSize: 11, fontWeight: 600, color: '#6b7280', display: 'block', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.4px' }}>Size Group</label>
            {sizeGroups.length === 0
              ? <div style={{ fontSize: 12, color: '#9ca3af', padding: '10px 0' }}>Complete Step 2 (PO Matrix) first.</div>
              : <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  {sizeGroups.map(sg => (
                    <button key={sg.id} onClick={() => handleGroupChange(sg)}
                      style={{ padding: '5px 12px', borderRadius: 6, fontSize: 12, fontWeight: 600, border: 'none', cursor: 'pointer',
                        background: selGroup?.id === sg.id ? '#0d0d0d' : '#f0f0ee',
                        color: selGroup?.id === sg.id ? '#fff' : '#374151' }}>
                      {sg.group_name}
                    </button>
                  ))}
                </div>
            }
          </div>

          {selGroup && (<>
            {/* Colours */}
            <div style={{ marginBottom: 14 }}>
              <label style={{ fontSize: 11, fontWeight: 600, color: '#6b7280', display: 'block', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.4px' }}>
                Colours <span style={{ color: '#9ca3af', fontWeight: 400, textTransform: 'none' }}>(select one or more)</span>
              </label>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {selGroup.colours.map(c => {
                  const on = selColours.includes(c.color_name)
                  return (
                    <button key={c.id} onClick={() => toggleColour(c.color_name)}
                      style={{ padding: '5px 12px', borderRadius: 6, fontSize: 12, fontWeight: 600, border: 'none', cursor: 'pointer',
                        background: on ? '#1a1a2e' : '#f0f0ee', color: on ? '#fff' : '#374151' }}>
                      {c.color_name}
                    </button>
                  )
                })}
              </div>
            </div>

            {/* Sizes */}
            <div style={{ marginBottom: 14 }}>
              <label style={{ fontSize: 11, fontWeight: 600, color: '#6b7280', display: 'block', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.4px' }}>
                Sizes <span style={{ color: '#9ca3af', fontWeight: 400, textTransform: 'none' }}>(defaults to full size set — deselect to exclude)</span>
              </label>
              <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
                {(selGroup.sizes || []).map(sz => {
                  const on = selSizes.includes(sz)
                  return (
                    <button key={sz} onClick={() => toggleSize(sz)}
                      style={{ padding: '4px 10px', borderRadius: 5, fontSize: 11, fontWeight: 600, border: `1px solid ${on ? '#0d0d0d' : '#e5e7eb'}`, cursor: 'pointer',
                        background: on ? '#0d0d0d' : '#fff', color: on ? '#fff' : '#9ca3af' }}>
                      {sz}
                    </button>
                  )
                })}
              </div>
            </div>

            {/* Base size */}
            <div style={{ marginBottom: 14, maxWidth: 200 }}>
              <label style={{ fontSize: 11, fontWeight: 600, color: '#6b7280', display: 'block', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.4px' }}>Base Size</label>
              <input style={inp} value={baseSize} onChange={e => setBaseSize(e.target.value)} placeholder="e.g. W32" />
            </div>

            {/* Required Pieces — mandatory */}
            <div style={{ marginBottom: 14, maxWidth: 200 }}>
              <label style={{ fontSize: 11, fontWeight: 600, color: '#6b7280', display: 'block', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.4px' }}>
                Required Pieces <span style={{ color: '#dc2626' }}>*</span>
              </label>
              <input style={{ ...inp, borderColor: reqPcs === '' ? '#fca5a5' : '#e5e7eb' }}
                type="number" min="1" value={reqPcs}
                onChange={e => setReqPcs(e.target.value)}
                placeholder="e.g. 3" />
              {reqPcs === '' && <div style={{ fontSize: 10, color: '#dc2626', marginTop: 3 }}>Required</div>}
            </div>

            {/* Notes */}
            <div style={{ marginBottom: 16 }}>
              <label style={{ fontSize: 11, fontWeight: 600, color: '#6b7280', display: 'block', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.4px' }}>Notes</label>
              <input style={inp} value={notes} onChange={e => setNotes(e.target.value)} placeholder="Any special instructions..." />
            </div>

            {/* BOM / Wash / Emb snapshot — shown once colours selected */}
            {selColours.length > 0 && (
              <div style={{ background: '#fafaf8', border: '1px solid #e8e8e6', borderRadius: 8, padding: '12px 14px' }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: '#374151', marginBottom: 10, display: 'flex', alignItems: 'center', gap: 6 }}>
                  <Package size={13} /> Linked Details (auto-pulled from wizard)
                  {loadingBom && <span style={{ fontSize: 10, color: '#9ca3af', fontWeight: 400 }}>Loading...</span>}
                </div>

                {[
                  { label: 'Fabrics',         items: bomData.fabrics,   key: 'name', sub: 'detail' },
                  { label: 'Stitching Trims', items: bomData.stitching, key: 'name', sub: 'detail' },
                  { label: 'Packing Trims',   items: bomData.packing,   key: 'name', sub: 'detail' },
                ].map(sec => sec.items.length > 0 && (
                  <div key={sec.label} style={{ marginBottom: 8 }}>
                    <div style={{ fontSize: 10, fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 4 }}>{sec.label}</div>
                    {sec.items.map((it, i) => (
                      <div key={i} style={{ fontSize: 11, color: '#374151', padding: '2px 0', display: 'flex', gap: 6 }}>
                        <span style={{ fontWeight: 600 }}>{it[sec.key]}</span>
                        {it[sec.sub] && <span style={{ color: '#9ca3af' }}>· {it[sec.sub]}</span>}
                        {it.unit && <span style={{ color: '#9ca3af' }}>· {it.unit}</span>}
                      </div>
                    ))}
                  </div>
                ))}

                {washData.length > 0 && (
                  <div style={{ marginBottom: 8 }}>
                    <div style={{ fontSize: 10, fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 4 }}>Washing</div>
                    {washData.map((w, i) => (
                      <div key={i} style={{ fontSize: 11, color: '#374151', padding: '2px 0' }}>
                        <span style={{ fontWeight: 600 }}>{w.color_name}</span>
                        <span style={{ color: '#9ca3af' }}> · {w.wash_type}{w.wash_ref ? ` · ${w.wash_ref}` : ''}</span>
                      </div>
                    ))}
                  </div>
                )}

                {embData.length > 0 && (
                  <div>
                    <div style={{ fontSize: 10, fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 4 }}>Embellishments</div>
                    {embData.map((e, i) => (
                      <div key={i} style={{ fontSize: 11, color: '#374151', padding: '2px 0' }}>
                        <span style={{ fontWeight: 600 }}>{e.description}</span>
                        <span style={{ color: '#9ca3af' }}> · {e.technique} · {e.placement}</span>
                      </div>
                    ))}
                  </div>
                )}

                {bomData.fabrics.length === 0 && bomData.stitching.length === 0 && bomData.packing.length === 0 && washData.length === 0 && embData.length === 0 && !loadingBom && (
                  <div style={{ fontSize: 11, color: '#9ca3af' }}>No linked BOM/wash/embellishment data found. Complete those steps first.</div>
                )}
              </div>
            )}
          </>)}
        </div>

        {/* Footer */}
        <div style={{ padding: '12px 20px', borderTop: '1px solid #f0f0ee', display: 'flex', justifyContent: 'flex-end', gap: 8, flexShrink: 0 }}>
          <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" onClick={handleCreate} disabled={saving || !canCreate}>
            {saving ? 'Creating...' : 'Create Sample Request'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Sample Row (expanded detail) ──────────────────────────────────────────────
function SampleRow({ s, onUpdate, onDelete }) {
  const [expanded, setExpanded] = useState(false)
  const updLocal = (k, v) => onUpdate(s.id, k, v)

  const inp = { height: 28, padding: '0 8px', border: '1px solid #e5e7eb', borderRadius: 5, fontSize: 11, fontFamily: 'Inter,sans-serif', outline: 'none', background: '#fff' }

  return (
    <>
      <tr>
        <td style={{ padding: '6px 6px', borderBottom: expanded ? 'none' : '1px solid #f0f0ee' }}>
          <span style={{ fontFamily: 'monospace', fontSize: 11, fontWeight: 700, color: '#0d0d0d' }}>{s.sample_number}</span>
        </td>
        <td style={{ padding: '6px 4px', borderBottom: expanded ? 'none' : '1px solid #f0f0ee', width: 90 }}>
          <select style={{ ...inp, width: '100%', cursor: 'pointer' }} value={s.sample_type || 'Proto'} onChange={e => updLocal('sample_type', e.target.value)}>
            {SAMPLE_TYPES.map(t => <option key={t}>{t}</option>)}
          </select>
        </td>
        <td style={{ padding: '6px 4px', borderBottom: expanded ? 'none' : '1px solid #f0f0ee' }}>
          <div style={{ fontSize: 11, fontWeight: 600 }}>{s.size_group_name || s.color || '—'}</div>
          {s.colours?.length > 0 && (
            <div style={{ fontSize: 10, color: '#9ca3af' }}>{s.colours.join(', ')}</div>
          )}
        </td>
        <td style={{ padding: '6px 4px', borderBottom: expanded ? 'none' : '1px solid #f0f0ee' }}>
          {s.sizes?.length > 0
            ? <div style={{ fontSize: 11, color: '#374151' }}>{s.sizes.join(', ')}</div>
            : <span style={{ fontSize: 11, color: '#9ca3af' }}>{s.size || '—'}</span>
          }
          {s.base_size && <div style={{ fontSize: 10, color: '#9ca3af' }}>Base: {s.base_size}</div>}
        </td>
        <td style={{ padding: '6px 4px', borderBottom: expanded ? 'none' : '1px solid #f0f0ee', width: 70 }}>
          <input style={{ ...inp, width: '100%', textAlign: 'center', borderColor: !s.req_pcs ? '#fca5a5' : '#e5e7eb' }}
            type="number" min="1" value={s.req_pcs || ''}
            onChange={e => updLocal('req_pcs', parseInt(e.target.value) || '')} />
        </td>
        <td style={{ padding: '6px 4px', borderBottom: expanded ? 'none' : '1px solid #f0f0ee', width: 120 }}>
          <input style={{ ...inp, width: '100%' }} type="date" value={s.due_date || ''} onChange={e => updLocal('due_date', e.target.value)} />
        </td>
        <td style={{ padding: '6px 4px', borderBottom: expanded ? 'none' : '1px solid #f0f0ee', width: 110 }}>
          <select style={{ ...inp, width: '100%', cursor: 'pointer', fontWeight: 600, color: STATUS_COLORS[s.status] || '#374151' }}
            value={s.status || 'Pending'} onChange={e => updLocal('status', e.target.value)}>
            {['Pending', 'Requested', 'Received', 'Approved', 'Rejected'].map(t => <option key={t}>{t}</option>)}
          </select>
        </td>
        <td style={{ padding: '6px 4px', borderBottom: expanded ? 'none' : '1px solid #f0f0ee', minWidth: 120 }}>
          <input style={{ ...inp, width: '100%' }} value={s.comments || ''} onChange={e => updLocal('comments', e.target.value)} placeholder="Notes..." />
        </td>
        <td style={{ padding: '6px 0 6px 4px', borderBottom: expanded ? 'none' : '1px solid #f0f0ee' }}>
          <div style={{ display: 'flex', gap: 2 }}>
            {(s.bom_snapshot || s.wash_snapshot || s.emb_snapshot) && (
              <button className="btn btn-ghost btn-sm" onClick={() => setExpanded(e => !e)} title="View linked details">
                {expanded ? <ChevronUp size={11} /> : <ChevronDown size={11} />}
              </button>
            )}
            <button className="btn btn-ghost btn-sm" onClick={() => onDelete(s.id)}><Trash2 size={11} /></button>
          </div>
        </td>
      </tr>
      {expanded && (
        <tr>
          <td colSpan={9} style={{ padding: '0 10px 10px 36px', borderBottom: '1px solid #f0f0ee', background: '#fafaf8' }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, paddingTop: 10 }}>
              {[
                { label: 'Fabrics',         data: s.bom_snapshot?.fabrics },
                { label: 'Stitching Trims', data: s.bom_snapshot?.stitching },
                { label: 'Packing Trims',   data: s.bom_snapshot?.packing },
              ].map(sec => (sec.data?.length > 0) && (
                <div key={sec.label}>
                  <div style={{ fontSize: 10, fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 4 }}>{sec.label}</div>
                  {sec.data.map((it, i) => (
                    <div key={i} style={{ fontSize: 11, color: '#374151' }}>{it.name}{it.detail ? ` · ${it.detail}` : ''}</div>
                  ))}
                </div>
              ))}
              {s.wash_snapshot?.length > 0 && (
                <div>
                  <div style={{ fontSize: 10, fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 4 }}>Washing</div>
                  {s.wash_snapshot.map((w, i) => (
                    <div key={i} style={{ fontSize: 11, color: '#374151' }}>{w.color_name} · {w.wash_type}{w.wash_ref ? ` · ${w.wash_ref}` : ''}</div>
                  ))}
                </div>
              )}
              {s.emb_snapshot?.length > 0 && (
                <div>
                  <div style={{ fontSize: 10, fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 4 }}>Embellishments</div>
                  {s.emb_snapshot.map((e, i) => (
                    <div key={i} style={{ fontSize: 11, color: '#374151' }}>{e.description} · {e.technique}</div>
                  ))}
                </div>
              )}
            </div>
          </td>
        </tr>
      )}
    </>
  )
}

// ── Main Step5 ────────────────────────────────────────────────────────────────
export default function Step5Sampling({ orderId, onSaved, registerSave }) {
  const [samples,    setSamples]    = useState([])
  const [showModal,  setShowModal]  = useState(false)

  useEffect(() => { if (orderId) load() }, [orderId])

  async function load() {
    const { data } = await supabase.from('samples').select('*').eq('order_id', orderId).order('created_at')
    setSamples(data || [])
  }

  const updLocal = (id, k, v) => setSamples(s => s.map(x => x.id === id ? { ...x, [k]: v } : x))

  const remove = async (id) => {
    await supabase.from('samples').delete().eq('id', id)
    setSamples(s => s.filter(x => x.id !== id))
  }

  const samplesRef = useRef(samples)
  useEffect(() => { samplesRef.current = samples }, [samples])

  const doSave = useCallback(async () => {
    if (!orderId || !samplesRef.current.length) return
    await Promise.all(samplesRef.current.map(s => {
      const { id, created_at, order_id, sample_number, bom_snapshot, wash_snapshot, emb_snapshot, ...rest } = s
      return supabase.from('samples').update({ ...rest, req_pcs: s.req_pcs || null }).eq('id', id)
    }))
    await supabase.from('orders').update({ step_sampling: true }).eq('id', orderId)
    onSaved(orderId, { step_sampling: true })
  }, [orderId])

  useEffect(() => { if (registerSave) registerSave(doSave) }, [doSave])

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
        <div>
          <div style={{ fontSize: 14, fontWeight: 700 }}>Sample Requests</div>
          <div style={{ fontSize: 12, color: '#9ca3af', marginTop: 2 }}>Select variant — BOM, wash and embellishment details auto-populate</div>
        </div>
        <button className="btn btn-primary btn-sm" onClick={() => setShowModal(true)} disabled={!orderId}>
          <Plus size={12} /> Request Sample
        </button>
      </div>

      {samples.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '40px', color: '#9ca3af', fontSize: 12, background: '#fafaf8', borderRadius: 8, border: '1px solid #f0f0ee' }}>
          No samples yet. Click "Request Sample" to begin.
        </div>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 720 }}>
            <thead>
              <tr>
                {['Sample No.', 'Type', 'Group / Colours', 'Sizes', 'Req Pcs', 'Due Date', 'Status', 'Notes', ''].map(h => (
                  <th key={h} style={{ textAlign: 'left', fontSize: 10, fontWeight: 600, color: '#9ca3af', padding: '0 6px 10px', textTransform: 'uppercase', letterSpacing: '0.6px', whiteSpace: 'nowrap' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {samples.map(s => (
                <SampleRow key={s.id} s={s} onUpdate={updLocal} onDelete={remove} />
              ))}
            </tbody>
          </table>
        </div>
      )}

      {showModal && (
        <RequestModal
          orderId={orderId}
          onClose={() => setShowModal(false)}
          onCreated={() => { load(); onSaved(orderId, { step_sampling: true }) }}
        />
      )}
    </div>
  )
}
