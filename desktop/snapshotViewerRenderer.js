'use strict'
const $ = id => document.getElementById(id)
let tables = [], selected = null, offset = 0
function cell(value) {
  if (value == null) return ''
  const str = typeof value === 'object' ? JSON.stringify(value) : String(value)
  return str.length > 500 ? str.slice(0, 500) + '…' : str
}
async function loadPage() {
  $('status').textContent = 'Reading local SQLite…'
  $('columns').replaceChildren(); $('rows').replaceChildren()
  try {
    const data = await window.localSnapshot.rows(selected.name, offset)
    const cols = [...new Set(data.flatMap(row => Object.keys(row)))]
    const tr = document.createElement('tr')
    for (const col of cols) { const th = document.createElement('th'); th.textContent = col; tr.append(th) }
    $('columns').append(tr)
    for (const row of data) {
      const tr = document.createElement('tr')
      for (const col of cols) { const td = document.createElement('td'); td.textContent = cell(row[col]); td.title = cell(row[col]); tr.append(td) }
      $('rows').append(tr)
    }
    $('heading').textContent = selected.name + ' (' + selected.count.toLocaleString() + ')'
    $('status').textContent = selected.count ? 'Showing ' + (offset+1) + '–' + (offset+data.length) + ' of ' + selected.count : 'No records in this table'
    $('prev').disabled = offset === 0
    $('next').disabled = offset + data.length >= selected.count
  } catch (error) { $('status').textContent = 'Unable to read snapshot: ' + error.message }
}
async function selectTable(item) {
  selected = item; offset = 0
  for (const el of document.querySelectorAll('.item')) el.classList.toggle('active', el.dataset.table === item.name)
  await loadPage()
}
$('prev').addEventListener('click', () => { if (selected && offset >= 25) { offset -= 25; loadPage() } })
$('next').addEventListener('click', () => { if (selected && offset+25 < selected.count) { offset += 25; loadPage() } })
async function start() {
  try {
    tables = await window.localSnapshot.tables()
    for (const item of tables) {
      const btn = document.createElement('button')
      btn.className = 'item'; btn.dataset.table = item.name
      const name = document.createElement('span'); name.textContent = item.name
      const count = document.createElement('span'); count.textContent = item.count.toLocaleString()
      btn.append(name, count); btn.addEventListener('click', () => selectTable(item))
      $('tables').append(btn)
    }
    $('status').textContent = tables.length + ' local tables available. Choose one to inspect.'
  } catch (error) { $('status').textContent = 'Could not open local snapshot: ' + error.message }
}
start()
