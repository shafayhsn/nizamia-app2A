import React, { useState, useEffect, useRef, useCallback } from 'react'
import { supabase } from '../../lib/supabase'
import { ChevronLeft, ChevronRight, Check, X } from 'lucide-react'

import Step1GeneralInfo   from './steps/Step1GeneralInfo'
import Step2POMatrix      from './steps/Step2POMatrix'
import Step3BOM           from './steps/Step3BOM'
import Step4Fitting       from './steps/Step4Fitting'
import Step5Sampling      from './steps/Step5Sampling'
import Step6Washing       from './steps/Step6Washing'
import Step7Embellishment from './steps/Step7Embellishment'
import Step8Finishing     from './steps/Step8Finishing'
import Step9Processes     from './steps/Step9Processes'
import Step10Finalize     from './steps/Step10Finalize'

const STEPS = [
  { num: 1,  label: 'General Info',  required: true },
  { num: 2,  label: 'PO Matrix',     required: true },
  { num: 3,  label: 'BOM',           required: true },
  { num: 4,  label: 'Fitting',       required: false },
  { num: 5,  label: 'Sampling',      required: false },
  { num: 6,  label: 'Washing',       required: false },
  { num: 7,  label: 'Embellishment', required: false },
  { num: 8,  label: 'Finishing',     required: false },
  { num: 9,  label: 'Processes',     required: false },
  { num: 10, label: 'Finalize',      required: true },
]

const STEP_COMPONENTS = {
  1: Step1GeneralInfo, 2: Step2POMatrix,      3: Step3BOM,
  4: Step4Fitting,     5: Step5Sampling,      6: Step6Washing,
  7: Step7Embellishment, 8: Step8Finishing,   9: Step9Processes,
  10: Step10Finalize,
}

export default function OrderWizard({ order, onClose }) {
  const [step, setStep]           = useState(1)
  const [orderId, setOrderId]     = useState(order?.id || null)
  const [orderData, setOrderData] = useState(order || {})
  const [autoSave, setAutoSave]   = useState(false)
  const [saveStatus, setSaveStatus] = useState(null) // null | saving | saved | error
  const stepSaveRef  = useRef(null)
  const registerSave = useCallback((fn) => { stepSaveRef.current = fn }, [])

  useEffect(() => { if (orderId) loadOrder() }, [orderId])

  async function loadOrder() {
    const { data } = await supabase.from('orders').select('*').eq('id', orderId).single()
    if (data) setOrderData(data)
  }

  const handleSaved = useCallback((id, data) => {
    if (id && !orderId) setOrderId(id)
    if (data) setOrderData(prev => ({ ...prev, ...data }))
  }, [orderId])

  useEffect(() => {
    if (!autoSave || !orderId) return
    const t = setInterval(async () => {
      if (stepSaveRef.current) {
        setSaveStatus('saving')
        try { await stepSaveRef.current(); setSaveStatus('saved'); setTimeout(() => setSaveStatus(null), 2000) }
        catch { setSaveStatus('error') }
      }
    }, 5000)
    return () => clearInterval(t)
  }, [autoSave, orderId])

  // Save current step then advance
  const saveAndContinue = async () => {
    if (!stepSaveRef.current) { setStep(s => Math.min(10, s + 1)); return }
    setSaveStatus('saving')
    try {
      await stepSaveRef.current()
      setSaveStatus('saved')
      setTimeout(() => {
        setSaveStatus(null)
        if (step < 10) setStep(s => s + 1)
      }, 800)
    } catch {
      setSaveStatus('error')
      setTimeout(() => setSaveStatus(null), 2500)
    }
  }

  const manualSave = async () => {
    if (!stepSaveRef.current) return
    setSaveStatus('saving')
    try { await stepSaveRef.current(); setSaveStatus('saved'); setTimeout(() => setSaveStatus(null), 2500) }
    catch { setSaveStatus('error'); setTimeout(() => setSaveStatus(null), 2500) }
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

  const canAdvance = () => {
    if (step === 1) return !!orderId
    if (step === 2) return !!orderData.step_po_matrix
    if (step === 3) return !!orderData.step_bom
    return true
  }

  const StepComponent = STEP_COMPONENTS[step]

  // Footer save button state
  const isSaving = saveStatus === 'saving'
  const isSaved  = saveStatus === 'saved'
  const isError  = saveStatus === 'error'

  const dotColor = isSaving ? '#f59e0b' : isSaved ? '#16a34a' : isError ? '#dc2626' : autoSave ? '#16a34a' : '#d1d5db'

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 200, background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
      <div style={{ background: '#fff', borderRadius: 12, boxShadow: '0 24px 80px rgba(0,0,0,0.22)', width: '100%', maxWidth: 1100, height: 'calc(100vh - 80px)', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

        {/* Top bar */}
        <div style={{ height: 52, borderBottom: '1px solid #f0f0ee', display: 'flex', alignItems: 'center', padding: '0 24px', gap: 10, flexShrink: 0 }}>
          <span style={{ fontSize: 14, fontWeight: 700 }}>{order ? 'Edit Order' : 'New Order'}</span>
          {orderData.style_number && <span style={{ fontSize: 12, color: '#9ca3af', fontFamily: 'monospace' }}>· {orderData.style_number}</span>}
          {orderData.buyer_name   && <span style={{ fontSize: 12, color: '#9ca3af' }}>· {orderData.buyer_name}</span>}
          <div style={{ flex: 1 }} />
          {orderData.status && (
            <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 9px', borderRadius: 4, background: orderData.status === 'Confirmed' ? '#f0fdf4' : '#fafaf8', color: orderData.status === 'Confirmed' ? '#16a34a' : '#9ca3af', border: '1px solid', borderColor: orderData.status === 'Confirmed' ? '#bbf7d0' : '#e8e8e6', letterSpacing: '0.4px' }}>
              {orderData.status?.toUpperCase()}
            </span>
          )}
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#9ca3af', display: 'flex', padding: 4, borderRadius: 4 }}
            onMouseEnter={e => e.currentTarget.style.background='#f5f5f5'}
            onMouseLeave={e => e.currentTarget.style.background='none'}
          ><X size={16} /></button>
        </div>

        {/* Step tab bar */}
        <div style={{ borderBottom: '1px solid #f0f0ee', display: 'flex', flexShrink: 0, overflowX: 'auto', background: '#fff' }}>
          {STEPS.map((s) => {
            const done   = stepDone(s.num)
            const active = step === s.num
            const locked = !orderId && s.num > 1
            return (
              <button key={s.num} onClick={() => !locked && setStep(s.num)} style={{
                flex: '1 1 0', minWidth: 80, display: 'flex', flexDirection: 'column',
                alignItems: 'center', justifyContent: 'center', gap: 3, padding: '10px 6px',
                background: 'transparent', border: 'none',
                borderBottom: active ? '2px solid #0d0d0d' : '2px solid transparent',
                cursor: locked ? 'default' : 'pointer', opacity: locked ? 0.35 : 1,
              }}>
                <div style={{ width: 20, height: 20, borderRadius: '50%', background: done ? '#16a34a' : active ? '#0d0d0d' : '#e5e5e3', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  {done
                    ? <Check size={11} strokeWidth={3} color="#fff" />
                    : <span style={{ fontSize: 9, fontWeight: 700, color: active ? '#fff' : '#aaa' }}>{s.num}</span>
                  }
                </div>
                <span style={{ fontSize: 10, fontWeight: active ? 700 : 400, color: done ? '#16a34a' : active ? '#0d0d0d' : '#9ca3af', whiteSpace: 'nowrap', lineHeight: 1.2 }}>{s.label}</span>
                <span style={{ fontSize: 9, color: s.required ? '#d1d5db' : '#c4b5fd', lineHeight: 1 }}>{s.required ? 'req' : 'opt'}</span>
              </button>
            )
          })}
        </div>

        {/* Step content */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '24px 28px', background: '#fff' }}>
          <StepComponent
            key={`step-${step}-${orderId}`}
            orderId={orderId}
            orderData={orderData}
            onSaved={handleSaved}
            registerSave={registerSave}
            setStep={setStep}
          />
        </div>

        {/* Footer — single save button */}
        <div style={{ height: 54, borderTop: '1px solid #f0f0ee', display: 'flex', alignItems: 'center', padding: '0 24px', gap: 10, flexShrink: 0, background: '#fff' }}>
          <button className="btn btn-secondary btn-sm" onClick={() => setStep(s => Math.max(1, s - 1))} disabled={step === 1}>
            <ChevronLeft size={13} /> Back
          </button>

          <div style={{ flex: 1 }} />

          {/* Status indicator */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <div style={{
              width: 7, height: 7, borderRadius: '50%',
              background: dotColor,
              transition: 'background 0.3s',
              boxShadow: isSaved ? '0 0 0 3px #bbf7d066' : 'none',
            }} />
            {isSaving && <span style={{ fontSize: 11, color: '#9ca3af' }}>Saving...</span>}
            {isSaved  && <span style={{ fontSize: 11, color: '#16a34a', fontWeight: 600 }}>✓ Saved</span>}
            {isError  && <span style={{ fontSize: 11, color: '#dc2626' }}>Save failed</span>}
          </div>

          {/* Auto-save toggle */}
          {orderId && (
            <label style={{ display: 'flex', alignItems: 'center', gap: 5, cursor: 'pointer', userSelect: 'none' }}>
              <div onClick={() => setAutoSave(a => !a)} style={{ width: 28, height: 16, borderRadius: 8, background: autoSave ? '#0d0d0d' : '#d1d5db', position: 'relative', cursor: 'pointer', transition: 'background 0.2s', flexShrink: 0 }}>
                <div style={{ position: 'absolute', top: 2, left: autoSave ? 14 : 2, width: 12, height: 12, borderRadius: '50%', background: '#fff', transition: 'left 0.2s' }} />
              </div>
              <span style={{ fontSize: 10, color: '#9ca3af' }}>Auto</span>
            </label>
          )}

          <span style={{ fontSize: 11, color: '#9ca3af', minWidth: 50, textAlign: 'center' }}>Step {step} of 10</span>

          {/* Create Order (Step 1 only, no orderId) */}
          {step === 1 && !orderId && (
            <button className="btn btn-primary btn-sm" onClick={manualSave} disabled={isSaving}>
              {isSaving ? 'Creating...' : 'Create Order'}
            </button>
          )}

          {/* Save & Continue / Done */}
          {step < 10 ? (
            <button
              className="btn btn-primary btn-sm"
              onClick={saveAndContinue}
              disabled={isSaving || (!orderId && step === 1)}
              style={{ minWidth: 130, display: 'flex', alignItems: 'center', gap: 5, justifyContent: 'center' }}
            >
              {isSaving
                ? 'Saving...'
                : isSaved
                  ? <><Check size={13} /> Saved</>
                  : <>{orderId ? 'Save & Continue' : 'Next'} <ChevronRight size={13} /></>
              }
            </button>
          ) : (
            <button className="btn btn-primary btn-sm" onClick={onClose}><Check size={13} /> Done</button>
          )}
        </div>
      </div>
    </div>
  )
}
