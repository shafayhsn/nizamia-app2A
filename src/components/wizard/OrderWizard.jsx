import React from 'react'

export default function OrderWizard({ order, onClose }) {
  return (
    <div className="modal-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose?.() }}>
      <div className="modal" style={{ maxWidth: 720 }}>
        <div className="modal-header">
          <h2>{order ? 'Edit Order' : 'New Order'}</h2>
          <button className="btn btn-secondary btn-sm" onClick={onClose}>Close</button>
        </div>
        <div className="modal-body">
          <p style={{ color: '#64748b' }}>Order form module is preserved for routing/build stability. Use the table actions and existing import flow for order data.</p>
        </div>
      </div>
    </div>
  )
}
