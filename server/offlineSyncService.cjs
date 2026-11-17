'use strict'
// Composition root for offline sync HTTP -> authenticated security -> conditional apply.
// Nothing is mounted or enabled until trusted server providers are explicitly injected.
const {createOfflineSyncSecurity}=require('./offlineSyncSecurity.cjs')
const {createOfflineSyncApply}=require('./offlineSyncApply.cjs')
const {createOfflineSyncHttpHandler}=require('./offlineSyncHttpHandler.cjs')
function createOfflineSyncService({verifyBearer,loadUser,loadPermissions,transaction,maxBodyBytes}){
 if(typeof transaction!=='function')throw Error('Trusted transactional storage required')
 const security=createOfflineSyncSecurity({verifyBearer,loadUser,loadPermissions})
 const apply=createOfflineSyncApply({
  authenticate:security.authenticate,
  authorize:security.authorize,
  transaction
 })
 return createOfflineSyncHttpHandler({apply,maxBodyBytes})
}
module.exports={createOfflineSyncService}
