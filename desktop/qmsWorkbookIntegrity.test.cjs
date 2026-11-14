'use strict'
// Validate all production Excel templates are truly available offline and readable.
const assert=require('node:assert/strict')
const fs=require('node:fs'),path=require('node:path')
const JSZip=require('jszip')
const archive=path.join(__dirname,'..','QMS Excel formats.zip')
const page=fs.readFileSync(path.join(__dirname,'..','src/pages/ProductionFormats.jsx'),'utf8')
const match=page.match(/const FORMATS=\[([\s\S]*?)\]\.map\(\(name,index\)/)
assert.ok(match,'Original QMS catalog missing')
const names=[...match[1].matchAll(/"([^"]+)"/g)].map(x=>x[1]+'.xlsx')
assert.equal(names.length,40,'Expected all 40 QMS reports')
;(async()=>{
 const zip=await JSZip.loadAsync(fs.readFileSync(archive))
 const files=Object.values(zip.files).filter(f=>!f.dir&&!f.name.startsWith('__MACOSX/'))
 for(const name of names){
  const file=files.find(f=>f.name.split('/').pop()===name)
  assert.ok(file,'Missing original QMS workbook: '+name)
  const workbook=await JSZip.loadAsync(await file.async('nodebuffer'))
  for(const part of ['[Content_Types].xml','xl/workbook.xml','xl/worksheets/sheet1.xml'])assert.ok(workbook.file(part),name+' missing '+part)
  const xml=await workbook.file('xl/worksheets/sheet1.xml').async('string')
  assert.ok(/<row\\b/.test(xml),name+' missing worksheet rows')
 }
 process.stdout.write('All '+names.length+' original QMS Excel templates verified in offline archive.\\n')
})().catch(error=>{console.error(error);process.exitCode=1})
