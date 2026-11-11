import { createHash } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { buildDispensasiPdf } from "@/lib/dispensasi-pdf";
import { defaultLayout, type Letter } from "@/lib/dispensasi";
import { canManageLetters, letterHistoryColumns, letterUuid } from "@/lib/dispensasi-history";
import { createServiceClient } from "@/lib/supabase/service";

const textFields = [
  "athlete", "school", "event", "venue", "city", "attachment", "subject",
  "position", "organization", "signer", "opening", "closing",
] as const;
const requiredFields = ["athlete", "school", "event", "venue"] as const;
const layoutBounds = {
  margin: [36, 90], headerHeight: [95, 180], fontSize: [9, 15], leading: [13, 24],
  signatureX: [25, 85], signatureGap: [30, 100],
};

function validDate(value: unknown): value is string {
  if (typeof value !== "string" || !/^[1-9]\d{3}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function parseLetter(value: unknown): Letter | null {
  if (!value || typeof value !== "object") return null;
  const draft = value as Partial<Letter>;
  if (!textFields.every((field) => typeof draft[field] === "string"
    && draft[field]!.length <= (field === "opening" || field === "closing" ? 3000 : 220))
    || !requiredFields.every((field) => draft[field]?.trim())) return null;
  if (!validDate(draft.issueDate) || !validDate(draft.eventDate) || typeof draft.eventEnd !== "string"
    || (draft.eventEnd && (!validDate(draft.eventEnd) || draft.eventEnd < draft.eventDate))) return null;
  if (!Array.isArray(draft.leaveDates) || !draft.leaveDates.length || draft.leaveDates.length > 30
    || !draft.leaveDates.every(validDate)) return null;
  return {
    ...Object.fromEntries(textFields.map((field) => [field, draft[field]])) as Pick<Letter, typeof textFields[number]>,
    issueDate: draft.issueDate, eventDate: draft.eventDate, eventEnd: draft.eventEnd,
    leaveDates: Array.from(new Set(draft.leaveDates)).sort(), number: "",
  };
}

function parseLayout(value: unknown) {
  if (!value || typeof value !== "object") return null;
  const layout = value as Partial<typeof defaultLayout>;
  const entries = Object.entries(layoutBounds) as [keyof typeof defaultLayout, number[]][];
  if (!entries.every(([key, [min, max]]) =>
    typeof layout[key] === "number" && layout[key]! >= min && layout[key]! <= max)) return null;
  return Object.fromEntries(entries.map(([key]) => [key, layout[key]])) as typeof defaultLayout;
}

function fail(error: string, status: number) {
  return NextResponse.json({ error }, { status });
}

export async function POST(request: NextRequest) {
  if (request.headers.get("x-cakra-letter") !== "1" || !(await canManageLetters())) {
    return fail("Akses admin atau operator diperlukan.", 403);
  }
  if (Number(request.headers.get("content-length")) > 3_050_000) return fail("Ukuran kop terlalu besar.", 413);
  const form = await request.formData().catch(() => null);
  const eventId = form?.get("eventId");
  const athleteId = form?.get("athleteId");
  const image = form?.get("header");
  if (typeof eventId !== "string" || !letterUuid.test(eventId)
    || typeof athleteId !== "string" || !letterUuid.test(athleteId)
    || !image || typeof image === "string" || image.size > 3_000_000
    || (image.type !== "image/png" && image.type !== "image/jpeg")) {
    return fail("Data surat atau gambar kop tidak valid.", 400);
  }
  let letter, layout;
  try {
    letter = parseLetter(JSON.parse(String(form?.get("letter"))));
    layout = parseLayout(JSON.parse(String(form?.get("layout"))));
  } catch {
    return fail("Data surat tidak valid.", 400);
  }
  if (!letter || !layout) return fail("Lengkapi isi surat dan periksa tata letak.", 400);

  const bytes = await image.arrayBuffer();
  const buffer = Buffer.from(bytes);
  if (image.type === "image/png" && (buffer.length < 24
    || buffer.subarray(0, 8).toString("hex") !== "89504e470d0a1a0a"
    || buffer.readUInt32BE(16) * buffer.readUInt32BE(20) > 6_000_000)) {
    return fail("Ukuran piksel gambar kop PNG terlalu besar atau file tidak valid.", 400);
  }
  const db = createServiceClient();
  const { data: issued, error: issueError } = await db.rpc("issue_dispensation_letter_number", {
    p_event_id: eventId, p_athlete_id: athleteId, p_issue_date: letter.issueDate,
  });
  if (issueError || !issued?.letter_number) {
    return issueError?.code === "22023"
      ? fail("Atlet belum terdaftar aktif di event ini.", 400)
      : fail("Nomor surat belum bisa diterbitkan. Coba lagi.", 500);
  }
  letter.number = issued.letter_number;
  const contentKey = createHash("sha256")
    .update(JSON.stringify([eventId, athleteId, letter, layout, image.type]))
    .update(buffer).digest("hex");
  const history = () => db.from("dispensation_letter_history");
  const existing = await history().select(letterHistoryColumns).eq("content_key", contentKey).maybeSingle();
  if (existing.error) return fail("Riwayat surat gagal dibaca.", 500);
  if (existing.data) return NextResponse.json({ letter: existing.data, sequence: issued.sequence_no });

  let pdf;
  try {
    pdf = await buildDispensasiPdf(letter, layout, { bytes, type: image.type });
  } catch {
    return fail("PDF gagal dibuat. Periksa kembali isi surat, tata letak, dan gambar kop.", 422);
  }
  if (pdf.length > 3_900_000) return fail("PDF terlalu besar. Gunakan gambar kop yang lebih kecil.", 413);
  const saved = await history().insert({
    event_id: eventId, athlete_id: athleteId, athlete_name: letter.athlete.trim(), school: letter.school.trim(),
    letter_number: letter.number, issue_date: letter.issueDate, content_key: contentKey,
    pdf_base64: Buffer.from(pdf).toString("base64"),
  }).select(letterHistoryColumns).single();
  if (!saved.error) return NextResponse.json({ letter: saved.data, sequence: issued.sequence_no });
  if (saved.error.code === "23505") {
    const retry = await history().select(letterHistoryColumns).eq("content_key", contentKey).single();
    if (retry.data) return NextResponse.json({ letter: retry.data, sequence: issued.sequence_no });
  }
  return fail("PDF belum tersimpan. Coba lagi untuk menyimpan dengan nomor yang sama.", 500);
}
