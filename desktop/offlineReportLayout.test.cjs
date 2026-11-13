'use strict'
const assert = require('node:assert/strict')
const { layoutRows, validateLayout } = require('./offlineReportLayout.cjs')
const rows = [{ id: '2', name: 'Beta', quantity: 10, notes: '=2+2' }, { id: '1', name: 'Alpha', quantity: 2, notes: 'ok' }, { id: '3', name: 'Gamma', quantity: null, notes: '' }]
assert.deepEqual(layoutRows(rows, { sortBy: 'quantity' }).map(x => x.id), ['1','2','3'])
assert.deepEqual(layoutRows(rows, { sortBy: 'quantity', descending: true }).map(x => x.id), ['2','1','3'])
assert.deepEqual(layoutRows(rows, { columns: ['name', 'quantity'], sortBy: 'name' }), [{ name: 'Alpha', quantity: 2 }, { name: 'Beta', quantity: 10 }, { name: 'Gamma', quantity: null }])
assert.deepEqual(layoutRows(rows), rows)
assert.throws(() => validateLayout({ columns: ['id','id'] }), /columns/)
assert.throws(() => validateLayout({ columns: ['password;DROP TABLE'] }), /columns/)
assert.throws(() => layoutRows(rows, { sortBy: 'missing' }), /sort column/)
assert.throws(() => layoutRows(rows, { columns: ['missing'] }), /column/)
assert.throws(() => validateLayout({ descending: 'yes' }), /sort/)
process.stdout.write('Offline report layout tests passed.\n')
