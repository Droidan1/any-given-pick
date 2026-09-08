import "server-only";

import { asc, eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { privacyRequests, profiles } from "@/lib/db/schema";

export type AdminPrivacyRequest = {
  id: string;
  userId: string;
  displayName: string;
  status: "pending" | "processing";
  requestedAt: string;
  processingAt: string | null;
};

export async function listPendingPrivacyRequests(): Promise<AdminPrivacyRequest[]> {
  const rows = await getDb()
    .select({
      id: privacyRequests.id,
      userId: privacyRequests.userId,
      displayName: profiles.displayName,
      status: privacyRequests.status,
      requestedAt: privacyRequests.requestedAt,
      processingAt: privacyRequests.processingAt,
    })
    .from(privacyRequests)
    .leftJoin(profiles, eq(profiles.userId, privacyRequests.userId))
    .where(eq(privacyRequests.status, "pending"))
    .orderBy(asc(privacyRequests.requestedAt))
    .limit(25);
  return rows.map((row) => ({
    id: row.id,
    userId: row.userId,
    displayName: row.displayName ?? "Player account",
    status: row.processingAt ? "processing" : "pending",
    requestedAt: row.requestedAt.toISOString(),
    processingAt: row.processingAt?.toISOString() ?? null,
  }));
}
