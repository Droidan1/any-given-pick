export type PlayerEmailKind =
  | "week_published"
  | "deadline_approaching"
  | "picks_submitted"
  | "results_available";

export type PlayerEmailTemplateInput = {
  kind: PlayerEmailKind;
  displayName: string | null;
  weekLabel: string;
  entryDeadline: Date;
  versionNumber?: number | null;
  committedAt?: Date | null;
};

export type PlayerEmailContent = {
  subject: string;
  text: string;
  html: string;
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
  heading: string;
  greeting: string;
  body: string;
  detail: string;
  actionLabel: string;
  actionUrl: string;
}): string {
  const safeActionUrl = escapeHtml(input.actionUrl);
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
            <p style="margin:0 0 10px;color:#bc4f25;font-family:Arial Narrow,Arial,sans-serif;font-size:16px;font-weight:700;letter-spacing:2px;text-transform:uppercase">Coach's call sheet</p>
            <h1 style="margin:0;color:#123f31;font-family:Arial Narrow,Arial,sans-serif;font-size:42px;line-height:1;text-transform:uppercase">${escapeHtml(input.heading)}</h1>
          </td></tr>
          <tr><td style="padding:8px 28px 0;font-size:17px;line-height:1.55">
            <p style="margin:0 0 14px">${escapeHtml(input.greeting)}</p>
            <p style="margin:0 0 18px">${escapeHtml(input.body)}</p>
            <p style="margin:0;padding:14px 0;border-top:1px solid #9e987e;border-bottom:1px solid #9e987e;font-weight:700">${escapeHtml(input.detail)}</p>
          </td></tr>
          <tr><td style="padding:28px">
            <a href="${safeActionUrl}" style="display:inline-block;background:#f2c928;color:#123f31;padding:16px 24px;font-family:Arial Narrow,Arial,sans-serif;font-size:20px;font-weight:700;letter-spacing:1px;text-decoration:none;text-transform:uppercase">${escapeHtml(input.actionLabel)} →</a>
          </td></tr>
          <tr><td style="background:#123f31;padding:18px 28px;color:#d5cfb8;font-size:12px;line-height:1.5">
            You received this because email reminders are enabled in your Any Given Pick profile.
            Manage them at <a href="${APP_ORIGIN}/profile#email-reminders" style="color:#f2c928">anygivenpick.app/profile</a>.
          </td></tr>
        </table>
      </td></tr>
    </table>
  </body>
</html>`;
}

export function buildPlayerEmail(input: PlayerEmailTemplateInput): PlayerEmailContent {
  const name = input.displayName?.trim() || "Player";
  const deadline = formatter.format(input.entryDeadline);
  const greeting = `${name},`;

  if (input.kind === "week_published") {
    const subject = `${input.weekLabel} is live — make your picks`;
    const body = `The ${input.weekLabel} call sheet is open. Pick one team in every matchup and submit your tiebreaker before the lock.`;
    const detail = `Picks lock ${deadline}.`;
    return {
      subject,
      text: `${greeting}\n\n${body}\n\n${detail}\n\nMake your picks: ${APP_ORIGIN}/?view=picks\n\nManage email reminders: ${APP_ORIGIN}/profile#email-reminders`,
      html: emailShell({ preview: subject, heading: "The call sheet is live", greeting, body, detail, actionLabel: "Make your picks", actionUrl: `${APP_ORIGIN}/?view=picks` }),
    };
  }

  if (input.kind === "deadline_approaching") {
    const subject = `${input.weekLabel} picks lock soon`;
    const body = `You do not have an official submitted card for ${input.weekLabel} yet. Finish every matchup and submit before the deadline.`;
    const detail = `Picks lock ${deadline}.`;
    return {
      subject,
      text: `${greeting}\n\n${body}\n\n${detail}\n\nFinish your card: ${APP_ORIGIN}/?view=picks\n\nManage email reminders: ${APP_ORIGIN}/profile#email-reminders`,
      html: emailShell({ preview: subject, heading: "The clock is moving", greeting, body, detail, actionLabel: "Finish your card", actionUrl: `${APP_ORIGIN}/?view=picks` }),
    };
  }

  if (input.kind === "picks_submitted") {
    const versionNumber = input.versionNumber ?? 1;
    const committed = input.committedAt ? formatter.format(input.committedAt) : "just now";
    const subject = `${input.weekLabel} picks received`;
    const body = `Your latest ${input.weekLabel} card is official. You can still edit and resubmit before the lock; only your newest submitted version counts.`;
    const detail = `Official version ${versionNumber} received ${committed}.`;
    return {
      subject,
      text: `${greeting}\n\n${body}\n\n${detail}\n\nView your activity: ${APP_ORIGIN}/activity\n\nManage email reminders: ${APP_ORIGIN}/profile#email-reminders`,
      html: emailShell({ preview: subject, heading: "Your picks are official", greeting, body, detail, actionLabel: "View your activity", actionUrl: `${APP_ORIGIN}/activity` }),
    };
  }

  const subject = `${input.weekLabel} results are ready`;
  const body = `Every game on the ${input.weekLabel} card is complete. Open My Activity to see which picks won, lost, or tied.`;
  const detail = "Your private card now includes the final score and outcome for every pick.";
  return {
    subject,
    text: `${greeting}\n\n${body}\n\n${detail}\n\nReview your results: ${APP_ORIGIN}/activity\n\nManage email reminders: ${APP_ORIGIN}/profile#email-reminders`,
    html: emailShell({ preview: subject, heading: "Results are on the board", greeting, body, detail, actionLabel: "Review your results", actionUrl: `${APP_ORIGIN}/activity` }),
  };
}
