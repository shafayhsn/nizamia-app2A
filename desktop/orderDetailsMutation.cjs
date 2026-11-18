'use strict'

const fields=new Set(['ship_date','po_date','merchandiser_name','store_name','status'])

function isOrderDetailsPatch(patch){
 if(!patch||typeof patch!=='object'||Array.isArray(patch))return false
 const keys=Object.keys(patch)
 return keys.length>0&&keys.every(key=>fields.has(key)&&
  (patch[key]===null||typeof patch[key]==='string'&&patch[key].length<=2000))
}

module.exports={isOrderDetailsPatch}
