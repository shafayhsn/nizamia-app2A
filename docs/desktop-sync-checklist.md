# App-2A desktop two-way sync checklist

Baseline: development commit `cf1a51ec9efe17138d174ef8c4612826ede763df`, QA run [44282162586](https://github.com/shafayhsn/nizamia-app2A/actions/runs/44282162586).

The existing web app defines the screens, actions, data, relationships, validation, calculations and exports. Use the shared UI and add desktop sync support around its existing workflows. Role management is deferred. Keep using the existing free-plan QA environment and reserve distribution for the combined in-app update.

## Workflow tracker

| Area | Existing screens and data | Current evidence | Remaining acceptance |
| --- | --- | --- | --- |
| Login and Dashboard | Login; dashboard summaries and market rates; session and current permissions | Existing desktop login and cloud snapshot paths. Market rates use a separate endpoint. | Verify a fresh authorized download, offline restart, account isolation, filters and summaries with representative records. Treat live market rates as a connectivity dependency. |
| Orders | Orders, queues, jobs, size groups, colours, quantities, BOM, fitting, sampling, washing, embellishments, finishing/packing, processes and copy/finalize | Order notes and status have upload paths. The web copy/finalize workflow uses dynamic table references. | Verify full order changes and atomic linked edits, copying, and the Orders reports against the same source data. |
| Buyers and Suppliers | Profiles, order links, contacts and addresses; Buyers details also use an OMS API action | Core company records and buyer detail tables are on the snapshot list. | Exercise the existing detail API and all supported profile changes. Determine whether Supplier Contacts is an active web workflow before mapping desktop-local records. |
| Sampling and Approvals | Samples, stages, comments, activity and approval history, fitting and order relationships | Sample stage and linked history have an upload path. | Verify existing sample create/edit and approval actions from the Mac, including attached history. |
| Parcels | Drafts, consignee/invoice snapshots, custom items, dispatch/delivery, linked samples, status history | Creation and dispatch/delivery covered by SQLite and PostgreSQL tests. | Verify existing edit/delete actions and live round trips with related samples and invoices. |
| Purchasing and Testing | Purchase and work orders, line items, supplier links, rates, statuses, changelogs, testing requirements and testing orders | Create and edit paths have automated coverage. PO approval and edit RPCs passed live Supabase QA. | Verify current PO/WO operations across a Mac session, especially deletion and changelogs. Cover issue, completion and order flags in the existing testing workflow. |
| Production | Daily entries, orders, quantities by size/colour, batches and linked orders | Daily entry creation has an upload path. | Verify the web production entry actions, totals, batch membership and downstream report calculations. |
| Booking and Shipping | Booking records, direct shipments, shipment/booking lines, join records and settlements | Shipment status has an upload path. | Verify booking, shipment and settlement saves together with related records, balances and status history. |
| Tasks | Task list and comments | Snapshot includes `app_tasks` and `app_task_comments`. | Exercise offline task and comment actions using the same table names and relationships as the web app. |
| Library and resources | Library, BOM presets and lines, fitting blocks, templates, finishing packs, certificates, company files | Library data is in the snapshot. Company asset and certificate metadata are outside its current list. | Verify web library actions and the company resource workflows, including authenticated file download and durable uploads. |
| Reports and QMS | Reports, custom reports, production formats, QMS exports, PP meetings, costing, proforma | The original screens and bundled format checks exist. Costing, proforma and PP meetings use OMS actions. | Compare reports and exports using the same offline fixture. Verify existing saves and revisions through their normal paths. Include PP meeting attachments. |
| Settings and backup | Settings, document numbering, units, status colours, user/role administration, backup/export | Database backup and updater safety have automated coverage. | Verify permitted settings and numbering with the existing policies. Keep credentials and permissions administration outside generic business-data replication. Verify restore with pending work. |
| Desktop release | Intel DMG and in-app update | Baseline CI built an Intel test DMG. | Repeat the complete acceptance suite on the release candidate, then verify the in-app updater on an Intel Mac with unsent work before rollout. |

## Snapshot inventory

The desktop endpoint currently lists **62** tables. The list is a starting point for read coverage. The upload path must be verified against each existing write action.

| Group | Tables on the snapshot list |
| --- | --- |
| Company and Library | `buyers`, `suppliers`, `buyer_addresses`, `buyer_contacts`, `library_items`, `bom_presets`, `bom_preset_items`, `size_group_templates`, `fitting_blocks`, `finishing_packs` |
| Orders and linked details | `jobs`, `orders`, `order_queues`, `size_groups`, `size_group_colors`, `size_group_breakdown`, `bom_items`, `fitting`, `washing`, `embellishments`, `finishing`, `finishing_color_packing`, `order_processes`, `packing_snapshots` |
| Sampling and Parcels | `samples`, `sample_comments`, `sample_logs`, `parcels`, `parcel_status_history`, `parcel_invoice_snapshots` |
| Purchasing and Testing | `purchase_orders`, `purchase_order_items`, `purchase_order_changelog`, `work_orders`, `work_order_items`, `work_order_changelog`, `testing_orders`, `testing_requirements` |
| Production and Shipping | `production_daily_entries`, `production_batches`, `production_batch_orders`, `shipments`, `shipment_lines`, `payment_settlements`, `shipping_bookings`, `shipping_booking_lines`, `shipping_booking_shipments` |
| Tasks and business documents | `app_tasks`, `app_task_comments`, `pp_meetings`, `proforma_invoices`, `proforma_invoice_revisions`, `costing_sheets`, `costing_sheet_versions`, `costing_batches` |
| Shared configuration | `settings`, `app_settings`, `counters`, `document_numbering`, `uoms`, `ui_status_colors`, `exchange_rates` |

### Dependencies outside the snapshot list

- Company Resources uses `feature_assets`, `feature_certificates` and the `company-assets` bucket. PP meetings use signed links for the `ppm-attachments` bucket. Both need verification of file bytes and their associated records.
- Login and role administration reference `users`, `roles` and `permissions`. Continue using the existing session and access checks. User credentials are excluded from business snapshots.
- Some queries are defined in shared components, report definitions, backup helpers and dynamic OMS actions. Verify them against the individual workflow before ticking it. Local adapter names such as `tasks`, `costing`, `supplier_contacts` and `production_plans` require mapping to the actual web workflow before enabling upload.

## Acceptance and session log

For an editable workflow, verify authorized download, offline reopen, the existing action in the UI, durable local save, upload on reconnect, cloud readback, and an update from Supabase back to Mac. Check failed and repeated uploads, concurrent changes and linked records. Use the latest verified timestamp when both timestamps are reliable and retain unresolved versions for review. For read-only workflows, verify offline access and the same displayed or exported results from the same fixture.

| Session | Completed | Pending |
| --- | --- | --- |
| 1 | Mapped the existing page groups, snapshot tables and known API and storage exceptions. Recorded existing automated and live QA evidence. | Start with Orders and its linked writes. Tick individual workflows after their live acceptance evidence is recorded. |
| 2 | Added upload coverage for the existing Bulk Edit Orders fields. Automated and Supabase QA checks covered retries, field-level conflicts and preservation of unrelated cloud changes. | Verify the UI on Intel Mac and cover the remaining Orders actions, including job links, PO Matrix and BOM. |
| 3 | Added sync for assigning orders to an existing job and delinking. Automated and live Supabase QA checks passed for linked fields, retries and rejection of jobs from another buyer. | Cover creating and assigning a new job, then PO Matrix and BOM. Verify the complete Orders flow on Intel Mac. |
| 4 | Added offline creation and assignment of a new job. Automated and Supabase QA checks verified numbering, all selected order links, duplicate retry protection and atomic conflict rejection. | PO Matrix, BOM and complete Orders acceptance on Intel Mac. |
| 5 | Added offline save and upload for the existing PO Matrix on already synchronized orders. Automated and Supabase QA checks verified totals, linked Washing IDs, retries and stale write rejection. | Orders area remains open. Verify PO Matrix on Intel Mac, including queuing more than one edit before reconnecting and its use when generating queues. BOM, other order wizard saves, and buyer/supplier edits remain. |
| 5 continued | Added offline create, edit and deactivation for the existing Suppliers screen. Automated and Supabase QA checks exercised tags, lead time, retry and conflict handling. | Buyer profile and linked detail changes, BOM, and full Orders area verification remain open. |
| 5 continued | Added offline BOM save for synchronized orders. Automated and Supabase QA checks verified atomic save, refresh, retry and stale edit protection. | Buyer profile/details, remaining Orders actions, repeat editing before reconnect and physical Intel Mac acceptance are open. |
| 6 | Added offline buyer profile, address and contact reads and atomic saves through the existing Buyers screen. Automated and Supabase QA checks verified linked saves, default address changes, retry protection and stale child record rejection. | Remaining Orders actions and physical Intel Mac acceptance keep Box 2 open. |
| 6 continued | Added conflict-safe General Info sync for existing synchronized orders. Automated SQLite-to-PostgreSQL and live Supabase QA verified edited fields, retry and stale write protection. | New order creation and duplication, remaining wizard actions including queue generation, order removal and full physical Mac verification are open. |
| 7 | Added offline new order drafts, Duplicate Order and Confirm Order. Automated tests and live Supabase QA verified stable IDs, copied sizes, colours and BOM without quantities, duplicate-safe retries, and confirmation prerequisites. | Continue Box 2 with CSV import, removal, queue generation, remaining linked wizard saves and complete offline editing before reconnect. Physical Intel Mac acceptance remains due. |
| 8 | Added one-batch CSV import and atomic saves for the existing Washing, Embellishments and Processes steps. Automated tests exercised each workflow. Live Supabase QA covered CSV and Processes with replay protection. | Order removal, queue generation, Fitting, Finishing and other remaining wizard actions, multiple edits before reconnect, and full Intel Mac acceptance keep Box 2 open. |
| 9 | Local tests covered independent section saves, dependency ordering for a new draft, stable matrix IDs, queue generation and Fitting. Supabase QA verified matrix, queue and fitting relationships. | Order removal, Finishing and remaining linked wizard coverage, then one full Box 2 Intel Mac build and physical acceptance. No intermediate installer build. |
| 9 continued | Finishing settings and packing records now save atomically in the validation branch. Local automated and live Supabase QA checks passed, including stale writes and duplicate retries. | Order removal, remaining wizard workflows, dependent packing allocations and full physical Intel Mac acceptance. No build triggered. |
