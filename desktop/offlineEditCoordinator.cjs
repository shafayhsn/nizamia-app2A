'use strict'
// Main-process staging coordinator. Caller must supply independently verified
// signed grants and an authenticated trusted session; never accepts renderer grants.
const { stageDraft } = require('./offlineDraftJournal.cjs')
const { snapshotFingerprint } = require('./offlineDraftJournal.cjs')
const { authorizedDraft } = require('./offlineDraftAuthorization.cjs')
const fs = require('node:fs')
const path = require('node:path')
const initSqlJs = require('sql.js')
const crypto = require('node:crypto')
async function createTrustedDraftGrant({ directory, table, identity, permissions, verifiedAuthorization, now = Date.now() }) {
  if (verifiedAuthorization !== true) throw new Error('Independent trusted authorization required')
  if (!['orders','production_daily_entries'].includes(table) || typeof identity !== 'string' || !identity ||
      !Array.isArray(permissions) || !permissions.includes('offline:draft:' + table))
    throw new Error('Draft permission denied')
  if (typeof directory !== 'string' || !path.isAbsolute(directory)) throw new Error('Invalid directory')
  const file = path.join(directory, 'nizamia-app2a.sqlite')
  const stat = fs.lstatSync(file)
  if (!stat.isFile() || stat.isSymbolicLink() || stat.size > 50 * 1024 * 1024)
    throw new Error('Unsafe local snapshot')
  const wasm = require.resolve('sql.js/dist/sql-wasm.wasm').replace('app.asar' + path.sep, 'app.asar.unpacked' + path.sep)
  const SQL = await initSqlJs({ locateFile: () => wasm })
  const db = new SQL.Database(fs.readFileSync(file))
  try {
    if (db.exec('PRAGMA quick_check')[0]?.values?.[0]?.[0] !== 'ok') throw new Error('SQLite integrity failure')
    return Object.freeze({ identity, permissions: [...permissions], snapshotHash: snapshotFingerprint(db),
      issuedAt: now, expiresAt: now + 10 * 60 * 1000 })
  } finally { db.close() }
}
async function stageTrustedRecordEdit({ directory, table, recordId, changes, session, grant, authenticateEvidence }) {
  if (typeof authenticateEvidence !== 'function' || await authenticateEvidence({ session, grant }) !== true)
    throw new Error('Trusted session and grant verification required')
  if (!session?.authenticated || session.identity !== session.verifiedIdentity ||
      !Array.isArray(session.permissions) || !session.permissions.includes('offline:draft:' + table))
    throw new Error('Authenticated edit permission required')
  return stageDraft({ directory, table, recordId, changes, grant, session,
    authenticateEvidence: async evidence => authenticateEvidence(evidence) })
}
module.exports = { createTrustedDraftGrant, stageTrustedRecordEdit }
