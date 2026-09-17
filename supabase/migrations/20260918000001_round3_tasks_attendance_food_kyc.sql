-- Ashray-Next round 3: tasks, attendance, food_menu, students kyc (18-09-2026)
-- Pure SQL, Postgres/Supabase compatible, idempotent (IF NOT EXISTS / IF EXISTS)
-- Contract exact names - app code depends on these

-- Extensions ---------------------------------------------------------------
create extension if not exists "pgcrypto";

-- 1) TASKS -----------------------------------------------------------------
create table if not exists public.tasks (
  id uuid primary key default gen_random_uuid(),
  hostel_id uuid references public.hostels(id) on delete cascade,
  title text not null,
  category text not null default 'general',
  assigned_to text,
  due_date date,
  status text not null default 'open',
  created_at timestamptz default now()
);

-- 2) ATTENDANCE ------------------------------------------------------------
create table if not exists public.attendance (
  id uuid primary key default gen_random_uuid(),
  hostel_id uuid references public.hostels(id) on delete cascade,
  student_id uuid references public.students(id) on delete cascade,
  date date not null,
  status text not null default 'present',
  created_at timestamptz default now(),
  unique (student_id, date)
);

-- 3) FOOD MENU -------------------------------------------------------------
create table if not exists public.food_menu (
  id uuid primary key default gen_random_uuid(),
  hostel_id uuid references public.hostels(id) on delete cascade,
  day int not null check (day between 0 and 6),
  meal text not null,
  items text not null default '',
  unique (hostel_id, day, meal)
);

-- 4) STUDENTS KYC COLUMNS --------------------------------------------------
alter table public.students add column if not exists kyc_status text not null default 'pending';
alter table public.students add column if not exists kyc_docs jsonb not null default '[]';

-- 5) INDEXES ---------------------------------------------------------------
create index if not exists idx_tasks_hostel_status on public.tasks (hostel_id, status);
create index if not exists idx_attendance_hostel_date on public.attendance (hostel_id, date);
create index if not exists idx_food_menu_hostel_day on public.food_menu (hostel_id, day);

-- 6) RLS + POLICIES --------------------------------------------------------
alter table public.tasks enable row level security;
alter table public.attendance enable row level security;
alter table public.food_menu enable row level security;

-- Drop existing policies if any (idempotent rerun) - same pattern as supabase/migration.sql
drop policy if exists "authenticated all tasks" on public.tasks;
drop policy if exists "authenticated all attendance" on public.attendance;
drop policy if exists "authenticated all food_menu" on public.food_menu;

-- Authenticated full access
create policy "authenticated all tasks" on public.tasks for all to authenticated using (true) with check (true);
create policy "authenticated all attendance" on public.attendance for all to authenticated using (true) with check (true);
create policy "authenticated all food_menu" on public.food_menu for all to authenticated using (true) with check (true);

-- 7) GRANTS ----------------------------------------------------------------
grant all on public.tasks to authenticated;
grant all on public.attendance to authenticated;
grant all on public.food_menu to authenticated;
