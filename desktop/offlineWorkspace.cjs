'use strict'
// Main-process authentication bridge. Only a verified offline credential enrolled
// through the trusted server flow can create a session. No renderer permissions.
const path = require('node:path')
const { safeStorage, app } = require('electron')
const { createCredentialStore } = require('./offlineCredentialStore.cjs')
const { createOfflineAuthService } = require('./offlineAuthService.cjs')
const { createOfflineSessionManager } = require('./offlineSessionManager.cjs')
const { listDrafts, cancelDraft } = require('./offlineDraftJournal.cjs')
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
