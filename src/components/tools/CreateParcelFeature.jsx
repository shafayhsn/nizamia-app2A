import React, { useEffect, useMemo, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { createParcel, loadSamplingStore } from '../../lib/samplingStore'
import { ParcelBuilderModal } from '../../pages/Parcels'

export default function CreateParcelFeature({ onClose }) {
  const [samples, setSamples] = useState([])
  const [orders, setOrders] = useState([])
  const [store, setStore] = useState(() => loadSamplingStore())
  const [error, setError] = useState('')
  useEffect(() => {
    let mounted = true
    Promise.all([
      supabase.from('samples').select('*').order('created_at', { ascending: false }),
      supabase.from('orders').select('*').order('created_at', { ascending: false }),
    ]).then(([s,o]) => {
      if (!mounted) return
      if (s.error || o.error) { setError('Could not load samples and orders. Please try again.'); return }
      setSamples(s.data || []); setOrders(o.data || [])
    }).catch(() => mounted && setError('Could not load parcel data.'))
    return () => { mounted = false }
  }, [])
  const rows = useMemo(() => {
    const orderMap = Object.fromEntries(orders.map(o => [o.id,o]))
    const sampleMap = Object.fromEntries(samples.map(s => [s.id,s]))
    const inParcels = new Set((store.parcels || []).flatMap(p => (p.items || []).map(i => i.sampleId)))
    const ready = samples.filter(s => (store.sampleMeta?.[s.id]?.stage || s.stage || '') === 'Ready')
      .map(sample => ({ sampleId:sample.id, sample, order:orderMap[sample.order_id] || {} }))
    const pooled = (store.parcelPool || []).filter(p => sampleMap[p.sampleId])
      .map(p => ({ sampleId:p.sampleId, sample:sampleMap[p.sampleId], order:orderMap[sampleMap[p.sampleId].order_id] || {} }))
    return [...new Map([...ready,...pooled].map(r => [r.sampleId,r])).values()]
      .filter(r => !inParcels.has(r.sampleId))
  }, [samples,orders,store])
  if (error) return <div role="alert" style={{padding:24}}>{error}<button onClick={onClose}>Close</button></div>
  return <ParcelBuilderModal poolRows={rows} onClose={onClose} onCreated={payload => {
    try { createParcel(payload); setStore(loadSamplingStore()); onClose() }
    catch { setError('Parcel could not be created. Please try again.') }
  }} />
}
