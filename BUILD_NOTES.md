# App-2A consolidated source preview — 2026-10-12

This is a source-level preview, not a production-certified build. The environment could not install npm dependencies or complete Vite compilation.

Changes in this preview:
- Orders: buyer multi-select (all, clear, checkbox selection).
- Queues: default Open view; derived Completed for orders marked Shipped, Cancelled for cancelled orders. Does not write queue status back to database.
- Dashboard: all orders loaded (instead of 100 limit), sample due dates from samples table, current open order totals, actual quarterly PO totals. On-time delivery metrics intentionally unavailable without verified shipment-date data.
- Purchasing PO/WO print: document number in HTML print title (browser PDF save default).
- Magic Groups: visual styling tightened; logic unchanged.
- Settings UI: draft colour preview now matches selected palette.
- Existing Purchasing material/process demand filters and washing consolidation remain as in uploaded base.

Not yet verified: Vite build, browser regression, Supabase runtime, end-to-end report accuracy, queue status persistence, comprehensive wizard validation.
No Supabase data was changed or deleted.
