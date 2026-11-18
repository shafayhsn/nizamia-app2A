'use strict'

const {isDeepStrictEqual}=require('node:util')
const matrixTables=['size_groups','size_group_colors','size_group_breakdown']
const summaryFields=['step_po_matrix','total_qty','total_value_usd','excess_cutting_pct','queue_split_rule']

function matrixRows(tables,orderId){
 const groups=tables.size_groups.filter(row=>row.order_id===orderId)
 const ids=new Set(groups.map(row=>row.id))
 return {
  size_groups:groups,
  size_group_colors:tables.size_group_colors.filter(row=>ids.has(row.size_group_id)),
  size_group_breakdown:tables.size_group_breakdown.filter(row=>ids.has(row.size_group_id)),
 }
}

function matrixVisible(tables,orderId,desired){
 const actual=matrixRows(tables,orderId)
 const order=tables.orders.find(row=>row.id===orderId)
 if(!order||!summaryFields.every(key=>order[key]===desired.summary[key]))return false
 if(!matrixTables.every(table=>actual[table].length===desired.rows[table].length))return false
 const matchId=(id,expected)=>expected.startsWith('local-')||id===expected
 const comparable=(row,keys)=>keys.map(key=>row[key]??null)
 const groupKeys=['group_name','unit_price','currency','sizes','base_size','sort_order']
 const colorKeys=['color_name','sort_order','ratio_override','ratio_locked']
 for(const group of desired.rows.size_groups){
  const cloud=actual.size_groups.find(row=>row.sort_order===group.sort_order)
  if(!cloud||!matchId(cloud.id,group.id)||!isDeepStrictEqual(comparable(cloud,groupKeys),comparable(group,groupKeys)))return false
  for(const color of desired.rows.size_group_colors.filter(row=>row.size_group_id===group.id)){
   const cloudColor=actual.size_group_colors.find(row=>row.size_group_id===cloud.id&&row.sort_order===color.sort_order)
   if(!cloudColor||!matchId(cloudColor.id,color.id)||!isDeepStrictEqual(comparable(cloudColor,colorKeys),comparable(color,colorKeys)))return false
   const bySize=rows=>rows.map(row=>[row.size,row.qty]).sort(([a],[b])=>a.localeCompare(b))
   if(!isDeepStrictEqual(bySize(actual.size_group_breakdown.filter(row=>row.color_id===cloudColor.id)),
      bySize(desired.rows.size_group_breakdown.filter(row=>row.color_id===color.id))))return false
  }
 }
 return true
}

module.exports={matrixRows,matrixVisible,matrixTables,summaryFields}
