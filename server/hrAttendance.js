const commands = new Set(['list', 'saveEmployee', 'archiveEmployee', 'saveAttendance'])

export async function hrAttendance(req, res, db, user) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed.' })
  const { command, fields } = req.body
  if (!commands.has(command) || !fields || typeof fields !== 'object' || Array.isArray(fields)) {
    return res.status(400).json({ error: 'Invalid HR request.' })
  }
  const { data, error } = await db.rpc('hr_attendance_action', { actor: user.id, command, fields })
  if (error?.code === '42501') return res.status(403).json({ error: 'HR access required.' })
  if (error?.code === '23505') return res.status(409).json({ error: 'This employee number is already in use.' })
  if (error) {
    const invalid = error.code?.startsWith('22') || error.code?.startsWith('23')
    return res.status(invalid ? 400 : 503).json({ error: invalid
      ? 'Check the employee fields, date, and times.'
      : 'Could not load or save HR records.' })
  }
  if (data?.result === 'missing') return res.status(409).json({ error: 'This employee is no longer active.' })
  return res.json(data)
}
