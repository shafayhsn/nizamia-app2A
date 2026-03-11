import React, { useState, useEffect, useCallback, useRef } from 'react'
import { supabase } from '../../../lib/supabase'
import { Plus, Trash2, Check, Library } from 'lucide-react'

const USAGE_RULES = ['Generic','By Color','By Size Group','By Individual Sizes','Configure Own']
const UNITS = ['yards','meters','pcs','kg','cone','set','sht','ctn','roll','ltr']
const TABLES = [
  { key:'Fabric',        label:'Fabrics' },
  { key:'Stitching Trim',label:'Stitching Trims' },
  { key:'Packing Trim',  label:'Packing Trims' },
]

const COVERAGE_COLOR = { full:'#16a34a', partial:'#f59e0b', none:'#e5e7eb' }

function calcFinalQty(item, totalQty) {
  const base = parseFloat(item.base_qty) || 0
  const waste = parseFloat(item.wastage) || 0
  if (!base || !totalQty) return null
  return (base * totalQty * (1 + waste / 100)).toFixed(2)
}

export default function Step3BOM({ orderId, orderData, onSaved, registerSave }) {
  const [items,    setItems]   = useState([])
  const [library,  setLibrary] = useState([])
  const [saving,   setSaving]  = useState(false)
  const [saved,    setSaved]   = useState(false)
  const [activeTab, setActive] = useState('Fabric')
  const [showLib,  setShowLib] = useState(false)
  const [suppliers, setSuppliers] = useState([])

  // Approximate total qty from orderData
  const totalQty = orderData?.total_qty || 0

  useEffect(() => {
    if (orderId) loadItems()
    supabase.from('library_items').select('*').order('name').then(({data}) => setLibrary(data||[]))
    supabase.from('suppliers').select('id,name').order('name').then(({data}) => setSuppliers(data||[]))
  }, [orderId])

  async function loadItems() {
    const {data} = await supabase.from('bom_items').select('*').eq('order_id', orderId).order('sort_order')
    setItems(data || [])
  }

  const addBlank = (cat) => setItems(i => [...i, {
    _new:true, order_id:orderId, category:cat,
    name:'', specification:'', unit:'yards', usage_rule:'Generic',
    base_qty:'', wastage:5, supplier_id:'', notes:'', sort_order:i.length,
    _tempId: Math.random().toString(36).slice(2),
  }])

  const addFromLibrary = (libItem) => {
    setItems(i => [...i, {
      _new:true, order_id:orderId, category:libItem.category,
      name:libItem.name, specification:libItem.description||'',
      unit:libItem.unit, usage_rule:'Generic',
      base_qty:'', wastage:libItem.default_wastage||5,
      supplier_id:'', notes:'', sort_order:i.length,
      _tempId:Math.random().toString(36).slice(2),
      library_item_id:libItem.id,
    }])
    setActive(libItem.category)
    setShowLib(false)
  }

  const upd = (idx, k, v) => setItems(its => { const n=[...its]; n[idx]={...n[idx],[k]:v}; return n })

  const remove = async (idx) => {
    const item = items[idx]
    if (item.id) await supabase.from('bom_items').delete().eq('id', item.id)
    setItems(its => its.filter((_,i)=>i!==idx))
  }


  // Refs so doSave always has latest state without re-registering
  const itemsRef = useRef(items)
  useEffect(() => { itemsRef.current = items }, [items])

  const doSave = useCallback(async () => {
    if (!orderId) throw new Error('No order ID')
    for (let idx=0; idx<itemsRef.current.length; idx++) {
      const {_new, _tempId, id, ...rest} = itemsRef.current[idx]
      if (id) {
        await supabase.from('bom_items').update({...rest, sort_order:idx}).eq('id',id)
      } else {
        const {data} = await supabase.from('bom_items')
          .insert([{...rest, order_id:orderId, sort_order:idx}]).select().single()
        if (data) setItems(its => { const n=[...its]; n[idx]=data; return n })
      }
    }
    await supabase.from('orders').update({step_bom:true}).eq('id',orderId)
    onSaved(orderId, {step_bom:true})
  }, [items, orderId])

  useEffect(() => { if (registerSave) registerSave(doSave) }, [])

  const handleSave = async () => {
    setSaving(true)
    try { await doSave(); setSaved(true); setTimeout(()=>setSaved(false),2000) } catch{}
    setSaving(false)
  }

  const tabItems = items.filter(i => i.category === activeTab)
  const inp = { width:'100%', height:30, padding:'0 8px', border:'1px solid #e5e7eb', borderRadius:5, fontSize:11, fontFamily:'Inter,sans-serif', outline:'none', background:'#fff' }
  const sel = { ...inp, cursor:'pointer', paddingRight:4 }

  const coverageDot = (item) => {
    if (!item.usage_rule || item.usage_rule === 'Generic') return 'full'
    if (!item.base_qty) return 'none'
    return 'full'
  }

  return (
    <div>
      {/* Tab bar */}
      <div style={{ display:'flex', gap:0, marginBottom:16, borderBottom:'1px solid #e8e8e6' }}>
        {TABLES.map(t => {
          const count = items.filter(i=>i.category===t.key).length
          return (
            <button key={t.key} onClick={()=>setActive(t.key)} style={{
              padding:'9px 16px', background:'none', border:'none', cursor:'pointer',
              fontSize:12, fontWeight:activeTab===t.key?700:400,
              color:activeTab===t.key?'#1a1a2e':'#9ca3af',
              borderBottom:`2px solid ${activeTab===t.key?'#1a1a2e':'transparent'}`,
              marginBottom:-1, display:'flex', alignItems:'center', gap:6,
            }}>
              {t.label}
              <span style={{ fontSize:10, background:count>0?'#1a1a2e':'#e5e7eb', color:count>0?'#fff':'#9ca3af', borderRadius:10, padding:'1px 6px', fontWeight:700 }}>
                {count}
              </span>
            </button>
          )
        })}
      </div>

      {/* Table */}
      <div style={{ overflowX:'auto' }}>
        <table style={{ width:'100%', borderCollapse:'collapse', minWidth:760, marginBottom:12 }}>
          <thead>
            <tr>
              {['','Item Name','Specification','Unit','Usage Rule','Base Qty','Wastage %','Supplier','Final Qty',''].map((h,i) => (
                <th key={i} style={{ textAlign:i>=5&&i<=7?'right':'left', fontSize:10, fontWeight:600, color:'#9ca3af', padding:'0 6px 8px', textTransform:'uppercase', letterSpacing:'0.6px', whiteSpace:'nowrap' }}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {tabItems.length === 0 && (
              <tr><td colSpan={10} style={{ padding:'32px', textAlign:'center', color:'#9ca3af', fontSize:12 }}>
                No {activeTab.toLowerCase()} items yet. Add below.
              </td></tr>
            )}
            {tabItems.map(item => {
              const realIdx = items.indexOf(item)
              const fqty = calcFinalQty(item, totalQty)
              const cov  = coverageDot(item)
              return (
                <tr key={item.id || item._tempId}>
                  {/* Coverage dot */}
                  <td style={{ padding:'4px 6px', borderBottom:'1px solid #f0f0ee', width:14 }}>
                    <div title={cov} style={{ width:8, height:8, borderRadius:'50%', background:COVERAGE_COLOR[cov], flexShrink:0 }} />
                  </td>
                  <td style={{ padding:'4px 4px', borderBottom:'1px solid #f0f0ee', minWidth:150 }}>
                    <input style={inp} value={item.name||''} onChange={e=>upd(realIdx,'name',e.target.value)} placeholder="Item name" />
                  </td>
                  <td style={{ padding:'4px 4px', borderBottom:'1px solid #f0f0ee', minWidth:140 }}>
                    <input style={inp} value={item.specification||''} onChange={e=>upd(realIdx,'specification',e.target.value)} placeholder="e.g. 98% CO 2% EA" />
                  </td>
                  <td style={{ padding:'4px 4px', borderBottom:'1px solid #f0f0ee', width:80 }}>
                    <select style={sel} value={item.unit||'yards'} onChange={e=>upd(realIdx,'unit',e.target.value)}>
                      {UNITS.map(u=><option key={u}>{u}</option>)}
                    </select>
                  </td>
                  <td style={{ padding:'4px 4px', borderBottom:'1px solid #f0f0ee', width:130 }}>
                    <select style={sel} value={item.usage_rule||'Generic'} onChange={e=>upd(realIdx,'usage_rule',e.target.value)}>
                      {USAGE_RULES.map(r=><option key={r}>{r}</option>)}
                    </select>
                  </td>
                  <td style={{ padding:'4px 4px', borderBottom:'1px solid #f0f0ee', width:80 }}>
                    <input style={{...inp,textAlign:'right'}} type="number" value={item.base_qty||''} onChange={e=>upd(realIdx,'base_qty',e.target.value)} placeholder="0" />
                  </td>
                  <td style={{ padding:'4px 4px', borderBottom:'1px solid #f0f0ee', width:64 }}>
                    <input style={{...inp,textAlign:'right'}} type="number" value={item.wastage||''} onChange={e=>upd(realIdx,'wastage',e.target.value)} />
                  </td>
                  <td style={{ padding:'4px 4px', borderBottom:'1px solid #f0f0ee', minWidth:120 }}>
                    <select style={sel} value={item.supplier_id||''} onChange={e=>upd(realIdx,'supplier_id',e.target.value)}>
                      <option value="">Unassigned</option>
                      {suppliers.map(s=><option key={s.id} value={s.id}>{s.name}</option>)}
                    </select>
                  </td>
                  <td style={{ padding:'4px 4px', borderBottom:'1px solid #f0f0ee', width:90, textAlign:'right' }}>
                    {fqty ? (
                      <span style={{ fontSize:11, fontWeight:700, color:'#1a1a2e', fontVariantNumeric:'tabular-nums' }}>
                        {parseFloat(fqty).toLocaleString(undefined,{maximumFractionDigits:1})}
                      </span>
                    ) : <span style={{ color:'#d1d5db', fontSize:11 }}>—</span>}
                  </td>
                  <td style={{ padding:'4px 0 4px 4px', borderBottom:'1px solid #f0f0ee' }}>
                    <button className="btn btn-ghost btn-sm" onClick={()=>remove(realIdx)}><Trash2 size={11}/></button>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {/* Actions row */}
      <div style={{ display:'flex', gap:8, alignItems:'center', flexWrap:'wrap' }}>
        <button className="btn btn-secondary btn-sm" onClick={()=>addBlank(activeTab)}>
          <Plus size={12}/> Add {activeTab} Item
        </button>
        <button className="btn btn-ghost btn-sm" onClick={()=>setShowLib(true)}>
          <Library size={12}/> Add from Library
        </button>
        <div style={{ flex:1 }}/>
        <button className="btn btn-primary" onClick={handleSave} disabled={saving||!orderId}>
          {saving?'Saving...':saved?'✓ Saved':'Save BOM'}
        </button>
        {saved && <span style={{ fontSize:12, color:'#16a34a', display:'flex', alignItems:'center', gap:4 }}><Check size={13}/>Saved</span>}
      </div>

      {/* Library picker modal */}
      {showLib && (
        <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.4)', zIndex:400, display:'flex', alignItems:'center', justifyContent:'center' }}>
          <div style={{ background:'#fff', borderRadius:10, padding:24, width:480, maxHeight:'70vh', display:'flex', flexDirection:'column', boxShadow:'0 16px 48px rgba(0,0,0,0.2)' }}>
            <div style={{ fontSize:13, fontWeight:700, marginBottom:12 }}>Add from Library</div>
            <div style={{ flex:1, overflowY:'auto' }}>
              {library.length === 0 ? (
                <div style={{ padding:24, textAlign:'center', color:'#9ca3af', fontSize:12 }}>
                  No library items. Add them in the Library page.
                </div>
              ) : library.map(lib => (
                <div key={lib.id} style={{ display:'flex', alignItems:'center', gap:10, padding:'8px 0', borderBottom:'1px solid #f0f0ee' }}>
                  <div style={{ flex:1 }}>
                    <div style={{ fontSize:12, fontWeight:600 }}>{lib.name}</div>
                    <div style={{ fontSize:11, color:'#9ca3af' }}>{lib.category} · {lib.unit} · wastage {lib.default_wastage}%</div>
                  </div>
                  <button className="btn btn-sm btn-secondary" onClick={()=>addFromLibrary(lib)}>Add</button>
                </div>
              ))}
            </div>
            <div style={{ marginTop:12, display:'flex', justifyContent:'flex-end' }}>
              <button className="btn btn-ghost" onClick={()=>setShowLib(false)}>Close</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
