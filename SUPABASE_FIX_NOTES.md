# App-2A Supabase persistence, phase 2

This ZIP starts from the live ZIP supplied 26 September 2026 and includes the phase 1 payment/settings/packing fixes plus the sampling/parcels fix. It built with `npm run build`. It has not been deployed or exercised in the deployed browser.

## Sampling and parcels

- Sample stage, progress dates, approvals, dispatch checklists and revision metadata use `samples.workflow_meta`.
- Comments use `sample_comments` in Supabase.
- The parcel pool is derived from the sample's dispatch status in Supabase.
- Parcel headers, sample references, custom items, courier/tracking/date and dispatch state use `parcels` in Supabase.
- Save failures are shown in the pages. Existing browser-only sampling and parcel data is not migrated because the owner confirmed it is not important; existing `samples` records are retained.

## Production schema already added to nizamia-oms

```sql
alter table public.samples add column if not exists workflow_meta jsonb not null default '{}'::jsonb;
create table if not exists public.parcels (
  id text primary key, status text not null default 'Draft',
  created_at timestamptz not null default now(), dispatch_date date,
  courier text, tracking_no text, notes text,
  items jsonb not null default '[]'::jsonb,
  custom_items jsonb not null default '[]'::jsonb,
  dispatched_at timestamptz
);
grant select, insert, update, delete on public.parcels to anon, authenticated;
```

Production also has phase 1 schema changes: `payment_settlements.payload` and unique shipment key; unique packing snapshot order/mode; `uoms.type`.

## Still outstanding

- Other wizard, purchasing and shipping flows have unchecked steps in multi-table saves.
- Public tables, including the new parcels table, have no effective row-level access control. The current app uses custom login rather than Supabase Auth. Enabling RLS without redesigning that login would break these screens. This change does not resolve that security issue.
