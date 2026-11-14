'use strict'
// Protect the original business screens from regressions in offline table coverage.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path')
const root=path.join(__dirname,'..')
const adapter=fs.readFileSync(path.join(root,'src/lib/supabase.js'),'utf8')
const backend=fs.readFileSync(path.join(__dirname,'standaloneRecords.cjs'),'utf8')
const main=fs.readFileSync(path.join(__dirname,'main.cjs'),'utf8')
const tableList=source=>{const line=source.split('\n').find(x=>x.includes('const offlineTables = new Set(')||x.includes('const TABLES=new Set('));assert.ok(line,'Offline table registry missing');return new Set([...line.matchAll(/'([^']+)'/g)].map(x=>x[1]))}
const clientTables=tableList(adapter),serverTables=tableList(backend)
for(const name of ["Orders","Production","Purchasing","Shipping","Reports","DirectShipment","CustomReportBuilder"]){
 const file=path.join(root,'src/pages',name+'.jsx'),source=fs.readFileSync(file,'utf8')
 const tables=[...source.matchAll(/supabase\s*\.from\(\s*['\"]([a-z_]+)['\"]\s*\)/g)].map(x=>x[1])
 assert.ok(tables.length>0,name+' has no discovered queries')
 for(const table of tables){assert.ok(clientTables.has(table),name+' offline adapter missing '+table);assert.ok(serverTables.has(table),name+' SQLite missing '+table)}
}
for(const route of ['/api/offline/records','/api/offline/mutate','/api/offline/batch','/api/offline/mutate-batch','/api/offline/upsert-batch'])assert.ok(main.includes(route),'Missing desktop API '+route)
for(const method of ['select:','insert:','update:','delete:','upsert:','eq:','in:','order:','range:','single:','maybeSingle:'])assert.ok(adapter.includes(method),'Missing offline query method '+method)
assert.ok(backend.includes('BEGIN TRANSACTION'),'Atomic SQLite transactions missing')
assert.ok(backend.includes('ROLLBACK'),'SQLite rollback missing')
assert.ok(adapter.includes('onConflict'),'Shipping and production conflict-key upserts missing')
assert.ok(adapter.includes("operation==='update'?{...payload}:null"),'Offline updates must send only changed fields to preserve imported rows')
assert.ok(!adapter.includes("filter(k=>/^[a-z][a-z0-9_]*$/.test(k))"),'Invalid conflict columns must not be silently discarded')
const reportSource=fs.readFileSync(path.join(root,'src/pages/Reports.jsx'),'utf8')
assert.ok(reportSource.includes("location.protocol === 'app2a:'"),'Offline PDF fallback missing')
assert.ok(reportSource.includes('popup.print()'),'Native offline PDF print path missing')
process.stdout.write('Original Orders, Purchasing, Production, Shipping and Reports offline contract passed.\n')
