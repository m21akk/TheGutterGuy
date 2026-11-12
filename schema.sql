-- The Gutter Guy – database setup.
-- Paste this whole file into Supabase → SQL Editor → New query → Run.
-- Safe to run again: it only adds what's missing.

create table if not exists public.jobs (
  id                 uuid primary key default gen_random_uuid(),
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  status             text not null default 'new',

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
  scheduled_slot     text,
  completed_at       timestamptz,
  admin_notes        text
);

-- Online booking (added for "Book now")
alter table public.jobs add column if not exists booking_type      text not null default 'quote';
alter table public.jobs add column if not exists hold_expires_at   timestamptz;
alter table public.jobs add column if not exists stripe_session_id text;

alter table public.jobs drop constraint if exists jobs_status_check;
alter table public.jobs add constraint jobs_status_check
  check (status in ('new', 'quoted', 'pending', 'paid', 'completed', 'cancelled'));
alter table public.jobs drop constraint if exists jobs_scheduled_slot_check;
alter table public.jobs add constraint jobs_scheduled_slot_check
  check (scheduled_slot is null or scheduled_slot in ('am', 'pm', 'any'));

create index if not exists jobs_scheduled_date_idx on public.jobs (scheduled_date);
create index if not exists jobs_status_idx on public.jobs (status);
create index if not exists jobs_session_idx on public.jobs (stripe_session_id);

-- Roy's prices, working days and hours (one row)
create table if not exists public.settings (
  id         integer primary key default 1 check (id = 1),
  data       jsonb not null default '{}',
  updated_at timestamptz not null default now()
);

-- Roy's time off (blocks the booking calendar)
create table if not exists public.time_off (
  id         uuid primary key default gen_random_uuid(),
  start_date date not null,
  end_date   date not null,
  slot       text not null default 'all' check (slot in ('all', 'am', 'pm')),
  note       text,
  created_at timestamptz not null default now(),
  check (end_date >= start_date)
);

-- Lock the tables down: only the website's server (service key) can read/write.
alter table public.jobs enable row level security;
alter table public.settings enable row level security;
alter table public.time_off enable row level security;

-- Private bucket for customers' photos.
insert into storage.buckets (id, name, public)
values ('job-photos', 'job-photos', false)
on conflict (id) do nothing;
