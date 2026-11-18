const relationships={
 purchase_orders:{purchase_order_items:{parent:'id',child:'po_id',many:true}},
 work_orders:{work_order_items:{parent:'id',child:'wo_id',many:true}},
 bom_presets:{bom_preset_items:{parent:'id',child:'preset_id',many:true}},
 bom_preset_items:{library_items:{parent:'library_item_id',child:'id',many:false}},
}

function splitColumns(columns){
 const fields=[]
 let start=0,depth=0
 for(let i=0;i<columns.length;i++){
  if(columns[i]==='(')depth++
  if(columns[i]===')')depth--
  if(depth<0||depth>4)throw Error('Unsupported offline projection')
  if(!depth&&columns[i]===','){fields.push(columns.slice(start,i).trim());start=i+1}
 }
 if(depth)throw Error('Invalid offline projection')
 return [...fields,columns.slice(start).trim()]
}

export async function projectOfflineRows(table,rows,columns,loadRows){
 if(columns==='*')return rows
 const fields=splitColumns(columns)
 const joined=new Map()
 for(const field of fields){
  if(field==='*'||/^[a-z][a-z0-9_]*$/i.test(field))continue
  const match=/^([a-z][a-z0-9_]*)\(([\s\S]+)\)$/i.exec(field)
  const name=match?.[1]
  const options=Object.hasOwn(relationships,table)?relationships[table]:{}
  const relation=Object.hasOwn(options,name)?options[name]:null
  if(!relation)throw Error('Unsupported offline relationship: '+field)
  const parents=new Set(rows.map(row=>row[relation.parent]).filter(key=>key!=null).map(String))
  const children=parents.size?(await loadRows(name)).filter(row=>row[relation.child]!=null&&parents.has(String(row[relation.child]))):[]
  const projected=await projectOfflineRows(name,children,match[2].trim(),loadRows)
  const groups=new Map()
  children.forEach((row,index)=>{
   const key=String(row[relation.child])
   if(!groups.has(key))groups.set(key,[])
   groups.get(key).push(projected[index])
  })
  joined.set(field,{name,relation,groups})
 }
 return rows.map(row=>{
  const result=fields.includes('*')?{...row}:{}
  for(const field of fields){
   if(field==='*')continue
   const join=joined.get(field)
   if(!join){result[field]=row[field];continue}
   const matches=row[join.relation.parent]==null?[]:join.groups.get(String(row[join.relation.parent]))||[]
   result[join.name]=join.relation.many?matches:matches[0]||null
  }
  return result
 })
}
