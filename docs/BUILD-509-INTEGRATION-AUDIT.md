# Build 509 — desktop/web integration audit (2026-11-18)

Scope: repository implementation review on `feature/CP-18-sqlite-foundation`. This is a code audit, **not** proof of a live Supabase connection or a passing macOS DMG.

## Verified implementation and gaps

| Area | Verified code | Release gap |
| --- | --- | --- |
| Desktop UI | `desktop/main.cjs` loads bundled React SPA at `app2a://local/` | Verify parity with latest deployed web build; bundled UI can still depend on online APIs |
| Desktop authentication | `desktop/localDesktopAuth.cjs` enrolls verified online accounts for offline sign-in; `api/oms.js` issues scoped snapshot token | Verify token renewal, non-admin permissions, and restart/login behavior |
| Cloud download | `desktop/snapshotDownloadClient.cjs` validates HTTPS snapshot envelope; `api/desktop/snapshot.js` reads Supabase | Endpoint currently exports **only orders, buyers, suppliers**, and rejects non-admin users; not a complete app mirror |
| SQLite import | `desktop/applyCloudSnapshot.cjs` creates rollback backup, merges into snapshot tables and checks integrity | Any standalone record, overlay, or pending draft blocks whole refresh; requires safe per-table/per-record reconciliation |
| Offline data | `desktop/offlinePendingStatus.cjs` inventories standalone records, snapshot edits and drafts | Snapshot rows do not automatically make every React page functional offline |
| Offline upload | `desktop/offlineSyncClient.cjs`, `desktop/offlineSyncCoordinator.cjs` and journal provide a bounded draft transport | No deployed, verified `/api/offline-sync` write handler; coordinator not wired to online sign-in; draft allowlist covers only notes/remarks in orders and production_daily_entries |
| Data scope | `desktop/snapshotMerge.cjs` preserves local tables and protects changed cloud bases | Standalone records and snapshot edits are not covered by the draft upload client |
| Backup | `desktop/applyCloudSnapshot.cjs` retains a separate pre-refresh SQLite backup | Test restore from backup and update preservation on actual Intel Mac |
| App updates | `desktop/main.cjs` calls desktop update startup confirmation | Verify download, signature/integrity, installation and rollback in packaged DMG |

## Required release sequence (Builds 510–518)

1. **510**: Determine authoritative business-table list from existing web backup schema and expose a permission-checked, paginated snapshot. Do not expand service-role access without row/role authorization.
2. **511**: Make authenticated refresh reliable; update unaffected cloud records without deleting pending local work.
3. **512**: Implement server-authorized conditional writes with durable idempotency for supported offline changes; use a separate scoped write token.
4. **513**: Wire main-process upload coordinator, retry, status and conflict handling; preserve local journal until server acknowledgement.
5. **514**: Compare bundled React assets and data paths to deployed web UI and fix mismatches.
6. **515**: Exercise supported offline workflows and document unsupported ones rather than pretending all pages work offline.
7. **516**: Run end-to-end Supabase → SQLite → Supabase tests including duplicate submissions, concurrent edits and disconnections.
8. **517**: Test backup/restore, updater and Intel Mac packaging with existing database.
9. **518**: Produce release DMG only if all acceptance checks pass; publish explicit failed checks otherwise.

## Release acceptance (must demonstrate, not infer)

- Login online, fetch full **authorized** business data, and see updated data on desktop.
- Edit a supported record offline, reconnect, upload exactly once, and observe the change in web app.
- Detect concurrent web/offline edits and retain unresolved local changes without overwriting cloud data.
- Restore from a backup and install an update without losing local SQLite or pending work.
- Confirm UI/UX parity and required offline workflows in a packaged Intel Mac app.

**Data safety rule:** Never delete, replace, or silently mark local records as synced until the server has durably confirmed them. Existing local SQLite and web backups must be retained through verification.
