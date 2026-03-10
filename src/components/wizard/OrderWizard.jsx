import React, { useState, useEffect, useRef, useCallback } from 'react'
import { supabase } from '../../lib/supabase'
import { ChevronLeft, ChevronRight, Check, X } from 'lucide-react'

import Step1GeneralInfo  from './steps/Step1GeneralInfo'
import Step2POMatrix     from './steps/Step2POMatrix'
import Step3BOM          from './steps/Step3BOM'
import Step4Fitting      from './steps/Step4Fitting'
import Step5Sampling     from './steps/Step5Sampling'
import Step6Washing      from './steps/Step6Washing'
import Step7Embellishment from './steps/Step7Embellishment'
import Step8Finishing    from './steps/Step8Finishing'
import Step9Processes    from './steps/Step9Processes'
import Step10Finalize    from './steps/Step10Finalize'

const STEPS = [
  { num: 1,  label: 'General Info',    required: true },
  { num: 2,  label: 'PO Matrix',       required: true },
  { num: 3,  label: 'BOM',             required: true },
  { num: 4,  label: 'Fitting',         required: false },
  { num: 5,  label: 'Sampling',        required: false },
  { num: 6,  label: 'Washing',         required: false },
  { num: 7,  label: 'Embellishment',   required: false },
  { num: 8,  label: 'Finishing',       required: false },
  { num: 9,  label: 'Processes',       required: false },
  { num: 10, label: 'Finalize',        required: true },
]

const STEP_COMPONENTS = {
  1: Step1GeneralInfo, 2: Step2POMatrix, 3: Step3BOM,
  4: Step4Fitting,     5: Step5Sampling, 6: Step6Washing,
  7: Step7Embellishment, 8: Step8Finishing, 9: Step9Processes,
  10: Step10Finalize,
}

export default function OrderWizard({ order, onClose }) {
  const [step, setStep]           = useState(1)
  const [orderId, setOrderId]     = useState(order?.id || null)
  const [orderData, setOrderData] = useState(order || {})
  const [autoSave, setAutoSave]   = useState(false)
  const [saveStatus, setSaveStatus] = useState(null) // null | 'saving' | 'saved' | 'error'
  const saveRef = useRef(null)

  // Each step exposes a save function via this ref
  const stepSaveRef = useRef(null)

  useEffect(() => { if (orderId) loadOrder() }, [orderId])

  async function loadOrder() {
    const { data } = await supabase.from('orders').select('*').eq('id', orderId).single()
    if (data) setOrderData(data)
  }

  const handleSaved = useCallback((id, data) => {
    if (id && !orderId) setOrderId(id)
    if (data) setOrderData(prev => ({ ...prev, ...data }))
  }, [orderId])

  // Auto-save every 5 seconds when enabled
  useEffect(() => {
    if (!autoSave || !orderId) return
    const t = setInterval(async () => {
      if (stepSaveRef.current) {
        setSaveStatus('saving')
        try {
          await stepSaveRef.current()
          setSaveStatus('saved')
          setTimeout(() => setSaveStatus(null), 2000)
        } catch {
          setSaveStatus('error')
        }
      }
    }, 5000)
    return () => clearInterval(t)
  }, [autoSave, orderId])

  const manualSave = async () => {
    if (!stepSaveRef.current) return
    setSaveStatus('saving')
    try {
      await stepSaveRef.current()
      setSaveStatus('saved')
      setTimeout(() => setSaveStatus(null), 2500)
    } catch {
      setSaveStatus('error')
    }
  }

  const stepDone = (s) => {
    if (s === 1) return !!orderId
    if (s === 2) return !!orderData.step_po_matrix
    if (s === 3) return !!orderData.step_bom
    if (s === 4) return !!orderData.step_fitting
    if (s === 5) return !!orderData.step_sampling
    if (s === 6) return !!orderData.step_washing
    if (s === 7) return !!orderData.step_embellishment
    if (s === 8) return !!orderData.step_finishing
    if (s === 9) return !!orderData.step_processes
    return false
  }

  const canGoNext = () => {
    if (step === 1) return !!orderId
    if (step === 2) return !!orderData.step_po_matrix
    if (step === 3) return !!orderData.step_bom
    return true
  }

  const StepComponent = STEP_COMPONENTS[step]

  const statusDot = saveStatus === 'saving' ? '#f59e0b'
    : saveStatus === 'saved'  ? '#16a34a'
    : saveStatus === 'error'  ? '#dc2626'
    : autoSave ? '#16a34a' : '#d1d5db'

  const statusText = saveStatus === 'saving' ? 'Saving...'
    : saveStatus === 'saved'  ? 'Saved'
    : saveStatus === 'error'  ? 'Save failed'
    : autoSave ? 'Auto-save on' : ''

  return (
    // Full-page takeover — inline, not modal
    <div style={{
      position: 'fixed', inset: 0, zIndex: 200,
      background: '#f7f7f5',
      display: 'flex', flexDirection: 'column',
      overflow: 'hidden',
    }}>

      {/* ── Top bar ── */}
      <div style={{
        height: 48, background: '#fff', borderBottom: '1px solid #e8e8e6',
        display: 'flex', alignItems: 'center', padding: '0 24px',
        gap: 12, flexShrink: 0,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 13, fontWeight: 700 }}>
            {order ? 'Edit Order' : 'New Order'}
          </span>
          {orderData.style_number && (
            <span style={{ fontSize: 12, color: '#6b7280', fontFamily: 'monospace' }}>
              · {orderData.style_number}
            </span>
          )}
          {orderData.buyer_name && (
            <span style={{ fontSize: 12, color: '#9ca3af' }}>· {orderData.buyer_name}</span>
          )}
        </div>
        <div style={{ flex: 1 }} />
        {orderData.status && (
          <span style={{
            fontSize: 10, fontWeight: 700, padding: '2px 9px', borderRadius: 4,
            background: orderData.status === 'Confirmed' ? '#f0fdf4' : '#fff7ed',
            color: orderData.status === 'Confirmed' ? '#16a34a' : '#d97706',
            letterSpacing: '0.4px',
          }}>{orderData.status?.toUpperCase()}</span>
        )}
        <button onClick={onClose} style={{
          background: 'none', border: 'none', cursor: 'pointer',
          color: '#9ca3af', display: 'flex', padding: 4, borderRadius: 4,
        }}
          onMouseEnter={e => e.currentTarget.style.background = '#f3f4f6'}
          onMouseLeave={e => e.currentTarget.style.background = 'none'}
        >
          <X size={16} />
        </button>
      </div>

      {/* ── Step progress bar ── */}
      <div style={{
        background: '#fff', borderBottom: '1px solid #e8e8e6',
        display: 'flex', flexShrink: 0, overflowX: 'auto',
        padding: '0 12px',
      }}>
        {STEPS.map((s, idx) => {
          const done   = stepDone(s.num)
          const active = step === s.num
          const locked = !orderId && s.num > 1
          return (
            <button key={s.num}
              onClick={() => !locked && setStep(s.num)}
              style={{
                flex: '1 1 0', minWidth: 80, maxWidth: 130,
                display: 'flex', flexDirection: 'column',
                alignItems: 'center', justifyContent: 'center',
                gap: 4, padding: '10px 6px',
                background: 'transparent', border: 'none',
                borderBottom: active ? '2px solid #1a1a2e' : '2px solid transparent',
                cursor: locked ? 'not-allowed' : 'pointer',
                opacity: locked ? 0.4 : 1,
                transition: 'border-color 0.1s',
              }}
            >
              <div style={{
                width: 20, height: 20, borderRadius: '50%',
                background: done ? '#16a34a' : active ? '#1a1a2e' : '#e5e5e3',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                flexShrink: 0,
              }}>
                {done
                  ? <Check size={11} strokeWidth={3} color="#fff" />
                  : <span style={{ fontSize: 10, fontWeight: 700, color: active ? '#fff' : '#9ca3af' }}>{s.num}</span>
                }
              </div>
              <span style={{
                fontSize: 10, lineHeight: 1.2, textAlign: 'center',
                fontWeight: active ? 700 : 400,
                color: done ? '#16a34a' : active ? '#1a1a2e' : '#9ca3af',
                whiteSpace: 'nowrap',
              }}>{s.label}</span>
              <span style={{
                fontSize: 9, color: s.required ? '#9ca3af' : '#c4b5fd',
                lineHeight: 1, fontWeight: 500,
              }}>{s.required ? 'Required' : 'Optional'}</span>
            </button>
          )
        })}
      </div>

      {/* ── Step content ── */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '24px 32px' }}>
        <StepComponent
          key={`step-${step}-${orderId}`}
          orderId={orderId}
          orderData={orderData}
          onSaved={handleSaved}
          registerSave={(fn) => { stepSaveRef.current = fn }}
          setStep={setStep}
        />
      </div>

      {/* ── Footer ── */}
      <div style={{
        height: 56, background: '#fff', borderTop: '1px solid #e8e8e6',
        display: 'flex', alignItems: 'center', padding: '0 24px',
        gap: 12, flexShrink: 0,
      }}>
        {/* Back */}
        <button className="btn btn-secondary" onClick={() => setStep(s => Math.max(1, s - 1))} disabled={step === 1}>
          <ChevronLeft size={14} /> Back
        </button>

        <div style={{ flex: 1 }} />

        {/* Save status dot */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <div style={{ width: 7, height: 7, borderRadius: '50%', background: statusDot, transition: 'background 0.3s' }} />
          {statusText && <span style={{ fontSize: 11, color: '#6b7280' }}>{statusText}</span>}
        </div>

        {/* Manual save */}
        {orderId && (
          <button className="btn btn-secondary" onClick={manualSave} disabled={saveStatus === 'saving'}>
            {saveStatus === 'saving' ? 'Saving...' : 'Save'}
          </button>
        )}

        {/* Auto-save toggle */}
        {orderId && (
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', userSelect: 'none' }}>
            <div
              onClick={() => setAutoSave(a => !a)}
              style={{
                width: 32, height: 18, borderRadius: 9,
                background: autoSave ? '#1a1a2e' : '#d1d5db',
                position: 'relative', transition: 'background 0.2s', cursor: 'pointer',
              }}
            >
              <div style={{
                position: 'absolute', top: 2, left: autoSave ? 16 : 2,
                width: 14, height: 14, borderRadius: '50%',
                background: '#fff', transition: 'left 0.2s',
                boxShadow: '0 1px 2px rgba(0,0,0,0.2)',
              }} />
            </div>
            <span style={{ fontSize: 11, color: '#6b7280' }}>Auto-save</span>
          </label>
        )}

        {/* Step counter */}
        <span style={{ fontSize: 11, color: '#9ca3af', minWidth: 60, textAlign: 'center' }}>
          {step} / 10
        </span>

        {/* Next / Done */}
        {step < 10
          ? <button className="btn btn-primary" onClick={() => setStep(s => s + 1)} disabled={!canGoNext()}>
              Next <ChevronRight size={14} />
            </button>
          : <button className="btn btn-primary" onClick={onClose}><Check size={14} /> Done</button>
        }
      </div>
    </div>
  )
}
