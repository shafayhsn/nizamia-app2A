'use strict'
const {randomUUID}=require('node:crypto')
const fields={
 library_items:'name category description unit default_wastage notes composition weight width_inches shrinkage colour weave_construction packing_form is_active',
 size_group_templates:'name sizes buyer_id buyer_name base_size is_active',
 app_tasks:'title assignee_id due_date priority description related_record status completed_at',
 app_task_comments:'task_id body',
 costing_batches:'name',
 pp_meetings:'meeting_date status decision technical_checks fit_approved department_notes outstanding_actions signatures'
}
function catalogChange(input,rows,stamp,owner){
 const table=input.kind,allowed=fields[table].split(' '),target=input.id||randomUUID()
 const before=rows(table).find(row=>row.id===target)||null
 if(input.action!=='save'||input.id&&!before)throw Error('Refresh and reopen the record before saving.')
 const patch=Object.fromEntries(Object.entries(input.fields||{}).filter(([k])=>allowed.includes(k)))
 if(!Object.keys(patch).length)throw Error('No editable fields were supplied.')
 if(table==='app_task_comments'&&before||table==='costing_batches'&&before)throw Error('This action requires a new record.')
 if(table==='pp_meetings'&&!before)throw Error('Choose a saved meeting.')
 const expected=before?Object.fromEntries(Object.keys(patch).map(k=>[k,before[k]??null])):null
 const after={...before,...patch,id:target}
 const dependencies=[]
 if(!before){
  after.created_at=stamp
  if(table==='app_tasks'){after.created_by=owner;after.status='Pending'}
  if(table==='app_task_comments'){after.user_id=owner;dependencies.push(['app_tasks',after.task_id])}
 }
 if(table==='pp_meetings')after.updated_at=stamp
 return {table,target,payload:{patch},expected:{previous:expected},edits:[{table,id:target,before,after}],dependencies}
}
module.exports={catalogChange,fields}
