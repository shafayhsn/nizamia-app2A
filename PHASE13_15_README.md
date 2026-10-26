# Phase 13.15 — INCOMPLETE SECURITY PREVIEW (not production ready)

Implemented in source:
- Operations section with Reports and Tasks.
- Tasks page: My Tasks, Assigned by Me, permission-gated All Tasks, Completed; create task, change status, comments.
- Tasks shortcut after notification bell without counter.
- Existing Settings User Management popup has Users & Rights and Roles & Permissions tabs.
- Sync indicator uses tracked Supabase HTTP write responses: Connected, Syncing, Synced, Sync Error, Offline.

NOT COMPLETE / DO NOT DEPLOY AS A CONFIDENTIALITY RELEASE:
- No safe server-side enforcement of shipment/payment access or buyer contact confidentiality.
- App currently uses public.users application-table login rather than Supabase Auth; browser role checks are not a secure access boundary.
- Task tables are not installed; migrations/phase13_15_tasks.sql is a schema proposal only. Tasks require secure authenticated API / RLS before live use.
- Notification bell not yet integrated with task assignments and reminders; no server-side reminder scheduler.
- Sync indicator only tracks writes made via shared Supabase client in this browser, not external/background changes.
- No Vite compilation or end-to-end tests completed.

No live Supabase changes made.
