# Phase 13.11 — Shipment statuses, manual references, tracking

Based on Phase 13.10. No Supabase migration or data changes.

- Distinct status badge colours for Gate-In (grey), In-Transit (blue), Discharged (amber), Gate-Out (purple), Delivered (green); payment badges retain sensible colours.
- Shipment numbers are manually entered in both normal and historical shipment forms. New entries check duplicate numbers against currently loaded shipments; existing numbers are preserved on edit.
- Change Shipment Status toolbar action now uses RefreshCcw, matching the Change Order Status action in Orders.
- Tracking cell shows an external-link icon above ETA day count; link opens saved URL in a new tab. Disabled icon if URL missing/invalid. Late days are red. Historical revised ETA takes precedence.

## Validation
Archive integrity verified. Full Vite build could not be run because dependency installation timed out in the environment. Test on staging before production.
