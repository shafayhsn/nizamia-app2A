Phase 13.18 — TEST / UNVERIFIED
Base: Phase 13.17 supplied package.
Implemented: topbar connection indicator is green when connected, clickable session-based last confirmed Supabase write popup; Order Wizard minimize/restore via persistent Layout host; bottom-right dock; Order Wizard remains mounted while navigating between pages; existing sidebar Calendar retained.
Important limitations: Only Order Wizard supports minimize/restore in this build. Other data-entry modals have not been migrated. No browser-refresh draft persistence. The close button on minimized windows discards unsaved edits. Only one Order Wizard window is supported. Existing trackedFetch tracks HTTP-level Supabase REST writes, not every background write or business transaction.
Build: NOT VERIFIED. npm install did not complete; vite binary unavailable. Do not deploy to production without npm install, npm run build, and user acceptance tests.
