# Phase 13.8 — TEST SOURCE ONLY

- Payments: prominent top-right Update Info action with shipment selector if no row selected.
- Payments: removed duplicate Update Info toolbar pencil; kept Change Status separate.
- KPI cards and toolbars: adjustments toward Orders styling.
- Legacy settled handling: UI recognizes `payment_settlements.payload.legacy_settled === true`, displays Settled, excludes outstanding from totals, and prevents status edits for archived settlements.
- No artificial cash receipts are created.

## CRITICAL
The live database historical-settlement update was NOT applied: a database constraint rejected setting shipment status to Delivered, and the subsequent settlement write was blocked. The app continues to read original records until they are properly archived. Existing shipment notes already display Delivered; database shipment status is Open.

Production build NOT verified: npm dependency installation timed out. Do not deploy this ZIP to production without a successful build and staging tests. The 3-column settlement UI remains from Phase 13.7.
