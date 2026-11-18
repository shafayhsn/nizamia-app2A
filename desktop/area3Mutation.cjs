'use strict'
const sampleFields='order_id sample_number sample_type color size requested_date due_date received_date status comments size_group_id size_group_name colours sizes base_size bom_snapshot wash_snapshot emb_snapshot req_pcs parent_sample_id root_sample_id version_no version_label stage approval_status dispatch_status last_comment_at last_comment_by workflow_meta'
const commentFields='sample_id root_sample_id sam_number version_label comment_type comment_text comment_by comment_date is_internal meta'
const parcelFields='status dispatch_date courier tracking_no notes items custom_items tracking_url'
const columns=Object.fromEntries(Object.entries({samples:sampleFields,sample_comments:commentFields,parcels:parcelFields}).map(([table,fields])=>[table,new Set(fields.split(' '))]))
function shape(table,fields){
 if(!Object.hasOwn(columns,table)||!fields||typeof fields!=='object'||Array.isArray(fields))throw Error('Invalid Sampling or Parcel fields.')
 return Object.fromEntries(Object.entries(fields).filter(([key])=>columns[table].has(key)))
}
module.exports={shape}
