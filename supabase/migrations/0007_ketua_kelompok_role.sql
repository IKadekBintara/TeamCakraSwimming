-- Add the new internal role without removing the legacy group_leader role.
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'ketua_kelompok';
