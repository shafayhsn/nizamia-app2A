'use strict'

const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const test = require('node:test')

test('the bundled desktop Library mounts Bulk BOM and queues it via the local API', () => {
  const assets = path.join(__dirname, '../dist/assets')
  const names = fs.readdirSync(assets).filter(name => /^(Library|BulkBOM)-.*\.js$/.test(name))
  assert.ok(names.length, 'Expected a bundled Library screen')
  const code = names.map(name => fs.readFileSync(path.join(assets, name), 'utf8')).join('\n')
  assert.match(code, /Build Bulk BOM/)
  assert.match(code, /Saved Bulk BOMs/)
  assert.match(code, /\/api\/offline\/bulk-bom/)
  assert.doesNotMatch(code, /Open Bulk BOM Online/)
})
