import "server-only";

import { and, desc, eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { privacyRequests } from "@/lib/db/schema";

export type AccountPrivacyRequest = {
  id: string;
  status: "pending" | "processing";
  requestedAt: string;
};

export async function getLatestAccountPrivacyRequest(
  userId: string,
): Promise<AccountPrivacyRequest | null> {
  const [request] = await getDb()
    .select({
      id: privacyRequests.id,
      status: privacyRequests.status,
      requestedAt: privacyRequests.requestedAt,
      processingAt: privacyRequests.processingAt,
    })
    .from(privacyRequests)
    .where(and(eq(privacyRequests.userId, userId), eq(privacyRequests.status, "pending")))
    .orderBy(desc(privacyRequests.requestedAt))
    .limit(1);
  return request
    ? {
        id: request.id,
        status: request.processingAt ? "processing" : "pending",
        requestedAt: request.requestedAt.toISOString(),
      }
    : null;
}
