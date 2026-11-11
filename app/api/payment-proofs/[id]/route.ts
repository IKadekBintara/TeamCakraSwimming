import { NextResponse } from "next/server";
import { getAuth } from "@/lib/supabase/auth-helper";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function GET(_: Request, { params: routeParams }: { params: Promise<{ id: string }> }) {
  const params = await routeParams;
  const { profile } = await getAuth();
  if (profile?.account_status !== "ACTIVE") return new Response("Akses diperlukan.", { status: 403 });
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(params.id)) {
    return new Response("Bukti tidak ditemukan.", { status: 404 });
  }
  const supabase = await createClient();
  const { data, error } = await supabase.from("event_payments")
    .select("payment_proof").eq("id", params.id).maybeSingle();
  if (error) return new Response("Bukti pembayaran gagal dibaca.", { status: 500 });
  if (!data?.payment_proof) return new Response("Bukti tidak ditemukan.", { status: 404 });

  let path = String(data.payment_proof);
  if (path.startsWith("https://") || path.startsWith("http://")) {
    try {
      const url = new URL(path);
      const prefix = "/storage/v1/object/public/payment-proofs/";
      if (url.origin !== new URL(process.env.NEXT_PUBLIC_SUPABASE_URL!).origin || !url.pathname.startsWith(prefix)) {
        return new Response("Lokasi bukti tidak valid.", { status: 404 });
      }
      path = decodeURIComponent(url.pathname.slice(prefix.length));
    } catch {
      return new Response("Lokasi bukti tidak valid.", { status: 404 });
    }
  }
  if (!path.startsWith(`${params.id}/`) || path.split("/").some((part) => !part || part === "." || part === "..")) {
    return new Response("Lokasi bukti tidak valid.", { status: 404 });
  }

  const { data: signed, error: signError } = await supabase.storage.from("payment-proofs").createSignedUrl(path, 120);
  if (signError || !signed?.signedUrl) return new Response("Bukti tidak dapat dibuka.", { status: 404 });
  const response = NextResponse.redirect(signed.signedUrl);
  response.headers.set("Cache-Control", "private, no-store");
  return response;
}
