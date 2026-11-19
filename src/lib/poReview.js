export async function reviewRequest(action,fields){
  const url=location.protocol==='app2a:'?'/api/offline/po-review':'/api/oms'
  const response=await fetch(fields?url:url+'?action='+encodeURIComponent(action),{
    method:fields?'POST':'GET',credentials:'same-origin',
    ...(fields?{headers:{'Content-Type':'application/json'},body:JSON.stringify({...fields,action})}:{})
  })
  const result=await response.json()
  if(!response.ok)throw Object.assign(Error(result.error||'PO review service unavailable'),{status:response.status})
  return result
}

export async function readPurchasingRegister(){
  const rows=[]
  let afterId=null
  for(;;){
    const page=await reviewRequest('readPOPage',{afterId})
    rows.push(...page.rows)
    if(page.rows.length<100)break
    const lastId=page.rows.at(-1).id
    if(lastId===afterId)throw Error('Purchase order download interrupted')
    afterId=lastId
  }
  return rows.sort((a,b)=>String(b.created_at).localeCompare(String(a.created_at)))
}

export async function relatedPurchaseOrders(){
  try{return await readPurchasingRegister()}
  catch(error){if(error.status===403)return [];throw error}
}

// Offline desktop queries use the guarded SQLite bridge. Web lookups use the
// same filtered records as Purchasing before doing any job or supplier joins.
export async function purchasingLookup(localQuery,{lines=false,orderId}={}){
  if(window.location.protocol==='app2a:')return localQuery
  try{
    let rows=await relatedPurchaseOrders()
    if(orderId!==undefined)rows=rows.filter(row=>row.order_id===orderId)
    if(lines)rows=rows.flatMap(row=>row.purchase_order_items.map(item=>({...item,po_id:row.id})))
    return {data:rows,error:null}
  }catch(error){return {data:null,error}}
}
