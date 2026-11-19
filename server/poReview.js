export async function poReview(req,res,db,user,action){
  if(action==='assignedPOReviews' && req.method==='GET'){
    if(user.role!=='admin')return res.status(403).json({error:'Admin access required'})
    const rows=[]
    let cursor=null
    for(;;){
      let page=db.from('app_tasks').select('*').eq('assignee_id',user.id).like('related_record','PO approval: %').order('id').limit(100)
      if(cursor)page=page.gt('id',cursor)
      const {data,error}=await page
      if(error)return res.status(503).json({error:'Could not refresh PO approval tasks'})
      rows.push(...data)
      if(data.length<100)break
      cursor=data.at(-1).id
    }
    return res.json({data:rows})
  }
  if(action==='poApprovers' && req.method==='GET'){
    if(user.role!=='admin'){
      const {data,error}=await db.from('permissions').select('can_view,can_create')
        .eq('role_id',user.role_id).eq('module','purchasing').maybeSingle()
      if(error||!data?.can_view||!data.can_create)return res.status(403).json({error:'Purchasing access required'})
    }
    const {data,error}=await db.from('users').select('id,username').eq('role','admin')
      .eq('is_active',true).or('is_restricted.is.null,is_restricted.eq.false').order('username')
    return error?res.status(503).json({error:'Could not load admins'}):res.json({data})
  }
  if(req.method!=='POST')return res.status(405).json({error:'Method not allowed'})
  if(action==='setPOStage'){
    const {poId,expectedTime,status}=req.body
    const {error}=await db.rpc('set_reviewed_po_stage',{actor:user.id,target:poId,expected_time:expectedTime,next_stage:status})
    if(error)return res.status(error.code==='42501'?403:409).json({error:'The status could not be updated. Check your permission and PO approval.'})
    return res.json({ok:true})
  }
  if(action==='deletePORecords'){
    const {poId,orderIds,expectedTime}=req.body
    if(orderIds && (!Array.isArray(orderIds)||orderIds.length===0))return res.status(400).json({error:'Orders required'})
    const {error}=await db.rpc('remove_po_records',{actor:user.id,target:poId||null,parent_orders:orderIds||null,expected_time:expectedTime||null})
    if(error)return res.status(error.code==='42501'?403:409).json({error:error.code==='42501'?'An admin must remove the linked PO.':'The PO could not be removed. Refresh before retrying.'})
    return res.json({ok:true})
  }
  if(action==='readPOHistory'){
    const {ids,afterId}=req.body
    if(!Array.isArray(ids)||ids.length>50)return res.status(400).json({error:'Invalid history request'})
    const {data,error}=await db.rpc('read_po_history',{actor:user.id,ids,after_id:afterId||null})
    if(error)return res.status(403).json({error:'Purchase order history unavailable'})
    return res.json({rows:data})
  }
  if(action==='savePurchaseOrder'){
    const {operation,poId,header,lines,expected}=req.body
    const args={actor:user.id,operation,kind:'purchase_orders',header,lines}
    if(poId){args.target=poId;args.expected=expected}
    const needsReviewer=!poId && user.role!=='admin'
    if(needsReviewer && !req.body.approver)return res.status(400).json({error:'Choose an approving Admin'})
    if(needsReviewer)args.approver=req.body.approver
    const command=poId?'desktop_edit_purchasing_document':needsReviewer?'create_assigned_po':'desktop_create_purchasing_document'
    const {data,error}=await db.rpc(command,args)
    if(error)return res.status(503).json({error:'Could not confirm the save. Retry the same change.'})
    if(data==='unauthorized')return res.status(403).json({error:'Purchasing permission required.'})
    if(data==='conflict')return res.status(409).json({error:'The PO or its source records changed. Reopen the PO before editing.'})
    if(!['applied','already-applied'].includes(data))return res.status(400).json({error:'Check the PO header and line items.'})
    return res.json({id:poId||operation})
  }
  if(action==='readPOPage'){
    const {data,error}=await db.rpc('read_purchase_order_page',{actor:user.id,after_id:req.body.afterId||null,only_id:req.body.poId||null})
    if(error)return res.status(error.code==='42501'?403:503).json({error:'Purchase orders unavailable for this account'})
    return res.json({rows:data.map(row=>row.document)})
  }
  const {poId,approverId}=req.body
  const approve=action==='approveAssignedPO'
  if(approve && user.role!=='admin')return res.status(403).json({error:'Admin approval required'})
  const {data,error}=await db.rpc('review_purchase_order',{actor:user.id,target:poId,approver:approve?user.id:approverId,approve})
  if(error){
    if(error.code==='42501')return res.status(403).json({error:'You do not have permission for this approval.'})
    return res.status(409).json({error:error.code==='P0001'?error.message:'Could not complete this review. Refresh the PO and try again.'})
  }
  return res.json({taskId:data})
}
