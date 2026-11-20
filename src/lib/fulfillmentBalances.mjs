// Quantities use integral units: pieces for WOs, or the PO line's smallest
// tracked unit for materials that can be received in fractional quantities.
function quantity(value, label, allowZero = false) {
  if (!Number.isSafeInteger(value) || value < (allowZero ? 0 : 1)) {
    throw new RangeError(label + ' must be a safe integer in the line’s quantity units')
  }
  return value
}

export function summarizeStoreReceipts(orderedQuantity, receipts) {
  quantity(orderedQuantity, 'Ordered quantity', true)
  let delivered = 0
  let accepted = 0
  let held = 0
  let rejected = 0

  for (const receipt of receipts) {
    const total = quantity(receipt.quantity, 'Delivered quantity')
    const passed = quantity(receipt.accepted, 'Accepted quantity', true)
    const failed = quantity(receipt.rejected, 'Rejected quantity', true)
    if (passed > total || failed > total - passed) {
      throw new RangeError('Quality quantities exceed the delivery quantity')
    }
    delivered = quantity(delivered + total, 'Total delivered quantity')
    accepted += passed
    rejected += failed
    held += total - passed - failed
  }

  return {
    ordered: orderedQuantity,
    delivered,
    accepted,
    held,
    rejected,
    pending: Math.max(0, orderedQuantity - accepted),
    excessAccepted: Math.max(0, accepted - orderedQuantity)
  }
}

// Apply one work order line's movements in posting order. Returning work for
// rework frees it from the out balance until it is sent again.
export function summarizeWorkOrder(orderedQuantity, movements) {
  quantity(orderedQuantity, 'Work order quantity', true)
  let awaitingDispatch = orderedQuantity
  let out = 0
  let accepted = 0
  let rework = 0
  let rejected = 0

  for (const movement of movements) {
    const total = quantity(movement.quantity, 'Movement quantity')
    switch (movement.type) {
      case 'dispatch':
        if (total > awaitingDispatch) throw new RangeError('Dispatch exceeds the unissued quantity')
        awaitingDispatch -= total
        out += total
        break
      case 'dispatchRework':
        if (total > rework) throw new RangeError('Dispatch exceeds the rework quantity')
        rework -= total
        out += total
        break
      case 'accept':
      case 'rework':
      case 'reject':
        if (total > out) throw new RangeError('Return exceeds the outstanding quantity')
        out -= total
        if (movement.type === 'accept') accepted += total
        if (movement.type === 'rework') rework += total
        if (movement.type === 'reject') rejected += total
        break
      default:
        throw new TypeError('Unknown work order movement type')
    }
  }

  return { ordered: orderedQuantity, awaitingDispatch, out, accepted, rework, rejected }
}
