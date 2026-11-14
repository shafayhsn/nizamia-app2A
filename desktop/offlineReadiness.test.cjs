'use strict'
const assert=require('node:assert/strict')
const {assessOfflineReadiness,REQUIRED}=require('./offlineReadiness.cjs')
assert.equal(REQUIRED.length,7)
const none=assessOfflineReadiness()
assert.equal(none.readyForDrafts,false)
assert.equal(none.readyForSync,false)
assert.equal(none.missing.length,7)
const enrolled=assessOfflineReadiness({signedEnrollment:true,authenticatedSession:true})
assert.equal(enrolled.readyForDrafts,false)
assert.equal(enrolled.readyForSync,false)
const draft=assessOfflineReadiness({
 signedEnrollment:true,pinnedServerKey:true,authenticatedSession:true,
 scopedEditGrant:true,snapshotIntegrity:true
})
assert.equal(draft.readyForDrafts,true)
assert.equal(draft.readyForSync,false)
const all=assessOfflineReadiness(Object.fromEntries(REQUIRED.map(k=>[k,true])))
assert.equal(all.readyForSync,true)
assert.equal(all.missing.length,0)
assert.throws(()=>{all.checks.signedEnrollment=false},TypeError)
process.stdout.write('Offline editing and synchronization readiness gates passed.\n')
