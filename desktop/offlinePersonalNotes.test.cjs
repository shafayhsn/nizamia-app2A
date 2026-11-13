'use strict'
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { createLocalAnnotations } = require('./offlinePersonalNotes.cjs')
async function main() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'app2a-notes-'))
  try {
    const notes = createLocalAnnotations(dir)
    assert.deepEqual(await notes.get('orders', 'o1'), { body: '', updatedAt: null })
    await Promise.all([notes.save('orders','o1','first'),notes.save('orders','o2','second'),notes.save('production_daily_entries','p1','production')])
    assert.equal((await createLocalAnnotations(dir).get('orders','o1')).body, 'first')
    assert.equal((await notes.get('orders','o2')).body, 'second')
    assert.equal((await notes.get('production_daily_entries','p1')).body, 'production')
    await notes.save('orders','o1','')
    assert.equal((await notes.get('orders','o1')).body, '')
    await assert.rejects(notes.save('orders','o1','x'.repeat(4001)), /4,000/)
    await assert.rejects(notes.get('../secrets','x'), /record reference/)
    const filename = path.join(dir,'offline-personal-notes.sqlite')
    assert.equal(fs.statSync(filename).mode & 0o777, 0o600)
    process.stdout.write('Personal offline notes tests passed.\n')
  } finally { fs.rmSync(dir,{recursive:true,force:true}) }
}
main().catch(e => { console.error(e); process.exitCode = 1 })
