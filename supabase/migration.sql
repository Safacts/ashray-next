-- Ashray-Next Supabase migration
-- Next.js + Supabase PG/hostel manager (RentOk-like) for Aadi
-- Compatible with old Ashray SPA + new Ashray-Next schema
-- Pure SQL, Postgres/Supabase compatible, idempotent (IF NOT EXISTS / IF EXISTS)

-- Extensions ---------------------------------------------------------------
create extension if not exists "pgcrypto";

-- 1) OLD TABLES (keep compatible, all IF NOT EXISTS) -----------------------

create table if not exists public.hostels (
  id uuid primary key default gen_random_uuid(),
  name text,
  default_fee int,
  qr_code_url text,
  upi_id text,
  created_at timestamptz default now()
);

create table if not exists public.students (
  id uuid primary key default gen_random_uuid(),
  hostel_id uuid references public.hostels(id) on delete cascade,
  name text,
  phone text,
  room text,
  monthly_fee int,
  last_paid_date date,
  created_at timestamptz default now()
);

create table if not exists public.payments (
  id uuid primary key default gen_random_uuid(),
  hostel_id uuid references public.hostels(id) on delete cascade,
  student_id uuid references public.students(id) on delete cascade,
  amount int,
  status text,
  proof_url text,
  created_at timestamptz default now()
);

create table if not exists public.expenses (
  id uuid primary key default gen_random_uuid(),
  hostel_id uuid references public.hostels(id) on delete cascade,
  amount int,
  description text,
  date date,
  created_at timestamptz default now()
);

-- 1b) ADD COLUMN IF NOT EXISTS for evolved fields --------------------------

alter table public.students add column if not exists bed_id uuid;
alter table public.students add column if not exists status text default 'active';

alter table public.payments add column if not exists due_id uuid;
alter table public.payments add column if not exists method text;
alter table public.payments add column if not exists utr text;
alter table public.payments add column if not exists month date;

-- 2) NEW TABLES ------------------------------------------------------------

create table if not exists public.rooms (
  id uuid primary key default gen_random_uuid(),
  hostel_id uuid references public.hostels(id) on delete cascade,
  floor text not null default 'Ground',
  room_no text not null,
  sharing_type int not null default 2,
  rent int not null default 0,
  status text not null default 'vacant',
  created_at timestamptz default now(),
  unique (hostel_id, room_no)
);

create table if not exists public.beds (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.rooms(id) on delete cascade,
  bed_no text not null,
  student_id uuid references public.students(id) on delete set null,
  status text not null default 'vacant',
  unique (room_id, bed_no)
);

create table if not exists public.dues (
  id uuid primary key default gen_random_uuid(),
  hostel_id uuid references public.hostels(id) on delete cascade,
  student_id uuid not null references public.students(id) on delete cascade,
  month date not null,
  amount int not null,
  breakup jsonb not null default '{}',
  due_date date,
  status text not null default 'pending',
  late_fee int not null default 0,
  created_at timestamptz default now(),
  unique (student_id, month)
);

create table if not exists public.complaints (
  id bigint generated always as identity primary key,
  hostel_id uuid references public.hostels(id) on delete cascade,
  student_id uuid references public.students(id) on delete cascade,
  category text,
  description text,
  status text not null default 'open',
  assigned_to text,
  created_at timestamptz default now()
);

-- Enquiries / Reviews copied from Akshaya pattern (C:\Projects\myprojects\akshaya-men-s-pg-\supabase\migration.sql)
create table if not exists public.enquiries (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  name text,
  phone text,
  occupation text,
  move_in date,
  message text,
  contacted boolean not null default false
);

create table if not exists public.reviews (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  name text not null,
  rating int not null check (rating between 1 and 5),
  text text not null,
  approved boolean not null default false
);

-- Akshaya site_info -> Ashray hostel_settings (per-hostel key/value)
create table if not exists public.hostel_settings (
  hostel_id uuid not null references public.hostels(id) on delete cascade,
  key text not null,
  value text not null default '',
  updated_at timestamptz not null default now(),
  primary key (hostel_id, key)
);

-- keep Akshaya's extra column evolution (idempotent)
alter table public.reviews add column if not exists source text not null default 'site';

-- 3) INDEXES (helpful) -----------------------------------------------------

create index if not exists idx_students_hostel_id on public.students (hostel_id);
create index if not exists idx_students_bed_id on public.students (bed_id);
create index if not exists idx_students_status on public.students (status);

create index if not exists idx_payments_hostel_id on public.payments (hostel_id);
create index if not exists idx_payments_student_id on public.payments (student_id);
create index if not exists idx_payments_due_id on public.payments (due_id);
create index if not exists idx_payments_month on public.payments (month);
create index if not exists idx_payments_status on public.payments (status);

create index if not exists idx_expenses_hostel_id on public.expenses (hostel_id);
create index if not exists idx_expenses_date on public.expenses (date);

create index if not exists idx_rooms_hostel_id on public.rooms (hostel_id);
create index if not exists idx_rooms_status on public.rooms (status);

create index if not exists idx_beds_room_id on public.beds (room_id);
create index if not exists idx_beds_student_id on public.beds (student_id);
create index if not exists idx_beds_status on public.beds (status);

create index if not exists idx_dues_hostel_status on public.dues (hostel_id, status);
create index if not exists idx_dues_student_id on public.dues (student_id);
create index if not exists idx_dues_month on public.dues (month);
create index if not exists idx_dues_status on public.dues (status);

create index if not exists idx_complaints_hostel_id on public.complaints (hostel_id);
create index if not exists idx_complaints_student_id on public.complaints (student_id);
create index if not exists idx_complaints_status on public.complaints (status);

create index if not exists idx_hostel_settings_hostel_id on public.hostel_settings (hostel_id);

-- 4) RLS + POLICIES --------------------------------------------------------

-- Enable RLS on every table
alter table public.hostels enable row level security;
alter table public.students enable row level security;
alter table public.payments enable row level security;
alter table public.expenses enable row level security;
alter table public.rooms enable row level security;
alter table public.beds enable row level security;
alter table public.dues enable row level security;
alter table public.complaints enable row level security;
alter table public.enquiries enable row level security;
alter table public.reviews enable row level security;
alter table public.hostel_settings enable row level security;

-- Drop existing policies if any (idempotent rerun)
drop policy if exists "authenticated all hostels" on public.hostels;
drop policy if exists "authenticated all students" on public.students;
drop policy if exists "authenticated all payments" on public.payments;
drop policy if exists "authenticated all expenses" on public.expenses;
drop policy if exists "authenticated all rooms" on public.rooms;
drop policy if exists "authenticated all beds" on public.beds;
drop policy if exists "authenticated all dues" on public.dues;
drop policy if exists "authenticated all complaints" on public.complaints;
drop policy if exists "authenticated all enquiries" on public.enquiries;
drop policy if exists "admin all enquiries" on public.enquiries;
drop policy if exists "anon insert enquiries" on public.enquiries;
drop policy if exists "authenticated all reviews" on public.reviews;
drop policy if exists "admin all reviews" on public.reviews;
drop policy if exists "anon insert reviews" on public.reviews;
drop policy if exists "anon read approved reviews" on public.reviews;
drop policy if exists "authenticated all hostel_settings" on public.hostel_settings;
drop policy if exists "admin all site info" on public.hostel_settings;
drop policy if exists "anon read hostel_settings" on public.hostel_settings;
drop policy if exists "anon read site info" on public.hostel_settings;

-- Authenticated full access (every table) - mirrors Akshaya "admin all ..." pattern but for authenticated
create policy "authenticated all hostels" on public.hostels for all to authenticated using (true) with check (true);
create policy "authenticated all students" on public.students for all to authenticated using (true) with check (true);
create policy "authenticated all payments" on public.payments for all to authenticated using (true) with check (true);
create policy "authenticated all expenses" on public.expenses for all to authenticated using (true) with check (true);
create policy "authenticated all rooms" on public.rooms for all to authenticated using (true) with check (true);
create policy "authenticated all beds" on public.beds for all to authenticated using (true) with check (true);
create policy "authenticated all dues" on public.dues for all to authenticated using (true) with check (true);
create policy "authenticated all complaints" on public.complaints for all to authenticated using (true) with check (true);
create policy "authenticated all enquiries" on public.enquiries for all to authenticated using (true) with check (true);
create policy "authenticated all reviews" on public.reviews for all to authenticated using (true) with check (true);
create policy "authenticated all hostel_settings" on public.hostel_settings for all to authenticated using (true) with check (true);

-- Anon policies (copied from Akshaya RLS pattern)
-- enquiries: anon insert-only
create policy "anon insert enquiries" on public.enquiries for insert to anon with check (true);

-- reviews: anon read approved only (no anon insert - insert-only is enquiries)
create policy "anon read approved reviews" on public.reviews for select to anon using (approved = true);

-- hostel_settings: anon read all (mirrors Akshaya "anon read site info")
create policy "anon read hostel_settings" on public.hostel_settings for select to anon using (true);

-- Grants (mirror Akshaya grants) -----------------------------------------
grant all on public.hostels to authenticated;
grant all on public.students to authenticated;
grant all on public.payments to authenticated;
grant all on public.expenses to authenticated;
grant all on public.rooms to authenticated;
grant all on public.beds to authenticated;
grant all on public.dues to authenticated;
grant all on public.complaints to authenticated;
grant all on public.enquiries to authenticated;
grant all on public.reviews to authenticated;
grant all on public.hostel_settings to authenticated;

-- anon minimal grants
grant insert on public.enquiries to anon;
grant select on public.reviews to anon;
grant select on public.hostel_settings to anon;

-- sequences for identity cols (enquiries, reviews, complaints) - needed for anon insert / authenticated
grant usage, select on sequence public.enquiries_id_seq to anon, authenticated;
grant usage, select on sequence public.reviews_id_seq to anon, authenticated;
grant usage, select on sequence public.complaints_id_seq to anon, authenticated;
