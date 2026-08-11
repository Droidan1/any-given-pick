import "server-only";

const DEFAULT_SUPPORT_EMAIL = "brian@Droidan1.dev";
const DEFAULT_FROM_EMAIL = "Any Given Pick <onboarding@resend.dev>";

export function supportEmailAddress(): string {
  return process.env.SUPPORT_EMAIL?.trim() || DEFAULT_SUPPORT_EMAIL;
}

export type EmailDelivery =
  | { sent: true; id: string | null }
  | { sent: false; reason: "not_configured" | "provider_error" };

export async function sendSystemEmail(input: {
  subject: string;
  text: string;
  replyTo?: string;
  idempotencyKey?: string;
}): Promise<EmailDelivery> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.warn(JSON.stringify({
      level: "warning",
      message: "Email delivery skipped because RESEND_API_KEY is not configured.",
      subject: input.subject,
    }));
    return { sent: false, reason: "not_configured" };
  }

  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        ...(input.idempotencyKey ? { "Idempotency-Key": input.idempotencyKey } : {}),
      },
      body: JSON.stringify({
        from: process.env.EMAIL_FROM?.trim() || DEFAULT_FROM_EMAIL,
        to: [supportEmailAddress()],
        subject: input.subject,
        text: input.text,
        ...(input.replyTo ? { reply_to: input.replyTo } : {}),
      }),
      signal: AbortSignal.timeout(8_000),
    });
    if (!response.ok) {
      console.error(JSON.stringify({
        level: "error",
        message: "Resend rejected an Any Given Pick email.",
        status: response.status,
        subject: input.subject,
      }));
      return { sent: false, reason: "provider_error" };
    }
    const data = await response.json().catch(() => null) as { id?: string } | null;
    return { sent: true, id: data?.id ?? null };
  } catch (error) {
    console.error(JSON.stringify({
      level: "error",
      message: "Any Given Pick email delivery failed.",
      error: error instanceof Error ? error.message : "Unknown email error",
      subject: input.subject,
    }));
    return { sent: false, reason: "provider_error" };
  }
}
