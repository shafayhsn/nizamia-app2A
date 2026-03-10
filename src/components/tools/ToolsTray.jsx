import React, { useState } from 'react'
import { X, Scissors, Box, Ruler, Scale, Palette, DollarSign, Send, Tag, BookImage } from 'lucide-react'

const TOOLS = [
  { id: 'thread', icon: Scissors, label: 'Sewing Thread Calc' },
  { id: 'cbm', icon: Box, label: 'CBM Calculator' },
  { id: 'fabric', icon: Ruler, label: 'Fabric Consumption' },
  { id: 'gsm', icon: Scale, label: 'Fabric GSM Finder' },
  { id: 'pantone', icon: Palette, label: 'Pantone Converter' },
  { id: 'costing', icon: DollarSign, label: 'Costing Sheet' },
  { id: 'dispatch', icon: Send, label: 'Parcel Dispatch' },
  { id: 'accessories', icon: Tag, label: 'Accessories / Trims', soon: true },
  { id: 'catalogue', icon: BookImage, label: 'Catalogue Maker', soon: true },
]

function ThreadCalc() {
  const FACTORS = {
    'Lockstitch': 2.5, 'Overlock': 3.5, 'Double Needle': 4.0,
    'Coverstitch': 4.0, 'Flatlock': 4.5, 'Bartack': 10.0, 'Zigzag': 2.8,
  }
  const [rows, setRows] = useState([{ stitch: 'Lockstitch', length: '', }])
  const addRow = () => setRows([...rows, { stitch: 'Lockstitch', length: '' }])
  const updateRow = (i, k, v) => { const r = [...rows]; r[i][k] = v; setRows(r) }
  const total = rows.reduce((s, r) => s + (parseFloat(r.length) || 0) * (FACTORS[r.stitch] || 0), 0)

  return (
    <div>
      <p style={{ fontSize: 11, color: 'var(--text-light)', marginBottom: 12 }}>Consumption = seam length × machine factor</p>
      {rows.map((r, i) => (
        <div key={i} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 8 }}>
          <div>
            <label>Stitch Type</label>
            <select className="select" value={r.stitch} onChange={e => updateRow(i, 'stitch', e.target.value)}>
              {Object.keys(FACTORS).map(k => <option key={k}>{k}</option>)}
            </select>
          </div>
          <div>
            <label>Seam Length (cm)</label>
            <input className="input" type="number" value={r.length} onChange={e => updateRow(i, 'length', e.target.value)} placeholder="0" />
          </div>
        </div>
      ))}
      <button className="btn btn-secondary btn-sm" onClick={addRow} style={{ marginBottom: 14 }}>+ Add Operation</button>
      {total > 0 && (
        <div style={{ background: '#f7f7f5', borderRadius: 6, padding: '10px 14px' }}>
          <div style={{ fontSize: 11, color: 'var(--text-light)' }}>Total Consumption</div>
          <div style={{ fontSize: 18, fontWeight: 700 }}>{(total / 100).toFixed(1)} m <span style={{ fontSize: 12, fontWeight: 400, color: 'var(--text-mid)' }}>({(total / 91.44).toFixed(1)} yd)</span></div>
        </div>
      )}
    </div>
  )
}

function CBMCalc() {
  const [unit, setUnit] = useState('cm')
  const [dims, setDims] = useState({ l: '', w: '', h: '', qty: '' })
  const set = (k, v) => setDims({ ...dims, [k]: v })
  const factor = unit === 'cm' ? 1 / 1000000 : 0.0254 ** 3
  const cbm = (parseFloat(dims.l) || 0) * (parseFloat(dims.w) || 0) * (parseFloat(dims.h) || 0) * factor * (parseFloat(dims.qty) || 1)
  const container = cbm <= 15 ? 'LCL' : cbm <= 28 ? "20' FCL" : cbm <= 58 ? "40' FCL" : cbm <= 68 ? "40' HC" : 'Multiple containers'

  return (
    <div>
      <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
        {['cm', 'inches'].map(u => (
          <button key={u} className={`btn btn-sm ${unit === u ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setUnit(u)}>{u}</button>
        ))}
      </div>
      <div className="form-row form-row-2" style={{ marginBottom: 8 }}>
        <div className="form-group"><label>Length</label><input className="input" type="number" value={dims.l} onChange={e => set('l', e.target.value)} /></div>
        <div className="form-group"><label>Width</label><input className="input" type="number" value={dims.w} onChange={e => set('w', e.target.value)} /></div>
        <div className="form-group"><label>Height</label><input className="input" type="number" value={dims.h} onChange={e => set('h', e.target.value)} /></div>
        <div className="form-group"><label>Carton Qty</label><input className="input" type="number" value={dims.qty} onChange={e => set('qty', e.target.value)} /></div>
      </div>
      {cbm > 0 && (
        <div style={{ background: '#f7f7f5', borderRadius: 6, padding: '10px 14px' }}>
          <div style={{ fontSize: 18, fontWeight: 700 }}>{cbm.toFixed(3)} m³</div>
          <div style={{ fontSize: 11, color: 'var(--text-mid)', marginTop: 4 }}>Recommended: <strong>{container}</strong></div>
        </div>
      )}
    </div>
  )
}

function PantoneConverter() {
  const [code, setCode] = useState('')
  const [result, setResult] = useState(null)
  const [loading, setLoading] = useState(false)

  const convert = async () => {
    if (!code.trim()) return
    setLoading(true)
    try {
      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'claude-sonnet-4-20250514',
          max_tokens: 300,
          messages: [{
            role: 'user',
            content: `For Pantone color ${code}, provide: RGB values, HEX code, closest thread color (brand + code), closest zipper color. Respond ONLY in JSON: {"rgb":"r,g,b","hex":"#XXXXXX","thread":"brand + code","zipper":"description"}`
          }]
        })
      })
      const data = await res.json()
      const text = data.content[0].text.replace(/```json|```/g, '').trim()
      setResult(JSON.parse(text))
    } catch (e) {
      setResult({ error: 'Could not convert. Check the Pantone code.' })
    }
    setLoading(false)
  }

  return (
    <div>
      <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
        <input className="input" placeholder="e.g. 18-1550 TCX" value={code} onChange={e => setCode(e.target.value)} onKeyDown={e => e.key === 'Enter' && convert()} />
        <button className="btn btn-primary" onClick={convert} disabled={loading}>{loading ? '...' : 'Convert'}</button>
      </div>
      {result && !result.error && (
        <div style={{ background: '#f7f7f5', borderRadius: 6, padding: '12px 14px', display: 'flex', gap: 12 }}>
          <div style={{ width: 40, height: 40, borderRadius: 6, background: result.hex, border: '1px solid #ddd', flexShrink: 0 }} />
          <div style={{ fontSize: 12, lineHeight: 1.7 }}>
            <div><strong>HEX</strong> {result.hex}</div>
            <div><strong>RGB</strong> {result.rgb}</div>
            <div><strong>Thread</strong> {result.thread}</div>
            <div><strong>Zipper</strong> {result.zipper}</div>
          </div>
        </div>
      )}
      {result?.error && <div style={{ color: 'var(--red)', fontSize: 12 }}>{result.error}</div>}
    </div>
  )
}

function GSMFinder() {
  const [gsm, setGsm] = useState('')
  const [oz, setOz] = useState('')
  const [query, setQuery] = useState('')
  const [result, setResult] = useState(null)
  const [loading, setLoading] = useState(false)

  const convertGSM = (v) => { setGsm(v); setOz(v ? (parseFloat(v) / 33.9062).toFixed(2) : '') }
  const convertOZ = (v) => { setOz(v); setGsm(v ? (parseFloat(v) * 33.9062).toFixed(0) : '') }

  const find = async () => {
    if (!gsm || !query) return
    setLoading(true)
    try {
      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'claude-sonnet-4-20250514',
          max_tokens: 300,
          messages: [{
            role: 'user',
            content: `Target GSM: ${gsm}. Fabric type/content: ${query}. Suggest the best fabric construction that would achieve this GSM. Respond ONLY in JSON: {"construction":"description","weave":"weave type","typical_use":"use case","notes":"any notes"}`
          }]
        })
      })
      const data = await res.json()
      const text = data.content[0].text.replace(/```json|```/g, '').trim()
      setResult(JSON.parse(text))
    } catch (e) { setResult({ error: 'Could not process.' }) }
    setLoading(false)
  }

  return (
    <div>
      <div style={{ background: '#f7f7f5', borderRadius: 6, padding: '10px 14px', marginBottom: 14 }}>
        <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-light)', marginBottom: 8, letterSpacing: '0.5px', textTransform: 'uppercase' }}>GSM ↔ OZ Converter</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
          <div><label>GSM</label><input className="input" type="number" value={gsm} onChange={e => convertGSM(e.target.value)} /></div>
          <div><label>oz/yd²</label><input className="input" type="number" value={oz} onChange={e => convertOZ(e.target.value)} /></div>
        </div>
      </div>
      <div className="form-group"><label>Fabric Type / Content</label>
        <input className="input" placeholder="e.g. 100% Cotton Denim" value={query} onChange={e => setQuery(e.target.value)} />
      </div>
      <button className="btn btn-primary btn-sm" onClick={find} disabled={loading || !gsm || !query}>{loading ? '...' : 'Find Construction'}</button>
      {result && !result.error && (
        <div style={{ background: '#f7f7f5', borderRadius: 6, padding: '10px 14px', marginTop: 12, fontSize: 12, lineHeight: 1.7 }}>
          <div><strong>Construction:</strong> {result.construction}</div>
          <div><strong>Weave:</strong> {result.weave}</div>
          <div><strong>Typical Use:</strong> {result.typical_use}</div>
          {result.notes && <div style={{ color: 'var(--text-mid)', marginTop: 4 }}>{result.notes}</div>}
        </div>
      )}
    </div>
  )
}

const TOOL_CONTENT = {
  thread: <ThreadCalc />,
  cbm: <CBMCalc />,
  pantone: <PantoneConverter />,
  gsm: <GSMFinder />,
}

export default function ToolsTray({ open, onClose }) {
  const [active, setActive] = useState('thread')

  if (!open) return null

  const tool = TOOLS.find(t => t.id === active)

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 100,
      display: 'flex', justifyContent: 'flex-end',
    }}>
      {/* Backdrop */}
      <div onClick={onClose} style={{ flex: 1, background: 'rgba(0,0,0,0.2)' }} />

      {/* Tray */}
      <div style={{
        width: 480, height: '100vh', background: '#fff',
        borderLeft: '1px solid var(--border)',
        display: 'flex', flexDirection: 'column',
        boxShadow: '-4px 0 24px rgba(0,0,0,0.08)',
      }}>
        {/* Header */}
        <div style={{
          height: 'var(--topbar-h)', display: 'flex', alignItems: 'center',
          justifyContent: 'space-between', padding: '0 20px',
          borderBottom: '1px solid var(--border)', flexShrink: 0,
        }}>
          <div style={{ fontSize: 14, fontWeight: 600 }}>Production Tools</div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-mid)', display: 'flex' }}>
            <X size={16} />
          </button>
        </div>

        <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
          {/* Tool list */}
          <div style={{ width: 160, borderRight: '1px solid var(--border)', padding: '8px 0', overflowY: 'auto', flexShrink: 0 }}>
            {TOOLS.map(t => (
              <button key={t.id} onClick={() => !t.soon && setActive(t.id)} style={{
                display: 'flex', alignItems: 'center', gap: 8,
                width: '100%', padding: '9px 14px',
                background: active === t.id ? '#f0f0ee' : 'none',
                border: 'none', cursor: t.soon ? 'default' : 'pointer',
                textAlign: 'left', fontSize: 12,
                fontWeight: active === t.id ? 600 : 400,
                color: t.soon ? 'var(--text-light)' : active === t.id ? 'var(--text)' : 'var(--text-mid)',
              }}>
                <t.icon size={14} strokeWidth={1.8} />
                <span style={{ lineHeight: 1.3 }}>{t.label}{t.soon ? ' *' : ''}</span>
              </button>
            ))}
            <div style={{ padding: '8px 14px', fontSize: 10, color: 'var(--text-light)' }}>* Coming soon</div>
          </div>

          {/* Tool content */}
          <div style={{ flex: 1, padding: '20px', overflowY: 'auto' }}>
            <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 14 }}>{tool?.label}</div>
            {TOOL_CONTENT[active] || (
              <div className="empty-state">
                <p>Coming soon</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
