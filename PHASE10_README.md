# Phase 10 test build

Changes: A4 narrow-margin print layouts in Reports, Sampling Program, PrintReports, and selected Orders documents; notification panel with All/Unread, per-alert Mark read, Mark all as read, unread badge, and urgency/date sorting. No Clear option.

## Important integration note
This app uses custom `public.users` login, not Supabase Auth. The client-side notification read receipts are scoped by user ID and browser, but **cannot be secured or reliably synchronized across devices** without a trusted server/API that validates the current app user. The optional migration `migrations/20261016_notification_reads.sql` creates a receipts table but is NOT applied. Before enabling cross-device sync, build an authenticated backend/RPC for this table and use that instead of direct anonymous client writes. Do not treat user_id provided by the browser as authorization.

Print documents use several distinct templates. This phase narrows key templates but is not a complete audit of every legacy printable surface. Some long-content page breaks still require print-preview validation.

Validation: ZIP structure check only; Node 24 build/browser testing pending.
