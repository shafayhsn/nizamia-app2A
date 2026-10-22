# Phase 9 Sampling Program correction (TEST)

- Program: lightweight milestone timeline and emphasized sample-specification box.
- BOM column order: Type, Item, Detail, Consumption/pc, Required.
- Full item name includes saved specification (e.g., Denim - Blue).
- By Size Group consumption resolves using sample size-group name or unambiguous sample size range.
- Generic usage unchanged; By Color requires an unambiguous match. Unsupported/ambiguous usage shows a dash, never a fabricated value.
- BOM per-piece requirements exclude order-level cutting/wastage allowances, as requested for sample cutting.
- Existing Orders Wizard calculations and Supabase data unchanged.
- Order audit: (225*0.60 + 294*0.90)*1.05 cutting*1.05 wastage = 440.559m, rounded to 440.6m saved.
- QA needed: verify sample size/group metadata and print layout in browser.
