# Phase 13.4 — Cumulative UI / Workflow TEST

Base: Phase 13.3.3 dropdown-layer fix.

- Orders: New Order menu offers existing new-order wizard or existing import modal; removes separate import shortcut.
- Reports: Active Orders multi-select production-batch filter (including unbatched); filtered rows feed totals, print and Excel.
- Purchasing: removes subtitle and upper tab-strip overflow; aligns Material Demand action buttons to 32px.
- Sampling: Ready samples appear in Completed Samples; comment, revision and send-to-parcel actions are only shown there, independent of one another.
- Parcels: two-tab page, single ready-samples table with Ready Date, existing draft parcels and dispatched parcels; Create Parcel supports custom-only items.

CAUTION: This source is a TEST build, not verified in a browser or against live Supabase. Parcel storage and sampling metadata remain on the existing localStorage-based samplingStore implementation; no database migration was made. Please back up data and test in a non-production environment first. Node 24 required by package.json; no production compile completed here because dependencies could not be installed offline.
