import { NextRequest, NextResponse } from "next/server";
import { runAutomationSweeps } from "@/lib/notifications/engine";

/**
 * Scheduled automation endpoint (payment reminders + event deadline reminders).
 * Dipanggil oleh cron/scheduler. Dilindungi CRON_SECRET (header x-cron-secret
 * atau Bearer). Tidak ada secret yang di-log.
 */
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const provided =
    req.headers.get("x-cron-secret") ??
    req.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ??
    "";
  if (!secret || provided !== secret) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const report = await runAutomationSweeps();
    return NextResponse.json({ ok: true, ...report });
  } catch (e) {
    console.error("automation_sweep_failed", (e as Error).message);
    return NextResponse.json({ ok: false, error: "sweep failed" }, { status: 500 });
  }
}

export const dynamic = "force-dynamic";
