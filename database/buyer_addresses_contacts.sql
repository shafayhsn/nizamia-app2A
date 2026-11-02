-- Buyer master data extension. Apply only after confirming the target Supabase project.
create table if not exists public.buyer_addresses (
 id uuid primary key default gen_random_uuid(),
 buyer_id uuid not null references public.buyers(id) on delete cascade,
 label text not null default '',
 recipient text not null default '',
 address_line1 text not null default '',
 address_line2 text not null default '',
 city text not null default '',
 region text not null default '',
 postal_code text not null default '',
 country text not null default '',
 phone text not null default '',
 email text not null default '',
 is_default boolean not null default false,
 created_at timestamptz not null default now()
);
create unique index if not exists buyer_addresses_one_default on public.buyer_addresses(buyer_id) where is_default;
create index if not exists buyer_addresses_buyer_idx on public.buyer_addresses(buyer_id);
create table if not exists public.buyer_contacts (
 id uuid primary key default gen_random_uuid(),
 buyer_id uuid not null references public.buyers(id) on delete cascade,
 name text not null default '',
 designation text not null default '',
 department text not null default '',
 phone text not null default '',
 email text not null default '',
 is_default boolean not null default false,
 created_at timestamptz not null default now()
);
create unique index if not exists buyer_contacts_one_default on public.buyer_contacts(buyer_id) where is_default;
create index if not exists buyer_contacts_buyer_idx on public.buyer_contacts(buyer_id);
-- IMPORTANT: apply suitable RLS policies for your actual user identity/authorization model
-- before granting API access. Do not add unrestricted anon policies.
alter table public.buyer_addresses enable row level security;
alter table public.buyer_contacts enable row level security;
