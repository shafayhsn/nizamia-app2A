'use strict'

const primaryKeys=Object.freeze({
 counters:'key',
 settings:'key',
 parcel_invoice_snapshots:'parcel_id',
 production_batch_orders:'order_id'
})

async function readSnapshotTable(db,table,{pageSize=1000,maxRows=100000,filter=q=>q}={}){
 const directory=table==='desktop_task_assignees'
 const source=directory?'users':table
 const fields=directory?'id,username':'*'
 const select=(fields,options)=>{
  const q=db.from(source).select(fields,options)
  return filter(directory?q.eq('is_active',true):q)
 }
 const key=primaryKeys[table]||'id'
 const rows=[]
 const seen=new Set()
 let cursor,total
 do{
  let query=select(fields,{count:'exact'}).order(key,{ascending:true}).limit(pageSize)
  if(cursor!==undefined)query=query.gt(key,cursor)
  const {data,count,error}=await query
  if(error||!Array.isArray(data)||!Number.isSafeInteger(count)||count<0||
     count+rows.length>maxRows||data.length>count||data.length>pageSize)
   throw Error('Cloud snapshot query failed')
  if(total===undefined)total=count
  if(count+rows.length!==total||(!data.length&&count))
   throw Error('Cloud snapshot changed during pagination')
  for(const row of data){
   const id=row?.[key]
   if(!['string','number'].includes(typeof id)||id===''||seen.has(id))
    throw Error('Cloud snapshot contains an invalid or repeated primary key')
   seen.add(id)
   cursor=id
   rows.push(row)
  }
 }while(rows.length<total)
 // A new row before the cursor can evade a remaining-row count check.
 const {count,error}=await select(key,{count:'exact',head:true})
 if(error||count!==total)throw Error('Cloud snapshot count changed')
 return rows
}

module.exports={readSnapshotTable,primaryKeys}
