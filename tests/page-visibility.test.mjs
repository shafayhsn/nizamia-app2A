import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { MODULES, can } from '../src/lib/permissions.js'

test('every signed-in page has its own role setting or an admin-only rule', () => {
  const routes = readFileSync(new URL('../src/App.jsx', import.meta.url), 'utf8')
  const keys = new Set(MODULES.map(page => page.key))
  for (const [, path, element] of routes.matchAll(/<Route path="([^"]+)" element=\{(.*?)\} \/>/g)) {
    if (['/login', '*'].includes(path)) continue
    if (path === '/hr') {
      assert.match(element, /<ProtectedRoute hr>/)
      continue
    }
    const key = ['settings/users','settings/hr'].includes(path) ? 'settings' : path.replace(/\/\*$/, '')
    assert.ok(keys.has(key), path)
    if (path === 'dashboard') assert.match(element, /DashboardEntry/)
    else assert.ok(element.includes('RequireRight module="' + key + '"'), path)
  }
  const hr = {role:'hr',permissions:Object.fromEntries([...keys].map(key => [key,{view:true,create:true}]))}
  for (const key of keys) assert.equal(can(hr,key),false)
  for (const hidden of keys) {
    const permissions = Object.fromEntries([...keys].map(key => [key, {view:key !== hidden}]))
    const role = {role:'future-team-role', role_id:'example', permissions}
    for (const key of keys) assert.equal(can(role,key), key !== hidden && key !== 'settings')
    assert.equal(can(role,'shipping.payments'),false)
    assert.equal(can({role:'admin'},hidden),true)
  }
})
