'use strict'
const assert=require('node:assert/strict');
const {validateInventory,planSchema,applySchema,affinity}=require('./offlineSchemaAlignment.cjs');
const inventory={tableCount:2,columnCount:4,tables:[
 {table_name:'orders',columns:[{name:'id',type:'uuid'},{name:'notes',type:'text'},{name:'pieces',type:'int4'}]},
 {table_name:'users',columns:[{name:'id',type:'uuid'}]}]};
assert.equal(validateInventory(inventory),true);
assert.equal(affinity('jsonb'),'TEXT');
assert.throws(()=>planSchema({inventory,allowedTables:['users']}),/allowlist/);
assert.throws(()=>validateInventory({...inventory,columnCount:3}),/count mismatch/);
let plan=planSchema({inventory,allowedTables:['orders']});
assert.equal(plan.counts.created,1);
const localOnly=planSchema({inventory,allowedTables:['orders'],localTables:{offline_draft_journal:[{name:'id',type:'TEXT'}]}});
assert.equal(localOnly.canApply,true);
assert.equal(localOnly.counts.retiredCandidates,0);
assert.equal(plan.operations[0].sql,'CREATE TABLE "offline_orders" ("id" TEXT, "notes" TEXT, "pieces" INTEGER)');
plan=planSchema({inventory,allowedTables:['orders'],localTables:{offline_orders:[{name:'id',type:'TEXT'},{name:'notes',type:'TEXT'}]}});
assert.equal(plan.counts.addedColumns,1);
assert.equal(plan.canApply,true);
const manual=planSchema({inventory,allowedTables:['orders'],localTables:{offline_orders:[{name:'id',type:'INTEGER'},{name:'notes',type:'TEXT'},{name:'old_field',type:'TEXT'}]}});
assert.equal(manual.canApply,false);
assert.throws(()=>applySchema({},manual),/requires review/);
const statements=[];const db={run:s=>statements.push(s),exec:s=>s==='PRAGMA integrity_check'?[{values:[['ok']]}]:[]};
const applied=applySchema(db,plan);
assert.equal(applied.applied,1);assert.equal(statements[0],'BEGIN IMMEDIATE');assert.equal(statements.at(-1),'COMMIT');
const bad={run:s=>statements.push(s),exec:()=>[{values:[['corrupt']]}]};
assert.throws(()=>applySchema(bad,plan),/integrity/);
assert.equal(statements.at(-1),'ROLLBACK');
console.log('Offline schema alignment planner tests passed');
