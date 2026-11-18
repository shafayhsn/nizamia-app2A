export async function accountRequest(action,fields){
 const response=await fetch(fields?'/api/oms':'/api/oms?action='+encodeURIComponent(action),{
  method:fields?'POST':'GET',credentials:'same-origin',
  ...(fields?{headers:{'Content-Type':'application/json'},body:JSON.stringify({action,...fields})}:{})
 })
 const result=await response.json()
 if(!response.ok)throw Error(result.error||'Account request failed')
 return result
}
