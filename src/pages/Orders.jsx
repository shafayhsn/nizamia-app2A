import React, { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { formatDate, shipDateStatus, daysUntil } from '../lib/utils'
import { Plus, Search, Filter, Edit2, Copy, Trash2, FileText, Package } from 'lucide-react'
import OrderWizard from '../components/wizard/OrderWizard'

export default function Orders() {
  const [tab, setTab] = useState('orders')
  const [orders, setOrders] = useState([])
  const [jobs, setJobs] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [wizardOpen, setWizardOpen] = useState(false)
  const [editOrder, setEditOrder] = useState(null)

  useEffect(() => { loadOrders(); loadJobs() }, [])

  async function loadOrders() {
    setLoading(true)
    const { data } = await supabase.from('orders')
      .select('*')
      .order('created_at', { ascending: false })
    setOrders(data || [])
    setLoading(false)
  }

  async function loadJobs() {
    const { data } = await supabase.from('jobs')
      .select('*, buyers(name)')
      .order('created_at', { ascending: false })
    setJobs(data || [])
  }

  const filtered = orders.filter(o =>
    !search || [o.job_number, o.buyer_name, o.style_number, o.description, o.po_number]
      .some(f => f?.toLowerCase().includes(search.toLowerCase()))
  )

  const statusColor = (s) => {
    if (s === 'overdue') return 'var(--red)'
    if (s === 'critical') return 'var(--red)'
    if (s === 'warning') return 'var(--amber)'
    return 'inherit'
  }

  const handleNew = () => { setEditOrder(null); setWizardOpen(true) }
  const handleEdit = (o) => { setEditOrder(o); setWizardOpen(true) }

  const handleDuplicate = async (o) => {
    const { id, created_at, updated_at, po_number, ship_date, planned_date, po_date, status, ...rest } = o
    const { data } = await supabase.from('orders').insert([{ ...rest, status: 'Draft', po_number: null }]).select().single()
    if (data) loadOrders()
  }

  const handleDelete = async (id) => {
    if (!confirm('Delete this order? This cannot be undone.')) return
    await supabase.from('orders').delete().eq('id', id)
    loadOrders()
  }

  const stepsComplete = (o) => {
    const steps = [o.step_po_matrix, o.step_bom, o.step_fitting, o.step_sampling,
      o.step_washing, o.step_embellishment, o.step_finishing, o.step_processes]
    return steps.filter(Boolean).length
  }

  return (
    <div className="page-content">
      {/* Tabs */}
      <div style={{ display: 'flex', gap: 0, marginBottom: 20, borderBottom: '1px solid var(--border)' }}>
        {[['orders', 'Buyer POs'], ['jobs', 'Jobs']].map(([id, label]) => (
          <button key={id} onClick={() => setTab(id)} style={{
            padding: '0 16px', height: 36, background: 'none', border: 'none',
            cursor: 'pointer', fontSize: 13, fontWeight: tab === id ? 600 : 400,
            color: tab === id ? 'var(--text)' : 'var(--text-mid)',
            borderBottom: tab === id ? '2px solid var(--black)' : '2px solid transparent',
            marginBottom: -1,
          }}>{label}</button>
        ))}
      </div>

      {tab === 'orders' && (
        <>
          <div className="section-header">
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <div style={{ position: 'relative' }}>
                <Search size={13} style={{ position: 'absolute', left: 9, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-light)' }} />
                <input className="input" style={{ paddingLeft: 28, width: 240 }} placeholder="Search orders..." value={search} onChange={e => setSearch(e.target.value)} />
              </div>
            </div>
            <button className="btn btn-primary" onClick={handleNew}>
              <Plus size={14} /> New Order
            </button>
          </div>

          <div className="card">
            <div className="table-wrap">
              {loading ? (
                <div className="empty-state"><p>Loading...</p></div>
              ) : filtered.length === 0 ? (
                <div className="empty-state">
                  <Package size={32} />
                  <p>{search ? 'No orders match your search' : 'No orders yet. Create your first order.'}</p>
                  {!search && <button className="btn btn-primary" onClick={handleNew}><Plus size={14} /> New Order</button>}
                </div>
              ) : (
                <table>
                  <thead>
                    <tr>
                      <th>Job / Style</th>
                      <th>Buyer</th>
                      <th>Description</th>
                      <th>PO Number</th>
                      <th style={{ textAlign: 'center' }}>Steps</th>
                      <th>Status</th>
                      <th style={{ textAlign: 'right' }}>Ex-Factory</th>
                      <th style={{ textAlign: 'right' }}>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map(o => {
                      const ds = shipDateStatus(o.ship_date)
                      const sc = stepsComplete(o)
                      return (
                        <tr key={o.id}>
                          <td>
                            <div style={{ fontWeight: 600, fontSize: 12 }}>{o.job_number || <span style={{ color: 'var(--text-light)' }}>Unassigned</span>}</div>
                            <div style={{ fontSize: 11, color: 'var(--text-light)', fontFamily: 'monospace' }}>{o.style_number || '—'}</div>
                          </td>
                          <td style={{ fontSize: 12 }}>{o.buyer_name || '—'}</td>
                          <td style={{ fontSize: 12, color: 'var(--text-mid)', maxWidth: 180 }}>
                            <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{o.description || '—'}</div>
                          </td>
                          <td style={{ fontFamily: 'monospace', fontSize: 11 }}>{o.po_number || '—'}</td>
                          <td style={{ textAlign: 'center' }}>
                            <div style={{ fontSize: 11, color: sc === 8 ? 'var(--green)' : 'var(--text-mid)' }}>
                              {sc}/8
                            </div>
                          </td>
                          <td>
                            <span className={`badge badge-${(o.status || 'draft').toLowerCase().replace(' ', '')}`}>{o.status || 'Draft'}</span>
                          </td>
                          <td style={{ textAlign: 'right' }}>
                            <div style={{ fontSize: 12, fontWeight: 600, color: statusColor(ds) }}>
                              {formatDate(o.ship_date)}
                            </div>
                            {ds === 'overdue' && <div style={{ fontSize: 10, color: 'var(--red)' }}>Overdue</div>}
                            {ds === 'critical' && <div style={{ fontSize: 10, color: 'var(--red)' }}>{daysUntil(o.ship_date)}d</div>}
                          </td>
                          <td style={{ textAlign: 'right' }}>
                            <div style={{ display: 'flex', gap: 2, justifyContent: 'flex-end' }}>
                              <button className="btn btn-ghost btn-sm" onClick={() => handleEdit(o)} title="Edit"><Edit2 size={12} /></button>
                              <button className="btn btn-ghost btn-sm" onClick={() => handleDuplicate(o)} title="Duplicate"><Copy size={12} /></button>
                              <button className="btn btn-ghost btn-sm" onClick={() => handleDelete(o.id)} title="Delete"><Trash2 size={12} /></button>
                            </div>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </>
      )}

      {tab === 'jobs' && (
        <>
          <div className="section-header">
            <div style={{ fontSize: 13, color: 'var(--text-mid)' }}>{jobs.length} jobs</div>
          </div>
          <div className="card">
            <div className="table-wrap">
              {jobs.length === 0 ? (
                <div className="empty-state"><p>No jobs yet. Jobs are created when you assign orders.</p></div>
              ) : (
                <table>
                  <thead>
                    <tr>
                      <th>Job Number</th>
                      <th>Buyer</th>
                      <th>Season</th>
                      <th style={{ textAlign: 'right' }}>Orders</th>
                      <th>Created</th>
                    </tr>
                  </thead>
                  <tbody>
                    {jobs.map(j => (
                      <tr key={j.id}>
                        <td style={{ fontWeight: 600, fontFamily: 'monospace', fontSize: 12 }}>{j.job_number}</td>
                        <td>{j.buyers?.name || '—'}</td>
                        <td style={{ fontFamily: 'monospace', fontSize: 11 }}>{j.season || '—'}</td>
                        <td style={{ textAlign: 'right' }}>
                          {orders.filter(o => o.job_id === j.id).length}
                        </td>
                        <td style={{ fontSize: 11, color: 'var(--text-light)' }}>{formatDate(j.created_at)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </>
      )}

      {wizardOpen && (
        <OrderWizard
          order={editOrder}
          onClose={() => { setWizardOpen(false); loadOrders() }}
        />
      )}
    </div>
  )
}
