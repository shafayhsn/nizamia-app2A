import React, { createContext, useCallback, useContext, useMemo, useState } from 'react'
import { ChevronUp, X } from 'lucide-react'

const WindowContext = createContext(null)
export function useWindowManager() { return useContext(WindowContext) }
export default function WindowManager({ children }) {
  const [entries, setEntries] = useState({})
  const register = useCallback((id, title, restore, close) => {
    setEntries(prev => ({ ...prev, [id]: { id, title, restore, close, minimized: prev[id]?.minimized || false } }))
  }, [])
  const unregister = useCallback(id => setEntries(prev => { const next = { ...prev }; delete next[id]; return next }), [])
  const minimize = useCallback(id => setEntries(prev => prev[id] ? { ...prev, [id]: { ...prev[id], minimized: true } } : prev), [])
  const restore = useCallback(id => setEntries(prev => prev[id] ? { ...prev, [id]: { ...prev[id], minimized: false } } : prev), [])
  const value = useMemo(() => ({ register, unregister, minimize, restore }), [register, unregister, minimize, restore])
  return <WindowContext.Provider value={value}>
    {children}
    <div role="region" aria-label="Minimized windows" style={{ position:'fixed', right:20, bottom:18, zIndex:1800, display:'flex', gap:8, flexWrap:'wrap', justifyContent:'flex-end', maxWidth:'calc(100vw - 24px)' }}>
      {Object.values(entries).filter(e => e.minimized).map(e => <div key={e.id} style={{display:'flex', gap:4}}>
        <button type="button" onClick={() => { restore(e.id); e.restore?.() }} style={trayButton}><ChevronUp size={15}/>{e.title}</button>
        {e.close && <button type="button" title={`Close ${e.title}`} aria-label={`Close ${e.title}`} onClick={e.close} style={trayButton}><X size={14}/></button>}
      </div>)}
    </div>
  </WindowContext.Provider>
}
const trayButton = { display:'flex', alignItems:'center', gap:8, background:'#fff', color:'#111827', border:'1px solid #cbd5e1', borderRadius:9, boxShadow:'0 6px 24px #0002', padding:'10px 12px', cursor:'pointer', fontSize:12, fontWeight:700 }
