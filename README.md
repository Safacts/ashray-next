# Ashray-Next — PG/Hostel Manager (Next.js + Supabase)

Next.js 16 + TypeScript + Tailwind 4 + Supabase. Ported from old SPA `ashray` + microsite `akshaya-men-s-pg-`. Branch: `development-v1`. Staging auto-deploys from `deployment-v1`, production from `main` (manual approval).

## Setup Checklist

### 1. Env — `.env.local` (never commit)
Create `C:\Projects\myprojects\ashray-next\.env.local`:
```env
NEXT_PUBLIC_SUPABASE_URL=https://<project>.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon-key>
NEXT_PUBLIC_ADMIN_PASSWORD=BALAJI14
```
Get URL/anon key from Supabase Dashboard → Project Settings → API. Keep `NEXT_PUBLIC_ADMIN_PASSWORD` in sync with admin login. Placeholder values allow `npm run build` to succeed without env (collects page data with dummy client).

`.env.example` is empty template — fill it as above.

### 2. Supabase — apply SQL in Dashboard SQL Editor
Order matters:
1. Run `supabase/migration.sql` — creates idempotent tables (`hostels/students/payments/expenses/rooms/beds/dues/complaints/enquiries/reviews/hostel_settings`), indexes, RLS + policies (authenticated full access, anon `insert enquiries` + `select approved reviews` + `select hostel_settings`), grants & sequences.
2. Then run `supabase/seed.sql` — idempotent Akshaya demo seed (fixed UUIDs + `ON CONFLICT DO NOTHING`): hostel `Akshaya Men's PG` (Ground/First floors, rooms 101 Single ₹9000 / 102 Double ₹6500 / 103 Triple ₹5000 with beds A/B/C), 2 students (Rahul 101-A, Arjun 102-A), 1 month dues (pending), 1 open complaint, 2 approved reviews, `hostel_settings` rows (pricing_note, phone, address, about_*). Rerun safe.

Verify: `select * from hostels; select * from rooms; select * from beds;`

### 3. Storage buckets (create if missing)
Dashboard → Storage → New bucket (public):
- `payment-proofs` — student UPI proof uploads (publicUrl used)
- `hostel-assets` — admin QR uploads
Set public read, authenticated write (or public write for prototype). Without buckets, upload will error but rest of app works.

### 4. Run
```bash
npm install
npm run dev     # http://localhost:3000
npm run build   # must be green before pushing (≤3 fix rounds)
```
Login:
- Admin: `/login` → select hostel + `NEXT_PUBLIC_ADMIN_PASSWORD` → `/admin`
- Student: `/login` → select hostel + phone (seed: 9876543210 / 9876543211) → `/student` (also `/student-dashboard` alias redirects)

## API List

All routes use `src/lib/supabase.ts` `createServerSupabaseClient` (anon key, placeholder-safe).

| Method | Route | Query/Body | Description |
|---|---|---|---|
| POST | `/api/dues/generate` | `{ hostel_id, month: "2026-09" }` | Generate monthly dues via `pg-engine.generateMonthlyDues` (skips existing). Returns `{ created, skipped }` |
| GET | `/api/rooms` | `?hostel_id=` | Rooms with nested `beds` for hostel |
| POST | `/api/rooms` | `{ hostel_id, floor, room_no, sharing_type (1-6), rent }` | Create room + auto-create N beds (A,B,C…) |
| GET | `/api/complaints` | `?hostel_id=&status=` | List complaints (filter by status, joins students) |
| POST | `/api/complaints` | `{ hostel_id?, student_id?, category, description }` | Public-ish insert (status `open`) |
| PATCH | `/api/complaints` | `{ id, status?, assigned_to? }` | Update status / assign |
| GET | `/api/reminders/bulk` | `?hostel_id=&status=overdue` | WhatsApp reminder links (`pg-engine.buildReminderMessage` + `waReminderLink`) |

Client-direct Supabase ops (no API): student proof upload → `payment-proofs` + `payments` insert (pending), complaints insert fallback, admin assign/vacate (`beds.student_id` + `students.bed_id`), enquiries `contacted` toggle, reviews `approved` toggle/delete, expenses CRUD, dues read, payments approve/reject.

## Project Structure

```
ashray-next/
├── supabase/
│   ├── migration.sql  # full contract (hostels/students/payments/expenses/rooms/beds/dues/complaints/enquiries/reviews/hostel_settings)
│   └── seed.sql       # Akshaya-flavored demo seed
├── src/
│   ├── app/
│   │   ├── page.tsx              # landing redirect
│   │   ├── layout.tsx
│   │   ├── globals.css
│   │   ├── login/page.tsx        # student (hostel+phone) / admin (hostel+password)
│   │   ├── student/page.tsx      # 'use client' — dues, payments, pay flow (UPI+proof→pending), complaints, bed/room via beds→rooms
│   │   ├── student-dashboard/page.tsx # alias redirect → /student
│   │   ├── admin/page.tsx        # analytics/students/payments/expenses/dues + Rooms CRUD + Complaints/Enquiries/Reviews tabs
│   │   └── api/
│   │       ├── dues/generate/route.ts
│   │       ├── rooms/route.ts
│   │       ├── complaints/route.ts
│   │       └── reminders/bulk/route.ts
│   └── lib/
│       ├── supabase.ts           # browser + server clients (placeholder-safe for build)
│       └── pg-engine.ts          # pure helpers: generateMonthlyDues, applyLateFee, occupancySummary, duesSummary, formatINR, waReminderLink
├── .env.local                    # not committed
├── package.json
└── README.md
```

References (read-only, never edit): `C:\Projects\myprojects\ashray\ashray` (old SPA — `StudentDashboard.jsx` ported) and `C:\Projects\myprojects\akshaya-men-s-pg-\` (microsite — enquiries/reviews/hostel_settings pattern).

## Notes

- TS strict-safe, `'use client'` for interactive pages, Tailwind + lucide-react + react-hot-toast only, no secrets in repo, `supabase.ts` clients only.
- RLS: `authenticated` full access, `anon` limited as above. Admin pages assume localStorage `admin_hostel_id`; student pages use `student_user`.
- Build: `npm run build` uses `placeholder.supabase.co` when env missing so CI doesn't fail.
