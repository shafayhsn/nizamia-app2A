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

export default function OrderWizard({ order, onClose }) {
  const [step, setStep] = useState(1)
  const [orderId, setOrderId] = useState(order?.id || null)
  const [orderData, setOrderData] = useState(order || {})
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (orderId) loadOrder()
  }, [orderId])

  async function loadOrder() {
    const { data } = await supabase.from('orders').select('*').eq('id', orderId).single()
    if (data) setOrderData(data)
  }

  const canGoNext = () => {
    if (step === 1) return !!orderId
    if (step === 2) return !!orderData.step_po_matrix
    if (step === 3) return !!orderData.step_bom
    return true
  }

  const STEP_COMPONENTS = {
    1: Step1GeneralInfo,
    2: Step2POMatrix,
    3: Step3BOM,
    4: Step4Fitting,
    5: Step5Sampling,
    6: Step6Washing,
    7: Step7Embellishment,
    8: Step8Finishing,
    9: Step9Processes,
    10: Step10Finalize,
  }

  const StepComponent = STEP_COMPONENTS[step]

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

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 200,
      background: 'rgba(0,0,0,0.4)',
      display: 'flex', alignItems: 'stretch',
    }}>
      <div style={{
        width: '100%', maxWidth: 960, margin: 'auto',
        background: '#fff', borderRadius: 12,
        display: 'flex', flexDirection: 'column',
        maxHeight: '92vh', overflow: 'hidden',
        boxShadow: '0 20px 60px rgba(0,0,0,0.2)',
      }}>
        {/* Header */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '0 24px', height: 52,
          borderBottom: '1px solid var(--border)', flexShrink: 0,
        }}>
          <div style={{ fontSize: 14, fontWeight: 600 }}>
            {order ? 'Edit Order' : 'New Order'} {orderData.style_number ? `· ${orderData.style_number}` : ''}
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-mid)', display: 'flex' }}>
            <X size={16} />
          </button>
        </div>

        {/* Progress bar */}
        <div style={{
          display: 'flex', padding: '0 24px',
          borderBottom: '1px solid var(--border)',
          overflowX: 'auto', flexShrink: 0,
          gap: 0,
        }}>
          {STEPS.map(s => {
            const done = stepDone(s.num)
            const active = step === s.num
            return (
              <button key={s.num} onClick={() => orderId && setStep(s.num)} style={{
                display: 'flex', alignItems: 'center', gap: 6,
                padding: '10px 14px', background: 'none', border: 'none',
                cursor: orderId ? 'pointer' : 'default',
                borderBottom: active ? '2px solid var(--black)' : '2px solid transparent',
                marginBottom: -1, whiteSpace: 'nowrap',
                color: active ? 'var(--text)' : done ? 'var(--green)' : 'var(--text-light)',
                fontSize: 12, fontWeight: active ? 600 : 400,
              }}>
                <div style={{
                  width: 18, height: 18, borderRadius: '50%',
                  background: done ? 'var(--green)' : active ? 'var(--black)' : '#eee',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 9, fontWeight: 700, flexShrink: 0,
                  color: done || active ? '#fff' : 'var(--text-light)',
                }}>
                  {done ? <Check size={10} strokeWidth={3} /> : s.num}
                </div>
                {s.label}
                {!s.required && <span style={{ fontSize: 9, color: 'var(--text-light)' }}>opt</span>}
              </button>
            )
          })}
        </div>

        {/* Step content */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '24px' }}>
          <StepComponent
            orderId={orderId}
            orderData={orderData}
            onSaved={(id, data) => {
              if (id && !orderId) setOrderId(id)
              if (data) setOrderData(prev => ({ ...prev, ...data }))
            }}
          />
        </div>

        {/* Footer nav */}
        <div style={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          padding: '14px 24px', borderTop: '1px solid var(--border)', flexShrink: 0,
          background: '#fafaf8',
        }}>
          <button
            className="btn btn-secondary"
            onClick={() => setStep(s => Math.max(1, s - 1))}
            disabled={step === 1}
          >
            <ChevronLeft size={14} /> Back
          </button>

          <span style={{ fontSize: 11, color: 'var(--text-light)' }}>
            Step {step} of {STEPS.length}
          </span>

          {step < 10 ? (
            <button
              className="btn btn-primary"
              onClick={() => setStep(s => s + 1)}
              disabled={!canGoNext()}
            >
              Next <ChevronRight size={14} />
            </button>
          ) : (
            <button className="btn btn-accent" onClick={onClose}>
              <Check size={14} /> Done
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
