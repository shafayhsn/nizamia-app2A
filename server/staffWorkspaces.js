import { staffWorkflow } from '../src/lib/staffRoles.js'
import { fulfillment } from './fulfillment.js'

const sampleStages = ['Not Started','Pattern','Cutting','Stitching','Washing','Finishing','Ready']
const departments = ['Cutting','Stitching','Washing','Back Process','Finishing','Packing','Embroidery','Printing','Other']
const movementDepartments = new Set(['Washing','Embroidery','Printing','Other'])
const uuid = value => typeof value === 'string' && /^[a-f\d]{8}-(?:[a-f\d]{4}-){3}[a-f\d]{12}$/i.test(value)
const day = value => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)
const today = () => new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Karachi'}).format(new Date())

export async function staffWorkspace(req,res,db,user,action) {
  const role = String(user.role).toLowerCase()
  const error = (status,message) => res.status(status).json({error:message})
  const workflow = staffWorkflow(role)
  if(!workflow)return error(403,'Staff workflow access required.')
  if(['session','accountProfile'].includes(action)){
    return res.json({ok:true,user:{id:user.id,username:user.username,email:user.email,role,role_id:user.role_id}})
  }
  if(req.method!=='POST')return error(405,'Method not allowed.')
  const body=req.body || {}
  if(role==='storekeeper' && ['readPoReceiving','postPoReceiving'].includes(action)){
    if(action==='readPoReceiving' && !uuid(body.target))return error(400,'Select an eligible purchase order.')
    return fulfillment(req,res,db,user,action)
  }
  async function rpc(name,args) {
    const result = await db.rpc(name,{actor:user.id,...args})
    if(result.error?.code==='42501'||result.data==='unauthorized')return error(403,'This action is restricted.')
    if(result.error)return error(503,'Could not confirm the request. Check your connection and retry.')
    if(result.data==='invalid')return error(400,'Check the entry details.')
    if(result.data==='conflict')return error(409,'This record changed. Refresh before retrying.')
    return res.json({ok:true,data:result.data})
  }
  if(role==='storekeeper'&&action==='staffReceivingList'){
    if(body.afterId!=null&&!uuid(body.afterId))return error(400,'Invalid page.')
    return rpc('staff_receiving_list',{after_id:body.afterId??null})
  }
  if(role==='production_incharge'){
    if(action==='staffProductionList'){
      if(body.afterId!=null&&!uuid(body.afterId))return error(400,'Invalid page.')
      return rpc('staff_production_list',{after_id:body.afterId??null})
    }
    if(action==='staffProductionLog'){
      const {operation,orderId,groupId,colorId,department,movement,date,place,quantity}=body
      if(![operation,orderId,groupId,colorId].every(uuid)||!departments.includes(department)||
        !['completed','sent','received'].includes(movement)||(movement!=='completed'&&!movementDepartments.has(department))||
        !day(date)||date>today()||typeof place!=='string'||place.length>150||
        !Number.isSafeInteger(quantity)||quantity<1||quantity>999999999)return error(400,'Check the entry details.')
      return rpc('desktop_create_production_entry',{operation,payload:{order_id:orderId,size_group_id:groupId,color_id:colorId,
        department,movement,production_date:date,production_at:place.trim()||null,quantity}})
    }
  }
  if(role==='sample_room'){
    if(action==='staffSamplingList'){
      if(body.afterId!=null&&!uuid(body.afterId))return error(400,'Invalid page.')
      let query=db.from('samples').select('id,sample_number,sample_type,version_label,stage,dispatch_status')
        .order('id').limit(100)
      if(body.afterId)query=query.gt('id',body.afterId)
      const result=await query
      return result.error?error(503,'Could not load samples.'):res.json({data:result.data})
    }
    if(action==='staffSampleStage'){
      const {operation,sampleId,previousStage,stage}=body
      if(!uuid(operation)||!uuid(sampleId)||!sampleStages.includes(stage)||
        (previousStage!==null&&!sampleStages.includes(previousStage)))return error(400,'Choose a valid sample stage.')
      return rpc('desktop_update_sample_stage',{operation,target_sample:sampleId,previous_stage:previousStage,new_stage:stage})
    }
    if(action==='staffSamplingProgram'){
      if(!uuid(body.sampleId))return error(400,'Select a sample.')
      const {data:sample,error:sampleError}=await db.from('samples')
        .select('id,order_id,sample_number,sample_type,version_label,version_no,created_at,requested_date,due_date,req_pcs,size_group_name,base_size,sizes,size,colours,color,wash_snapshot,stage')
        .eq('id',body.sampleId).maybeSingle()
      if(sampleError)return error(503,'Could not load this sample.')
      if(!sample?.order_id)return error(404,'No order is linked to this sample.')
      const [order,bom,fits]=await Promise.all([
        db.from('orders').select('id,job_number,style_number,buyer_name,merchandiser_name,description,factory_ref,style_image_url,style_image_base64').eq('id',sample.order_id).maybeSingle(),
        db.from('bom_items').select('order_id,category,name,specification,detail,usage_rule,usage_data,base_qty,unit,sort_order').eq('order_id',sample.order_id).order('sort_order'),
        db.from('fitting_blocks').select('order_id,spec_code').eq('order_id',sample.order_id),
      ])
      if([order,bom,fits].some(result=>result.error))return error(503,'Could not prepare the sampling program.')
      if(!order.data)return error(404,'The linked order is unavailable.')
      return res.json({row:{...sample,dueDate:sample.due_date,order:order.data,buyer:{},meta:{}},bomItems:bom.data,fittingBlocks:fits.data})
    }
  }
  return error(403,'This action is outside your assigned workspace.')
}
