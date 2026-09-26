import { supabase } from './supabase'

const checked = ({ data, error }) => { if (error) throw error; return data }
const parcelFromRow = r => ({
  id: r.id, status: r.status, createdAt: r.created_at,
  dispatchDate: r.dispatch_date || '', courier: r.courier || '',
  trackingNo: r.tracking_no || '', notes: r.notes || '',
  items: r.items || [], customItems: r.custom_items || [], dispatchedAt: r.dispatched_at,
})

export async function loadSamplingStore() {
  const [s, c, p] = await Promise.all([
    supabase.from('samples').select('id,workflow_meta'),
    supabase.from('sample_comments').select('*').order('comment_date'),
    supabase.from('parcels').select('*').order('created_at', { ascending:false }),
  ])
  const samples = checked(s), comments = checked(c), parcels = checked(p)
  const sampleMeta = Object.fromEntries(samples.map(row => [row.id, row.workflow_meta || {}]))
  const commentMap = {}
  comments.forEach(row => {
    ;(commentMap[row.sample_id] ||= []).push({
      id:row.id, type:row.comment_type, date:row.comment_date?.slice(0,10),
      by:row.comment_by, text:row.comment_text,
    })
  })
  return {
    sampleMeta, comments:commentMap,
    parcelPool:samples.filter(row => sampleMeta[row.id].dispatchStatus === 'Pending Parcel').map(row => ({
      sampleId:row.id, addedAt:sampleMeta[row.id].sentToParcelsAt,
      checklist:sampleMeta[row.id].dispatchChecklist || {}, status:'Pending',
    })),
    parcels:parcels.map(parcelFromRow),
  }
}

export async function getSampleMeta(sampleId) {
  const row = checked(await supabase.from('samples').select('workflow_meta').eq('id',sampleId).single())
  return row.workflow_meta || {}
}
export async function updateSampleMeta(sampleId, patch) {
  const meta = { ...(await getSampleMeta(sampleId)), ...patch }
  checked(await supabase.from('samples').update({ workflow_meta:meta }).eq('id',sampleId).select('id').single())
  return meta
}
export async function addSampleComment(sampleId, comment) {
  return checked(await supabase.from('sample_comments').insert({
    sample_id:sampleId, comment_type:comment.type,
    comment_date:comment.date || new Date().toISOString(),
    comment_by:comment.by, comment_text:comment.text,
  }).select('id').single())
}
export async function getSampleComments(sampleId) {
  const rows = checked(await supabase.from('sample_comments')
    .select('id,comment_type,comment_date,comment_by,comment_text')
    .eq('sample_id',sampleId).order('comment_date'))
  return rows.map(row => ({
    id:row.id, type:row.comment_type, date:row.comment_date?.slice(0,10),
    by:row.comment_by, text:row.comment_text,
  }))
}
export async function sendSampleToParcelPool(sampleId, checklist={}) {
  return updateSampleMeta(sampleId, {
    dispatchStatus:'Pending Parcel', sentToParcelsAt:new Date().toISOString(), dispatchChecklist:checklist,
  })
}
export async function removeSampleFromParcelPool(sampleId) {
  return updateSampleMeta(sampleId, { dispatchStatus:'In Development' })
}
export async function createParcel(data) {
  const id = `PAR-${String(new Date().getFullYear()).slice(2)}-${crypto.randomUUID().slice(0,8).toUpperCase()}`
  const row = checked(await supabase.from('parcels').insert({
    id, items:data.items || [], custom_items:data.customItems || [],
  }).select('*').single())
  return parcelFromRow(row)
}
export async function updateParcel(parcelId, patch) {
  const body = {}
  if ('courier' in patch) body.courier = patch.courier
  if ('trackingNo' in patch) body.tracking_no = patch.trackingNo
  if ('dispatchDate' in patch) body.dispatch_date = patch.dispatchDate || null
  if ('notes' in patch) body.notes = patch.notes
  const row = checked(await supabase.from('parcels').update(body).eq('id',parcelId).select('*').single())
  return parcelFromRow(row)
}
export async function dispatchParcel(parcelId) {
  const parcel = parcelFromRow(checked(await supabase.from('parcels').select('*').eq('id',parcelId).single()))
  for (const item of parcel.items) {
    await updateSampleMeta(item.sampleId, {
      dispatchStatus:'Dispatched', parcelId,
      dispatchDate:parcel.dispatchDate || new Date().toISOString().slice(0,10),
      awaitingComments:true,
    })
  }
  const row = checked(await supabase.from('parcels')
    .update({ status:'Dispatched', dispatched_at:new Date().toISOString() })
    .eq('id',parcelId).select('*').single())
  return parcelFromRow(row)
}
export async function deleteParcel(parcelId) {
  checked(await supabase.from('parcels').delete().eq('id',parcelId))
}
