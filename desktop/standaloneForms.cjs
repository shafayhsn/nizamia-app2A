'use strict'
// Explicit starter forms for offline business data; optional extra fields may
// be added later without changing the underlying local-only record format.
const FORMS=Object.freeze({
 orders:[['job_number','Job number','text',true],['buyer_name','Buyer','text',true],['style_number','Style number','text'],['total_qty','Order quantity','number'],['status','Status','text'],['ex_factory_date','Ex-factory date','date'],['remarks','Remarks','textarea']],
 tasks:[['title','Task','text',true],['assigned_to','Assigned to','text'],['status','Status','text'],['due_date','Due date','date'],['priority','Priority','text'],['description','Description','textarea']],
 buyers:[['name','Buyer name','text',true],['contact_person','Contact','text'],['email','Email','email'],['phone','Phone','text'],['country','Country','text']],
 suppliers:[['name','Supplier name','text',true],['contact_person','Contact','text'],['email','Email','email'],['phone','Phone','text'],['material_type','Material','text']],
 purchase_orders:[['po_number','PO number','text',true],['supplier_name','Supplier','text',true],['order_id','Order reference','text'],['quantity','Quantity','number'],['status','Status','text'],['delivery_date','Delivery date','date']],
 samples:[['sample_number','Sample number','text',true],['order_id','Order reference','text'],['style_number','Style','text'],['sample_type','Sample type','text'],['status','Status','text'],['due_date','Due date','date']],
 parcels:[['tracking_number','Tracking number','text',true],['courier','Courier','text'],['recipient','Recipient','text'],['dispatch_date','Dispatch date','date'],['status','Status','text']],
 shipments:[['shipment_number','Shipment number','text',true],['order_id','Order reference','text'],['vessel','Vessel','text'],['etd','ETD','date'],['eta','ETA','date'],['status','Status','text']],
 production_daily_entries:[['order_id','Order reference','text',true],['department','Department','text',true],['production_date','Production date','date'],['quantity','Produced quantity','number'],['remarks','Remarks','textarea']]
})
function normalizeForm(table,input){
 const fields=FORMS[table]
 if(!fields||!input||typeof input!=='object'||Array.isArray(input))throw Error('Unsupported business form')
 const result={}
 for(const [key,label,type,required] of fields){
  const value=input[key]
  if(required&&(value==null||String(value).trim()===''))throw Error(label+' is required')
  if(value==null||value==='')continue
  if(type==='number'){
   const number=Number(value)
   if(!Number.isFinite(number)||number<0)throw Error(label+' must be a non-negative number')
   result[key]=number
  }else{
   if(typeof value!=='string'||value.length>4000)throw Error('Invalid '+label)
   if(type==='date'&&!/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(value))throw Error('Invalid '+label)
   if(type==='date' && !Number.isFinite(Date.parse(value+'T00:00:00Z')))throw Error('Invalid '+label)
   result[key]=value.trim()
  }
 }
 // Preserve previously imported custom scalar fields during local edits.
 for(const [key,value] of Object.entries(input)){
  if(!fields.some(([name])=>name===key)&&!['id','_local_only','_local_updated_at'].includes(key))result[key]=value
 }
 return result
}
module.exports={FORMS,normalizeForm}
