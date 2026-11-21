import test from 'node:test'
import assert from 'node:assert/strict'
import { calculateBOMFinalQty } from '../src/lib/bomUsage.js'

const sizes = [{ size: '4', qty: 30 }, { size: '6', qty: 20 }]
const context = {
  totalQty: 50,
  excessCutPct: 0,
  cuttingQtyMult: 1,
  poData: {
    colors: [{ name: 'Indigo', qty: 50 }],
    sizeGroups: [{ name: 'Kids', qty: 50 }],
    allSizes: sizes,
    sgMatrix: [{ sgName: 'Kids', colors: [{ colorName: 'Indigo', qty: 50, sizes }] }],
  },
}

const rules = [
  ['Generic', null, '105.0'],
  ['By Color', { Indigo: 2 }, '105.0'],
  ['By Size Group', { Kids: 2 }, '105.0'],
  ['By Individual Sizes', { '4': 2, '6': { na: true } }, '63.0'],
  ['Configure Own', { __matrix: [{ sgName: 'Kids', colorName: 'Indigo', consumption: 2 }] }, '105.0'],
  ['Configure Own', { __groups: [{ sizes: ['6'], consumption: 2 }] }, '42.0'],
  ['By Batch', { __batches: [{ cells: [{ sgName: 'Kids', colorName: 'Indigo', size: '4' }], consumption: 2 }] }, '63.0'],
]
for (const [usage_rule, usage_data, expected] of rules) {
  test(usage_rule + ' uses the PO quantity and allowance', () => {
    const line = { usage_rule, usage_data, base_qty: 2, wastage: 5 }
    assert.equal(calculateBOMFinalQty(line, context), expected)
    assert.equal(calculateBOMFinalQty({ ...line, usage_data: JSON.stringify(usage_data) }, context), expected)
  })
}
