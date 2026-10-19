# Phase 11.2 — Sampling Program print footer pagination hotfix

The fixed footer used `bottom:-10mm`, placing it outside the printable page box and causing an otherwise empty second page. This hotfix places it at `bottom:0` inside the page content area and reserves a 12mm bottom print margin. No database or BOM changes. Verify in Chrome/Safari print preview, including long multi-page programs.
