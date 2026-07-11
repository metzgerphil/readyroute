-- Driver profile fields and reusable driver document storage.
-- Run this in Supabase SQL before enabling driver document uploads.

alter table public.drivers
  add column if not exists date_of_birth date,
  add column if not exists daily_flat_rate numeric(10, 2) not null default 0;

create table if not exists public.driver_documents (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts(id) on delete cascade,
  driver_id uuid not null references public.drivers(id) on delete cascade,
  document_type text not null check (
    document_type in (
      'driver_license',
      'mec',
      'qualification_certificate',
      'signed_policy',
      'write_up',
      'other'
    )
  ),
  file_name text not null,
  mime_type text,
  file_size integer,
  storage_bucket text not null default 'driver-documents',
  storage_path text not null,
  public_url text,
  expires_on date,
  notes text,
  uploaded_by_manager_id uuid references public.manager_users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists driver_documents_required_unique_idx
  on public.driver_documents(account_id, driver_id, document_type)
  where document_type in ('driver_license', 'mec', 'qualification_certificate', 'signed_policy');

create index if not exists driver_documents_account_driver_idx
  on public.driver_documents(account_id, driver_id);

create index if not exists driver_documents_expires_on_idx
  on public.driver_documents(account_id, expires_on)
  where expires_on is not null;

create or replace function public.touch_driver_documents_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists touch_driver_documents_updated_at on public.driver_documents;
create trigger touch_driver_documents_updated_at
before update on public.driver_documents
for each row
execute function public.touch_driver_documents_updated_at();

insert into storage.buckets (id, name, public)
values ('driver-documents', 'driver-documents', false)
on conflict (id) do update
set public = false;
