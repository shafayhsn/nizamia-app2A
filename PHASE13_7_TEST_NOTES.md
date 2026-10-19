# Phase 13.7 — UI Consistency (TEST / NOT PRODUCTION VERIFIED)

Source: Phase 13.6 cumulative test package.

Implemented in `src/pages/Shipping.jsx`:
- Shipments: Record Past Shipment moved to header, Print Summary header action removed.
- Shipment and payment statuses displayed under shipment number; separate status columns hidden.
- Buyer column in Shipments, including historic buyer data.
- Orders-inspired grouped action controls (status/edit, print/export, delete/settings where applicable).
- Bulk shipment/payment status change dialogs; payment status restrictions for Buyer Paid and Settled remain.
- Multi-select status filters and persistent search/group/sort/status filters via browser localStorage.
- Payments: subheading and quick-filter pills removed, print/export moved to main toolbar.
- Fixed filtered totals footers for Shipments and Payments.
- Settlement popup: three-column Buyer / Tax / Rebate overview, receivable/received/balance cards, expandable update entry form. Existing adjustments, partial receipts and tax/rebate controls preserved.

IMPORTANT:
- Source-only TEST ZIP. Production build and browser integration tests have NOT passed / could not be run (Node 24 and dependencies unavailable).
- No Supabase data or migrations were changed.
- The KPI and toolbar styling is Orders-inspired, not yet verified pixel-identical.
- Test on staging, not on production financial records. Verify historical entry, receipts, tax/rebate and manual status updates before any live deployment.
