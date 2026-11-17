'use strict'
const assert=require('node:assert/strict')
const fs=require('node:fs'),path=require('node:path'),test=require('node:test')
test('Desktop routes web-only parcel and testing calls to local JSON handler',()=>{
 const main=fs.readFileSync(path.join(__dirname,'main.cjs'),'utf8')
 const oms=fs.readFileSync(path.join(__dirname,'offlineOms.cjs'),'utf8')
 const records=fs.readFileSync(path.join(__dirname,'standaloneRecords.cjs'),'utf8')
 assert.match(main,/url.pathname==='\/api\/oms'/)
 for(const name of ['testing_requirements','testing_orders','parcel_invoice_snapshots','feature_assets'])assert.ok(records.includes("'"+name+"'"))
 for(const name of ["action==='testing'","action==='list'","action==='createParcel'","type==='snapshots'"])assert.ok(oms.includes(name))
 assert.ok(oms.includes('501'))
})
