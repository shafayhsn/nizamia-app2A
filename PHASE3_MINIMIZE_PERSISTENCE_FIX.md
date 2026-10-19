# Phase 3 minimized-window persistence patch

Fix: MinimizableModal previously re-registered its window every time its parent re-rendered because the inline onClose callback changed identity. Effect cleanup unregistered the minimized entry, and registration reset its minimized flag. This patch stores the latest onClose in a ref and keeps registration stable across parent renders.

No changes to Layout, Topbar, Sidebar, routing, or page CSS. This is a focused source patch based on the Phase 3 layout-hotfix source. Browser and Node 24 build verification are not available in this environment; test cross-page persistence and restore form state before deployment.
