Copy Style Data test build
- Finalize footer now contains Copy to Style Orders next to Back.
- The copy modal shows real section-by-section progress, disables closing during copy and retains detailed results.
- Each selected destination is processed independently; existing sections are preserved.
- Sampling receives newly generated globally unique sample numbers, with retries on unique-number conflicts. Samples map their source size-group name to the corresponding destination size group. Missing groups cause an explicit error rather than a broken foreign key.
- Important: copying is not atomic across sections. If a section fails partway through, the modal reports failure and existing records must be inspected before retry. A database-side transaction would be required for full atomicity.
- Live Supabase records were not modified in building this ZIP.
