import React, { useCallback, useState } from 'react'

const backdropStyle = {
  position: 'fixed',
  inset: 0,
  background: 'rgba(17, 24, 39, 0.42)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  zIndex: 9999,
}

const dialogStyle = {
  width: 'min(420px, calc(100vw - 32px))',
  background: '#fff',
  borderRadius: 16,
  boxShadow: '0 24px 70px rgba(15, 23, 42, 0.28)',
  border: '1px solid #eef2f7',
  overflow: 'hidden',
}

const headStyle = {
  padding: '18px 20px 8px',
}

const titleStyle = {
  margin: 0,
  fontSize: 17,
  lineHeight: 1.25,
  fontWeight: 800,
  color: '#111827',
}

const bodyStyle = {
  padding: '0 20px 18px',
  color: '#4b5563',
  fontSize: 13,
  lineHeight: 1.5,
}

const footStyle = {
  display: 'flex',
  justifyContent: 'flex-end',
  gap: 8,
  padding: '14px 20px',
  background: '#f9fafb',
  borderTop: '1px solid #eef2f7',
}

const buttonStyle = {
  height: 34,
  padding: '0 14px',
  borderRadius: 9,
  border: '1px solid #d1d5db',
  background: '#fff',
  color: '#111827',
  fontSize: 13,
  fontWeight: 700,
  cursor: 'pointer',
}

const primaryButtonStyle = {
  ...buttonStyle,
  borderColor: '#111827',
  background: '#111827',
  color: '#fff',
}

const dangerButtonStyle = {
  ...buttonStyle,
  borderColor: '#dc2626',
  background: '#dc2626',
  color: '#fff',
}

const inputStyle = {
  width: '100%',
  height: 38,
  border: '1px solid #d1d5db',
  borderRadius: 9,
  padding: '0 10px',
  fontSize: 13,
  boxSizing: 'border-box',
  outline: 'none',
  marginTop: 10,
}

export function useAppDialogs() {
  const [dialog, setDialog] = useState(null)

  const close = useCallback((value) => {
    setDialog((current) => {
      if (current?.resolve) current.resolve(value)
      return null
    })
  }, [])

  const alertDialog = useCallback((message, options = {}) => new Promise((resolve) => {
    setDialog({
      type: 'alert',
      title: options.title || 'Notice',
      message,
      okText: options.okText || 'OK',
      resolve,
    })
  }), [])

  const confirmDialog = useCallback((message, options = {}) => new Promise((resolve) => {
    setDialog({
      type: 'confirm',
      title: options.title || 'Confirm',
      message,
      okText: options.okText || 'Confirm',
      cancelText: options.cancelText || 'Cancel',
      danger: !!options.danger,
      resolve,
    })
  }), [])

  const promptDialog = useCallback((message, options = {}) => new Promise((resolve) => {
    setDialog({
      type: 'prompt',
      title: options.title || 'Input Required',
      message,
      value: options.defaultValue || '',
      placeholder: options.placeholder || '',
      okText: options.okText || 'Save',
      cancelText: options.cancelText || 'Cancel',
      resolve,
    })
  }), [])

  function Dialogs() {
    if (!dialog) return null

    const isPrompt = dialog.type === 'prompt'
    const primary = dialog.danger ? dangerButtonStyle : primaryButtonStyle

    return (
      <div style={backdropStyle} onMouseDown={() => close(dialog.type === 'alert' ? true : false)}>
        <div style={dialogStyle} onMouseDown={(e) => e.stopPropagation()}>
          <div style={headStyle}><h3 style={titleStyle}>{dialog.title}</h3></div>
          <div style={bodyStyle}>
            <div>{dialog.message}</div>
            {isPrompt && (
              <input
                style={inputStyle}
                autoFocus
                value={dialog.value}
                placeholder={dialog.placeholder}
                onChange={(e) => setDialog((d) => ({ ...d, value: e.target.value }))}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') close(dialog.value)
                  if (e.key === 'Escape') close(null)
                }}
              />
            )}
          </div>
          <div style={footStyle}>
            {dialog.type !== 'alert' && <button style={buttonStyle} onClick={() => close(isPrompt ? null : false)}>{dialog.cancelText}</button>}
            <button style={primary} onClick={() => close(isPrompt ? dialog.value : true)}>{dialog.okText}</button>
          </div>
        </div>
      </div>
    )
  }

  return { alert: alertDialog, confirm: confirmDialog, prompt: promptDialog, Dialogs }
}

export default function AppDialogs() {
  return null
}
