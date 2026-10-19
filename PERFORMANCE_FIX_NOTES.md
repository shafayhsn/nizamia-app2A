# Sampling & Purchasing targeted performance / footer update

- Sampling: replace full orders payload with only the order fields used in this page; read sample metadata once per row-list calculation rather than once per sample.
- Process Demand: index orders and queues by order ID, avoiding repeated full-array scans while building demand rows.
- Material and Process Demand: add a live footer showing the count of selected line allocations and their selected **required** quantities grouped by unit. These are required amounts, not net outstanding balances, because queue-level fulfilled amounts are not available in the current data model.
- Existing purchasing calculations, copy workflow, queue creation and report logic are unchanged.

Validation: ZIP integrity checked. Production build not verified: dependencies are not available locally and npm offline install cannot obtain all packages.
