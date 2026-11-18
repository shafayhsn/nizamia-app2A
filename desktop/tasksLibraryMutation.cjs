'use strict'
const columns={
 app_tasks:'title assignee_id due_date priority description related_record status completed_at',
 app_task_comments:'task_id body',
 library_items:'name unit notes colour weight category shrinkage composition description packing_form width_inches default_wastage weave_construction is_active',
 size_group_templates:'name sizes buyer_id buyer_name base_size is_active',
 bom_presets:'name buyer_id members'
}
const tables=new Set(Object.keys(columns))
const shape=(table,input)=>{
 if(!tables.has(table)||!input||typeof input!=='object'||Array.isArray(input))throw Error('Invalid Tasks or Library fields.')
 const allowed=new Set(columns[table].split(' '))
 const patch=Object.fromEntries(Object.entries(input).filter(([key])=>allowed.has(key)))
 for(const field of ['default_wastage','width_inches']){
  if(!Object.hasOwn(patch,field))continue
  const raw=patch[field]
  patch[field]=raw==null||raw===''?null:Number(raw)
  if(patch[field]!==null&&!Number.isFinite(patch[field]))throw Error('Enter a valid number.')
 }
 return patch
}
module.exports={tables,shape}
