/**
 * TEAM CAKRA SWIMMING — Notification service (server-side).
 * Dispatch in-app via tulisan tabel langsung + dedupe dispatch_key (idempoten),
 * email/WA via provider abstraction dengan delivery log + retry max 3 attempt.
 */
import { createServiceClient } from "@/lib/supabase/service";
import { sendInApp } from "./dispatch";
import { renderTemplate, type Vars } from "./render";
import { emailProvider, whatsappProvider } from "./providers";
import type { SendResult } from "./providers";

export const MAX_ATTEMPTS = 3;

export type DispatchInput = {
  recipientId: string;
  ntype: string;
  title: string;
  message?: string;
  linkPath?: string | null;
  dispatchKey?: string | null;
  templateKey?: string | null;
  vars?: Vars;
};

/** Kirim in-app notification idempoten. Returns notification id atau null duplikat. */
export async function notifyInApp(input: DispatchInput): Promise<string | null> {
  const svc = createServiceClient();
  const { id } = await sendInApp(svc, {
    recipientId: input.recipientId,
    ntype: input.ntype,
    title: input.title,
    message: input.message ?? "",
    link: input.linkPath ?? null,
    key: input.dispatchKey ?? null,
  });
  return id;
}

/** Log delivery attempt ke notification_deliveries (service role dibutuhkan untuk write). */
export async function logDelivery(opts: {
  recipientId: string;
  channel: "in_app" | "email" | "whatsapp";
  templateKey?: string | null;
  result: SendResult;
  attempts: number;
  relatedType?: string;
  relatedId?: string;
}): Promise<void> {
  const { createServiceClient } = await import("@/lib/supabase/service");
  const svc = createServiceClient();
  await svc.from("notification_deliveries").insert({
    recipient_id: opts.recipientId,
    channel: opts.channel,
    template_key: opts.templateKey ?? null,
    status: opts.result.status,
    attempts: opts.attempts,
    error: opts.result.error ?? null,
    related_entity_type: opts.relatedType ?? null,
    related_entity_id: opts.relatedId ?? null,
    sent_at: opts.result.status === "SENT" ? new Date().toISOString() : null,
  });
}

/** Retry exponential sederhana: attempt 1 langsung, lalu backoff 2^n detik. */
export async function sendWithRetry(
  fn: () => Promise<SendResult>,
  maxAttempts = MAX_ATTEMPTS
): Promise<SendResult & { attempts: number }> {
  let last: SendResult = { ok: false, status: "FAILED", error: "unknown" };
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    last = await fn();
    if (last.ok) return { ...last, attempts: attempt };
    if (attempt < maxAttempts) {
      await new Promise((r) => setTimeout(r, Math.min(30_000, 2 ** attempt * 1000)));
    }
  }
  return { ...last, attempts: maxAttempts };
}

/** Render template dari DB lalu kirim via channel yang diminta (email/wa). */
export async function dispatchTemplated(opts: {
  recipientId: string;
  channel: "email" | "whatsapp";
  templateKey: string;
  vars: Vars;
  to: string;
  relatedType?: string;
  relatedId?: string;
}): Promise<void> {
  const svc = createServiceClient();
  const { data: tpl } = await svc
    .from("notification_templates")
    .select("subject, body")
    .eq("key", opts.templateKey)
    .maybeSingle();
  if (!tpl) return;
  const body = renderTemplate(tpl.body, opts.vars);
  const subject = tpl.subject ? renderTemplate(tpl.subject, opts.vars) : undefined;

  let result: SendResult & { attempts: number };
  if (opts.channel === "email") {
    result = await sendWithRetry(() =>
      emailProvider.send(opts.to, subject ?? "(tanpa subjek)", body)
    );
  } else {
    result = await sendWithRetry(() => whatsappProvider.send(opts.to, body));
  }
  await logDelivery({
    recipientId: opts.recipientId,
    channel: opts.channel,
    templateKey: opts.templateKey,
    result,
    attempts: result.attempts,
    relatedType: opts.relatedType,
    relatedId: opts.relatedId,
  });
}
