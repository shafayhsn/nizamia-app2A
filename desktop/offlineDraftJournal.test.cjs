'use strict'
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const initSqlJs = require('sql.js')
const { stageDraft, listDrafts, previewSync, cancelDraft, snapshotFingerprint } = require('./offlineDraftJournal.cjs')
async function main() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'app2a-journal-'))
  try {
    const SQL = await initSqlJs({ locateFile: () => require.resolve('sql.js/dist/sql-wasm.wasm') })
    const db = new SQL.Database()
    db.run('CREATE TABLE snapshot_manifest (table_name TEXT, row_count INTEGER)')
    db.run('INSERT INTO snapshot_manifest VALUES (?, ?)', ['orders', 1])
    db.run('CREATE TABLE snapshot_rows (table_name TEXT, row_index INTEGER, row_json TEXT)')
    db.run('INSERT INTO snapshot_rows VALUES (?, ?, ?)', ['orders', 0, JSON.stringify({ id: 'o1', notes: 'before', remarks: '' })])
    const file = path.join(dir, 'nizamia-app2a.sqlite')
    fs.writeFileSync(file, Buffer.from(db.export()))
    db.close()
    const initial = new SQL.Database(fs.readFileSync(file))
    const hash = snapshotFingerprint(initial)
    initial.close()
    const now = Date.now()
    const session = { identity: 'worker1', verifiedIdentity: 'worker1', authenticated: true, permissions: ['offline:draft:orders'] }
    const grant = { identity: 'worker1', issuedAt: now - 1000, expiresAt: now + 60000, permissions: ['offline:draft:orders'], snapshotHash: hash }
    const args = { directory: dir, table: 'orders', recordId: 'o1', changes: { notes: 'after' }, grant, session, now }
    await assert.rejects(stageDraft(args), /Trusted authorization/)
    await assert.rejects(stageDraft({ ...args, authenticateEvidence: async () => false }), /Trusted authorization/)
    await assert.rejects(stageDraft({ ...args, changes: { password_hash: 'bad' }, authenticateEvidence: async () => true }), /Field is not approved/)
    await assert.rejects(stageDraft({ ...args, table: 'users', authenticateEvidence: async () => true }), /not enabled/)
    const result = await stageDraft({ ...args, authenticateEvidence: async () => true })
    assert.equal(result.state, 'pending')
    assert.equal((await listDrafts({ directory: dir, session, authenticateSession: async () => true })).length, 1)
    await assert.rejects(listDrafts({ directory: dir, session }), /Authenticated session/)
    const reopened = new SQL.Database(fs.readFileSync(file))
    assert.equal(reopened.exec('PRAGMA integrity_check')[0].values[0][0], 'ok')
    assert.equal(JSON.parse(reopened.exec("SELECT row_json FROM snapshot_rows WHERE table_name='orders'")[0].values[0][0]).notes, 'before')
    assert.equal(reopened.exec('SELECT COUNT(*) FROM offline_draft_journal')[0].values[0][0], 1)
    reopened.close()
    await assert.rejects(stageDraft({ ...args, changes: { notes: 'second edit' }, authenticateEvidence: async () => true }), /Pending draft already changes this field/)
    const second = await stageDraft({ ...args, changes: { remarks: 'separate field' }, authenticateEvidence: async () => true })
    assert.notEqual(second.draftId, result.draftId)
    assert.equal((await listDrafts({ directory: dir, session, authenticateSession: async () => true })).length, 2)
    const syncArgs = { directory: dir, session, authenticateSession: async () => true,
      authorizedTables: ['orders'], cloudRecords: new Map([['orders:o1', { id: 'o1', notes: 'before', remarks: '' }]]) }
    await assert.rejects(previewSync({ ...syncArgs, authenticateSession: async () => false }), /Authenticated session/)
    const preview = await previewSync(syncArgs)
    assert.equal(preview.length, 2)
    assert.equal(preview[0].decision, 'ready')
    assert.equal(preview[1].decision, 'ready')
    const conflicting = await previewSync({ ...syncArgs, cloudRecords: new Map([['orders:o1', { id: 'o1', notes: 'changed online', remarks: '' }]]) })
    assert.equal(conflicting[0].reason, 'cloud-field-changed')
    assert.equal(conflicting[1].decision, 'ready')
    await assert.rejects(cancelDraft({ directory: dir, draftId: result.draftId, session }), /Authenticated session/)
    assert.deepEqual(await cancelDraft({ directory: dir, draftId: result.draftId,
      session: { ...session, identity: 'another-user' }, authenticateSession: async () => true }), { cancelled: false })
    assert.deepEqual(await cancelDraft({ directory: dir, draftId: result.draftId,
      session, authenticateSession: async () => true }), { cancelled: true })
    assert.deepEqual(await cancelDraft({ directory: dir, draftId: result.draftId,
      session, authenticateSession: async () => true }), { cancelled: false })
    const replacement = await stageDraft({ ...args, changes: { notes: 'after cancellation' }, authenticateEvidence: async () => true })
    assert.equal(replacement.state, 'pending')
    // Simultaneous edits to distinct fields must both persist, not overwrite.
    await cancelDraft({ directory: dir, draftId: second.draftId, session, authenticateSession: async () => true })
    await cancelDraft({ directory: dir, draftId: replacement.draftId, session, authenticateSession: async () => true })
    const concurrent = await Promise.all([
      stageDraft({ ...args, changes: { notes: 'concurrent note' }, authenticateEvidence: async () => true }),
      stageDraft({ ...args, changes: { remarks: 'concurrent remark' }, authenticateEvidence: async () => true })
    ])
    assert.equal(concurrent.length, 2)
    assert.equal((await listDrafts({ directory: dir, session, authenticateSession: async () => true })).length, 2)
    await assert.rejects(Promise.all([
      stageDraft({ ...args, changes: { notes: 'racing A' }, authenticateEvidence: async () => true }),
      stageDraft({ ...args, changes: { notes: 'racing B' }, authenticateEvidence: async () => true })
    ]), /Pending draft already changes this field/)
    const later = new SQL.Database(fs.readFileSync(file))
    assert.equal(snapshotFingerprint(later), hash)
    assert.equal(later.exec('PRAGMA integrity_check')[0].values[0][0], 'ok')
    later.close()
    await assert.rejects(stageDraft({ ...args, grant: { ...grant, snapshotHash: '0'.repeat(64) }, authenticateEvidence: async () => true }), /Draft permission denied/)
    process.stdout.write('Offline journal tests passed: fail-closed authorization, allowlist, staging, isolation, persistence, integrity.\n')
  } finally { fs.rmSync(dir, { recursive: true, force: true }) }
}
main().catch(e => { console.error(e); process.exitCode = 1 })
