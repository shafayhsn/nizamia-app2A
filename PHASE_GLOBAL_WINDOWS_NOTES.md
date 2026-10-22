Phase 1/2 incremental source patch (not production verified).
- Shared WindowManager registry/tray introduced at Layout level.
- Buyer and Supplier dialogs register their minimized state in the shared tray.
- Order Wizard retains its existing independent tray and behavior (not migrated yet).
- Buyer/Supplier dialogs still unmount on page navigation; cross-page persistence is NOT implemented.
- Build verification unavailable: environment Node v22 (project requires v24), vite executable absent.
- Do not deploy without dependency installation, build, and browser testing.
