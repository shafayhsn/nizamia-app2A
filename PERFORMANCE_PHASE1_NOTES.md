# Performance Phase 1 — route-based loading
- Converted page component imports to React.lazy and added Suspense fallback around the existing route tree.
- No business logic, Supabase queries, schemas, calculations, report logic, or navigation paths changed.
- This reduces the initial JavaScript bundle by loading page code only when that page is visited.
- Does not yet optimize database latency or per-page data fetches.
- TEST: Build not verified in this environment (Vite executable unavailable; local Node 22 vs project Node 24).
