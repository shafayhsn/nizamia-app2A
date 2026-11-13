'use strict'
// Local-only report preferences. No business records, credentials or cloud writes.
const fs = require('node:fs')
const path = require('node:path')
const { validateLayout } = require('./offlineReportLayout.cjs')
const NAME = 'offline-report-presets.json'
const TABLE = /^[a-z][a-z0-9_]{0,119}$/
function createReportPresets(directory) {
  if (typeof directory !== 'string' || !path.isAbsolute(directory)) throw new Error('Invalid settings directory')
  const file = path.join(directory, NAME)
  function loadAll() {
    if (!fs.existsSync(file)) return {}
    const info = fs.lstatSync(file)
    if (!info.isFile() || info.isSymbolicLink() || info.size > 128 * 1024)
      throw new Error('Unsafe report preferences')
    const parsed = JSON.parse(fs.readFileSync(file, 'utf8'))
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed) || Object.keys(parsed).length > 250)
      throw new Error('Invalid report preferences')
    const clean = Object.create(null)
    for (const [table, layout] of Object.entries(parsed)) {
      if (!TABLE.test(table)) throw new Error('Invalid saved table name')
      clean[table] = validateLayout(layout)
    }
    return clean
  }
  function get(table) {
    if (typeof table !== 'string' || !TABLE.test(table)) throw new Error('Invalid table')
    return loadAll()[table] || null
  }
  function save(table, layout) {
    if (typeof table !== 'string' || !TABLE.test(table)) throw new Error('Invalid table')
    const checked = validateLayout(layout)
    const all = loadAll()
    all[table] = checked
    const payload = JSON.stringify(all)
    if (Buffer.byteLength(payload) > 128 * 1024) throw new Error('Too many saved report preferences')
    fs.mkdirSync(directory, { recursive: true, mode: 0o700 })
    const temp = file + '.tmp'
    if (fs.existsSync(temp)) throw new Error('Report preferences are being updated')
    try {
      fs.writeFileSync(temp, payload, { flag: 'wx', mode: 0o600 })
      fs.renameSync(temp, file)
    } finally { if (fs.existsSync(temp)) fs.unlinkSync(temp) }
    return checked
  }
  function remove(table) {
    if (typeof table !== 'string' || !TABLE.test(table)) throw new Error('Invalid table')
    const all = loadAll()
    delete all[table]
    fs.mkdirSync(directory, { recursive: true, mode: 0o700 })
    const temp = file + '.tmp'
    if (fs.existsSync(temp)) throw new Error('Report preferences are being updated')
    try {
      fs.writeFileSync(temp, JSON.stringify(all), { flag: 'wx', mode: 0o600 })
      fs.renameSync(temp, file)
    } finally { if (fs.existsSync(temp)) fs.unlinkSync(temp) }
    return { removed: true }
  }
  return { get, save, remove }
}
module.exports = { createReportPresets }
