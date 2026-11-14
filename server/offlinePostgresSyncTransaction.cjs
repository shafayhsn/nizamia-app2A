'use strict'
// PostgreSQL transactional adapter for offlineSyncApply. No database connection
// is opened here. Caller supplies a trusted pg-compatible pool and must run
// the migration before enabling this adapter.
const TABLES=Object.freeze({
 orders:'orders',
 production_daily_entries:'production_daily_entries'
})
const FIELDS=new Set(['notes','remarks'])
function createPostgresSyncTransaction({pool}){
 if(!pool||typeof pool.connect!=='function')throw Error('Trusted PostgreSQL pool required')
 return async function transaction(work){
  if(typeof work!=='function')throw Error('Transaction callback required')
  const client=await pool.connect()
  let open=false
  try{
   await client.query('BEGIN ISOLATION LEVEL SERIALIZABLE')
   open=true
   const tx={
    async once(id,callback){
     if(typeof id!=='string'||!/^[a-f0-9]{64}$/.test(id)||typeof callback!=='function')
      throw Error('Invalid idempotency request')
     // Advisory transaction lock serializes concurrent retries of the same ID.
     await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))',[id])
     const prior=await client.query('SELECT outcome FROM offline_sync_operations WHERE operation_id = $1',[id])
     if(prior.rows.length)return {decision:'already-applied'}
     const outcome=await callback()
     if(outcome?.decision==='applied')
      await client.query('INSERT INTO offline_sync_operations (operation_id, outcome) VALUES ($1, $2)',[id,'applied'])
     return outcome
    },
    async readForUpdate(table,id){
     if(!Object.hasOwn(TABLES,table)||typeof id!=='string'||!id||id.length>120)
      throw Error('Invalid table or record')
     const result=await client.query('SELECT id, notes, remarks FROM '+TABLES[table]+' WHERE id::text = $1 FOR UPDATE',[id])
     return result.rows[0]||null
    },
    async updateConditional(table,id,before,changes){
     if(!Object.hasOwn(TABLES,table)||typeof id!=='string'||!id||
        !changes||typeof changes!=='object'||Array.isArray(changes)||
        !before||typeof before!=='object'||Array.isArray(before))
      throw Error('Invalid conditional update')
     const fields=Object.keys(changes)
     if(!fields.length||fields.length>2||fields.some(f=>!FIELDS.has(f)||
        !Object.hasOwn(before,f)||typeof changes[f]!=='string'||changes[f].length>2000))
      throw Error('Unsupported conditional fields')
     const args=[id],set=[],conditions=[]
     for(const field of fields){
      args.push(changes[field]);set.push(field+' = $'+args.length)
      args.push(before[field]);conditions.push(field+' IS NOT DISTINCT FROM $'+args.length)
     }
     const sql='UPDATE '+TABLES[table]+' SET '+set.join(', ')+
      ' WHERE id::text = $1 AND '+conditions.join(' AND ')+' RETURNING id'
     const result=await client.query(sql,args)
     return result.rowCount
    }
   }
   const result=await work(tx)
   await client.query('COMMIT')
   open=false
   return result
  }catch(error){
   if(open){try{await client.query('ROLLBACK')}catch{}}
   throw error
  }finally{client.release()}
 }
}
module.exports={createPostgresSyncTransaction}
