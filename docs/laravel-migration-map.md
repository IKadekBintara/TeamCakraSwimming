# TEAM CAKRA — Mapping Migrasi Next.js → Laravel
> FASE 2 master task. Sumber: audit aktual codebase `D:\Projects\TeamCakraSwimming` (31 halaman, 21 API route, 39 komponen) + schema Supabase `akxfonpjqanvgkikttxz` (31 tabel public). DB tetap SINGLE SOURCE OF TRUTH — tidak ada tabel duplikat, tidak ada database kedua.

## 1. Keputusan Arsitektur Inti
| Topik | Keputusan |
|---|---|
| Database | Koneksi langsung Postgres Supabase via Eloquent (`$table` = nama tabel existing). TIDAK ADA Laravel migration untuk tabel existing; migration Laravel hanya untuk infrastruktur baru bila wajib (jobs/cache), backward-compatible. |
| Auth | Supabase Auth (GoTrue) TETAP sumber identitas. Laravel = confidential client: verifikasi JWT user per-request (GoTrue `/auth/v1/user` atau validasi JWT HS256 dengan `SUPABASE_JWT_SECRET`), role dari `profiles.role`. Service-role key HANYA di server env. RLS tidak dimatikan. |
| Authorization | Replikasi `page-guard.ts` → Laravel middleware + Policies/Gates per role: admin, operator, coach, group_leader/ketua_kelompok, athlete, parent. `account_status = ACTIVE` wajib. |
| Session | Login form → proxy ke GoTrue `token?grant_type=password` → session Laravel menyimpan access/refresh token. APK native nanti pakai GoTrue langsung (client kedua, DB sama). |
| Queue | Laravel queue (database driver) jika fitur berat butuh background; tabel infrastruktur baru dibuat terpisah & idempotent, tidak menyentuh data existing. |
| Excel Sync & RDP Worker | **TIDAK diporting ke PHP.** Worker Node.js di RDP tetap berjalan (schtasks → `D:\Projects\TeamCakraSwimming\worker\start-worker.bat`). Laravel hanya menggantikan UI/endpoint admin Excel Sync (`excel_sync_configurations`, `excel_sync_jobs` tabel sama). |

## 2. Route → Controller → Service → Model → View
### 2a. Halaman (31) — semua `app/(app)/**` + login
| Next.js | Laravel Route | Controller@method | View (Blade) |
|---|---|---|---|
| `/` (app/page) | `/` | DashboardController@index (redirect per role) | — |
| `/login` | `/login` GET/POST | AuthController@show / login | auth.login |
| `/dashboard` | `/dashboard` | DashboardController@index | dashboard.index |
| `/atlet`, `/atlet/tambah`, `/atlet/{id}`, `/atlet/{id}/edit` | resource | AthleteController (index/create/show/edit/update/destroy) | athletes.* |
| `/absensi`, `/absensi/{groupId}`, `/absensi-saya` | `/absensi…` | AttendanceController | attendance.* |
| `/events`, `/events/{id}` | resource | EventController | events.* |
| `/registrations` | `/registrations` | RegistrationController@index (filter/sort/paginasi server-side) | registrations.index |
| `/keuangan` | `/keuangan` | PaymentCenterController@index | finance.index |
| `/performance`, `/performance-saya` | `/performance…` | PerformanceController | performance.* |
| `/jadwal` | `/jadwal` | ScheduleController | schedule.index |
| `/kelompok` | `/kelompok` | GroupController (training_groups + members) | groups.index |
| `/laporan` | `/laporan` | AttendanceReportController | reports.attendance |
| `/reports` | `/reports` | ReportCenterController (6 report, aggregate SQL) | reports.index |
| `/users`, `/accounts` | `/users`, `/accounts` | UserController / AccountController | users.*, accounts.* |
| `/audit` | `/audit` | AuditController@index (audit_logs, paginasi) | audit.index |
| `/communication` | `/communication` | CommunicationController (templates/settings/manual/retry) | communication.index |
| `/notifications` | `/notifications` | NotificationController | notifications.index |
| `/settings`, `/event-settings`, `/excel-sync` | sama | SettingsController / EventSettingsController / ExcelSyncController | settings.* |
| `/import-export` | `/import-export` | ImportExportController | io.index |
| `/profil-saya`, `/pembayaran-saya` | sama | SelfProfileController / SelfPaymentController | self.* |

### 2b. API (21) → Laravel API routes (middleware auth + role)
| Next.js API | Laravel Endpoint | Catatan |
|---|---|---|
| `/api/admin/event-payments` PATCH | `PATCH /api/admin/event-payments` | aksi verify/reject/set_status/cancel/**remove_from_event** (urutan hapus: entries→payments→registrations; atlet tidak disentuh; audit `REMOVE_FROM_EVENT`) |
| `/api/admin/events/[id]`, `.../permanent-delete` | `PATCH|DELETE /api/admin/events/{id}` | permanent delete cek dependensi (registrations/races/payments) |
| `/api/admin/accounts`, `/api/admin/athlete-accounts` | `POST/PATCH /api/admin/accounts…` | kelola profiles + auth user |
| `/api/admin/excel-sync`, `/api/admin/excel-sync/{id}` | CRUD config sync | tabel sama; Dry Run read-only, Sync menulis + read-back |
| `/api/admin/payment-settings` | `PATCH /api/admin/payment-settings` | — |
| `/api/export` | `GET /api/export?kind=…` | stream Excel (maatwebsite/excel), mapping per cfg |
| `/api/communication/*` (manual, retry, settings, templates) | group `api/communication/*` | engine notifikasi |
| `/api/notifications`, `…/read`, `…/prefs` | group | bell + preferensi |
| `/api/performance` | `POST/PATCH /api/performance` | hasil lomba; uppercase; athlete_id identity |
| `/api/training-groups` | `GET /api/training-groups` | grup dinamis dari DB |
| `/api/automation/sweep` | `POST /api/automation/sweep` | scheduler |
| `/api/events/options` | `GET /api/events/options` | — |
| `/api/hermes` | `GET /api/hermes` | integrasi asisten (keep) |

### 2c. Model Eloquent (tabel existing — tanpa migration)
`Profile (profiles)`, `Athlete (athletes)`, `TrainingGroup`, `TrainingGroupMember`, `TrainingSession`, `Attendance`, `Event`, `EventRace`, `EventRegistration`, `EventRegistrationEntry`, `EventPayment`, `RelayTeam?` (cek), `Notification`, `NotificationDelivery`, `AuditLog`, `ExcelSyncConfiguration`, `ExcelSyncJob`, `AthletePerformanceResult`, `PaymentSetting`, `CommunicationSetting/Template`.

Aturan model wajib:
- `keyType = 'string'`, `incrementing = false` (UUID), `timestamps` sesuai kolom `created_at/updated_at`.
- **Athlete identity = athlete_id (UUID)**; rename/uppercase TIDAK membuat atlet baru (FASE 6).
- Kelompok = relasi `training_group_members` aktif (`left_at IS NULL`); tampilan kosong = "BELUM DIATUR", tanpa fallback nama (FASE 7).
- Registrasi: unik aktif per (event, athlete) — sudah dijaga partial index + trigger `guard_registration_unique` di DB; RPC `create_event_registration` tetap dipakai via QueryBuilder `select('create_event_registration', [...])` (FASE 9).
- Pembayaran: `registration_fee` (uang event) ≠ `admin_fee`; `total_amount = trigger`; dashboard memisahkan ketiganya (FASE 10).

## 3. Rencana Performa (FASE 5) — akar masalah Next.js saat ini
1. Dashboard fetch full-table (payments, registrations, athletes) untuk count → ganti `COUNT()`/aggregate SQL.
2. Halaman index fetch semua lalu filter in-memory → filter/sort/paginasi server-side (SQL).
3. Auth berulang per komponen → sudah di-cache via `getAuth()`; Laravel: middleware sekali per request.
4. Waterfall query berurutan → eager loading + `Promise.all` setara (pool).
5. Target: klik → shell < 300ms; ukur BEFORE/AFTER (TTFB per halaman, jumlah query, waktu query) — tabel hasil menyusul saat Laravel jalan.

## 4. Parity Checklist (FASE 23) — per halaman: data, tombol, CRUD, filter, sort, paginasi, export, role gate. Sumber kebenaran = DB, bukan salah satu app.

## 5. Urutan Eksekusi (FASE 3+)
1. Setup PHP 8.3 + Composer (Windows) → `laravel new TeamCakraLaravel` di `D:\Projects`.
2. Koneksi Postgres Supabase (port 5432/6543 pooler) — env server-only.
3. Auth bridge GoTrue + middleware role (FASE 4).
4. Port modul berurutan: Athlete → Groups → Events/Registration → Payment → Dashboard → Performance/Attendance → Reports → Notifications → Users/Audit → Import-Export → Excel Sync UI.
5. Test tiap modul (FASE 21–22) + parity (FASE 23) + QC (FASE 24).
6. Deploy staging (port berbeda, DB sama) → uji paralel dengan Next.js → produksi hanya setelah semua PASS. Next.js JANGAN dihapus.
