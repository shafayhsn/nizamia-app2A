export const usesOfflineOperations=()=>typeof location!=='undefined'&&location.protocol==='app2a:'

export async function saveOfflineOperation(input){
 const response=await fetch('/api/offline/operational-record',{
  method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(input),
 })
 const {data,error}=await response.json()
 if(!response.ok)throw Error(error||'Could not save the offline change')
 window.dispatchEvent(new Event('app2a-offline-data-changed'))
 return data
}

export function offlineShipmentHeader(header,notes,meta){
 const {status}=header
 const storedStatus=status==='Cancelled'?'Cancelled':['Closed','Delivered','Shipped'].includes(status)?'Closed':'Open'
 const content=JSON.stringify({...meta,display_status:meta.display_status||status})
 const encoded=btoa(content.replace(/[\u007f-\uffff]/g,ch=>'\\u'+ch.charCodeAt(0).toString(16).padStart(4,'0')))
 return {...header,status:storedStatus,notes:String(notes||'').trim()+'\n\n[[APP2A_SHIPPING_META:'+encoded+']]'}
}
