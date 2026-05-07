import React, { useCallback, useMemo, useRef, useState } from 'react'

const overlay = { position:'fixed', inset:0, background:'rgba(15,23,42,.28)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:1000, padding:24 }
const card = { width:'100%', maxWidth:460, background:'#fff', border:'1px solid #e5e7eb', borderRadius:14, boxShadow:'0 24px 60px rgba(0,0,0,.18)', overflow:'hidden' }
const btn = { height:36, padding:'0 14px', borderRadius:10, border:'1px solid #e5e7eb', background:'#fff', fontSize:13, fontWeight:700, cursor:'pointer' }

export function useAppDialogs() {
  const resolverRef = useRef(null)
  const [dialog, setDialog] = useState(null)

  const close = useCallback((value) => {
    const r = resolverRef.current
    resolverRef.current = null
    setDialog(null)
    if (r) r(value)
  }, [])

  const open = useCallback((cfg) => new Promise(resolve => {
    resolverRef.current = resolve
    setDialog(cfg)
  }), [])

  const alert = useCallback((message, options={}) => open({ type:'alert', title:options.title || 'Notice', message }), [open])
  const confirm = useCallback((message, options={}) => open({ type:'confirm', title:options.title || 'Confirm', message, confirmText:options.confirmText || 'Confirm', cancelText:options.cancelText || 'Cancel', tone:options.tone || 'default' }), [open])
  const prompt = useCallback((message, options={}) => open({ type:'prompt', title:options.title || 'Input Required', message, confirmText:options.confirmText || 'Confirm', cancelText:options.cancelText || 'Cancel', value:options.defaultValue || '', placeholder:options.placeholder || '', password:!!options.password }), [open])

  const Dialogs = useMemo(() => function DialogsRenderer() {
    const [inputValue, setInputValue] = useState(dialog?.value || '')
    React.useEffect(() => { setInputValue(dialog?.value || '') }, [dialog])
    if (!dialog) return null
    const danger = dialog.tone === 'danger'
    return (
      <div style={overlay}>
        <div style={card}>
          <div style={{ padding:'18px 20px', borderBottom:'1px solid #f1f5f9' }}>
            <div style={{ fontSize:19, fontWeight:800, color:'#111827' }}>{dialog.title}</div>
          </div>
          <div style={{ padding:'18px 20px' }}>
            <div style={{ fontSize:14, color:'#475569', lineHeight:1.55, whiteSpace:'pre-wrap' }}>{dialog.message}</div>
            {dialog.type === 'prompt' && (
              <input autoFocus type={dialog.password ? 'password' : 'text'} value={inputValue} onChange={e => setInputValue(e.target.value)} placeholder={dialog.placeholder}
                style={{ marginTop:14, width:'100%', height:40, padding:'0 12px', border:'1px solid #d1d5db', borderRadius:10, outline:'none', fontSize:14, boxSizing:'border-box' }}
                onKeyDown={e => { if (e.key === 'Enter') close(inputValue) }} />
            )}
          </div>
          <div style={{ padding:'14px 20px', borderTop:'1px solid #f1f5f9', display:'flex', justifyContent:'flex-end', gap:10 }}>
            {dialog.type !== 'alert' && <button style={btn} onClick={() => close(dialog.type === 'prompt' ? null : false)}>{dialog.cancelText || 'Cancel'}</button>}
            <button style={{ ...btn, background: danger ? '#dc2626' : '#111827', color:'#fff', borderColor: danger ? '#dc2626' : '#111827' }} onClick={() => close(dialog.type === 'prompt' ? inputValue : true)}>{dialog.confirmText || 'OK'}</button>
          </div>
        </div>
      </div>
    )
  }, [dialog, close])

  return { alert, confirm, prompt, Dialogs }
}
