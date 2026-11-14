'use strict'
const assert=require('node:assert/strict')
const {reconcileSyncResults}=require('./offlineSyncReconciliation.cjs')
const drafts=[{draftId:'a'},{draftId:'b'},{draftId:'c'},{draftId:'d'},{draftId:'e'}]
const results=[
 {draftId:'a',decision:'applied'},
 {draftId:'b',decision:'already-applied'},
 {draftId:'c',decision:'conflict',reason:'cloud-field-changed'},
 {draftId:'d',decision:'blocked'},
 {draftId:'e',decision:'error'}
]
const actions=reconcileSyncResults(drafts,results)
assert.deepEqual(actions.map(x=>x.action),[
 'archive-applied','archive-applied','mark-conflict','retain-locked','retain-retryable'
])
assert.equal(actions[2].reason,'cloud-field-changed')
assert.throws(()=>reconcileSyncResults(drafts,[...results.slice(0,4),results[0]]),/Untrusted/)
assert.throws(()=>reconcileSyncResults(drafts,[...results.slice(0,4),{draftId:'unknown',decision:'applied'}]),/Untrusted/)
assert.throws(()=>reconcileSyncResults(drafts,[...results.slice(0,4),{draftId:'e',decision:'unknown'}]),/Invalid/)
assert.throws(()=>reconcileSyncResults(drafts,[]),/Invalid/)
process.stdout.write('Offline sync queue reconciliation tests passed.\n')
