create sequence if not exists public.costing_reference_seq;
create sequence if not exists public.costing_woven_ref_seq;
create sequence if not exists public.costing_knits_ref_seq;
create sequence if not exists public.proforma_invoice_number_seq;
create sequence if not exists public.pp_meeting_number_seq;
create table public.costing_batches (id uuid default gen_random_uuid() primary key,name text,created_at timestamp with time zone default now());
create table public.costing_sheet_versions (id bigint generated always as identity primary key,costing_id uuid,version integer,document jsonb,created_at timestamp with time zone default now());
create table public.costing_sheets (id uuid default gen_random_uuid() primary key,reference text default ((('CST-'::text || to_char(now(), 'YY'::text)) || '-'::text) || lpad((nextval('costing_reference_seq'::regclass))::text, 5, '0'::text)),type text,buyer_id uuid,customer text,style text,document jsonb,version integer default 1,created_at timestamp with time zone default now(),updated_at timestamp with time zone default now(),batch_id uuid);
create table public.feature_assets (id uuid default gen_random_uuid() primary key,file_name text,storage_path text,mime_type text,file_size bigint,created_at timestamp with time zone default now());
create table public.feature_certificates (id uuid default gen_random_uuid() primary key,certificate text,issued_on date,expires_on date,renewed_from uuid,created_at timestamp with time zone default now(),certificate_number text);
create table public.pp_meetings (id uuid default gen_random_uuid() primary key,order_id uuid,ppm_number text default ('PPM-'::text || lpad((nextval('pp_meeting_number_seq'::regclass))::text, 6, '0'::text)),meeting_date date,status text default 'Draft'::text,decision text,technical_checks jsonb default '{}'::jsonb,fit_approved boolean,department_notes jsonb default '{}'::jsonb,outstanding_actions text default ''::text,signatures jsonb default '{}'::jsonb,attachment_path text,created_by uuid default null::uuid,created_at timestamp with time zone default now(),updated_at timestamp with time zone default now());
create table public.proforma_invoice_revisions (id uuid default gen_random_uuid() primary key,invoice_id uuid,revision integer,snapshot jsonb,action text,actor_id uuid,created_at timestamp with time zone default now());
create table public.proforma_invoices (id uuid default gen_random_uuid() primary key,pi_number text,buyer_id uuid,status text default 'draft'::text,revision integer default 1,snapshot jsonb default '{}'::jsonb,acceptance_email_from text,acceptance_email_date timestamp with time zone,acceptance_email_reference text,issued_at timestamp with time zone,accepted_at timestamp with time zone,cancelled_at timestamp with time zone,created_by uuid,updated_by uuid,created_at timestamp with time zone default now(),updated_at timestamp with time zone default now());
CREATE OR REPLACE FUNCTION public.allocate_costing_reference()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
 IF NEW.reference IS NULL OR NEW.reference = '' THEN
   IF NEW.type = 'woven' THEN
     NEW.reference := 'CW-' || LPAD(nextval('public.costing_woven_ref_seq')::text,4,'0');
   ELSIF NEW.type = 'knits' THEN
     NEW.reference := 'CK-' || LPAD(nextval('public.costing_knits_ref_seq')::text,4,'0');
   ELSE
     RAISE EXCEPTION 'Unsupported costing type';
   END IF;
 END IF;
 RETURN NEW;
END;
$function$;
CREATE OR REPLACE FUNCTION public.allocate_proforma_number()
 RETURNS text
 LANGUAGE sql
 SECURITY INVOKER
 SET search_path TO 'public'
AS $function$ select 'PI-'||to_char(current_date,'YYYY')||'-'||lpad(nextval('public.proforma_invoice_number_seq')::text,6,'0') $function$;
CREATE OR REPLACE FUNCTION public.record_proforma_revision()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY INVOKER
 SET search_path TO 'public'
AS $function$ begin insert into public.proforma_invoice_revisions(invoice_id,revision,snapshot,action,actor_id) values (new.id,new.revision,new.snapshot,case when tg_op='INSERT' then 'created' when old.status is distinct from new.status then new.status else 'updated' end,coalesce(new.updated_by,new.created_by)); return new; end $function$;
revoke all on function public.allocate_proforma_number() from public,anon,authenticated; grant execute on function public.allocate_proforma_number() to service_role;
create or replace trigger trg_proforma_revision after insert or update on public.proforma_invoices for each row execute function public.record_proforma_revision();
create or replace trigger costing_reference_by_type before insert on public.costing_sheets for each row execute function public.allocate_costing_reference();
