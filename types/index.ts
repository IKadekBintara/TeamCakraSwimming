// Shared application types for Absensi Team Cakra Swimming

export type Role = "admin" | "operator" | "coach" | "group_leader" | "athlete" | "parent";

export type AthleteStatus = "ACTIVE" | "INACTIVE" | "LEFT_CLUB";

export type Gender = "M" | "F";

export type AttendanceStatus = "present" | "excused" | "sick" | "absent";

export interface Profile {
  id: string; // uuid, references auth.users
  full_name: string;
  role: Role;
  phone: string | null;
  created_at: string;
}

export interface Parent {
  id: string;
  user_id: string | null;
  full_name: string;
  whatsapp: string | null;
  address: string | null;
  created_at: string;
}

export interface Coach {
  id: string;
  user_id: string | null;
  full_name: string;
  whatsapp: string | null;
  created_at: string;
}

export interface TrainingGroup {
  id: string;
  name: string;
  location: string | null;
  coach_id: string | null;
  leader_id: string | null; // group leader (ketua) — profile user_id
  is_active: boolean;
  created_at: string;
}

export interface GroupMember {
  id: string;
  group_id: string;
  athlete_id: string;
  joined_at: string;
  left_at: string | null;
  created_at: string;
}

export interface Athlete {
  id: string;
  user_id: string | null; // athlete login account
  full_name: string;
  nickname: string | null;
  birth_date: string | null;
  gender: Gender | null;
  school: string | null;
  grade: string | null;
  parent_id: string | null;
  parent_name: string | null;
  whatsapp: string | null;
  address: string | null;
  photo_url: string | null;
  program: string | null;
  cakra: string | null;
  join_date: string | null;
  status: AthleteStatus;
  left_at: string | null;
  left_reason: string | null;
  reactivated_at: string | null;
  notes: string | null;
  created_at: string;
}

export interface TrainingSchedule {
  id: string;
  group_id: string;
  day_of_week: number; // 0=Sunday .. 6=Saturday
  start_time: string;
  end_time: string;
  location: string | null;
  is_active: boolean;
  created_at: string;
}

export interface TrainingSession {
  id: string;
  group_id: string;
  session_date: string;
  start_time: string | null;
  end_time: string | null;
  location: string | null;
  coach_id: string | null;
  notes: string | null;
  created_at: string;
}

export interface Attendance {
  id: string;
  session_id: string;
  athlete_id: string;
  status: AttendanceStatus;
  note: string | null;
  recorded_by: string | null;
  created_at: string;
}

export interface AuditLog {
  id: string;
  actor_id: string | null;
  action: string;
  entity: string;
  entity_id: string | null;
  old_value: Record<string, unknown> | null;
  new_value: Record<string, unknown> | null;
  created_at: string;
}

export const DAY_NAMES = [
  "Minggu",
  "Senin",
  "Selasa",
  "Rabu",
  "Kamis",
  "Jumat",
  "Sabtu",
] as const;

export const ATTENDANCE_LABELS: Record<AttendanceStatus, string> = {
  present: "Hadir",
  excused: "Izin",
  sick: "Sakit",
  absent: "Alpa",
};

export const STATUS_LABELS: Record<AthleteStatus, string> = {
  ACTIVE: "Aktif",
  INACTIVE: "Nonaktif",
  LEFT_CLUB: "Keluar",
};

export const ROLE_LABELS: Record<Role, string> = {
  admin: "Admin",
  operator: "Operator",
  coach: "Coach",
  group_leader: "Ketua Kelompok",
  athlete: "Atlet",
  parent: "Orang Tua",
};

export function normalizeWhatsapp(raw: string | null | undefined): string {
  if (!raw) return "";
  let digits = raw.replace(/\D/g, "");
  if (digits.startsWith("0")) digits = "62" + digits.slice(1);
  if (digits.startsWith("8")) digits = "62" + digits;
  return digits;
}

export function waLink(raw: string | null | undefined): string {
  const n = normalizeWhatsapp(raw);
  return n ? `https://wa.me/${n}` : "#";
}

export function mapsLink(address: string | null | undefined): string {
  if (!address) return "#";
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`;
}
