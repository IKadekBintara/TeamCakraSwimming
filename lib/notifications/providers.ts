/**
 * TEAM CAKRA SWIMMING — Provider abstraction (email + WhatsApp).
 * TIDAK ADA provider terpasang: kedua channel bernilai NOT CONFIGURED.
 * Service tidak boleh mengklaim pesan terkirim bila provider belum ada.
 */

export type SendResult = {
  ok: boolean;
  status: "SENT" | "QUEUED" | "FAILED";
  providerMessageId?: string;
  error?: string;
};

export interface EmailProvider {
  readonly name: string;
  readonly configured: boolean;
  send(to: string, subject: string, html: string): Promise<SendResult>;
}

export interface WhatsAppProvider {
  readonly name: string;
  readonly configured: false;
  send(to: string, text: string): Promise<SendResult>;
}

class NotConfiguredEmail implements EmailProvider {
  readonly name = "not_configured";
  readonly configured = false;
  async send(): Promise<SendResult> {
    return { ok: false, status: "FAILED", error: "Email provider belum dikonfigurasi" };
  }
}

class NotConfiguredWhatsApp implements WhatsAppProvider {
  readonly name = "not_configured";
  readonly configured = false;
  async send(): Promise<SendResult> {
    return { ok: false, status: "FAILED", error: "WhatsApp integration belum dikonfigurasi" };
  }
}

export const emailProvider: EmailProvider =
  process.env.EMAIL_PROVIDER === "resend" && process.env.RESEND_API_KEY
    ? new NotConfiguredEmail() // placeholder until a real provider module is wired
    : new NotConfiguredEmail();

export const whatsappProvider: WhatsAppProvider = new NotConfiguredWhatsApp();
