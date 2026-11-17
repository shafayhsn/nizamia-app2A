'use strict'
const assert = require('node:assert/strict')
const {planDraft,planBatch,operationId,validateDraft} = require('./offlineSyncPlanner.cjs')
const draft = {draftId:'11111111-1111-4111-8111-111111111111',status:'uncommitted',table:'orders',recordId:'order-1',snapshotHash:'a'.repeat(64),before:{notes:'original'},changes:{notes:'offline edit'}}
const authorized = {identity:'worker-1',authorizedTables:['orders']}
assert.deepEqual(validateDraft(draft),['notes'])
assert.equal(planDraft(draft,{id:'order-1',notes:'original'},authorized).decision,'ready')
assert.equal(planDraft(draft,{id:'order-1',notes:'changed in cloud'},authorized).reason,'cloud-field-changed')
assert.equal(planDraft(draft,null,authorized).reason,'record-missing')
assert.equal(planDraft(draft,{id:'order-1',notes:'original'},{identity:'worker-1',authorizedTables:[]}).decision,'blocked')
assert.equal(operationId(draft),operationId({...draft}))
const records = new Map([['orders:order-1',{id:'order-1',notes:'original'}]])
const batch = planBatch([{identity:'worker-1',draft},{identity:'worker-1',draft:{...draft,draftId:'22222222-2222-4222-8222-222222222222'}}],records,authorized)
assert.equal(batch[0].decision,'ready')
assert.equal(batch[1].reason,'overlapping-batch-fields')
assert.equal(planBatch([{identity:'other',draft}],records,authorized)[0].reason,'identity-mismatch')
assert.throws(()=>validateDraft({...draft,changes:{password:'secret'}}),/Unsupported/)
assert.throws(()=>planBatch(new Array(101).fill({identity:'worker-1',draft}),records,authorized),/Invalid sync batch/)
console.log('Offline sync planner safety tests passed (no network or database writes)')
