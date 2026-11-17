# CP-20: Online / offline database alignment audit (2026-11-17)

Status: read-only discovery; no production schema changes.

## Verified live source
Supabase project: nizamia-oms (dmsplpbpnbijrfjskjcc).
Public schema: **71 base tables and 728 columns** (information_schema).
These counts are a snapshot, not a hardcoded target.

## Desktop baseline
CP-19 / v0.1.5 stores SQLite metadata and imported records in generic snapshot_rows and snapshot_manifest tables; it is **not** a native 71-table SQLite mirror.
Existing offlineSyncPlanner allows notes/remarks changes only on orders and production_daily_entries.
Existing offlineWorkspace requires trusted authorization and synchronization endpoints; absent configuration keeps writes disabled.
The existing update checker already sorts releases and selects the highest version. Investigate duplicate UI prompts separately.

## Implementation gates
1. Export and review public schema: columns, types, defaults, PK/FK, indexes, and RLS/access rules; exclude secrets, authentication internals, and non-client tables.
2. Define signed/versioned, backend-approved offline schema manifest; never execute untrusted arbitrary SQL from a remote response.
3. Build deterministic SQLite migrations for eligible tables; add, alter, rename, retire safely. Never drop uncommitted drafts or delete data on a mere table-name mismatch.
4. Transactional migration with verified pre-migration backup, integrity checks, and recovery; retain previous app and data.
5. Separate structural migration from authorized incremental record sync (including deletes, conflict detection, and offline write journal).
6. Report real step completion and checked/changed/unchanged table counts; do not simulate progress.
7. Present one latest compatible release and readable release notes after restart.

## Not yet verified
Local Mac's actual SQLite table count and data cannot be remotely inspected.
Real-world end-to-end sync, schema migration, and offline CRUD have not been demonstrated.
No production Supabase changes should be made as part of this audit.
