import assert from 'node:assert/strict'
import { test } from 'node:test'
import { reviewLocalBulkBOM } from './bulkBOMLocalReview.js'

const snapshot = {
  buyerId: 'B', styles: ['S'],
  orders: [
    { id: 'po-a', buyer_id: 'B', style_number: 'S', total_qty: 100 },
    { id: 'po-b', buyer_id: 'OTHER', style_number: 'S', total_qty: 50 },
  ],
  library: [{ id: 'trim', name: 'Trim', category: 'Stitching Trim', default_wastage: 5, unit: 'pcs' }],
  groups: [{ id: 'g', order_id: 'po-a', group_name: 'Kids', sizes: ['4', '6'] }],
  colors: [{ id: 'c', size_group_id: 'g', color_name: 'Indigo' }],
  breakdown: [
    { size_group_id: 'g', color_id: 'c', size: '4', qty: 60 },
    { size_group_id: 'g', color_id: 'c', size: '6', qty: 40 },
  ],
  lines: [], finishingPacks: [],
}

const cases = [
  ['Generic', { generic: { value: '1.25', na: false } }, 137.5],
  ['By Color', { Indigo: { value: '2', na: false } }, 220],
  ['By Size Group', { Kids: { value: '3', na: false } }, 330],
  ['By Individual Sizes', { 4: { value: '2', na: false }, 6: { value: '', na: true } }, 132],
  ['Configure Own', { __matrix: [{ sgName: 'Kids', colorName: 'Indigo', consumption: '4', na: false }] }, 440],
  ['By Batch', { __batches: [
    { name: 'A', consumption: '2', cells: [{ sgName: 'Kids', colorName: 'Indigo', size: '4' }] },
    { name: 'B', consumption: '4', cells: [{ sgName: 'Kids', colorName: 'Indigo', size: '6' }] },
  ] }, 308],
]

function review(usage, usageData, overrides = {}) {
  return reviewLocalBulkBOM({
    ...snapshot, ...overrides,
    draft: {
      styles: ['S'],
      materials: [{ id: 'trim', usage, shared: false, settings: { S: { wastage: '10', usageData } } }],
    },
  })
}

for (const [usage, usageData, quantity] of cases) {
  test(usage + ' uses only this buyer’s PO and preserves its wizard inputs', () => {
    const rows = review(usage, usageData)
    assert.equal(rows.length, 1)
    const [row] = rows
    assert.equal(row.action, 'Add')
    assert.equal(row.after.final_qty, quantity)
    assert.deepEqual(JSON.parse(row.after.usage_data), usageData)
    assert.equal(row.after.wastage, 10)
    assert.equal(review(usage, usageData, { lines: [{ ...row.after, id: 'id', order_id: 'po-a' }] })[0].action, 'Unchanged')
  })
}

test('flags omitted sizes and leaves unrelated BOM lines outside the proposed changes', () => {
  const lines = [{ id: 'keep', order_id: 'po-a', library_item_id: 'other', name: 'Other' }]
  const [row] = review('By Individual Sizes', { 4: 2 }, { lines })
  assert.equal(row.action, 'Blocked')
  assert.match(row.issue, /6/)
  assert.equal(row.before, null)
  assert.equal(lines[0].id, 'keep')
})

test('an existing line is a replacement with its original ID available for explicit selection', () => {
  const lines = [{ id: 'replace-me', order_id: 'po-a', library_item_id: 'trim', name: 'Trim', base_qty: 4 }]
  const [row] = review('Generic', { generic: { value: '1', na: false } }, { lines })
  assert.equal(row.action, 'Replace')
  assert.equal(row.before.id, 'replace-me')
})
