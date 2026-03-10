import React, { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import { X, ChevronLeft, ChevronRight, Check } from 'lucide-react'

import Step1GeneralInfo from './steps/Step1GeneralInfo'
import Step2POMatrix from './steps/Step2POMatrix'
import Step3BOM from './steps/Step3BOM'
import Step4Fitting from './steps/Step4Fitting'
import Step5Sampling from './steps/Step5Sampling'
import Step6Washing from './steps/Step6Washing'
import Step7Embellishment from './steps/Step7Embellishment'
import Step8Finishing from './steps/Step8Finishing'
import Step9Processes from './steps/Step9Processes'
import Step10Finalize from './steps/Step10Finalize'

const STEPS = [
  { num: 1, label: 'General Info', required: true },
  { num: 2, label: 'PO Matrix', required: true },
  { num: 3, label: 'BOM', required: true },
  { num: 4, label: 'Fitting', required: false },
  { num: 5, label: 'Sampling', required: false },
  { num: 6, label: 'Washing', required: false },
  { num: 7, label: 'Embellishment', required: false },
  { num: 8, label: 'Finishing', required: false },
  { num: 9, label: 'Processes', required: false },
  { num: 10, label: 'Finalize', required: true },
]

const STEP_COMPONENTS = {
  1: Step1GeneralInfo, 2: Step2POMatrix, 3: Step3BOM,
  4: Step4Fitting, 5: Step5Sampling, 6: Step6Washing,
  7: Step7Embellishment, 8: Step8Finishing, 9: Step9Processes,
  10: Step10Finalize,
}

export default function OrderWizard({ order, onClose }) {
  const [step, setStep] = useState(1)
  const [orderId, setOrderId] = useState(order?.id || null)
  const [orderData, setOrderData] = useState(order || {})

  useEffect(() => { if (orderId) loadOrder() }, [orderId])

  async function loadOrder() {
    const { data } = await supabase.from('orders').select('*').eq('id', orderId).single()
    if (data) setOrderData(data)
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

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 200,
      background: 'rgba(0,0,0,0.5)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: 20,
    }}>
      <div style={{
        width: '100%', maxWidth: 1100,
        height: 'calc(100vh - 40px)',
        background: '#fff', borderRadius: 12,
        display: 'flex', flexDirection: 'column',
        overflow: 'hidden',
        boxShadow: '0 24px 80px rgba(0,0,0,0.25)',
      }}>

        {/* Header */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '0 24px', height: 48, flexShrink: 0,
          borderBottom: '1px solid var(--border)', background: '#fafaf8',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 13, fontWeight: 700 }}>{order ? 'Edit Order' : 'New Order'}</span>
            {orderData.style_number && <span style={{ fontSize: 12, color: 'var(--text-mid)', fontFamily: 'monospace' }}>· {orderData.style_number}</span>}
            {orderData.buyer_name && <span style={{ fontSize: 12, color: 'var(--text-light)' }}>· {orderData.buyer_name}</span>}
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-light)', display: 'flex' }}>
            <X size={16} />
          </button>
        </div>

        {/* Step tabs */}
        <div style={{
          display: 'flex', borderBottom: '1px solid var(--border)',
          flexShrink: 0, overflowX: 'auto', background: '#fafaf8',
        }}>
          {STEPS.map((s, idx) => {
            const done = stepDone(s.num)
            const active = step === s.num
            return (
              <button key={s.num} onClick={() => orderId && setStep(s.num)} style={{
                flex: 1, minWidth: 72, display: 'flex', flexDirection: 'column',
                alignItems: 'center', justifyContent: 'center', gap: 3,
                padding: '9px 6px',
                background: active ? '#fff' : 'transparent',
                border: 'none',
                borderBottom: active ? '2px solid #0d0d0d' : '2px solid transparent',
                borderRight: idx < 9 ? '1px solid var(--border)' : 'none',
                cursor: orderId ? 'pointer' : 'default',
                marginBottom: -1,
              }}>
                <div style={{
                  width: 18, height: 18, borderRadius: '50%',
                  background: done ? 'var(--green)' : active ? '#0d0d0d' : '#e5e5e3',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  {done
                    ? <Check size={10} strokeWidth={3} color="#fff" />
                    : <span style={{ fontSize: 9, fontWeight: 700, color: active ? '#fff' : '#aaa' }}>{s.num}</span>
                  }
                </div>
                <span style={{
                  fontSize: 10, whiteSpace: 'nowrap', lineHeight: 1.2,
                  fontWeight: active ? 600 : 400,
                  color: done ? 'var(--green)' : active ? 'var(--text)' : 'var(--text-light)',
                }}>{s.label}</span>
                {!s.required && <span style={{ fontSize: 9, color: 'var(--text-light)', lineHeight: 1 }}>opt</span>}
              </button>
            )
          })}
        </div>

        {/* Content */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '24px 28px' }}>
          <StepComponent
            orderId={orderId}
            orderData={orderData}
            onSaved={(id, data) => {
              if (id && !orderId) setOrderId(id)
              if (data) setOrderData(prev => ({ ...prev, ...data }))
            }}
          />
        </div>

        {/* Footer */}
        <div style={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          padding: '12px 24px', borderTop: '1px solid var(--border)',
          flexShrink: 0, background: '#fafaf8',
        }}>
          <button className="btn btn-secondary" onClick={() => setStep(s => Math.max(1, s - 1))} disabled={step === 1}>
            <ChevronLeft size={14} /> Back
          </button>
          <span style={{ fontSize: 11, color: 'var(--text-light)' }}>
            Step {step} of 10
            {!orderId && step === 1 && <span style={{ color: 'var(--amber)', marginLeft: 8 }}>Save General Info to continue</span>}
          </span>
          {step < 10
            ? <button className="btn btn-primary" onClick={() => setStep(s => s + 1)} disabled={!canGoNext()}>
                Next <ChevronRight size={14} />
              </button>
            : <button className="btn btn-accent" onClick={onClose}><Check size={14} /> Done</button>
          }
        </div>
      </div>
    </div>
  )
}
