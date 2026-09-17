-- Ashray-Next demo seed — Akshaya-flavored, idempotent
-- Run AFTER supabase/migration.sql in Supabase Dashboard SQL Editor
-- Uses fixed UUIDs + ON CONFLICT DO NOTHING so reruns are safe

-- 1) Hostel ------------------------------------------------------------------
insert into public.hostels (id, name, default_fee, upi_id, qr_code_url)
values (
  '11111111-1111-4111-8111-111111111111',
  'Akshaya Men''s PG',
  7000,
  'akshayapg@upi',
  null
)
on conflict (id) do nothing;

-- 2) Rooms (Ground/First, 101 Single / 102 Double / 103 Triple) -------------
insert into public.rooms (id, hostel_id, floor, room_no, sharing_type, rent, status)
values
  ('22222222-2222-4222-8222-222222222222', '11111111-1111-4111-8111-111111111111', 'Ground', '101', 1, 9000, 'occupied'),
  ('33333333-3333-4333-8333-333333333333', '11111111-1111-4111-8111-111111111111', 'First',  '102', 2, 6500, 'occupied'),
  ('44444444-4444-4444-8444-444444444444', '11111111-1111-4111-8111-111111111111', 'First',  '103', 3, 5000, 'vacant')
on conflict (hostel_id, room_no) do nothing;

-- 2b) Resolve room ids for beds (fallback if ON CONFLICT skipped and ids differ)
-- We use fixed ids above, so beds can reference them directly.

-- 3) Beds (auto per sharing; link students AFTER section 4 — FK order) --------
-- NOTE (fixed 18-09-2026): beds.student_id refs students, so ALL beds insert
-- with student_id NULL first; linkage happens in 4b below. Inserting occupied
-- beds here fails on a fresh DB (FK violation) — that was the old bug.
insert into public.beds (id, room_id, bed_no, student_id, status)
values
  -- 101 Single -> 1 bed (A)
  ('77777777-7777-4777-8777-777777777777', '22222222-2222-4222-8222-222222222222', 'A', null, 'vacant'),
  -- 102 Double -> 2 beds (A,B)
  ('88888888-8888-4888-8888-888888888888', '33333333-3333-4333-8333-333333333333', 'A', null, 'vacant'),
  ('88888888-8888-4888-8888-888888888889', '33333333-3333-4333-8333-333333333333', 'B', null, 'vacant'),
  -- 103 Triple -> 3 beds (A,B,C)
  ('99999999-9999-4999-8999-999999999999', '44444444-4444-4444-8444-444444444444', 'A', null, 'vacant'),
  ('99999999-9999-4999-8999-999999999991', '44444444-4444-4444-8444-444444444444', 'B', null, 'vacant'),
  ('99999999-9999-4999-8999-999999999992', '44444444-4444-4444-8444-444444444444', 'C', null, 'vacant')
on conflict (room_id, bed_no) do nothing;

-- 4) Students (2 demo; bed_id linked in 4b AFTER beds exist) -----------------
insert into public.students (id, hostel_id, name, phone, room, monthly_fee, bed_id, status, last_paid_date)
values
  ('55555555-5555-4555-8555-555555555555', '11111111-1111-4111-8111-111111111111', 'Rahul Sharma',  '9876543210', '101', 9000, null, 'active', (current_date - interval '10 days')::date),
  ('66666666-6666-4666-8666-666666666666', '11111111-1111-4111-8111-111111111111', 'Arjun Reddy',   '9876543211', '102', 6500, null, 'active', (current_date - interval '35 days')::date)
on conflict (id) do nothing;

-- 4b) Link beds <-> students (both sides; rerun-safe) ------------------------
update public.beds set student_id = '55555555-5555-4555-8555-555555555555', status='occupied' where id='77777777-7777-4777-8777-777777777777' and student_id is null;
update public.beds set student_id = '66666666-6666-4666-8666-666666666666', status='occupied' where id='88888888-8888-4888-8888-888888888888' and student_id is null;
update public.students set bed_id = '77777777-7777-4777-8777-777777777777' where id='55555555-5555-4555-8555-555555555555' and bed_id is null;
update public.students set bed_id = '88888888-8888-4888-8888-888888888888' where id='66666666-6666-4666-8666-666666666666' and bed_id is null;

-- 5) Dues (1 month for each student, pending + overdue demo) -----------------
insert into public.dues (id, hostel_id, student_id, month, amount, breakup, due_date, status, late_fee)
values
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '11111111-1111-4111-8111-111111111111', '55555555-5555-4555-8555-555555555555', date_trunc('month', now())::date, 9000, '{"rent":9000}'::jsonb, (date_trunc('month', now()) + interval '5 days')::date, 'pending', 0),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', '11111111-1111-4111-8111-111111111111', '66666666-6666-4666-8666-666666666666', date_trunc('month', now())::date, 6500, '{"rent":6500}'::jsonb, (date_trunc('month', now()) + interval '5 days')::date, 'pending', 0)
on conflict (student_id, month) do nothing;

-- 6) Complaint (1 open) -------------------------------------------------------
-- Use a fixed id for idempotency via checking existence (complaints is bigint identity, can't ON CONFLICT on id if we specify)
-- So guard with NOT EXISTS:
insert into public.complaints (hostel_id, student_id, category, description, status, assigned_to)
select '11111111-1111-4111-8111-111111111111', '55555555-5555-4555-8555-555555555555', 'Maintenance', 'Water tap leaking in bathroom — please fix.', 'open', null
where not exists (
  select 1 from public.complaints where hostel_id='11111111-1111-4111-8111-111111111111' and student_id='55555555-5555-4555-8555-555555555555' and category='Maintenance' and status='open'
);

-- 7) Reviews (2 approved) -----------------------------------------------------
insert into public.reviews (name, rating, text, approved, source)
select 'Rahul Sharma', 5, 'Best PG in Pragathi Nagar — clean rooms, helpful owner, great food!', true, 'seed'
where not exists (select 1 from public.reviews where name='Rahul Sharma' and text like 'Best PG%');
insert into public.reviews (name, rating, text, approved, source)
select 'Vikram Singh', 4, 'Stayed 8 months, very comfortable and safe. Homely atmosphere.', true, 'seed'
where not exists (select 1 from public.reviews where name='Vikram Singh' and text like 'Stayed 8 months%');

-- 8) Hostel settings (Akshaya site_info flavor -> hostel_settings) -----------
insert into public.hostel_settings (hostel_id, key, value)
values
  ('11111111-1111-4111-8111-111111111111', 'pricing_note', 'Single ₹9000 · Double ₹6500 · Triple ₹5000 (food + WiFi included)'),
  ('11111111-1111-4111-8111-111111111111', 'phone', '+91 90308 12182'),
  ('11111111-1111-4111-8111-111111111111', 'phone_link', '+919030812182'),
  ('11111111-1111-4111-8111-111111111111', 'address', 'Plot No 945, near Bachpan School, Elephant Circle, JNTU, Pragathi Nagar, Hyderabad, Telangana 500090'),
  ('11111111-1111-4111-8111-111111111111', 'about_title', 'A homely PG in the heart of Pragathi Nagar'),
  ('11111111-1111-4111-8111-111111111111', 'about_text', 'Akshaya Men''s Hostel & PG — clean rooms, essential facilities, homely food support, and a peaceful setup for everyday living.'),
  ('11111111-1111-4111-8111-111111111111', 'upi_id', 'akshayapg@upi')
on conflict (hostel_id, key) do nothing;

-- Keep hostels.upi_id in sync with settings (if null)
update public.hostels set upi_id = 'akshayapg@upi' where id='11111111-1111-4111-8111-111111111111' and upi_id is null;
