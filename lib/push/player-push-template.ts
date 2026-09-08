import type { PlayerEmailKind } from "@/lib/email/player-email-template";

export type PlayerPushKind = PlayerEmailKind;

export type PlayerPushContent = {
  title: string;
  body: string;
  url: string;
  tag: string;
  urgency: "normal" | "high";
};

const deadlineFormatter = new Intl.DateTimeFormat("en-US", {
  weekday: "short",
  month: "short",
  day: "numeric",
  hour: "numeric",
  minute: "2-digit",
  timeZone: "America/Indiana/Indianapolis",
  timeZoneName: "short",
});

export function buildPlayerPush(input: {
  kind: PlayerPushKind;
  weekId: string;
  weekLabel: string;
  entryDeadline: Date;
  versionNumber?: number | null;
}): PlayerPushContent {
  const deadline = deadlineFormatter.format(input.entryDeadline);

  if (input.kind === "week_published") {
    return {
      title: "The new call sheet is ready",
      body: `${input.weekLabel} is open. Make your picks before ${deadline}.`,
      url: "/?view=picks",
      tag: `week-published-${input.weekId}`,
      urgency: "normal",
    };
  }

  if (input.kind === "deadline_approaching") {
    return {
      title: "Pick deadline approaching",
      body: `${input.weekLabel} locks ${deadline}. Finish and submit your card now.`,
      url: "/?view=picks",
      tag: `deadline-${input.weekId}`,
      urgency: "high",
    };
  }

  if (input.kind === "picks_submitted") {
    return {
      title: "Your picks are in",
      body: `${input.weekLabel} version ${input.versionNumber ?? 1} is official. You can update it before the lock.`,
      url: "/activity",
      tag: `picks-submitted-${input.weekId}-${input.versionNumber ?? 1}`,
      urgency: "normal",
    };
  }

  return {
    title: "Results are final",
    body: `${input.weekLabel} results are ready. See every win and loss on your card.`,
    url: "/results",
    tag: `results-${input.weekId}`,
    urgency: "normal",
  };
}

export function buildWebPushPayload(content: PlayerPushContent) {
  const absoluteUrl = new URL(content.url, "https://anygivenpick.app").toString();
  return {
    web_push: 8030,
    notification: {
      title: content.title,
      body: content.body,
      navigate: absoluteUrl,
      icon: "https://anygivenpick.app/pwa-icon-192.png",
      badge: "https://anygivenpick.app/pwa-icon-192.png",
      tag: content.tag,
      data: { url: absoluteUrl },
    },
  };
}
