'use strict'
// Pure, local-only snapshot refresh. Never touches Supabase or local draft tables.
// Call only with a fully validated, authenticated snapshot and a verified backup.
function mergeSnapshotRows(db,tables,{excludedTables=[]}={}){
 if(!db||typeof db.run!=='function'||!tables||typeof tables!=='object'||Array.isArray(tables))throw Error('Validated snapshot required')
 const excluded=new Set(excludedTables)
 const names=Object.keys(tables)
 if(!names.length)throw Error('Empty snapshot refused')
 for(const name of names){
  if(!/^[a-z][a-z0-9_]*$/.test(name)||!Array.isArray(tables[name]))throw Error('Invalid snapshot table')
  for(const row of tables[name])if(!row||typeof row!=='object'||Array.isArray(row))throw Error('Invalid snapshot row')
 }
 // Only snapshot_rows and snapshot_manifest are modified. Preserve standalone_records,
 // snapshot_edits, and offline_draft_journal unchanged, including pending/conflicts.
 db.run('CREATE TABLE IF NOT EXISTS snapshot_rows (table_name TEXT NOT NULL,row_index INTEGER NOT NULL,row_json TEXT NOT NULL,PRIMARY KEY(table_name,row_index))')
 db.run('CREATE TABLE IF NOT EXISTS snapshot_manifest (table_name TEXT PRIMARY KEY NOT NULL,row_count INTEGER NOT NULL)')
 db.run('BEGIN TRANSACTION')
 try{
  const insert=db.prepare('INSERT INTO snapshot_rows(table_name,row_index,row_json) VALUES (?,?,?)')
  const manifest=db.prepare('INSERT INTO snapshot_manifest(table_name,row_count) VALUES (?,?)')
  try{
   for(const name of names){
    if(excluded.has(name))continue
    db.run('DELETE FROM snapshot_rows WHERE table_name=?',[name])
    db.run('DELETE FROM snapshot_manifest WHERE table_name=?',[name])
    tables[name].forEach((row,index)=>insert.run([name,index,JSON.stringify(row)]))
    manifest.run([name,tables[name].length])
   }
  }finally{insert.free();manifest.free()}
  db.run('COMMIT')
 }catch(error){db.run('ROLLBACK');throw error}
 return {updatedTables:names.filter(name=>!excluded.has(name)).length}
}
module.exports={mergeSnapshotRows}
