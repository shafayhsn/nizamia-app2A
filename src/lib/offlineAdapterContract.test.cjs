'use strict'
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path')
const source=fs.readFileSync(path.join(__dirname,'supabase.js'),'utf8')
for(const pattern of [
 /Relational queries are not yet available offline/,
 /Offline creates cannot preserve cloud IDs/,
 /const fields=operation==='create'\?\(Array\.isArray\(payload\)\?\{\.\.\.payload\[0\]\}:\{\.\.\.payload\}\)/,
 /delete fields\._local_only/
])assert.match(source,pattern)
assert.doesNotMatch(source,/if\(fields\)\{delete fields\.id;/)
process.stdout.write('Offline query adapter contract guards passed.\\n')
