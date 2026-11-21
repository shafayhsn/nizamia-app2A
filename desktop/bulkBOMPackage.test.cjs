'use strict'

const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const test = require('node:test')

test('the bundled desktop Library can open the hosted Bulk BOM workspace', () => {
  const assets = path.join(__dirname, '../dist/assets')
  const library = fs.readdirSync(assets).filter(name => /^Library-.*\.js$/.test(name))
  assert.ok(library.length, 'Expected a bundled Library screen')
  const code = library.map(name => fs.readFileSync(path.join(assets, name), 'utf8')).join('\n')
  assert.match(code, /Open Bulk BOM Online/)
  const destination = /https:\/\/app\.nizamia\.com\/library\?tab=trim-packages/
  assert.match(code, destination)
  const main = fs.readFileSync(path.join(__dirname, 'main.cjs'), 'utf8')
  assert.match(main, /createWindow\(BULK_BOM_URL\)/)
})
