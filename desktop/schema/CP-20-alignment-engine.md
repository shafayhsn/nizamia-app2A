# CP-20 schema alignment — development batch

This batch adds a **conservative schema planner**, not live auto-migration.
It uses the 71-table inventory captured from nizamia-oms on 2026-11-17.

Safeguards:
- Offline tables must be explicitly approved on a per-table allowlist; online presence is not sufficient authorization.
- Tables are namespaced as offline_* to avoid touching existing snapshot, draft journal, or metadata storage.
- Creates missing tables and adds missing columns. Does not drop/rename columns or tables, overwrite rows, or assume PostgreSQL types/defaults translate directly.
- Type mismatches, missing online columns, and retired tables require manual review.
- SQL identifiers are validated, generated SQL is deterministic, and changes run in a transaction with SQLite integrity check.
- Progress is based on completed statements, never a simulated percentage.

Before enabling on user machines:
1. Define allowed client tables and fields, including RLS policy analysis.
2. Extend schema inventory to indexes, FKs, defaults, and rename history.
3. Add verified file-level backup and atomic replacement around sql.js export.
4. Wire to startup/update lifecycle and genuine progress window.
5. Implement authenticated incremental row sync and conflict resolution.
6. Run real SQLite integration tests and power-loss recovery tests.

No changes to production Supabase or web app. This module is deliberately not invoked on startup.
