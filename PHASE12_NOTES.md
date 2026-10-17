# Phase 12 — Order Sampling Plan + PO Matrix ID preservation

Based on Phase 11.3 cumulative source.

## Order Metadata > Sampling Plan
- Multi-select sample chooser (all selected initially).
- First printed page: index with SAM#, type/version, wash/colour, sample size, quantity and due date.
- Each selected sample uses the existing Sampling Program renderer and begins on a new page.
- Samples are scoped to the selected order ID, ordered by SAM number.
- The report uses saved BOM, fitting, version and comments data. No database writes.

## PO Matrix save
- The old atomic RPC deleted/reinserted every size group and colour, breaking Washing FK references.
- The new payload includes persisted group/colour IDs, and the replacement RPC updates them in place.
- Removing a linked colour is rejected with a useful error; Washing records are never deleted.
- New size groups/colours are inserted; removed unreferenced ones are removed.
- Apply `supabase/migrations/20261017_po_matrix_preserve_linked_ids.sql` BEFORE deploying the app ZIP.
- This migration changes the RPC definition only; it does not modify stored PO records at installation.

## Validation limits
- ZIP integrity and source-level checks only. Browser/Vite production build unavailable in this environment (Node 22, no Vite dependencies).
- Test with a staging/preview deployment, and verify PO 10966 save retains its washing colour links.
