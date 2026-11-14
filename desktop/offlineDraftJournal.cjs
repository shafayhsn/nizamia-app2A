'use strict'
// Isolated, fail-closed offline draft journal. Not exposed to renderers or cloud.
// A trusted caller must supply independently authenticated grant/session evidence.
const fs = require('node:fs')
const path = require('node:path')
const crypto = require('node:crypto')
const initSqlJs = require('sql.js')
const { makeDraft, checkDraftConflict } = require('./offlineDraft.cjs')
const { authorizedDraft } = require('./offlineDraftAuthorization.cjs')
const DB_NAME = 'nizamia-app2a.sqlite'
const MAX_BYTES = 50 * 1024 * 1024
const APPROVED = new Set(['orders', 'production_daily_entries'])
let sqlPromise
// Serialize journal mutations in this Electron main process to avoid lost updates.
const mutationQueues = new Map()
function serializedMutation(directory, work) {
  const key = path.resolve(directory)
  const prior = mutationQueues.get(key) || Promise.resolve()
  const next = prior.catch(() => {}).then(work)
  const settled = next.catch(() => {})
  mutationQueues.set(key, settled)
  settled.finally(() => { if (mutationQueues.get(key) === settled) mutationQueues.delete(key) })
  return next
}
function sqlEngine() {
  if (!sqlPromise) sqlPromise = initSqlJs({ locateFile: () => require.resolve('sql.js/dist/sql-wasm.wasm').replace('app.asar' + path.sep, 'app.asar.unpacked' + path.sep) })
  return sqlPromise
}
function assertDirectory(directory) {
  if (typeof directory !== 'string' || !path.isAbsolute(directory)) throw new Error('Absolute database directory required')
  const stat = fs.lstatSync(directory)
  if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error('Invalid database directory')
}
function fingerprint(file) {
  const stat = fs.lstatSync(file)
  if (!stat.isFile() || stat.isSymbolicLink() || stat.size > MAX_BYTES) throw new Error('Unsafe snapshot database')
  return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex')
}
// Stable across journal writes; changes only when the imported snapshot changes.
function snapshotFingerprint(db) {
  const hash = crypto.createHash('sha256')
  for (const table of ['snapshot_manifest', 'snapshot_rows']) {
    const present = db.exec("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?", [table])
    if (!present.length) throw new Error('Missing snapshot table')
    const query = table === 'snapshot_rows'
      ? 'SELECT table_name, row_index, row_json FROM snapshot_rows ORDER BY table_name, row_index'
      : 'SELECT table_name, row_count FROM snapshot_manifest ORDER BY table_name'
    const stmt = db.prepare(query)
    try {
      hash.update(table + '\\n')
      while (stmt.step()) hash.update(JSON.stringify(stmt.get()) + '\\n')
    } finally { stmt.free() }
  }
  return hash.digest('hex')
}
function findRecord(db, table, recordId) {
  const stmt = db.prepare('SELECT row_json FROM snapshot_rows WHERE table_name = ? ORDER BY row_index')
  try {
    stmt.bind([table])
    while (stmt.step()) {
      const row = JSON.parse(stmt.get()[0])
      if (String(row.id) === String(recordId)) return row
    }
    return null
  } finally { stmt.free() }
}
function persist(file, db) {
  const bytes = Buffer.from(db.export())
  const temp = file + '.' + crypto.randomUUID() + '.tmp'
  try {
    fs.writeFileSync(temp, bytes, { flag: 'wx', mode: 0o600 })
    fs.renameSync(temp, file)
  } finally { try { fs.unlinkSync(temp) } catch (e) { if (e.code !== 'ENOENT') throw e } }
}
function ensureSchema(db) {
  db.run(`CREATE TABLE IF NOT EXISTS offline_draft_journal (
    draft_id TEXT PRIMARY KEY NOT NULL,
    identity TEXT NOT NULL,
    table_name TEXT NOT NULL,
    record_id TEXT NOT NULL,
    snapshot_hash TEXT NOT NULL,
    draft_json TEXT NOT NULL,
    state TEXT NOT NULL CHECK(state IN ('pending', 'conflict')),
    created_at TEXT NOT NULL
  )`)
}
async function stageDraft(args) {
  return serializedMutation(args.directory, () => stageDraftInternal(args))
}
async function stageDraftInternal({ directory, table, recordId, changes, grant, session, authenticateEvidence, now = Date.now() }) {
  if (!APPROVED.has(table)) throw new Error('Offline edits are not enabled for this table')
  if (typeof authenticateEvidence !== 'function' || await authenticateEvidence({ grant, session }) !== true)
    throw new Error('Trusted authorization evidence required')
  if (!Number.isSafeInteger(now) || now <= 0) throw new Error('Invalid clock')
  assertDirectory(directory)
  const file = path.join(directory, DB_NAME)
  const fileHash = fingerprint(file)
  const SQL = await sqlEngine()
  const db = new SQL.Database(fs.readFileSync(file))
  const snapshotHash = snapshotFingerprint(db)
  try {
    if (db.exec('PRAGMA integrity_check')[0]?.values[0]?.[0] !== 'ok') throw new Error('Database integrity failure')
    const record = findRecord(db, table, recordId)
    if (!record) throw new Error('Snapshot record missing')
    const draft = makeDraft({ table, record, changes, snapshotHash })
    if (!authorizedDraft(draft, grant, session, now)) throw new Error('Draft permission denied')
    if (!checkDraftConflict(draft, record, snapshotHash).safe) throw new Error('Draft conflict')
    ensureSchema(db)
    // Prevent ambiguous edits: one pending change per field and record.
    const pending = db.prepare("SELECT draft_json FROM offline_draft_journal WHERE table_name = ? AND record_id = ? AND state = 'pending'")
    try {
      pending.bind([table, draft.recordId])
      while (pending.step()) {
        const earlier = JSON.parse(pending.get()[0])
        if (Object.keys(draft.changes).some(field => Object.hasOwn(earlier.changes, field)))
          throw new Error('Pending draft already changes this field')
      }
    } finally { pending.free() }
    // No snapshot records are modified; only pending draft metadata is appended.
    db.run('INSERT INTO offline_draft_journal VALUES (?, ?, ?, ?, ?, ?, ?, ?)', [
      draft.draftId, session.identity, table, draft.recordId, draft.snapshotHash,
      JSON.stringify(draft), 'pending', draft.createdAt
    ])
    // Reject concurrent snapshot replacement before atomic journal persistence.
    if (fingerprint(file) !== fileHash) throw new Error('Database changed during staging')
    persist(file, db)
    return { draftId: draft.draftId, state: 'pending', table, recordId: draft.recordId }
  } finally { db.close() }
}
async function listDrafts({ directory, session, authenticateSession }) {
  if (typeof authenticateSession !== 'function' || await authenticateSession(session) !== true ||
      !session || typeof session.identity !== 'string' || !session.identity)
    throw new Error('Authenticated session required')
  assertDirectory(directory)
  const file = path.join(directory, DB_NAME)
  const SQL = await sqlEngine()
  const db = new SQL.Database(fs.readFileSync(file))
  try {
    const tables = db.exec("SELECT name FROM sqlite_master WHERE type='table' AND name='offline_draft_journal'")
    if (!tables.length) return []
    const rows = db.exec('SELECT draft_id, table_name, record_id, state, created_at FROM offline_draft_journal WHERE identity = ? ORDER BY created_at', [session.identity])
    return (rows[0]?.values || []).map(([draftId, table, recordId, state, createdAt]) => ({ draftId, table, recordId, state, createdAt }))
  } finally { db.close() }
}
// Builds a bounded, read-only preview against caller-supplied cloud records.
// Never submits a mutation; trusted server authorization and conditional writes
// are required before any production synchronization can be enabled.
async function previewSync({ directory, session, authenticateSession, cloudRecords, authorizedTables }) {
  if (typeof authenticateSession !== 'function' || await authenticateSession(session) !== true ||
      !session || typeof session.identity !== 'string' || !session.identity)
    throw new Error('Authenticated session required')
  if (!(cloudRecords instanceof Map) || !Array.isArray(authorizedTables))
    throw new Error('Trusted cloud record map and permissions required')
  assertDirectory(directory)
  const file = path.join(directory, DB_NAME)
  fingerprint(file)
  const SQL = await sqlEngine()
  const db = new SQL.Database(fs.readFileSync(file))
  try {
    if (db.exec('PRAGMA integrity_check')[0]?.values[0]?.[0] !== 'ok') throw new Error('Database integrity failure')
    const exists = db.exec("SELECT 1 FROM sqlite_master WHERE type='table' AND name='offline_draft_journal'")
    if (!exists.length) return []
    const { planBatch } = require('./offlineSyncPlanner.cjs')
    const stmt = db.prepare("SELECT identity, draft_json FROM offline_draft_journal WHERE identity = ? AND state = 'pending' ORDER BY created_at LIMIT 101")
    const items = []
    try {
      stmt.bind([session.identity])
      while (stmt.step()) {
        const [identity, json] = stmt.get()
        items.push({ identity, draft: JSON.parse(json) })
      }
    } finally { stmt.free() }
    if (items.length > 100) throw new Error('Sync preview batch limit exceeded')
    return planBatch(items, cloudRecords, { identity: session.identity, authorizedTables })
  } finally { db.close() }
}
// Explicit user cancellation. Does not touch snapshot records or cloud data.
// Authentication is performed by a trusted main-process callback, never by IPC claims.
async function cancelDraft(args) {
  return serializedMutation(args.directory, () => cancelDraftInternal(args))
}
async function cancelDraftInternal({ directory, draftId, session, authenticateSession }) {
  if (typeof authenticateSession !== 'function' || await authenticateSession(session) !== true ||
      !session || typeof session.identity !== 'string' || !session.identity)
    throw new Error('Authenticated session required')
  if (typeof draftId !== 'string' || !/^[a-f0-9-]{36}$/i.test(draftId))
    throw new Error('Invalid draft identifier')
  assertDirectory(directory)
  const file = path.join(directory, DB_NAME)
  const fileHash = fingerprint(file)
  const SQL = await sqlEngine()
  const db = new SQL.Database(fs.readFileSync(file))
  try {
    if (db.exec('PRAGMA integrity_check')[0]?.values[0]?.[0] !== 'ok') throw new Error('Database integrity failure')
    const exists = db.exec("SELECT 1 FROM sqlite_master WHERE type='table' AND name='offline_draft_journal'")
    if (!exists.length) return { cancelled: false }
    db.run("DELETE FROM offline_draft_journal WHERE draft_id = ? AND identity = ? AND state = 'pending'", [draftId, session.identity])
    const changed = db.getRowsModified()
    if (!changed) return { cancelled: false }
    if (fingerprint(file) !== fileHash) throw new Error('Database changed during cancellation')
    persist(file, db)
    return { cancelled: true }
  } finally { db.close() }
}

// Owner-scoped pending drafts for a trusted main-process sync coordinator.
// No renderer-facing IPC should expose draft payloads or session credentials.
async function pendingSyncDrafts({directory,session,authenticateSession}){
 if(typeof authenticateSession!=='function'||await authenticateSession(session)!==true||
    !session||typeof session.identity!=='string'||!session.identity)
  throw Error('Authenticated session required')
 assertDirectory(directory)
 const file=path.join(directory,DB_NAME)
 fingerprint(file)
 const SQL=await sqlEngine(),db=new SQL.Database(fs.readFileSync(file))
 try{
  if(db.exec('PRAGMA integrity_check')[0]?.values?.[0]?.[0]!=='ok')throw Error('Database integrity failure')
  if(!db.exec("SELECT 1 FROM sqlite_master WHERE type='table' AND name='offline_draft_journal'").length)return []
  const stmt=db.prepare("SELECT draft_json FROM offline_draft_journal WHERE identity = ? AND state = 'pending' ORDER BY created_at LIMIT 101")
  const drafts=[]
  try{
   stmt.bind([session.identity])
   while(stmt.step())drafts.push(JSON.parse(stmt.get()[0]))
  }finally{stmt.free()}
  if(drafts.length>100)throw Error('Sync batch limit exceeded')
  const {validateDraft}=require('./offlineSyncPlanner.cjs')
  drafts.forEach(validateDraft)
  return drafts
 }finally{db.close()}
}
// Persist server outcomes only after a trusted, authenticated main-process
// coordinator has verified the response. Archive applied drafts in place.
async function commitSyncResults(args){
 return serializedMutation(args.directory,()=>commitSyncResultsInternal(args))
}
async function commitSyncResultsInternal({directory,session,authenticateSession,results}){
 if(typeof authenticateSession!=='function'||await authenticateSession(session)!==true||
    !session||typeof session.identity!=='string'||!session.identity)
  throw Error('Authenticated session required')
 if(!Array.isArray(results)||results.length<1||results.length>100)throw Error('Invalid sync results')
 assertDirectory(directory)
 const file=path.join(directory,DB_NAME),fileHash=fingerprint(file)
 const SQL=await sqlEngine(),db=new SQL.Database(fs.readFileSync(file))
 try{
  if(db.exec('PRAGMA integrity_check')[0]?.values?.[0]?.[0]!=='ok')throw Error('Database integrity failure')
  ensureSchema(db)
  db.run("CREATE TABLE IF NOT EXISTS offline_sync_history (draft_id TEXT PRIMARY KEY NOT NULL, identity TEXT NOT NULL, decision TEXT NOT NULL, updated_at TEXT NOT NULL)")
  const drafts=[]
  for(const result of results){
   const row=db.exec("SELECT draft_json FROM offline_draft_journal WHERE draft_id = ? AND identity = ? AND state = 'pending'",[result.draftId,session.identity])
   if(!row.length||row[0].values.length!==1)throw Error('Pending owner draft missing or changed')
   drafts.push(JSON.parse(row[0].values[0][0]))
  }
  const {reconcileSyncResults}=require('./offlineSyncReconciliation.cjs')
  const actions=reconcileSyncResults(drafts,results)
  const stamp=new Date().toISOString()
  for(const action of actions){
   if(action.action==='archive-applied'){
    db.run("INSERT INTO offline_sync_history (draft_id,identity,decision,updated_at) VALUES (?,?,?,?)",[action.draftId,session.identity,'applied',stamp])
    db.run("DELETE FROM offline_draft_journal WHERE draft_id = ? AND identity = ? AND state = 'pending'",[action.draftId,session.identity])
   }else if(action.action==='mark-conflict'){
    db.run("UPDATE offline_draft_journal SET state = 'conflict' WHERE draft_id = ? AND identity = ? AND state = 'pending'",[action.draftId,session.identity])
   }
  }
  if(await authenticateSession(session)!==true)throw Error('Session expired before journal commit')
  if(fingerprint(file)!==fileHash)throw Error('Database changed during synchronization')
  persist(file,db)
  return {archived:actions.filter(a=>a.action==='archive-applied').length,
   conflicts:actions.filter(a=>a.action==='mark-conflict').length,
   retained:actions.filter(a=>a.action.startsWith('retain-')).length}
 }finally{db.close()}
}

module.exports = { stageDraft, listDrafts, previewSync, cancelDraft, snapshotFingerprint, pendingSyncDrafts, commitSyncResults }
