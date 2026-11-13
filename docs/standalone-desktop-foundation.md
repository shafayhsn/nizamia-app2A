# App-2A Standalone Desktop — Foundation Plan

Baseline: checkpoint/CP-15-complete-backup-fix (production). CP-16 remains separate.

## Findings
- React 18 + Vite 5 client, Supabase JS v2, and Vercel API functions.
- Browser client reads VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY; no database password is needed for normal authenticated API calls.
- The existing client is online-first. Packaging it in a desktop window does NOT make existing workflows offline-capable.
- Vercel /api/oms calls need explicit desktop URL configuration; relative paths do not automatically reach production APIs from a packaged app.

## Proposed architecture
- Electron desktop shell for both macOS and Windows, separate build targets; reuse existing React UI. macOS is the FIRST hands-on testing target because the owner tests on a Mac; Windows remains a required release target.
- SQLite lives only in the desktop main process, exposed through a minimal validated IPC interface.
- Never ship PostgreSQL passwords, service-role keys, or unrestricted SQL execution in the renderer.
- Keep local records and a durable outbox of pending mutations, with client-generated operation IDs for idempotency.
- Authenticated sync uses existing Supabase API/RLS and explicitly authorized server endpoints. Do not bypass permissions.
- Use per-entity conflict rules and revision tracking; never silently overwrite concurrent edits.
- Store attachments locally pending upload; encrypt sensitive local data where appropriate and protect sessions.
- Keep the web app unchanged.

## Implementation gates
1. Inventory all direct Supabase and /api/oms usage; classify online-only versus offline-ready.
2. macOS desktop shell proof of concept first: login online, navigate read-only, correct API base URL, no secret keys; then validate the equivalent Windows build.
3. Local SQLite schema and migrations, durable outbox and crash recovery; test without production writes.
4. Offline-first pilot for ONE workflow (proposed: production daily entries), with idempotent synchronization and conflict tests.
5. Test restart, disconnection, reconnection, duplicate submissions, authorization, backup and restore.
6. Produce macOS .dmg (Apple signing/notarization for trusted distribution) and Windows installer after successful validation. No production merge without approval.

## Current status
Architecture plan only. No installer, SQLite integration or offline synchronization implemented yet.

## Mac test hardware
- Initial tester reports Intel Mac, architecture x86_64 (to confirm via About This Mac).
- First macOS build target: darwin x64 / Intel .dmg; retain future arm64 support.
- Verify minimum supported macOS version and Electron compatibility before packaging.

- Tester confirmed MacBook Pro 13-inch 2017 model A1708 (Intel x86_64). Official macOS ceiling: Ventura 13. Verify installed macOS version and Electron minimum OS before packaging.
