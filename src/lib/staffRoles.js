const workflows = {
  hr: {path:'/hr', title:'HR & Attendance', actions:'Manage employee records and attendance.'},
  production_incharge: {path:'/staff/production', title:'Production Log', actions:'Record daily production quantities.'},
  sample_room: {path:'/staff/sampling', title:'Sampling', actions:'Update sample stages and download sampling programs.'},
  storekeeper: {path:'/staff/receiving', title:'Expected Deliveries', actions:'Receive goods against approved, issued purchase orders.'},
}

export function staffWorkflow(role) {
  const key = String(role || '').toLowerCase()
  return Object.hasOwn(workflows,key) ? workflows[key] : null
}
