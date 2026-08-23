import { NextRequest, NextResponse } from "next/server";

/**
 * Rate limiter in-memory sederhana (sliding window per menit, per IP + scope).
 * Cukup untuk deployment single-instance; jika nanti multi-instance,
 * ganti backend-nya ke Redis/upstash tanpa mengubah API helper ini.
 */

type Bucket = { count: number; resetAt: number };

const buckets = new Map<string, Bucket>();
const MAX_KEYS = 5000;

function sweepExpired(now: number) {
  if (buckets.size < MAX_KEYS) return;
  buckets.forEach((b, k) => {
    if (b.resetAt <= now) buckets.delete(k);
  });
}

function clientIp(req: NextRequest): string {
  const fwd = req.headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0]!.trim();
  return req.headers.get("x-real-ip") ?? "local";
}

/**
 * Mengembalikan null jika permintaan diizinkan, atau response 429 jika melebihi kuota.
 * Pasang di awal setiap handler mutasi/export:
 *   const rl = rateLimit(req, "scope-name", 30);
 *   if (rl) return rl;
 */
export function rateLimit(
  req: NextRequest,
  scope: string,
  max = 30,
  windowMs = 60_000
): NextResponse | null {
  const now = Date.now();
  sweepExpired(now);
  const key = `${scope}:${clientIp(req)}`;
  const bucket = buckets.get(key);
  if (!bucket || bucket.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return null;
  }
  bucket.count += 1;
  if (bucket.count > max) {
    const retryAfter = Math.max(1, Math.ceil((bucket.resetAt - now) / 1000));
    return NextResponse.json(
      { error: `Terlalu banyak permintaan. Coba lagi dalam ${retryAfter} detik.` },
      { status: 429, headers: { "Retry-After": String(retryAfter) } }
    );
  }
  return null;
}
