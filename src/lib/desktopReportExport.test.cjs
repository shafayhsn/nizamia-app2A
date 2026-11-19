const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const test = require('node:test')
const JSZip = require('jszip')

test('all 40 QMS workbooks contain a printable worksheet and template headers', async () => {
  const root = path.join(__dirname, '../..')
  const zip = await JSZip.loadAsync(fs.readFileSync(path.join(root, 'QMS Excel formats.zip')))
  const names = JSON.parse(fs.readFileSync(path.join(root, 'src/pages/ProductionFormats.jsx'), 'utf8')
    .match(/const FORMATS=(\[.*?\])\.map/)[1])
  assert.equal(new Set(names).size, 40)
  for (const name of names) {
    const file = Object.values(zip.files).find(f => !f.dir && f.name.split('/').at(-1) === name + '.xlsx')
    assert.ok(file, name)
    const book = await JSZip.loadAsync(await file.async('nodebuffer'))
    const sheet = await book.file('xl/worksheets/sheet1.xml').async('string')
    assert.match(sheet, /<(?:x:)?row\b[^>]*\br="9"/, name)
  }
})

test('desktop PDF export preserves report HTML and surfaces save failures and cancellation', async t => {
  const { saveDesktopPdf } = await import('./saveDesktopPdf.mjs')
  const fetch = t.mock.method(globalThis, 'fetch', async (url, options) => {
    assert.equal(url, '/api/offline/pdf')
    assert.deepEqual(JSON.parse(options.body), {html: '<html>report</html>', filename: 'QMS'})
    return Response.json({cancelled:true})
  })
  assert.deepEqual(await saveDesktopPdf('<!DOCTYPE html><html>report</html>', 'QMS'), {cancelled:true})
  fetch.mock.mockImplementation(async () => Response.json({error:'Disk full'}, {status:500}))
  await assert.rejects(saveDesktopPdf('<html/>','QMS'), /Disk full/)
})
