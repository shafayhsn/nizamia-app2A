# Phase 13.5 — Record Past Shipment (TEST)

Cumulative from Phase 13.4. Shipments > Record Past Shipment.
Historical summary form requires no order, booking, queue or item lines.
Saved in existing shipments table using notes metadata. No shipment_lines added, preserving Orders shipped quantities.
Historical values appear in Shipments and Payments. Initial credited amount can be entered; subsequent settlement edits use Payments.
Expected tax and rebate use settings rates applied to invoice value converted to PKR.

Limitations: This does NOT implement the future Orders-based Bookings redesign or new shipment/payment status rules. Existing Payments UI is retained and does not yet support full transaction-ledger installments. Production build and browser test pending. No migration or live data modification performed.
