'use strict'

const flags={
 bom_items:'step_bom',fitting_blocks:'step_fitting',samples:'step_sampling',washing:'step_washing',
 embellishments:'step_embellishment',finishing:'step_finishing',order_processes:'step_processes',
}

function planCopy(load,source,target,sections,newId){
 const children={},changes={},skipped=[]
 const groups=load('size_groups')
 const locateGroup=id=>{
  const old=groups.find(row=>row.id===id&&row.order_id===source)
  const matches=old?groups.filter(row=>row.order_id===target&&row.group_name===old.group_name):[]
  if(matches.length!==1)throw Error('Match the destination size groups before copying.')
  return matches[0].id
 }
 const copyRow=(row,drop=[])=>{
  const skip=new Set(['id','order_id','created_at','updated_at',...drop])
  return {...Object.fromEntries(Object.entries(row).filter(([key])=>!skip.has(key))),id:newId(),order_id:target}
 }
 for(const table of sections){
  const relevant=load(table)
  const sourceRows=relevant.filter(row=>row.order_id===source)
  if(!sourceRows.length||relevant.some(row=>row.order_id===target)){skipped.push(table);continue}
  if(table==='finishing'){
   if(sourceRows.length!==1)throw Error('The source has more than one Finishing record.')
   const header=copyRow(sourceRows[0]),queues=load('order_queues')
   children.finishing=[header]
   children.finishing_packs=load('finishing_packs').filter(row=>row.finishing_id===sourceRows[0].id).map(row=>{
    const pack={...copyRow(row,['finishing_id']),finishing_id:header.id}
    if((pack.packing_basis||pack.pack_type)==='By Q#'&&Array.isArray(pack.config?.lines)){
     pack.config={...pack.config,lines:pack.config.lines.map(line=>{
      const original=queues.find(q=>q.order_id===source&&(q.id===line.key||q.q_number===line.key))
      const matches=original?queues.filter(q=>q.order_id===target&&q.label===original.label&&q.sort_order===original.sort_order&&q.qty===original.qty):[]
      if(matches.length!==1)throw Error('Match the destination queues before copying packing.')
      return {...line,key:matches[0].id}
     })}
    }
    return pack
   })
  }else children[table]=sourceRows.map(row=>{
   if(table==='samples'){
    const copy=copyRow(row,['sample_number','parent_sample_id','root_sample_id','last_comment_at','last_comment_by','size_group_id'])
    return {...copy,sample_number:'OFFLINE-'+copy.id.slice(0,8),size_group_id:row.size_group_id?locateGroup(row.size_group_id):null}
   }
   if(table==='washing'&&row.color_id){
    const colors=load('size_group_colors')
    const original=colors.find(color=>color.id===row.color_id)
    const group=original&&locateGroup(original.size_group_id)
    const matches=colors.filter(color=>color.size_group_id===group&&color.color_name===original?.color_name)
    if(matches.length!==1)throw Error('Match the destination colours before copying Washing.')
    return {...copyRow(row),color_id:matches[0].id}
   }
   return copyRow(row)
  })
  changes[flags[table]]=true
 }
 return {children,changes,skipped}
}

module.exports={flags,planCopy}
