-- 0024: Akun atlet + manajemen atlet keluar (bagian 1).
-- Prinsip: "keluar" = cabut akses + nonaktifkan atlet, BUKAN hapus data.
-- Semua perubahan bersifat aditif; tidak ada kolom/tabel yang dihapus.

-- Satu akun hanya boleh menautkan SATU atlet.
-- athletes.user_id sudah FK -> auth.users; kini diberi UNIQUE parsial
-- agar sinkronisasi/bulk creation idempoten di level database.
create unique index if not exists athletes_user_id_unique
  on public.athletes (user_id)
  where user_id is not null;

-- Atlet berhak membaca hasil performance miliknya sendiri.
-- (attendance/event/payments sudah punya policy my_athlete_id();
--  perf_select sebelumnya hanya staff/kelompok/parent.)
drop policy if exists perf_select on public.athlete_performance_results;
create policy perf_select on public.athlete_performance_results
  for select using (
    public.is_staff()
    or athlete_id in (select public.my_group_athlete_ids())
    or athlete_id in (select public.parent_athlete_ids())
    or athlete_id = public.my_athlete_id()
  );
