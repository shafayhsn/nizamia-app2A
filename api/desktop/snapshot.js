import {createClient} from '@supabase/supabase-js'
import {createHmac,timingSafeEqual} from 'node:crypto'
import snapshotReader from '../../server/snapshotTableReader.cjs'
const key=process.env.SUPABASE_SERVICE_ROLE_KEY
const url=process.env.VITE_SUPABASE_URL||process.env.SUPABASE_URL
const db=key&&url?createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}}):null
// Explicit allowlist verified against the live public schema on 2026-11-18.
// Deliberately excludes users, roles, permissions, read receipts, sync metadata,
// historical migration tables and all account credential columns.
const TABLES=["buyers","suppliers","library_items","bom_presets","bom_preset_items","jobs","orders","size_groups","size_group_colors","size_group_breakdown","bom_items","fitting","samples","washing","embellishments","finishing","finishing_color_packing","order_processes","purchase_orders","purchase_order_items","purchase_order_changelog","work_orders","work_order_items","work_order_changelog","settings","counters","exchange_rates","size_group_templates","fitting_blocks","finishing_packs","order_queues","sample_comments","sample_logs","shipments","shipment_lines","payment_settlements","app_settings","document_numbering","uoms","ui_status_colors","packing_snapshots","parcels","production_batches","production_batch_orders","app_tasks","app_task_comments","production_daily_entries","shipping_bookings","shipping_booking_lines","shipping_booking_shipments","parcel_status_history","buyer_addresses","buyer_contacts","parcel_invoice_snapshots","testing_orders","testing_requirements","pp_meetings","proforma_invoices","proforma_invoice_revisions","costing_sheets","costing_sheet_versions","costing_batches","feature_assets","feature_certificates","desktop_task_assignees"]
const sensitive=/password|secret|token|api_key|private_key|session|credential|auth_hash|passkey_hash/i
function verifyBearer(value){
 if(typeof value!=='string'||!value.startsWith('Bearer '))return null
 const token=value.slice(7),parts=token.split('.')
 if(parts.length!==2||parts[0].length>2048||parts[1].length>128)return null
 const expected=createHmac('sha256',key).update('desktop-snapshot:'+parts[0]).digest('base64url')
 const a=Buffer.from(parts[1]),b=Buffer.from(expected)
 if(a.length!==b.length||!timingSafeEqual(a,b))return null
 try{
  const claim=JSON.parse(Buffer.from(parts[0],'base64url').toString())
  if(typeof claim.id!=='string'||!claim.id||!Number.isSafeInteger(claim.exp)||claim.exp<Date.now()||claim.exp>Date.now()+9*60*60*1000||claim.scope!=='desktop-snapshot')return null
  return claim
 }catch{return null}
}
export default async function handler(req,res){
 res.setHeader('Cache-Control','no-store')
 res.setHeader('Content-Type','application/json')
 if(req.method!=='GET')return res.status(405).json({error:'Method not allowed'})
 if(!db)return res.status(503).json({error:'Backend unavailable'})
 const claim=verifyBearer(req.headers.authorization)
 if(!claim)return res.status(401).json({error:'Authenticated desktop session required'})
 const {data:user,error:userError}=await db.from('users').select('id,role,is_active,is_restricted').eq('id',claim.id).maybeSingle()
 if(userError||!user||user.is_active!==true||user.is_restricted===true)return res.status(403).json({error:'Access denied'})
 // Initial release is restricted to administrators until table-level permission
 // and row-scoping rules are implemented. Service-role access must not bypass authorization.
 if(String(user.role).toLowerCase()!=='admin')return res.status(403).json({error:'Administrator authorization required'})
 try{
  if(req.query?.attachment){
   const kind=req.query.attachment
   if(!['meeting','asset'].includes(kind)||!/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(req.query.id||''))return res.status(400).json({error:'Invalid attachment'})
   const meeting=kind==='meeting',field=meeting?'attachment_path':'storage_path'
   const {data:record,error}=await db.from(meeting?'pp_meetings':'feature_assets').select(field).eq('id',req.query.id).maybeSingle()
   if(error)throw error
   if(!record?.[field])return res.status(404).json({error:'Attachment unavailable'})
   const {data,error:signError}=await db.storage.from(meeting?'ppm-attachments':'company-assets').createSignedUrl(record[field],60)
   if(signError)throw signError
   return res.status(200).json({url:data.signedUrl,path:record[field]})
  }
  const entries=[]
  const concurrency=8
  for(let offset=0;offset<TABLES.length;offset+=concurrency){
   const batch=await Promise.all(TABLES.slice(offset,offset+concurrency).map(async name=>{
    const source=await snapshotReader.readSnapshotTable(db,name)
    const rows=source.map(row=>Object.fromEntries(Object.entries(row).filter(([field])=>!sensitive.test(field))))
    return [name,rows]
   }))
   entries.push(...batch)
  }
  const tables=Object.fromEntries(entries)
  const counts=Object.fromEntries(entries.map(([name,rows])=>[name,rows.length]))
  return res.status(200).json({backup_metadata:{table_count:TABLES.length,table_row_counts:counts,exported_at:new Date().toISOString()},tables})
 }catch(error){return res.status(503).json({error:'Cloud snapshot could not be prepared'})}
}
