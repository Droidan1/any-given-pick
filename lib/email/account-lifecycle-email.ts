export type AccountLifecycleEmailKind = "admin_approval_needed" | "account_approved";

export type AccountLifecycleEmailContent = {
  subject: string;
  text: string;
  html: string;
};

type AccountLifecycleEmailInput = {
  kind: AccountLifecycleEmailKind;
  displayName: string | null;
  verifiedEmail: string | null;
  occurredAt: Date;
};

const APP_ORIGIN = "https://anygivenpick.app";
const formatter = new Intl.DateTimeFormat("en-US", {
  weekday: "long",
  year: "numeric",
  month: "long",
  day: "numeric",
  hour: "numeric",
  minute: "2-digit",
  timeZone: "America/Indiana/Indianapolis",
  timeZoneName: "short",
});

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function emailShell(input: {
  preview: string;
  kicker: string;
  heading: string;
  greeting: string;
  body: string;
  detail: string;
  actionLabel: string;
  actionUrl: string;
  footer: string;
}): string {
  return `<!doctype html>
<html lang="en">
  <head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(input.preview)}</title></head>
  <body style="margin:0;background:#f7f0df;color:#123f31;font-family:Verdana,Arial,sans-serif">
    <div style="display:none;max-height:0;overflow:hidden;opacity:0">${escapeHtml(input.preview)}</div>
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f7f0df">
      <tr><td align="center" style="padding:32px 16px">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:600px;border:1px solid #9e987e;background:#fffdf7">
          <tr><td style="background:#123f31;padding:22px 28px;color:#f2c928;font-family:Arial Narrow,Arial,sans-serif;font-size:24px;font-weight:700;letter-spacing:3px;text-transform:uppercase">Any Given Pick</td></tr>
          <tr><td style="padding:36px 28px 14px">
            <p style="margin:0 0 10px;color:#bc4f25;font-family:Arial Narrow,Arial,sans-serif;font-size:16px;font-weight:700;letter-spacing:2px;text-transform:uppercase">${escapeHtml(input.kicker)}</p>
            <h1 style="margin:0;color:#123f31;font-family:Arial Narrow,Arial,sans-serif;font-size:42px;line-height:1;text-transform:uppercase">${escapeHtml(input.heading)}</h1>
          </td></tr>
          <tr><td style="padding:8px 28px 0;font-size:17px;line-height:1.55">
            <p style="margin:0 0 14px">${escapeHtml(input.greeting)}</p>
            <p style="margin:0 0 18px">${escapeHtml(input.body)}</p>
            <p style="margin:0;padding:14px 0;border-top:1px solid #9e987e;border-bottom:1px solid #9e987e;font-weight:700">${escapeHtml(input.detail)}</p>
          </td></tr>
          <tr><td style="padding:28px">
            <a href="${escapeHtml(input.actionUrl)}" style="display:inline-block;background:#f2c928;color:#123f31;padding:16px 24px;font-family:Arial Narrow,Arial,sans-serif;font-size:20px;font-weight:700;letter-spacing:1px;text-decoration:none;text-transform:uppercase">${escapeHtml(input.actionLabel)} →</a>
          </td></tr>
          <tr><td style="background:#123f31;padding:18px 28px;color:#d5cfb8;font-size:12px;line-height:1.5">${escapeHtml(input.footer)}</td></tr>
        </table>
      </td></tr>
    </table>
  </body>
</html>`;
}

export function buildAccountLifecycleEmail(
  input: AccountLifecycleEmailInput,
): AccountLifecycleEmailContent {
  const occurredAt = formatter.format(input.occurredAt);
  const displayName = input.displayName?.trim() || "New player";

  if (input.kind === "admin_approval_needed") {
    const subject = "[Any Given Pick] New player needs approval";
    const body = `${displayName} created an account and is waiting in the approval queue.`;
    const detail = input.verifiedEmail
      ? `Verified email: ${input.verifiedEmail} · Requested ${occurredAt}`
      : `A verified email is not available yet · Requested ${occurredAt}`;
    return {
      subject,
      text: `Commissioner,\n\n${body}\n\n${detail}\n\nReview player access: ${APP_ORIGIN}/admin`,
      html: emailShell({
        preview: subject,
        kicker: "Approval queue",
        heading: "New player on deck",
        greeting: "Commissioner,",
        body,
        detail,
        actionLabel: "Review player access",
        actionUrl: `${APP_ORIGIN}/admin`,
        footer: "This administrative alert was sent because you manage player access for Any Given Pick.",
      }),
    };
  }

  const subject = "You're approved to play Any Given Pick";
  const body = "Your account has been approved. Complete your player card, then make your picks when a weekly call sheet is open.";
  const detail = `Access approved ${occurredAt}.`;
  return {
    subject,
    text: `${displayName},\n\n${body}\n\n${detail}\n\nComplete your player card: ${APP_ORIGIN}/profile\n\nGet support: ${APP_ORIGIN}/support`,
    html: emailShell({
      preview: subject,
      kicker: "Roster update",
      heading: "You're cleared to play",
      greeting: `${displayName},`,
      body,
      detail,
      actionLabel: "Complete your player card",
      actionUrl: `${APP_ORIGIN}/profile`,
      footer: "This transactional message confirms a change to your Any Given Pick account. Support is available at anygivenpick.app/support.",
    }),
  };
}
