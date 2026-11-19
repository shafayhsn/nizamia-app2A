export async function accountRequest(action,fields){
 const endpoint=location.protocol==='app2a:'?'/api/offline/accounts':'/api/oms'
 const response=await fetch(fields?endpoint:endpoint+'?action='+encodeURIComponent(action),{
  method:fields?'POST':'GET',credentials:'same-origin',
  ...(fields?{headers:{'Content-Type':'application/json'},body:JSON.stringify({action,...fields})}:{})
 })
 const result=await response.json()
 if(!response.ok)throw Error(result.error||'Account request failed')
 return result
}
