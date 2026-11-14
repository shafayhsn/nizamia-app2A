'use strict'
// Search imported and standalone offline records without exposing sensitive fields.
const {TABLES:LOCAL_TABLES,readLocalRows}=require('./standaloneRecords.cjs')
// Never query credentials or execute user-provided SQL.
function searchSnapshot(db, query, limit = 100) {
  if (typeof query !== 'string' || query.trim().length < 2 || query.length > 120)
    throw new Error('Search requires 2–120 characters')
  if (!Number.isInteger(limit) || limit < 1 || limit > 200)
    throw new Error('Invalid search limit')
  const needle = query.trim().toLocaleLowerCase()
  const matches = [], counts = {}
  const allowed = new Set((db.exec('SELECT table_name FROM snapshot_manifest')[0]?.values || [])
    .map(r=>r[0]).filter(n=>typeof n==='string' && /^[a-z][a-z0-9_]*$/.test(n) &&
      !/(auth|password|secret|credential|token|session|permission|role|user)/i.test(n)))
  const stmt = db.prepare('SELECT table_name,row_json FROM snapshot_rows ORDER BY table_name,row_index')
  let scanned=0
  try {
    while (stmt.step()) {
      const [table,json]=stmt.get()
      if (!allowed.has(table)) continue
      scanned++
      if (scanned > 100000) throw new Error('Snapshot search limit exceeded')
      const row=JSON.parse(json)
      if (!row || typeof row !== 'object' || Array.isArray(row)) continue
      const found=Object.entries(row).some(([key,value]) =>
        !/(password|secret|credential|token|hash|salt|private_key)/i.test(key) &&
        String(value ?? '').toLocaleLowerCase().includes(needle))
      if (!found) continue
      counts[table]=(counts[table]||0)+1
      if (matches.length < limit) {
        const safe=Object.fromEntries(Object.entries(row).filter(([key]) =>
          !/(password|secret|credential|token|hash|salt|private_key)/i.test(key)))
        matches.push({table,record:safe})
      }
    }
  } finally { stmt.free() }
  for(const table of LOCAL_TABLES){
    for(const row of readLocalRows(db,table)){
      scanned++
      if(scanned>100000)throw Error('Offline search limit exceeded')
      const safe=Object.fromEntries(Object.entries(row).filter(([key])=>!/(password|secret|credential|token|hash|salt|private_key)/i.test(key)))
      if(!Object.values(safe).some(value=>String(value??'').toLocaleLowerCase().includes(needle)))continue
      counts[table]=(counts[table]||0)+1
      if(matches.length<limit)matches.push({table,record:safe})
    }
  }
  return {query:query.trim(),matches,counts,total:Object.values(counts).reduce((a,b)=>a+b,0),truncated:Object.values(counts).reduce((a,b)=>a+b,0)>limit}
}
module.exports={searchSnapshot}
