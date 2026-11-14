'use strict'
// Explicit starter forms for offline business data; optional extra fields may
// be added later without changing the underlying local-only record format.
const FORMS=Object.freeze({
 orders:[['job_number','Job number','text',true],['buyer_name','Buyer','text',true],['style_number','Style number','text'],['buyer_po_number','Buyer PO','text'],['destination','Destination','text'],['fabric','Fabric','text'],['color','Color','text'],['total_qty','Order quantity','number'],['status','Status','text'],['order_date','Order date','date'],['ex_factory_date','Ex-factory date','date'],['remarks','Remarks','textarea']],
 tasks:[['title','Task','text',true],['assigned_to','Assigned to','text'],['status','Status','text'],['due_date','Due date','date'],['priority','Priority','text'],['description','Description','textarea']],
 buyers:[['name','Buyer name','text',true],['contact_person','Contact','text'],['email','Email','email'],['phone','Phone','text'],['country','Country','text']],
 suppliers:[['name','Supplier name','text',true],['contact_person','Contact','text'],['email','Email','email'],['phone','Phone','text'],['material_type','Material','text']],
 purchase_orders:[['po_number','PO number','text',true],['supplier_name','Supplier','text',true],['order_id','Order reference','text'],['quantity','Quantity','number'],['unit_price','Unit price','number'],['material','Material','text'],['status','Status','text'],['order_date','PO date','date'],['delivery_date','Delivery date','date']],
 samples:[['sample_number','Sample number','text',true],['order_id','Order reference','text'],['style_number','Style','text'],['sample_size','Sample size','text'],['sample_type','Sample type','text'],['status','Status','text'],['due_date','Due date','date']],
 parcels:[['tracking_number','Tracking number','text',true],['courier','Courier','text'],['recipient','Recipient','text'],['dispatch_date','Dispatch date','date'],['status','Status','text']],
 shipments:[['shipment_number','Shipment number','text',true],['order_id','Order reference','text'],['vessel','Vessel','text'],['quantity','Shipped quantity','number'],['container_number','Container','text'],['booking_number','Booking','text'],['etd','ETD','date'],['eta','ETA','date'],['status','Status','text']],
 production_daily_entries:[['order_id','Order reference','text',true],['department','Department','text',true],['production_date','Production date','date'],['quantity','Produced quantity','number'],['line','Production line','text'],['shift','Shift','text'],['remarks','Remarks','textarea']]
})
function validCalendarDate(value){
 if(!/^\d{4}-\d{2}-\d{2}$/.test(value))return false
 const [year,month,day]=value.split('-').map(Number)
 const date=new Date(Date.UTC(year,month-1,day))
 return year>=1000&&date.getUTCFullYear()===year&&date.getUTCMonth()===month-1&&date.getUTCDate()===day
}
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
   if(type==='date'&&!validCalendarDate(value))throw Error('Invalid '+label)
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
