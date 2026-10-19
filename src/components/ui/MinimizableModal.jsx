import React, { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Minus, X } from 'lucide-react'
import { useWindowManager } from './WindowManager'

let serial = 0
export default function MinimizableModal({ title, children, zIndex = 1200, onClose }) {
  const manager = useWindowManager()
  const id = useRef(`modal:${++serial}`).current
  const [minimized, setMinimized] = useState(false)
  const [host] = useState(() => document.createElement('div'))
  useEffect(() => { document.body.appendChild(host); return () => host.remove() }, [host])
  useEffect(() => {
    if (!manager) return
    manager.register(id, title, () => setMinimized(false), onClose)
    return () => manager.unregister(id)
  }, [manager, id, title, onClose])
  const hide = () => { setMinimized(true); manager?.minimize(id) }
  const close = () => {
    if (window.confirm(`Close ${title}? Any unsaved changes will be lost.`)) onClose?.()
  }
  return createPortal(<div style={{display:minimized?'none':'flex',position:'fixed',inset:0,zIndex,background:'rgba(15,23,42,.45)',alignItems:'center',justifyContent:'center',padding:16}}>
    <div style={{background:'#fff',borderRadius:12,maxWidth:'96vw',maxHeight:'94vh',overflow:'auto',boxShadow:'0 20px 65px #0003'}}>
      <div style={{height:36,display:'flex',justifyContent:'flex-end',alignItems:'center',padding:'0 12px',borderBottom:'1px solid #e5e7eb'}}>
        <span style={{marginRight:'auto',fontSize:12,fontWeight:700,color:'#64748b'}}>{title}</span>
        <button type="button" onClick={hide} title={`Minimize ${title}`} aria-label={`Minimize ${title}`} style={{border:0,background:'transparent',cursor:'pointer',padding:5}}><Minus size={17}/></button>
        <button type="button" onClick={close} title={`Close ${title}`} aria-label={`Close ${title}`} style={{border:0,background:'transparent',cursor:'pointer',padding:5,marginLeft:8}}><X size={17}/></button>
      </div>
      {children}
    </div>
  </div>, host)
}
