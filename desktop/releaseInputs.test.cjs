'use strict'
// Verify the distributable contains the original application and its offline runtime.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict')
const root=path.resolve(__dirname,'..'),pkg=require('./package.json')
assert.equal(pkg.main,'main.cjs')
assert.equal(pkg.build.mac.target[0].arch[0],'x64')
assert.equal(pkg.build.extraResources[0].to,'web')
for(const file of pkg.build.files){assert.ok(fs.existsSync(path.join(__dirname,file)),'Missing packaged desktop file: '+file)}
for(const file of ['index.html','offline-desktop.html'])assert.ok(fs.statSync(path.join(root,'dist',file)).size>0,'Missing built screen: '+file)
const assets=fs.readdirSync(path.join(root,'dist','assets'))
assert.ok(assets.some(x=>x.endsWith('.js')),'Missing packaged application JavaScript')
assert.ok(assets.some(x=>x.endsWith('.zip')),'Missing offline QMS Excel templates')
const original=fs.readFileSync(path.join(root,'src','App.jsx'),'utf8')
for(const page of ['Orders','Production','Purchasing','Shipping','Reports','Sampling'])assert.ok(original.includes(page),'Original app route absent: '+page)
const main=fs.readFileSync(path.join(__dirname,'main.cjs'),'utf8')
for(const api of ['/api/offline/records','/api/offline/mutate','/api/offline/upsert-batch'])assert.ok(main.includes(api),'Offline API missing: '+api)
console.log('Intel desktop release inputs, original routes, SQLite APIs and QMS archive verified')
