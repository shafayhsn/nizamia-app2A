'use strict'
// Explicit readiness gates for offline business writes and cloud synchronization.
// This is a diagnostic only. It never grants permissions or modifies records.
const REQUIRED=['signedEnrollment','pinnedServerKey','authenticatedSession','scopedEditGrant','snapshotIntegrity','serverSyncEndpoint','conditionalCloudWrites']
function assessOfflineReadiness(evidence={}){
 const checks={
  signedEnrollment:evidence.signedEnrollment===true,
  pinnedServerKey:evidence.pinnedServerKey===true,
  authenticatedSession:evidence.authenticatedSession===true,
  scopedEditGrant:evidence.scopedEditGrant===true,
  snapshotIntegrity:evidence.snapshotIntegrity===true,
  serverSyncEndpoint:evidence.serverSyncEndpoint===true,
  conditionalCloudWrites:evidence.conditionalCloudWrites===true
 }
 const missing=REQUIRED.filter(key=>!checks[key])
 return Object.freeze({
  checks:Object.freeze(checks),
  missing:Object.freeze(missing),
  readyForDrafts:checks.signedEnrollment&&checks.pinnedServerKey&&checks.authenticatedSession&&checks.scopedEditGrant&&checks.snapshotIntegrity,
  readyForSync:missing.length===0,
  mode:missing.length?'locked':'eligible-for-trusted-authorization',
  note:'This report does not authorize an edit. Every mutation still requires independent signed grant and authenticated server-side checks.'
 })
}
module.exports={REQUIRED,assessOfflineReadiness}
