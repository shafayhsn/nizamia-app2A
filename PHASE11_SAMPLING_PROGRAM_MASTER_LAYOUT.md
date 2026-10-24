# Phase 11: Sampling Program — approved master layout

Based on the user's revised SAM-2617 PDF. This is a cumulative update to Phase 10.

- Dynamic header: `Sampling Program` / `<sample type> Sample - <version>` and `SAM # <YYNN>` using existing saved sampling data.
- Size Group and Factory Ref replace the redundant Sample Nature and Sample Version fields in the metadata grid.
- Four bold sample specification boxes appear above the compact production timeline.
- BOM order, item details, size-group consumption, full item names and earlier version history preserved.
- Strong separator after the last essential BOM row (fabric, thread, zipper), with repeated BOM table header for multi-page printing.
- Existing narrow A4 print margins retained. No Supabase changes.

This ZIP passed source/static checks only; Node 24 production build and browser print preview not run.
