# Phase 4: Shared minimized-window tray
Base: app2a-phase3-minimize-persistence-fix-test.zip (user-confirmed working)

- Order Wizard windows now register in the existing WindowManager tray, alongside Buyer/Supplier.
- Removed Order Wizard's duplicate bottom-right tray.
- Each Order Wizard remains mounted independently and retains its existing 3-window limit.
- No changes to the page routing, sidebar, main content layout, or database.

Verification: ZIP integrity checked. npm run build could not execute because Vite dependencies are absent in this environment (vite: not found). Browser behavior unverified. Test minimizing an Order Wizard, navigating to Buyers, opening and minimizing Buyer, and restoring both independently. Test closing a minimized wizard.
