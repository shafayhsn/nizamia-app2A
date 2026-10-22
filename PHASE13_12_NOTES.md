# Phase 13.12 — Payments and Shipments tables

- Payment refund/rebate cells say Not Due until buyer invoice balance is cleared (including approved discounts); N/A for inapplicable streams after eligibility.
- PKR Pending excludes not-yet-eligible government refund balances.
- Received (USD / PKR) shows cumulative buyer USD receipts above actual credited PKR.
- Header-click ascending/descending sort indicators on all data columns in Shipments and Payments.
- Shipment tracking uses 'days past ETA' (neutral) for Discharged and Gate-Out, and 'Delivered' for delivered shipments.
- Includes Phase 13.11.1 KPI card styling corrections.
- No database changes.

Source ZIP assembled; full Vite build not verified in this environment.
