'use strict'
// Backend-only composition of the existing OMS signed session and Postgres
// transaction adapter. Fail closed unless explicitly enabled by server config.
// This module does not create a pool, expose an endpoint or change any data.
const {createOmsSyncSecurity}=require('./offlineOmsSyncSecurity.cjs')
const {createPostgresSyncTransaction}=require('./offlinePostgresSyncTransaction.cjs')
const {createOfflineSyncApply}=require('./offlineSyncApply.cjs')
const {createOfflineSyncHttpHandler}=require('./offlineSyncHttpHandler.cjs')
function createOmsPostgresSyncService({secret,db,pool,enabled=false,maxBodyBytes}){
 if(enabled!==true)return async()=>({status:503,body:{error:'Cloud synchronization is not enabled'}})
 if(!pool||typeof pool.connect!=='function')throw Error('Trusted server PostgreSQL pool required')
 const security=createOmsSyncSecurity({secret,db})
 const transaction=createPostgresSyncTransaction({pool})
 const apply=createOfflineSyncApply({authenticate:security.authenticate,authorize:security.authorize,transaction})
 return createOfflineSyncHttpHandler({apply,maxBodyBytes})
}
module.exports={createOmsPostgresSyncService}
