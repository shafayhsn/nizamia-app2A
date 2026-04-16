const KEY = 'nzm_sampling_store_v1'

function base() {
  return {
    sampleMeta: {},
    comments: {},
    sampleLogs: {},
    parcelPool: [],
    parcels: [],
    counters: { parcel: 1 },
  }
}

function uid() {
  return `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
}

export function loadSamplingStore() {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return base()
    const parsed = JSON.parse(raw)
    return {
      ...base(),
      ...parsed,
      sampleMeta: parsed.sampleMeta || {},
      comments: parsed.comments || {},
      sampleLogs: parsed.sampleLogs || {},
      parcelPool: parsed.parcelPool || [],
      parcels: parsed.parcels || [],
      counters: { ...base().counters, ...(parsed.counters || {}) },
    }
  } catch {
    return base()
  }
}

export function saveSamplingStore(store) {
  localStorage.setItem(KEY, JSON.stringify(store))
}

export function getSampleMeta(sampleId) {
  const store = loadSamplingStore()
  return store.sampleMeta[sampleId] || {}
}

export function updateSampleMeta(sampleId, patch) {
  const store = loadSamplingStore()
  store.sampleMeta[sampleId] = { ...(store.sampleMeta[sampleId] || {}), ...patch }
  saveSamplingStore(store)
  return store.sampleMeta[sampleId]
}

export function addSampleComment(sampleId, comment) {
  const store = loadSamplingStore()
  const arr = store.comments[sampleId] || []
  arr.push({ id: uid(), created_at: new Date().toISOString(), ...comment })
  arr.sort((a, b) => new Date(a.created_at || a.date || 0) - new Date(b.created_at || b.date || 0))
  store.comments[sampleId] = arr
  saveSamplingStore(store)
  return arr
}

export function getSampleComments(sampleId) {
  return loadSamplingStore().comments[sampleId] || []
}

export function addSampleLog(sampleId, log) {
  const store = loadSamplingStore()
  const arr = store.sampleLogs[sampleId] || []
  arr.push({ id: uid(), event_at: new Date().toISOString(), ...log })
  arr.sort((a, b) => new Date(b.event_at || 0) - new Date(a.event_at || 0))
  store.sampleLogs[sampleId] = arr
  saveSamplingStore(store)
  return arr
}

export function getSampleLogs(sampleId) {
  return loadSamplingStore().sampleLogs[sampleId] || []
}

export function sendSampleToParcelPool(sampleId, checklist = {}) {
  const store = loadSamplingStore()
  if (!store.parcelPool.find(x => x.sampleId === sampleId)) {
    store.parcelPool.push({
      sampleId,
      addedAt: new Date().toISOString(),
      checklist,
      status: 'Pending',
    })
  }
  store.sampleMeta[sampleId] = {
    ...(store.sampleMeta[sampleId] || {}),
    dispatchStatus: 'Pending Parcel',
    sentToParcelsAt: new Date().toISOString(),
  }
  saveSamplingStore(store)
}

export function removeSampleFromParcelPool(sampleId) {
  const store = loadSamplingStore()
  store.parcelPool = store.parcelPool.filter(x => x.sampleId !== sampleId)
  saveSamplingStore(store)
}

export function createParcel(data) {
  const store = loadSamplingStore()
  const seq = String(store.counters.parcel || 1).padStart(3, '0')
  const parcelId = `PAR-${new Date().getFullYear().toString().slice(2)}-${seq}`
  store.counters.parcel = (store.counters.parcel || 1) + 1
  const parcel = {
    id: parcelId,
    status: 'Draft',
    createdAt: new Date().toISOString(),
    dispatchDate: '',
    courier: '',
    trackingNo: '',
    notes: '',
    items: [],
    customItems: [],
    ...data,
  }
  store.parcels.unshift(parcel)
  saveSamplingStore(store)
  return parcel
}

export function updateParcel(parcelId, patch) {
  const store = loadSamplingStore()
  store.parcels = store.parcels.map(p => p.id === parcelId ? { ...p, ...patch } : p)
  saveSamplingStore(store)
  return store.parcels.find(p => p.id === parcelId)
}

export function dispatchParcel(parcelId) {
  const store = loadSamplingStore()
  const parcel = store.parcels.find(p => p.id === parcelId)
  if (!parcel) return null
  parcel.status = 'Dispatched'
  parcel.dispatchedAt = new Date().toISOString()
  for (const item of parcel.items || []) {
    store.parcelPool = store.parcelPool.filter(x => x.sampleId !== item.sampleId)
    store.sampleMeta[item.sampleId] = {
      ...(store.sampleMeta[item.sampleId] || {}),
      dispatchStatus: 'Dispatched',
      parcelId,
      dispatchDate: parcel.dispatchDate || new Date().toISOString().slice(0,10),
      awaitingComments: true,
    }
  }
  saveSamplingStore(store)
  return parcel
}

export function deleteParcel(parcelId) {
  const store = loadSamplingStore()
  store.parcels = store.parcels.filter(p => p.id !== parcelId)
  saveSamplingStore(store)
}
