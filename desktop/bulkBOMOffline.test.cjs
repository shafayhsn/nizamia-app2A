'use strict'

const assert = require('node:assert/strict')
const { randomUUID } = require('node:crypto')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { test } = require('node:test')
const sqlite = require('sql.js')
const { bulkBomLocal, listCombinedRecords, submitPendingMutations } = require('./standaloneRecords.cjs')

test('desktop queues only reviewed BOM edits and retains unrelated lines across restart', async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'nzos-bulk-bom-'))
  try {
    const SQL = await sqlite()
    const db = new SQL.Database()
    const ownerId = randomUUID(), buyerId = randomUUID(), orderId = randomUUID(), libraryId = randomUUID()
    const order = { id: orderId, buyer_id: buyerId, total_qty: 100, step_bom: false }
    const original = { id: randomUUID(), order_id: orderId, name: 'Keep existing', sort_order: 1, notes: 'Keep notes' }
    const existing = { id: randomUUID(), order_id: orderId, name: 'Change existing', sort_order: 2, notes: 'Keep existing metadata' }
    db.run('CREATE TABLE snapshot_rows (table_name TEXT, row_index INTEGER, row_json TEXT)')
    for (const [table, row] of [['orders', order], ['bom_items', original], ['bom_items', existing]]) {
      db.run('INSERT INTO snapshot_rows VALUES (?, ?, ?)', [table, row.sort_order || 0, JSON.stringify(row)])
    }
    fs.writeFileSync(path.join(directory, 'nizamia-app2a.sqlite'), db.export())
    db.close()
    const isCurrent = () => true
    const call = input => bulkBomLocal(directory, { input, ownerId, isCurrent })
    const draft = await call({ action: 'save', buyerId, name: 'Offline draft', draft: { styles: ['S'], materials: [] } })
    assert.equal((await call({ action: 'list' }))[0].id, draft.id)
    assert.deepEqual(await bulkBomLocal(directory, { input: { action: 'list' }, ownerId: randomUUID(), isCurrent }), [])

    const after = { library_item_id: libraryId, name: 'New trim', category: 'Stitching Trim',
      unit: 'pcs', usage_rule: 'Generic', base_qty: 1, final_qty: 105, wastage: 5 }
    const repeated = {...after,bulk_instance_id:randomUUID(),detail:'Distinct trim'}
    const expected = { step_bom: false, total_qty: 100, groups: [], colors: [], breakdown: [], lines: [original, existing] }
    const input = { action: 'queue', buyerId, orders: [{ orderId, expected, lines: [
      { existingId: existing.id, after }, { existingId: null, after:repeated },
    ] }] }
    await assert.rejects(call({ ...input, orders: [{ ...input.orders[0], expected: { ...expected, total_qty: 99 } }] }), /changed since review/)
    assert.deepEqual(await call(input), { queued: 1 })
    const rows = await listCombinedRecords(directory, 'bom_items')
    assert.equal(rows.find(row => row.id === original.id).notes, original.notes)
    assert.equal(rows.find(row => row.id === existing.id).notes, existing.notes)
    assert.equal(rows.find(row => row.id === existing.id).final_qty, 105)
    assert.equal(rows.filter(row => row._local_only).length, 1)
    await assert.rejects(call(input), /awaiting synchronization|earlier PO Matrix or BOM/)
    const summary = await submitPendingMutations(directory, { ownerId, isCurrent, async submit(operations) {
      assert.equal(operations.length, 1)
      const [operation] = operations
      const { inserts, updates } = operation.intent.document.bulkBomPatch
      assert.equal(inserts.length, 1)
      assert.equal(inserts[0].bulk_instance_id,repeated.bulk_instance_id)
      assert.deepEqual(updates.map(row => row.id), [existing.id])
      return [{ operationId: operation.operationId, outcome: 'conflict' }]
    } })
    assert.equal(summary.conflicts, 1)
    assert.equal((await listCombinedRecords(directory, 'bom_items')).length, 3)
  } finally {
    fs.rmSync(directory, { recursive: true, force: true })
  }
})
