# TEAM CAKRA SWIMMING

Sistem manajemen atlet, absensi, event, pendaftaran, pembayaran, dan laporan **TEAM CAKRA SWIMMING**.

## Tech Stack

- Next.js 14 (App Router) + React + TypeScript
- Tailwind CSS + Lucide React icons
- Supabase (PostgreSQL + Auth + Storage)
- XLSX / SheetJS

## Setup

1. **Install dependencies**

   ```bash
   npm install
   ```

2. **Buat project Supabase** di https://supabase.com, lalu jalankan SQL migration berurutan di SQL Editor:

   - `supabase/migrations/0001_initial_schema.sql` — tabel + RLS
   - `supabase/migrations/0002_storage.sql` — bucket foto atlet
   - `supabase/migrations/0003_seed_dev.sql` — akun test development (opsional, JANGAN di produksi)
   - `supabase/migrations/0004_events_registration_payment.sql` — Events, nomor lomba, pendaftaran, pembayaran manual, payment settings, audit policy, dan bucket bukti pembayaran

3. **Salin env**

   ```bash
   copy .env.local.example .env.local
   ```

   Isi `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, dan `HERMES_API_TOKEN`.

4. **Jalankan**

   ```bash
   npm run dev
   ```

5. **Akun produksi pertama**: daftar di `/login`, lalu jadikan admin:

   ```sql
   update public.profiles set role = 'admin' where id = '<auth-user-id>';
   ```

## Akun Test (Development Only)

Login format: `<username>@cakra.local` + password.

| Username | Password | Role |
|---|---|---|
| admin | Admin123! | Admin |
| operator | Operator123! | Operator |
| coach | Coach123! | Coach (Team Cakra 1) |
| ketua.cakra1 | Cakra123! | Ketua Team Cakra 1 |
| ketua.cakra2 | Cakra123! | Ketua Team Cakra 2 |
| ketua.cakra3 | Cakra123! | Ketua Team Cakra 3 |
| athlete | Athlete123! | Atlet (Team Cakra 1) |
| parent | Parent123! | Orang tua atlet uji |

## Roles & Akses

| Role | Akses |
|---|---|
| admin | Semua fitur |
| operator | Operasional (atlet, grup, jadwal, absensi, export) — tanpa manajemen akun & pengaturan sistem |
| coach | Absensi & grup yang dilatih |
| group_leader | Hanya grup yang dipimpinnya |
| athlete | Profil & absensi dirinya sendiri |
| parent | Data anak yang tertaut |

Semua pembatasan ditegakkan server-side via Supabase Row Level Security.

## Struktur

```
├── app/            # Routes (App Router)
│   ├── (app)/      # Halaman terproteksi
│   ├── login/
│   └── api/        # export excel, hermes
├── components/
├── lib/supabase/   # client / server / service / middleware
├── types/
└── supabase/migrations/
```

## Integrasi Hermes (future)

`POST /api/hermes` dengan `Authorization: Bearer $HERMES_API_TOKEN`.

Aksi: `ping`, `list_athletes`, `get_athlete`, `list_groups`, `today_sessions`,
`today_attendance`, `attendance_stats`, `propose_add_athlete`, `confirm_add_athlete`,
`propose_update_athlete`, `confirm_update_athlete`.

Perubahan penting selalu dua langkah: `propose_*` → konfirmasi manusia → `confirm_*`.
