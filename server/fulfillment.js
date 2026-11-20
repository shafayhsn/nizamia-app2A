const actions = {
  readStoreReceipts: 'read_store_receipts',
  postStoreReceipt: 'post_store_receipt',
  readWorkOrderTracking: 'read_work_order_tracking',
  postWorkOrderMovement: 'post_work_order_movement',
  editTrackedWorkOrder: 'edit_tracked_work_order',
}

export function isFulfillmentAction(action) {
  return Object.hasOwn(actions, action)
}

export async function fulfillment(req, res, db, user, action) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })
  const { operation, target, date, reference, quantity, accepted, rejected, movement, notes, query, afterId } = req.body
  const reading = action.startsWith('read')
  const uuid = value => typeof value === 'string' && /^[a-f\d]{8}-(?:[a-f\d]{4}-){3}[a-f\d]{12}$/i.test(value)
  const validQuantity = value => typeof value === 'string' && /^\d{1,9}(\.\d{1,3})?$/.test(value)
  const validText = (value, max) => typeof value === 'string' && value.length <= max
  let args
  if (action === 'editTrackedWorkOrder') {
    const { expectedTime, header, lines } = req.body
    if (!uuid(target) || !header || typeof header !== 'object' || Array.isArray(header) ||
      (expectedTime !== null && !validText(expectedTime, 50)) ||
      (lines !== null && (!Array.isArray(lines) || lines.length > 200)))
      return res.status(400).json({ error: 'Check the work order fields and lines.' })
    args = { target, expected_time: expectedTime, header, lines }
  } else if (reading) {
    if ((target != null && !uuid(target)) || (afterId != null && !uuid(afterId)) || !validText(query ?? '', 120))
      return res.status(400).json({ error: 'Invalid register filter.' })
    args = { query: query ?? '', after_id: afterId ?? null, target: target ?? null }
  } else {
    if (!uuid(operation) || !uuid(target) || !validText(date, 10) ||
        !/^\d{4}-\d{2}-\d{2}$/.test(date) || !validQuantity(quantity) || Number(quantity) <= 0 ||
        !validText(reference, 120) || !reference.trim() || !validText(notes ?? '', 500))
      return res.status(400).json({ error: 'Check the date, reference, and quantity.' })
    args = { operation, target, event_date: date, reference, amount: quantity, memo: notes ?? '' }
    if (action === 'postStoreReceipt') {
      if (!validQuantity(accepted) || !validQuantity(rejected))
        return res.status(400).json({ error: 'Enter accepted and rejected quantities.' })
      Object.assign(args, { accepted_qty: accepted, rejected_qty: rejected })
    } else {
      if (!/^\d{1,9}$/.test(quantity) || !['dispatch', 'dispatchRework', 'accept', 'rework', 'reject'].includes(movement))
        return res.status(400).json({ error: 'Choose a movement and enter a whole piece quantity.' })
      args.movement = movement
    }
  }
  const { data, error } = await db.rpc(actions[action], { actor: user.id, ...args })
  if (error) {
    if (error.code === '42501') return res.status(403).json({ error: 'Your role does not have access to this operation.' })
    if (['22P02', '22007', '22008', '22023', '22003', '23514', '23502', '23503'].includes(error.code)) {
      const message = {
        postStoreReceipt: 'Check the date and quantities. Accepted and rejected quantities cannot exceed the delivery.',
        postWorkOrderMovement: 'Check the movement date and quantity.',
        editTrackedWorkOrder: 'Check the work order fields and lines.',
      }
      return res.status(400).json({ error: message[action] || 'Check the register filter.' })
    }
    return res.status(503).json({ error: 'Could not confirm the request. Check your connection and retry.' })
  }
  if (action === 'editTrackedWorkOrder' && (data === 'tracked' || data === 'conflict'))
    return res.status(409).json({ error: data === 'tracked'
      ? 'Work order lines with posted movements are protected. Reopen the work order to update its status.'
      : 'The work order changed. Reopen it before saving.' })
  if (data === 'conflict') return res.status(409).json({ error: 'The line could not be posted. Refresh and check the document status and current balance.' })
  return res.json(reading ? data : { ok: true })
}
