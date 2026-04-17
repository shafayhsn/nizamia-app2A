Use this if orders were imported into the orders table but PO Matrix did not come through.

Run in Supabase SQL Editor:
  supabase/repair_imported_orders_po_matrix_from_json.sql

What it does:
- finds imported orders by PO number + style number + buyer name
- rebuilds size_groups
- rebuilds size_group_colors
- rebuilds size_group_breakdown
- marks step_po_matrix = true
- recalculates total_qty and total_value_usd

Important:
- it expects matching entries in size_group_templates for names like 4-7 and 8-16
- it is designed for the ORDERSHEET import set generated in this chat
