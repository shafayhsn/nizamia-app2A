'use strict'

const fields=new Set(['ship_date','po_date','merchandiser_name','store_name','status'])

function isOrderDetailsPatch(patch){
 if(!patch||typeof patch!=='object'||Array.isArray(patch))return false
 const keys=Object.keys(patch)
 return keys.length>0&&keys.every(key=>fields.has(key)&&
  (patch[key]===null||typeof patch[key]==='string'&&patch[key].length<=2000))
}

const uuid=/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i

function isOrderJobPatch(patch){
 return !!patch&&Object.keys(patch).sort().join()==='job_id,job_number'&&
  (patch.job_id===null||typeof patch.job_id==='string'&&uuid.test(patch.job_id))&&
  (patch.job_number===null||typeof patch.job_number==='string'&&patch.job_number.length<=128)
}

module.exports={isOrderDetailsPatch,isOrderJobPatch}
