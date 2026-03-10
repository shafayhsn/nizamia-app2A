import React, { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { formatDate, formatCurrency } from '../lib/utils'
import { Plus, Package } from 'lucide-react'

export default function Purchasing() {
  const [tab, setTab] = useState('demand')
  const [pos, setPOs] = useState([])
  const [wos, setWOs] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => { loadData() }, [])

  async function loadData() {
    setLoading(true)
    const [poRes, woRes] = await Promise.all([
      supabase.from('purchase_orders').select('*, suppliers(name)').order('created_at', { ascending: false }),
      supabase.from('work_orders').select('*, suppliers(name)').order('created_at', { ascending: false }),
    ])
    setPOs(poRes.data || [])
    setWOs(woRes.data || [])
    setLoading(false)
  }

  const TABS = [
    { id: 'demand', label: 'Material Demand' },
    { id: 'pos', label: 'Purchase Orders' },
    { id: 'workorders', label: 'Work Orders' },
    { id: 'deliveries', label: 'Expected Deliveries' },
  ]

  return (
    <div className="page-content">
      <div style={{ display: 'flex', gap: 0, marginBottom: 20, borderBottom: '1px solid var(--border)' }}>
        {TABS.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)} style={{
            padding: '0 16px', height: 36, background: 'none', border: 'none',
            cursor: 'pointer', fontSize: 13, fontWeight: tab === t.id ? 600 : 400,
            color: tab === t.id ? 'var(--text)' : 'var(--text-mid)',
            borderBottom: tab === t.id ? '2px solid var(--black)' : '2px solid transparent',
            marginBottom: -1,
          }}>{t.label}</button>
        ))}
      </div>

      {tab === 'demand' && (
        <div className="card">
          <div className="empty-state">
            <Package size={32} />
            <p style={{ fontWeight: 600, color: 'var(--text)' }}>Consolidated Material Demand</p>
            <p>Aggregated BOM requirements across all active orders.</p>
            <p style={{ fontSize: 11 }}>Full implementation in next build.</p>
          </div>
        </div>
      )}

      {tab === 'pos' && (
        <>
          <div className="section-header">
            <div style={{ fontSize: 13, color: 'var(--text-mid)' }}>{pos.length} purchase orders</div>
            <button className="btn btn-primary"><Plus size={14} /> New PO</button>
          </div>
          <div className="card">
            <div className="table-wrap">
              {pos.length === 0 ? (
                <div className="empty-state"><Package size={32} /><p>No purchase orders yet.</p></div>
              ) : (
                <table>
                  <thead><tr>
                    <th>PO Number</th><th>Supplier</th><th>Job</th>
                    <th>PO Date</th><th>Delivery Date</th><th>Status</th>
                  </tr></thead>
                  <tbody>
                    {pos.map(po => (
                      <tr key={po.id}>
                        <td style={{ fontFamily: 'monospace', fontSize: 11, fontWeight: 600 }}>{po.po_number}</td>
                        <td>{po.suppliers?.name || '—'}</td>
                        <td style={{ fontFamily: 'monospace', fontSize: 11 }}>{po.job_id || '—'}</td>
                        <td style={{ fontSize: 11 }}>{formatDate(po.po_date)}</td>
                        <td style={{ fontSize: 11 }}>{formatDate(po.delivery_date)}</td>
                        <td><span className={`badge badge-${(po.status || 'draft').toLowerCase()}`}>{po.status}</span></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </>
      )}

      {tab === 'workorders' && (
        <>
          <div className="section-header">
            <div style={{ fontSize: 13, color: 'var(--text-mid)' }}>{wos.length} work orders</div>
            <button className="btn btn-primary"><Plus size={14} /> New Work Order</button>
          </div>
          <div className="card">
            <div className="table-wrap">
              {wos.length === 0 ? (
                <div className="empty-state"><Package size={32} /><p>No work orders yet.</p></div>
              ) : (
                <table>
                  <thead><tr>
                    <th>WO Number</th><th>Vendor</th><th>Job</th>
                    <th>Start Date</th><th>Complete By</th><th>Status</th>
                  </tr></thead>
                  <tbody>
                    {wos.map(wo => (
                      <tr key={wo.id}>
                        <td style={{ fontFamily: 'monospace', fontSize: 11, fontWeight: 600 }}>{wo.wo_number}</td>
                        <td>{wo.suppliers?.name || '—'}</td>
                        <td style={{ fontFamily: 'monospace', fontSize: 11 }}>{wo.job_id || '—'}</td>
                        <td style={{ fontSize: 11 }}>{formatDate(wo.start_date)}</td>
                        <td style={{ fontSize: 11 }}>{formatDate(wo.complete_by)}</td>
                        <td><span className={`badge badge-${(wo.status || 'draft').toLowerCase()}`}>{wo.status}</span></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </>
      )}

      {tab === 'deliveries' && (
        <div className="card">
          <div className="empty-state">
            <p style={{ fontWeight: 600, color: 'var(--text)' }}>Expected Deliveries</p>
            <p>Track incoming material deliveries against PO dates.</p>
            <p style={{ fontSize: 11 }}>Full implementation in next build.</p>
          </div>
        </div>
      )}
    </div>
  )
}
