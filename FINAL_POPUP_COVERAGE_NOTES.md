# Global Popup Coverage — Orders editor checkpoint

Base: user-confirmed Phase 10.

Added to shared window tray:
- Order Metadata (per order)
- Bulk Order Import (preserves imported rows and step)
- Bulk Edit Orders (preserves selected fields and values)

Orders page remains mounted after first visit within the original main content column so minimized editor components survive page navigation. The normal Orders page is not displayed while inactive.

Excluded by design: Assign Job, Change Status, short confirmations, security prompts and column settings (transactional/selection-sensitive interactions). Sampling Dispatch Checklist was already integrated in Phase 7.

## Test checklist
1. Orders > Order Metadata > Minimize > switch to Buyers > restore.
2. Orders > Bulk Import > upload file > minimize > switch to Shipping > restore; verify rows intact.
3. Orders > select orders > Bulk Edit > enter changes > minimize > switch to Sampling > restore; verify fields and selection.
4. Restore and close windows independently; check topbar/sidebar/table layout.
5. Verify existing Order Wizard and all previously integrated popups.

This is a source test ZIP; compilation and browser testing are not verified.
