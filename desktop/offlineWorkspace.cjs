'use strict'
// Main-process authentication bridge. Only a verified offline credential enrolled
// through the trusted server flow can create a session. No renderer permissions.
const path = require('node:path')
const fs = require('node:fs')
const { safeStorage, app, dialog, BrowserWindow } = require('electron')
const { assessOfflineReadiness } = require('./offlineReadiness.cjs')
const { createCredentialStore } = require('./offlineCredentialStore.cjs')
const { createOfflineAuthService } = require('./offlineAuthService.cjs')
const { createOfflineSessionManager } = require('./offlineSessionManager.cjs')
const { listDrafts, cancelDraft } = require('./offlineDraftJournal.cjs')
const { previewLocalDrafts } = require('./offlineDraftPreview.cjs')
const { buildDraftRecovery } = require('./offlineDraftRecovery.cjs')
function createOfflineWorkspace(getDirectory) {
  const store = createCredentialStore({
    safeStorage,
    file: path.join(app.getPath('userData'), 'offline-credentials.enc')
  })
  // Enrollment intentionally cannot be issued locally. It requires a
  // pinned server signature and independently validated online authorization.
  const service = createOfflineAuthService({
    store,
    authorizeEnrollment: async () => false,
    enrollmentPublicKey: 'enrollment-not-configured'
  })
  const sessions = createOfflineSessionManager({
    authenticate: (passphrase, now) => service.authenticate(passphrase, now),
    // No edit permissions until signed per-user authorization is integrated.
    resolvePermissions: async () => []
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
        pinnedServerKey:false,scopedEditGrant:false,snapshotIntegrity:false,
        serverSyncEndpoint:false,conditionalCloudWrites:false
      })
      return {...readiness,enrolled:credentialExists,authenticated:status.authenticated}
    }
    if (name === 'status') {
      const status = sessions.status()
      let enrolled = false
      try { enrolled = Boolean(store.load()) } catch (e) {
        return { ...status, enrolled: false, unavailable: e.message }
      }
      return { ...status, enrolled }
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
      // No trusted server enrollment or signed per-user editing grants exist yet.
      // Do not accept a renderer-provided grant or silently write a business draft.
      throw new Error('Business draft saving is locked until verified server enrollment and edit permissions are configured')
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
