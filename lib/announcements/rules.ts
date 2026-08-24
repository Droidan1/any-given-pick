export type CommissionerAnnouncementStatus = "draft" | "published" | "archived";
export type CommissionerAnnouncementDisplayState =
  | "draft"
  | "scheduled"
  | "live"
  | "expired"
  | "archived";

export function getAnnouncementDisplayState(input: {
  status: CommissionerAnnouncementStatus;
  startsAt: string | Date;
  expiresAt: string | Date | null;
  now?: string | Date;
}): CommissionerAnnouncementDisplayState {
  if (input.status === "archived") return "archived";
  if (input.status === "draft") return "draft";

  const now = new Date(input.now ?? Date.now()).getTime();
  const startsAt = new Date(input.startsAt).getTime();
  const expiresAt = input.expiresAt ? new Date(input.expiresAt).getTime() : null;

  if (startsAt > now) return "scheduled";
  if (expiresAt !== null && expiresAt <= now) return "expired";
  return "live";
}

export function isAnnouncementActive(input: {
  status: CommissionerAnnouncementStatus;
  startsAt: string | Date;
  expiresAt: string | Date | null;
  now?: string | Date;
}): boolean {
  return getAnnouncementDisplayState(input) === "live";
}
