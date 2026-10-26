# Phase 7 — Sampling layout and popup checkpoint

Base: Phase 6 Trim Package checkpoint.

- Sampling table container now occupies the available width with minimum-width table and horizontal scrolling when the sidebar is expanded or the viewport is narrow.
- Sampling toolbar can scroll horizontally rather than forcing the page beyond its content column.
- Sampling page remains mounted in the existing content column after first visit, following the same pattern as Buyers, Suppliers and Library.
- Record Comment and Send to Parcels dialogs now have minimize and close controls and register in the shared tray.
- Minimized dialogs retain their local form state during page navigation.

Unverified: dependency build and browser regression testing are not complete. Keep previous confirmed working ZIP for rollback.
