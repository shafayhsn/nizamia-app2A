# Phase 13.6 — Shipment & Payment Status / Adjustments — TEST

Cumulative source based on Phase 13.5.

## Changes
- Shipment statuses: Gate-In, In-Transit, Discharged, Gate-Out, Delivered. Status changes saved in shipment notes metadata to avoid violating the existing DB shipment-status constraint; previous raw database status is preserved.
- Shipment status history appended to metadata. No shipment-line or order updates on status changes.
- Payments: Not Due, Due, Overdue, Partial Paid, Buyer Paid, Settled; calculated from buyer credits, approved invoice adjustments, due date, tax and rebate claims. Manual status changes supported, but Buyer Paid and Settled require the corresponding accounting conditions.
- Multi-select shipment and payment status filters, Select All/Clear. Legacy shipment statuses remain visible on initial load.
- Invoice adjustment ledger for quality claims, shortages, discounts, other; original invoice retained.
- Bank credit receipts recorded as individual entries with date, invoice currency amount, and FX rate. Existing legacy totals retained.
- Tax refund expected calculated as Settings refund percentage of invoice value converted to PKR; rebate uses Settings rebate percentage. Both can be marked not applicable.
- Payment saving awaits database response; errors are displayed rather than silently ignored.

## IMPORTANT — test only
- Source syntax parsed with TypeScript JSX parser without diagnostics. Full Vite production build was NOT completed: dependencies could not be installed reliably in this environment.
- No live Supabase data modified. No SQL migration executed.
- Records are stored in existing `payment_settlements.payload` JSON; the transaction list is not a separate SQL ledger table. Review concurrency, RLS, and settlement editing on a staging instance before production.
- The full Orders-based Booking redesign was not included in this patch.
- No end-to-end browser test or production deployment performed.
- Back up your Supabase data before testing writes.
