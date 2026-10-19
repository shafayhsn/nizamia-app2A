import { useEffect, useRef, useState } from 'react'
import { useWindowManager } from './WindowManager'
let popupSerial = 0
/** Keeps a mounted operational editor in the shared window tray. */
export default function useManagedPopup(title, onClose) {
  const manager = useWindowManager()
  const id = useRef(`operational:${++popupSerial}`).current
  const [minimized, setMinimized] = useState(false)
  const closeRef = useRef(onClose)
  closeRef.current = onClose
  useEffect(() => {
    if (!manager) return
    manager.register(id, title, () => setMinimized(false), () => closeRef.current?.())
    return () => manager.unregister(id)
  }, [manager?.register, manager?.unregister, id, title])
  return { minimized, minimize: () => { setMinimized(true); manager?.minimize(id) },
    close: () => { if (window.confirm(`Close ${title}? Any unsaved changes will be lost.`)) closeRef.current?.() } }
}
