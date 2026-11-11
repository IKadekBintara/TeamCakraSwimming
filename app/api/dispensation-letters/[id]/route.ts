import { type NextRequest } from "next/server";
import { canManageLetters, letterUuid } from "@/lib/dispensasi-history";
import { createServiceClient } from "@/lib/supabase/service";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest, { params: routeParams }: { params: Promise<{ id: string }> }) {
  const params = await routeParams;
  if (!(await canManageLetters())) return new Response("Akses admin atau operator diperlukan.", { status: 403 });
  if (!letterUuid.test(params.id)) return new Response("Surat tidak ditemukan.", { status: 404 });
  const { data, error } = await createServiceClient().from("dispensation_letter_history")
    .select("pdf_base64,athlete_name").eq("id", params.id).maybeSingle();
  if (error) return new Response("PDF gagal dibaca.", { status: 500 });
  if (!data) return new Response("Surat tidak ditemukan.", { status: 404 });

  const athlete = String(data.athlete_name).normalize("NFKD").replace(/[^a-zA-Z0-9 -]/g, "").trim().slice(0, 100);
  const disposition = request.nextUrl.searchParams.has("download") ? "attachment" : "inline";
  const bytes = Uint8Array.from(Buffer.from(data.pdf_base64, "base64"));
  return new Response(bytes, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `${disposition}; filename="Surat Dispensasi - ${athlete || "Atlet"}.pdf"`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
      "X-Frame-Options": "SAMEORIGIN",
    },
  });
}
