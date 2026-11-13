'use strict'
// Framework-neutral API adapter; mounting requires trusted server middleware.
// Do not expose this handler directly to an unauthenticated HTTP route.
function createOfflineAuthorizationHandler({ issuer, authenticateRequest }) {
  if (!issuer || typeof issuer.enrollment !== 'function' ||
      typeof issuer.draft !== 'function' || typeof authenticateRequest !== 'function')
    throw new Error('Trusted issuer and server-side session authenticator required')
  return async function handle(request) {
    if (!request || request.method !== 'POST' ||
        !['enrollment','draft'].includes(request.kind))
      return { status:405, body:{error:'Unsupported request'} }
    let session
    try { session = await authenticateRequest(request) } catch { return {status:401,body:{error:'Authentication required'}} }
    if (!session || session.authenticated !== true || typeof session.identity !== 'string')
      return {status:401,body:{error:'Authentication required'}}
    const body = request.body
    if (!body || typeof body !== 'object' || Array.isArray(body))
      return {status:400,body:{error:'Invalid request'}}
    try {
      const proof = request.kind === 'enrollment'
        ? await issuer.enrollment({session,identity:session.identity,nonce:body.nonce})
        : await issuer.draft({session,identity:session.identity,snapshotHash:body.snapshotHash,permissions:body.permissions})
      return {status:200,body:{proof}}
    } catch {
      return {status:403,body:{error:'Authorization denied or invalid request'}}
    }
  }
}
module.exports = {createOfflineAuthorizationHandler}
