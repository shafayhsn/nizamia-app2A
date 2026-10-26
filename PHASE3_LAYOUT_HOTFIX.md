# Phase 3 layout hotfix

Restores Buyers and Suppliers persistent page instances to the main content column, inside `<main>` and its Suspense boundary. Phase 3 had mistakenly rendered them as siblings of the main column inside `.app-shell`, producing horizontal layout expansion and clipping the topbar.

The app-level WindowManager introduced in Phase 3 remains. This is a targeted layout fix, not a verified resolution of cross-page popup persistence.

Build and browser testing not performed in this environment (Node 22 rather than required 24, Vite unavailable).
