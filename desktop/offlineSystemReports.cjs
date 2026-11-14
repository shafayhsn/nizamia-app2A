'use strict'
// Data-driven operational reports, calculated from imported OMS records.
// Missing fields are reported as unavailable, never fabricated or counted as zero.
const {readLocalRows}=require('./standaloneRecords.cjs')
const DEFINITIONS = Object.freeze([
 {key:'orders_by_buyer',title:'Orders by buyer',table:'orders',group:['buyer_name','buyer','customer_name','customer','buyer_id'],quantity:['quantity','total_quantity','order_quantity','qty']},
 {key:'orders_by_status',title:'Orders by status',table:'orders',group:['status','order_status'],quantity:['quantity','total_quantity','order_quantity','qty']},
 {key:'production_by_department',title:'Production by department',table:'production_daily_entries',group:['department','dept','department_name'],quantity:['quantity','produced_qty','production_qty','output_qty','qty','pieces']},
 {key:'production_by_date',title:'Daily production',table:'production_daily_entries',group:['production_date','entry_date','date'],quantity:['quantity','produced_qty','production_qty','output_qty','qty','pieces']},
 {key:'purchasing_by_supplier',title:'Purchasing by supplier',table:'purchase_orders',group:['supplier_name','supplier','vendor_name','supplier_id'],quantity:['quantity','total_quantity','qty']},
 {key:'purchasing_by_status',title:'Purchasing by status',table:'purchase_orders',group:['status','po_status'],quantity:['quantity','total_quantity','qty']},
 {key:'tasks_by_status',title:'Tasks by status',table:'tasks',group:['status','task_status'],quantity:[]},
 {key:'tasks_by_assignee',title:'Tasks by assignee',table:'tasks',group:['assigned_to_name','assignee_name','assigned_to','assignee','owner'],quantity:[]}
])
function systemReport(db,key) {
 const def=DEFINITIONS.find(d=>d.key===key)
 if(!def) throw new Error('Unknown operational report')
 const present=db.exec('SELECT 1 FROM snapshot_manifest WHERE table_name = ?',[def.table])
 const local=readLocalRows(db,def.table)
 if(!present.length&&!local.length) return {key,title:def.title,table:def.table,available:false,reason:'Source table not in imported snapshot or standalone records',rows:[],totalRecords:0,quantityAvailable:false}
 const stmt=present.length?db.prepare('SELECT row_json FROM snapshot_rows WHERE table_name = ? ORDER BY row_index'):null
 const grouped=new Map(), fields=new Set()
 let totalRecords=0, quantityAvailable=false
 try {
  if(stmt)stmt.bind([def.table])
  const source=[]
  if(stmt)while(stmt.step())source.push(JSON.parse(stmt.get()[0]))
  source.push(...local)
  for(const row of source){
   if(++totalRecords>100000) throw new Error('Report source exceeds 100,000 records')
   if(!row || typeof row!=='object' || Array.isArray(row)) continue
   Object.keys(row).forEach(k=>fields.add(k))
   const groupKey=def.group.find(k=>row[k]!=null && String(row[k]).trim())
   const group=groupKey ? String(row[groupKey]).slice(0,160) : 'Unspecified'
   const entry=grouped.get(group)||{group,records:0,quantity:0,quantityRecords:0}
   entry.records++
   const quantityKey=def.quantity.find(k=>row[k]!=null && row[k]!=='')
   if(quantityKey) {
    const value=Number(row[quantityKey])
    if(Number.isFinite(value) && value>=0) {
     entry.quantity+=value;entry.quantityRecords++;quantityAvailable=true
    }
   }
   grouped.set(group,entry)
  }
 } finally {if(stmt)stmt.free()}
 const groupField=def.group.find(k=>fields.has(k))||null
 const rows=[...grouped.values()].sort((a,b)=>b.records-a.records||a.group.localeCompare(b.group))
 return {key,title:def.title,table:def.table,available:Boolean(groupField),reason:groupField?null:'Required grouping field missing in snapshot',groupField,rows:groupField?rows:[],totalRecords,quantityAvailable,localRecords:local.length}
}
module.exports={DEFINITIONS,systemReport}
