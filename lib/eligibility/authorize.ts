import "server-only";

import { getAccountSummary } from "@/lib/eligibility/service";

export class ParticipationForbiddenError extends Error {
  readonly code = "PARTICIPATION_FORBIDDEN";

  constructor(readonly reason: string) {
    super("Participation is not permitted for this account.");
  }
}

export async function requireParticipationEligibility(userId: string) {
  const account = await getAccountSummary(userId);
  if (account.overallResult !== "eligible") {
    throw new ParticipationForbiddenError(account.reason);
  }
  return account;
}
