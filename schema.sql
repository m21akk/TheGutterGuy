-- The Gutter Guy – database setup.
-- Paste this whole file into Supabase → SQL Editor → New query → Run.

create table if not exists public.jobs (
  id                 uuid primary key default gen_random_uuid(),
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  status             text not null default 'new'
                     check (status in ('new', 'quoted', 'paid', 'completed', 'cancelled')),

  -- What the customer sent
  name               text not null,
  email              text not null,
  phone              text not null,
  address            text not null,
  town               text,
  postcode           text not null,
  property_type      text,
  storeys            text,
  services           text[] not null default '{}',
  preferred_date     date,
  notes              text,
  photos             text[] not null default '{}',

  -- Quote and payment
  price_pence        integer,
  quote_message      text,
  stripe_customer_id text,
  stripe_invoice_id  text unique,
  invoice_url        text,
  quoted_at          timestamptz,
  paid_at            timestamptz,

  -- Diary
  scheduled_date     date,
  scheduled_slot     text check (scheduled_slot in ('am', 'pm', 'any')),
  completed_at       timestamptz,
  admin_notes        text
);

create index if not exists jobs_scheduled_date_idx on public.jobs (scheduled_date);
create index if not exists jobs_status_idx on public.jobs (status);

-- Lock the table down: only the website's server (service key) can read/write.
alter table public.jobs enable row level security;

-- Private bucket for customers' photos.
insert into storage.buckets (id, name, public)
values ('job-photos', 'job-photos', false)
on conflict (id) do nothing;
