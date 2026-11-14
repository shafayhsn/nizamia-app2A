'use strict'
// Main-process authentication bridge. Only a verified offline credential enrolled
// through the trusted server flow can create a session. No renderer permissions.
const path = require('node:path')
const fs = require('node:fs')
const { safeStorage, app, dialog, BrowserWindow } = require('electron')
const { createOfflineSyncCoordinator } = require('./offlineSyncCoordinator.cjs')
const { createOfflineSyncClient } = require('./offlineSyncClient.cjs')
const { createOfflineAuthorizationClient } = require('./offlineAuthorizationClient.cjs')
const { createTrustedGrantBroker } = require('./offlineTrustedGrantBroker.cjs')
const { stageTrustedRecordEdit } = require('./offlineEditCoordinator.cjs')
const { snapshotFingerprint } = require('./offlineDraftJournal.cjs')
const initSqlJs = require('sql.js')
const { assessOfflineReadiness } = require('./offlineReadiness.cjs')
const { createCredentialStore } = require('./offlineCredentialStore.cjs')
const { createOfflineAuthService } = require('./offlineAuthService.cjs')
const { createOfflineSessionManager } = require('./offlineSessionManager.cjs')
const { listDrafts, cancelDraft } = require('./offlineDraftJournal.cjs')
const { previewLocalDrafts } = require('./offlineDraftPreview.cjs')
const { buildDraftRecovery } = require('./offlineDraftRecovery.cjs')
function createOfflineWorkspace(getDirectory, trusted = null) {
  // Only Electron main-process configuration may provide these dependencies.
  // A missing trusted backend keeps all business writes disabled.
  const configured = Boolean(trusted && trusted.authorizationEndpoint && trusted.syncEndpoint &&
    trusted.publicKey && typeof trusted.getOnlineToken === 'function')
  const authorization = configured ? createOfflineAuthorizationClient({
    endpoint:trusted.authorizationEndpoint,fetchImpl:trusted.fetchImpl || globalThis.fetch
  }) : null
  const broker = configured ? createTrustedGrantBroker({
    client:authorization,publicKey:trusted.publicKey
  }) : null
  const syncClient = configured ? createOfflineSyncClient({
    endpoint:trusted.syncEndpoint,fetchImpl:trusted.fetchImpl || globalThis.fetch
  }) : null
  async function snapshotHash(directory){
    const file=path.join(directory,'nizamia-app2a.sqlite')
    const SQL=await initSqlJs({locateFile:()=>require.resolve('sql.js/dist/sql-wasm.wasm').replace('app.asar'+path.sep,'app.asar.unpacked'+path.sep)})
    const db=new SQL.Database(fs.readFileSync(file))
    try{
      if(db.exec('PRAGMA integrity_check')[0]?.values?.[0]?.[0]!=='ok')throw Error('Invalid local database')
      return snapshotFingerprint(db)
    }finally{db.close()}
  }
  const store = createCredentialStore({
    safeStorage,
    file: path.join(app.getPath('userData'), 'offline-credentials.enc')
  })
  // Enrollment intentionally cannot be issued locally. It requires a
  // pinned server signature and independently validated online authorization.
  const service = createOfflineAuthService({
    store,
    authorizeEnrollment: async ({identity}) => configured && typeof identity==='string',
    enrollmentPublicKey: configured ? trusted.publicKey : 'enrollment-not-configured'
  })
  const sessions = createOfflineSessionManager({
    authenticate: (passphrase, now) => service.authenticate(passphrase, now),
    // No edit permissions until signed per-user authorization is integrated.
    resolvePermissions: async () => configured ? ['offline:draft:orders','offline:draft:production_daily_entries'] : []
  })
  function authenticated() {
    const status = sessions.status()
    if (!status.authenticated) throw new Error('Offline sign-in required')
    return { authenticated: true, identity: status.identity }
  }
  async function action(name, args = {}) {
    if (name === 'readiness') {
      const status=sessions.status()
      let credentialExists=false
      try {credentialExists=Boolean(store.load())} catch {}
      const readiness=assessOfflineReadiness({
        signedEnrollment:credentialExists,
        authenticatedSession:status.authenticated,
        // No pinned backend key, scoped grants or cloud conditional-write endpoint
        // are currently connected. Never infer authorization from local data.
        pinnedServerKey:configured,scopedEditGrant:false,snapshotIntegrity:false,
        serverSyncEndpoint:configured,conditionalCloudWrites:false
      })
      return {...readiness,enrolled:credentialExists,authenticated:status.authenticated}
    }
    if (name === 'status') {
      const status = sessions.status()
      let enrolled = false
      try { enrolled = Boolean(store.load()) } catch (e) {
        return { ...status, enrolled: false, unavailable: e.message }
      }
      return { ...status, enrolled, permissions: configured && status.authenticated ? ['offline:draft:orders','offline:draft:production_daily_entries'] : [] }
    }
    if (name === 'beginEnrollment') {
      if(!configured)throw Error('Trusted online enrollment is not configured')
      return service.beginEnrollment()
    }
    if (name === 'enroll') {
      if(!configured)throw Error('Trusted online enrollment is not configured')
      const token=await trusted.getOnlineToken()
      const onlineProof=await authorization.enrollment(args.nonce,token)
      return service.enroll({identity:args.identity,passphrase:args.passphrase,onlineProof})
    }
    if (name === 'sync') {
      if(!configured)throw Error('Authenticated synchronization is not configured')
      const coordinator=createOfflineSyncCoordinator({
        client:syncClient,getDirectory,
        getSession:async()=>authenticated(),
        getToken:async()=>trusted.getOnlineToken(),
        authenticateSession:async session=>{
          const current=sessions.status()
          return current.authenticated && current.identity===session.identity
        }
      })
      return coordinator.synchronize()
    }
    if (name === 'login') {
      if (typeof args.passphrase !== 'string' || args.passphrase.length > 256)
        throw new Error('Invalid offline passphrase')
      return sessions.login(args.passphrase)
    }
    if (name === 'logout') { sessions.logout(); return { authenticated: false } }
    if (name === 'exportRecovery') {
      const session = authenticated()
      const directory = getDirectory()
      if (!directory) throw new Error('Local database not configured')
      const recovery = await buildDraftRecovery({ directory, session,
        authenticateSession: async () => sessions.status().identity === session.identity })
      if (!sessions.status().authenticated || sessions.status().identity !== session.identity)
        throw new Error('Offline session expired during export')
      const choice = await dialog.showSaveDialog(BrowserWindow.getFocusedWindow() || undefined, {
        title: 'Export private offline draft recovery copy',
        defaultPath: 'nizamia-offline-drafts-' + new Date().toISOString().slice(0,10) + '.json',
        filters: [{ name: 'JSON recovery copy', extensions: ['json'] }]
      })
      if (choice.canceled || !choice.filePath) return { cancelled: true }
      if (path.extname(choice.filePath).toLowerCase() !== '.json') throw new Error('JSON recovery destination required')
      if (!sessions.status().authenticated || sessions.status().identity !== session.identity)
        throw new Error('Offline session expired during export')
      const destination = choice.filePath
      if (fs.existsSync(destination) && (!fs.lstatSync(destination).isFile() || fs.lstatSync(destination).isSymbolicLink()))
        throw new Error('Unsafe recovery destination')
      fs.writeFileSync(destination, JSON.stringify(recovery, null, 2), { mode: 0o600, flag: 'w' })
      return { exported: recovery.drafts.length, file: path.basename(destination) }
    }
    if (name === 'stageDraft') {
      if(!configured)throw Error('Trusted online editing authorization is not configured')
      const session=authenticated()
      const directory=getDirectory()
      if(!directory)throw Error('Local database not configured')
      const table=args.table
      if(!['orders','production_daily_entries'].includes(table))throw Error('Unsupported edit table')
      const hash=await snapshotHash(directory)
      const token=await trusted.getOnlineToken()
      const grant=await broker.request({identity:session.identity,table,snapshotHash:hash,token})
      const permission='offline:draft:'+table
      const verifiedSession={...session,verifiedIdentity:session.identity,permissions:[permission]}
      return stageTrustedRecordEdit({
        directory,table,recordId:args.recordId,changes:args.changes,
        session:verifiedSession,grant,
        authenticateEvidence:async ({session:evidence,grant:proof})=>{
          const current=sessions.status()
          return current.authenticated && current.identity===evidence.identity &&
            proof===grant && Date.now()<grant.expiresAt
        }
      })
    }
    if (name === 'previewDrafts') {
      const session = authenticated()
      const directory = getDirectory()
      if (!directory) throw new Error('Local database not configured')
      return previewLocalDrafts({ directory, table: args.table, recordId: args.recordId, session,
        authenticateSession: async () => sessions.status().identity === session.identity })
    }
    if (name === 'drafts') {
      const session = authenticated()
      const directory = getDirectory()
      if (!directory) throw new Error('Local database not configured')
      return listDrafts({ directory, session, authenticateSession: async () => sessions.status().identity === session.identity })
    }
    if (name === 'cancelDraft') {
      const session = authenticated()
      const directory = getDirectory()
      if (!directory) throw new Error('Local database not configured')
      return cancelDraft({ directory, draftId: args.draftId, session,
        authenticateSession: async () => sessions.status().identity === session.identity })
    }
    throw new Error('Unsupported offline workspace action')
  }
  return { action, logout: () => sessions.logout() }
}
module.exports = { createOfflineWorkspace }
