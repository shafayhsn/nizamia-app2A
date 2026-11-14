'use strict'
// Mountable Express-compatible route adapter; no implicit authentication.
// A trusted server integrator MUST inject live-session authentication,
// permission checks, an Ed25519 issuer and a PostgreSQL pool.
const {createOfflineAuthorizationHandler}=require('./offlineAuthorizationHandler.cjs')
const {createOfflineSyncHttpHandler}=require('./offlineSyncHttpHandler.cjs')
const {createOfflineSyncApply}=require('./offlineSyncApply.cjs')
const {createPostgresSyncTransaction}=require('./offlinePostgresSyncTransaction.cjs')
function mountOfflineRoutes({app,issuer,authenticateRequest,authorizeSync,pool}){
 if(!app||typeof app.post!=='function'||typeof authenticateRequest!=='function'||
    typeof authorizeSync!=='function'||!issuer||!pool)
  throw Error('Trusted server route dependencies required')
 const authorization=createOfflineAuthorizationHandler({issuer,authenticateRequest})
 const sync=createOfflineSyncHttpHandler({apply:createOfflineSyncApply({
  authenticate:authenticateRequest,authorize:authorizeSync,
  transaction:createPostgresSyncTransaction({pool})
 })})
 app.post('/api/offline-authorization',async(req,res)=>{
  // req.body must be parsed by the server's existing JSON middleware.
  if(!req.body||typeof req.body!=='object'||Array.isArray(req.body))return res.status(400).json({error:'Invalid JSON body'})
  const result=await authorization({
   ...req,method:req.method,headers:req.headers,kind:req.body?.kind,body:req.body
  })
  return res.status(result.status).json(result.body)
 })
 app.post('/api/offline-sync',async(req,res)=>{
  // Do not trust req.body to be raw bytes: bounded serialization is applied.
  if(!req.body||typeof req.body!=='object'||Array.isArray(req.body))return res.status(400).json({error:'Invalid JSON body'})
  const rawBody=JSON.stringify(req.body)
  if(Buffer.byteLength(rawBody,'utf8')>262144)return res.status(413).json({error:'Sync request too large'})
  const result=await sync({...req,rawBody,headers:req.headers,method:req.method})
  return res.status(result.status).json(result.body)
 })
 return Object.freeze({mounted:true})
}
module.exports={mountOfflineRoutes}
