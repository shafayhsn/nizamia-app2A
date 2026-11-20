import assert from 'node:assert/strict'
import test from 'node:test'
import { summarizeStoreReceipts, summarizeWorkOrder } from './fulfillmentBalances.mjs'

test('store distinguishes delivered, rejected, held and still due', () => {
  const first = { quantity: 400, accepted: 350, rejected: 50 }
  const second = { quantity: 300, accepted: 200, rejected: 0 }
  assert.deepEqual(summarizeStoreReceipts(1000, [first, second]), {
    ordered: 1000, delivered: 700, accepted: 550, held: 100, rejected: 50,
    pending: 450, excessAccepted: 0
  })
})

test('store flags excess separately and rejects impossible quality totals', () => {
  assert.equal(summarizeStoreReceipts(1000, [{ quantity: 1100, accepted: 1100, rejected: 0 }]).excessAccepted, 100)
  assert.throws(() => summarizeStoreReceipts(1000, [{ quantity: 400, accepted: 350, rejected: 75 }]), /exceed/)
})

test('work order counts a piece only once after rework is completed', () => {
  const movements = [
    { type: 'dispatch', quantity: 2000 },
    { type: 'accept', quantity: 1100 },
    { type: 'rework', quantity: 100 }
  ]
  assert.deepEqual(summarizeWorkOrder(2000, movements), {
    ordered: 2000, awaitingDispatch: 0, out: 800, accepted: 1100, rework: 100, rejected: 0
  })
  movements.push({ type: 'dispatchRework', quantity: 100 }, { type: 'accept', quantity: 100 })
  assert.deepEqual(summarizeWorkOrder(2000, movements), {
    ordered: 2000, awaitingDispatch: 0, out: 800, accepted: 1200, rework: 0, rejected: 0
  })
})

test('work order rejects impossible dispatches and returns', () => {
  assert.throws(() => summarizeWorkOrder(2000, [{ type: 'dispatch', quantity: 2001 }]), /exceeds/)
  assert.throws(() => summarizeWorkOrder(2000, [{ type: 'accept', quantity: 1 }]), /outstanding/)
  assert.throws(() => summarizeWorkOrder(2000, [{ type: 'dispatchRework', quantity: 1 }]), /rework quantity/)
})
