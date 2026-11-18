'use strict'

const {createHash}=require('node:crypto')
const {isDeepStrictEqual}=require('node:util')

function canonical(value){
 if(Array.isArray(value))return value.map(canonical)
 if(value&&typeof value==='object')
  return Object.fromEntries(Object.keys(value).sort().map(key=>[key,canonical(value[key])]))
 return value
}

function tableExists(db,table){
 return db.exec("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?",[table]).length>0
}

function fingerprint(intent){
 return createHash('sha256').update(JSON.stringify(canonical(intent))).digest('hex')
}

function readBase(db,table,id){
 const rows=db.exec("SELECT row_json FROM snapshot_rows WHERE table_name=? AND CAST(json_extract(row_json,'$.id') AS TEXT)=?",[table,id])[0]?.values||[]
 if(rows.length!==1)return null
 return JSON.parse(rows[0][0])
}

function createMutationIntent(table,id,fields,createdAt,editedAt,document){
 const intent={operation:'create',table,id,fields,createdAt,editedAt,...(document?{document}:{})}
 return {...intent,fingerprint:fingerprint(intent)}
}

function updateMutationIntent(table,id,changes,expected,editedAt,historyRecord,document){
 const intent={operation:'update',table,id,changes,expected,editedAt,...(historyRecord?{historyRecord}:{}),...(document?{document}:{})}
 return {...intent,fingerprint:fingerprint(intent)}
}

function inspectPendingMutations(db){
 const mutations=[],blocked=[]
 if(tableExists(db,'standalone_records')){
  const records=db.exec('SELECT table_name,id,fields_json,created_at,updated_at FROM standalone_records ORDER BY created_at,table_name,id')[0]?.values||[]
  for(const [table,id,json,createdAt,editedAt] of records){
   mutations.push(createMutationIntent(table,id,JSON.parse(json),createdAt,editedAt))
  }
 }

 if(tableExists(db,'snapshot_edits')){
  const edits=db.exec('SELECT table_name,record_id,fields_json,updated_at FROM snapshot_edits ORDER BY updated_at,table_name,record_id')[0]?.values||[]
  for(const [table,id,json,editedAt] of edits){
   const base=tableExists(db,'snapshot_rows')?readBase(db,table,id):null
   if(!base){blocked.push({table,id,reason:'missing-or-ambiguous-base'});continue}
   if(json===null){
    const intent={operation:'delete',table,id,expected:base,editedAt}
    mutations.push({...intent,fingerprint:fingerprint(intent)})
    continue
   }
   const local=JSON.parse(json)
   const changed=Object.entries(local).filter(([key,value])=>key!=='id'&&!isDeepStrictEqual(value,base[key]))
   if(!changed.length)continue
   const missing=changed.filter(([key])=>!Object.hasOwn(base,key)).map(([key])=>key)
   if(missing.length){blocked.push({table,id,reason:'missing-base-fields',fields:missing});continue}
   mutations.push(updateMutationIntent(table,id,Object.fromEntries(changed),
    Object.fromEntries(changed.map(([key])=>[key,base[key]])),editedAt))
  }
 }
 return {mutations,blocked}
}

module.exports={inspectPendingMutations,createMutationIntent,updateMutationIntent}
