# Booking source Tool Tray and selection fixes

- Orders group header selection: fixed group key mismatch for non-batch groups, including collapsed groups.
- Queues: stable browser-local preference key, and delayed validation until data has loaded to prevent status filters from being cleared on refresh.
- New Booking: removed helper sentence, added compact search (~145px), Group By, Sort By, and Buyer/Store/Style/Job/Status filters above a structured source table.
- Existing selected lines persist when switching between Order and Queue sources; save validation now resolves sources from both lists.

## Verification
Source changes have not passed a full Vite build or browser tests because dependency installation timed out. Test in a preview deployment before replacing production.
