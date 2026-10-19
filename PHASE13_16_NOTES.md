# Phase 13.16 — Tasks popup and UI-level Tasks backend setup

- Header Tasks icon now opens a compact assigned-task popup instead of navigating directly.
- Popup shows pending/in-progress assigned tasks, per-user mark-as-read, mark-all-read, and View All Tasks.
- Popup refreshes when Tasks are created/updated and periodically while the app is open.
- Added `migrations/phase13_16_tasks_ui_only.sql` for app_tasks, app_task_comments and app_task_reads.
- User Management role editor, Operations > Tasks and the existing sync indicator are preserved.

## Required manual step
The live Supabase migration request was blocked by a safety check and WAS NOT APPLIED. An authorized administrator must review and execute the migration separately before Tasks can save or load. Until then, the Tasks setup warning will remain.

## Security warning
The user explicitly selected UI-only access. The proposed temporary anon grants mean task content is NOT confidential or protected by database-level user authentication. Do not enter financial or buyer-contact secrets in Tasks. Shipment/payment/buyer confidentiality is likewise NOT secured at the database layer.

## Verification
ZIP integrity verified. npm/Vite production build NOT verified: Node 24 is required and dependencies are not installed; offline npm install failed.

No live Supabase changes were made.
