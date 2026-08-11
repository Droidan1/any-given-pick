"use server";

import { clerkClient } from "@clerk/nextjs/server";
import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireAdminUser } from "@/lib/auth/admin";
import { getDb } from "@/lib/db";
import {
  auditEvents,
  authIdentities,
  displayNameHistory,
  eligibilityChecks,
  privacyRequests,
  profiles,
  userRoles,
  users,
} from "@/lib/db/schema";
import { reportOperationalIssue } from "@/lib/monitoring/operational-alerts";
import { consumeRateLimit } from "@/lib/security/rate-limit";

export type CompletePrivacyRequestState = {
  status: "idle" | "success" | "error";
  message: string;
};

const inputSchema = z.object({
  requestId: z.uuid(),
  confirmation: z.literal("confirmed"),
});

function isAlreadyDeletedClerkError(error: unknown): boolean {
  return Boolean(
    error
      && typeof error === "object"
      && "status" in error
      && (error as { status?: number }).status === 404,
  );
}

export async function completePrivacyRequestAction(
  _previousState: CompletePrivacyRequestState,
  formData: FormData,
): Promise<CompletePrivacyRequestState> {
  const parsed = inputSchema.safeParse({
    requestId: formData.get("requestId"),
    confirmation: formData.get("confirmation"),
  });
  if (!parsed.success) return { status: "error", message: "That privacy request was not valid." };

  const actor = await requireAdminUser();
  const rateLimit = await consumeRateLimit({
    scope: "admin_privacy_completion",
    identifier: actor.id,
    limit: 20,
    windowMs: 60 * 60 * 1_000,
  });
  if (!rateLimit.allowed) {
    return { status: "error", message: "Too many completion attempts. Wait before trying again." };
  }
  const db = getDb();
  const now = new Date();
  const staleBefore = new Date(now.getTime() - 10 * 60 * 1_000);
  const claim = await db.transaction(async (transaction) => {
    const [locked] = await transaction
      .select({
        id: privacyRequests.id,
        userId: privacyRequests.userId,
        status: privacyRequests.status,
        processingAt: privacyRequests.processingAt,
        clerkUserId: users.clerkUserId,
      })
      .from(privacyRequests)
      .innerJoin(users, eq(users.id, privacyRequests.userId))
      .where(eq(privacyRequests.id, parsed.data.requestId))
      .for("update")
      .limit(1);
    if (!locked || locked.status !== "pending") {
      return { ok: false as const, message: "That request is no longer open." };
    }
    if (locked.userId === actor.id) {
      return { ok: false as const, message: "Another administrator must complete your deletion request." };
    }
    if (locked.processingAt && locked.processingAt > staleBefore) {
      return { ok: false as const, message: "That request is already being processed. Try again in a few minutes." };
    }
    await transaction
      .update(privacyRequests)
      .set({
        processingAt: now,
        processingByUserId: actor.id,
        updatedAt: now,
      })
      .where(eq(privacyRequests.id, locked.id));
    return { ok: true as const, request: locked };
  });
  if (!claim.ok) return { status: "error", message: claim.message };
  const request = claim.request;

  try {
    const clerk = await clerkClient();
    await clerk.users.deleteUser(request.clerkUserId);
  } catch (error) {
    if (!isAlreadyDeletedClerkError(error)) {
      await db
        .update(privacyRequests)
        .set({
          processingAt: null,
          processingByUserId: null,
          updatedAt: new Date(),
        })
        .where(and(
          eq(privacyRequests.id, request.id),
          eq(privacyRequests.status, "pending"),
          eq(privacyRequests.processingByUserId, actor.id),
        ));
      await reportOperationalIssue({
        kind: "privacy_request_completion",
        identity: request.id,
        severity: "error",
        message: "Clerk identity deletion failed for a pending privacy request.",
        context: { requestId: request.id, stage: "clerk_delete" },
      });
      return {
        status: "error",
        message: "Clerk could not delete the identity. No application data was anonymized.",
      };
    }
  }

  const anonymousDisplayName = `Deleted ${request.id.slice(0, 8)}`;
  const result = await db.transaction(async (transaction) => {
    const [locked] = await transaction
      .select({
        status: privacyRequests.status,
        userId: privacyRequests.userId,
        processingByUserId: privacyRequests.processingByUserId,
      })
      .from(privacyRequests)
      .where(eq(privacyRequests.id, request.id))
      .for("update")
      .limit(1);
    if (!locked || locked.status !== "pending" || locked.processingByUserId !== actor.id) return false;

    await transaction.delete(authIdentities).where(eq(authIdentities.userId, locked.userId));
    await transaction.delete(displayNameHistory).where(eq(displayNameHistory.userId, locked.userId));
    await transaction.delete(eligibilityChecks).where(eq(eligibilityChecks.userId, locked.userId));
    await transaction.delete(userRoles).where(eq(userRoles.userId, locked.userId));
    await transaction
      .update(profiles)
      .set({
        displayName: anonymousDisplayName,
        normalizedDisplayName: anonymousDisplayName.toLocaleLowerCase("en-US"),
        birthDate: "1900-01-01",
        ageEligible: false,
        ageCheckedAt: now,
        displayNameChangedAt: now,
        updatedAt: now,
      })
      .where(eq(profiles.userId, locked.userId));
    await transaction
      .update(users)
      .set({
        clerkUserId: `deleted_${request.id}`,
        accountState: "deleted_anonymized",
        stateReason: "privacy_request_completed",
        stateChangedAt: now,
        anonymizedAt: now,
        updatedAt: now,
      })
      .where(eq(users.id, locked.userId));
    await transaction
      .update(privacyRequests)
      .set({
        status: "completed",
        completedAt: now,
        completedByUserId: actor.id,
        processingAt: null,
        processingByUserId: null,
        updatedAt: now,
      })
      .where(eq(privacyRequests.id, request.id));
    await transaction.insert(auditEvents).values({
      actorUserId: actor.id,
      targetUserId: locked.userId,
      action: "privacy.account_anonymized",
      entityType: "privacy_request",
      entityId: request.id,
      metadata: {
        clerk_identity_deleted: true,
        official_entries_retained_deidentified: true,
      },
    });
    return true;
  }).catch(async (error) => {
    await reportOperationalIssue({
      kind: "privacy_request_completion",
      identity: request.id,
      severity: "error",
      message: "Database anonymization failed after the Clerk identity was deleted.",
      context: { requestId: request.id, stage: "database_anonymization" },
    });
    console.error(error);
    return false;
  });

  if (!result) {
    return {
      status: "error",
      message: "The identity was removed, but database anonymization needs attention. An alert was recorded.",
    };
  }

  revalidatePath("/admin");
  revalidatePath("/results");
  return { status: "success", message: "Account deleted and contest history anonymized." };
}
