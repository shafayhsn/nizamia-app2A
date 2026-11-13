'use strict'
const assert=require('node:assert/strict')
const fs=require('node:fs')
const path=require('node:path')
const {PAGES,REQUIREMENTS}=require('./offlinePageCoverage.cjs')
const ui=fs.readFileSync(path.join(__dirname,'../src/offlineDesktop.jsx'),'utf8')
const backend=fs.readFileSync(path.join(__dirname,'snapshotViewer.cjs'),'utf8')
for(const page of PAGES){
 assert.match(ui,new RegExp("key: '"+page+"'"),'Missing offline navigation: '+page)
 assert.match(backend,new RegExp("\\b"+page+": \\["),'Missing offline module overview: '+page)
 assert.ok(REQUIREMENTS[page]?.length,'Missing workflow checklist: '+page)
}
assert.equal(new Set(PAGES).size,PAGES.length)
assert.ok(REQUIREMENTS.reports.includes('QMS formats'))
assert.ok(REQUIREMENTS.reports.includes('Excel'))
assert.ok(REQUIREMENTS.production.includes('department tracking'))
assert.ok(REQUIREMENTS.orders.includes('size breakdown'))
process.stdout.write('All '+PAGES.length+' OMS page navigation contracts present; workflow parity still pending.\n')
