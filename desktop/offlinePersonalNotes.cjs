'use strict'
// Personal Mac-local annotations, NOT business record edits or sync drafts.
// Independent SQLite database, never modifies imported snapshot.
const fs = require('node:fs')
const path = require('node:path')
const crypto = require('node:crypto')
const initSqlJs = require('sql.js')
const TABLE = /^[a-z][a-z0-9_]{0,119}$/
const MAX_NOTES = 10000
function createLocalAnnotations(directory) {
  if (typeof directory !== 'string' || !path.isAbsolute(directory)) throw new Error('Invalid local notes directory')
  const file = path.join(directory, 'offline-personal-notes.sqlite')
  async function open() {
    fs.mkdirSync(directory, { recursive: true, mode: 0o700 })
    if (fs.existsSync(file)) {
      const stat = fs.lstatSync(file)
      if (!stat.isFile() || stat.isSymbolicLink() || stat.size > 20 * 1024 * 1024)
        throw new Error('Unsafe local notes file')
    }
    const wasm = require.resolve('sql.js/dist/sql-wasm.wasm').replace('app.asar' + path.sep, 'app.asar.unpacked' + path.sep)
    const SQL = await initSqlJs({ locateFile: () => wasm })
    const db = new SQL.Database(fs.existsSync(file) ? fs.readFileSync(file) : undefined)
    if (db.exec('PRAGMA quick_check')[0]?.values?.[0]?.[0] !== 'ok') { db.close(); throw new Error('Local notes database damaged') }
    db.run('CREATE TABLE IF NOT EXISTS personal_notes (table_name TEXT NOT NULL, record_id TEXT NOT NULL, body TEXT NOT NULL, updated_at TEXT NOT NULL, PRIMARY KEY(table_name,record_id))')
    return db
  }
  function validate(table, recordId) {
    if (typeof table !== 'string' || !TABLE.test(table) || !['string','number'].includes(typeof recordId) ||
        !String(recordId).trim() || String(recordId).length > 120) throw new Error('Invalid record reference')
  }
  function persist(db) {
    const temp = file + '.' + crypto.randomUUID() + '.tmp'
    try {
      fs.writeFileSync(temp, Buffer.from(db.export()), { flag: 'wx', mode: 0o600 })
      fs.renameSync(temp, file)
    } finally { if (fs.existsSync(temp)) fs.unlinkSync(temp) }
  }
  let queue = Promise.resolve()
  function serialize(work) {
    const next = queue.catch(() => {}).then(work)
    queue = next.catch(() => {})
    return next
  }
  async function get(table, recordId) {
    validate(table, recordId)
    return serialize(async () => {
      const db = await open()
      try {
        const row = db.exec('SELECT body,updated_at FROM personal_notes WHERE table_name=? AND record_id=?', [table,String(recordId)])
        return row[0]?.values?.[0] ? { body: row[0].values[0][0], updatedAt: row[0].values[0][1] } : { body: '', updatedAt: null }
      } finally { db.close() }
    })
  }
  async function save(table, recordId, body) {
    validate(table, recordId)
    if (typeof body !== 'string' || body.length > 4000) throw new Error('Personal note exceeds 4,000 characters')
    return serialize(async () => {
      const db = await open()
      try {
        const count = db.exec('SELECT COUNT(*) FROM personal_notes')[0]?.values[0][0] || 0
        const exists = db.exec('SELECT 1 FROM personal_notes WHERE table_name=? AND record_id=?', [table,String(recordId)])
        if (!exists.length && count >= MAX_NOTES) throw new Error('Local notes limit reached')
        const updatedAt = new Date().toISOString()
        if (body.trim()) db.run('INSERT OR REPLACE INTO personal_notes VALUES (?,?,?,?)', [table,String(recordId),body,updatedAt])
        else db.run('DELETE FROM personal_notes WHERE table_name=? AND record_id=?', [table,String(recordId)])
        persist(db)
        return { saved: true, updatedAt }
      } finally { db.close() }
    })
  }
  return { get, save }
}
module.exports = { createLocalAnnotations }
