-- App-2A v39 Packing v2 field configuration
-- Safe to run more than once.

INSERT INTO app_settings (key, value)
VALUES (
  'packing_fields_config',
  '{"fields":[
    {"key":"carton_range","label":"CTN NO","visible":true,"order":1,"required":false},
    {"key":"pack_name","label":"PACK","visible":true,"order":2},
    {"key":"packing_basis","label":"BASIS","visible":true,"order":3},
    {"key":"description","label":"DESCRIPTION","visible":true,"order":4},
    {"key":"ratio","label":"RATIO","visible":true,"order":5},
    {"key":"quantity","label":"QTY","visible":true,"order":6,"required":true},
    {"key":"pcs_per_carton","label":"PCS/CTN","visible":true,"order":7},
    {"key":"cartons","label":"CTNS","visible":true,"order":8,"required":true},
    {"key":"inner_pack","label":"INNER PACK","visible":true,"order":9},
    {"key":"net_weight","label":"N.WT","visible":true,"order":10},
    {"key":"gross_weight","label":"G.WT","visible":true,"order":11},
    {"key":"cbm","label":"CBM","visible":true,"order":12},
    {"key":"carton_size","label":"CTN SIZE","visible":false,"order":13},
    {"key":"remarks","label":"REMARKS","visible":true,"order":14}
  ]}'::jsonb
)
ON CONFLICT (key)
DO UPDATE SET value = EXCLUDED.value, updated_at = NOW();
