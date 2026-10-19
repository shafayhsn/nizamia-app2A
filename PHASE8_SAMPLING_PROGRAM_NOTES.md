# Phase 8 — Sampling Program and Table Filters (TEST)

- Replaced Sampling > Program with A4 portrait production-floor layout.
- Dates: created/requested +1 pattern, due -2 wash, due ready; chronological version history.
- Current order BOM: base_qty * sample qty; priority fabric, thread, zipper. Complex usage rules are not recalculated in this build.
- Fitting spec_code from order fitting_blocks; image from saved order.
- Customer/Type/Stage/Approval multi-select; grouping and selections persist in browser localStorage.
- No Supabase writes or migrations.
- Requires browser QA and Node 24 production build.
