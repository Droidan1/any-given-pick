"use server";

import { clerkClient } from "@clerk/nextjs/server";
import { and, eq, inArray } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { z } from "zod";
import { requireAdminUser } from "@/lib/auth/admin";
import { getDb } from "@/lib/db";
import { auditEvents, roles, userRoles, users } from "@/lib/db/schema";
import { queueAndProcessAccountApprovedEmail } from "@/lib/email/account-lifecycle-notifications";
import { reportOperationalIssue } from "@/lib/monitoring/operational-alerts";

export type UserAccessActionState = {
  status: "idle" | "success" | "error";
  message: string;
};

const inputSchema = z.object({
  targetUserId: z.uuid(),
  intent: z.enum(["approve", "remove"]),
});

export async function manageUserAccessAction(
  _previousState: UserAccessActionState,
  formData: FormData,
): Promise<UserAccessActionState> {
  const parsed = inputSchema.safeParse({
    targetUserId: formData.get("targetUserId"),
    intent: formData.get("intent"),
  });
  if (!parsed.success) {
    return { status: "error", message: "That access request was not valid." };
  }

  const actor = await requireAdminUser();
  if (actor.id === parsed.data.targetUserId) {
    return { status: "error", message: "You cannot change your own administrator access." };
  }

  const db = getDb();
  const [identityTarget] = await db
    .select({ clerkUserId: users.clerkUserId })
    .from(users)
    .where(eq(users.id, parsed.data.targetUserId))
    .limit(1);
  if (!identityTarget) {
    return { status: "error", message: "That user could not be found." };
  }

  try {
    const clerk = await clerkClient();
    const clerkUser = await clerk.users.getUser(identityTarget.clerkUserId);
    const hasVerifiedEmail = clerkUser.emailAddresses.some(
      (email) => email.verification?.status === "verified",
    );
    if (!hasVerifiedEmail) {
      return {
        status: "error",
        message: "Access cannot change until Clerk confirms a verified email address.",
      };
    }
  } catch {
    return {
      status: "error",
      message: "Clerk could not verify this identity. No access was changed.",
    };
  }

  const now = new Date();
  const nextState = parsed.data.intent === "approve" ? "active" : "suspended";
  const nextReason = parsed.data.intent === "approve" ? "approved_by_admin" : "removed_by_admin";

  const result = await db.transaction(async (transaction) => {
    const [target] = await transaction
      .select({ id: users.id, accountState: users.accountState })
      .from(users)
      .where(eq(users.id, parsed.data.targetUserId))
      .for("update")
      .limit(1);
    if (!target) return { status: "missing" as const, approvalEventId: null };

    const [adminRole] = await transaction
      .select({ role: roles.key })
      .from(userRoles)
      .innerJoin(roles, eq(roles.id, userRoles.roleId))
      .where(
        and(
          eq(userRoles.userId, target.id),
          inArray(roles.key, ["admin", "super_admin"]),
        ),
      )
      .limit(1);
    if (adminRole) return { status: "protected" as const, approvalEventId: null };

    await transaction
      .update(users)
      .set({
        accountState: nextState,
        stateReason: nextReason,
        stateChangedAt: now,
        updatedAt: now,
      })
      .where(eq(users.id, target.id));

    const [auditEvent] = await transaction.insert(auditEvents).values({
      actorUserId: actor.id,
      targetUserId: target.id,
      action:
        parsed.data.intent === "approve"
          ? "account.access_approved"
          : "account.access_removed",
      entityType: "user",
      entityId: target.id,
      metadata: {
        previous_account_state: target.accountState,
        next_account_state: nextState,
        reversible: true,
      },
    }).returning({ id: auditEvents.id });

    return {
      status: "updated" as const,
      approvalEventId: parsed.data.intent === "approve" ? auditEvent.id : null,
    };
  });

  if (result.status === "missing") {
    return { status: "error", message: "That user could not be found." };
  }
  if (result.status === "protected") {
    return { status: "error", message: "Administrator accounts are protected." };
  }

  const approvalEventId = result.approvalEventId;
  if (approvalEventId) {
    after(async () => {
      try {
        await queueAndProcessAccountApprovedEmail({
          userId: parsed.data.targetUserId,
          approvalEventId,
        });
      } catch {
        await reportOperationalIssue({
          kind: "account_email_queue",
          identity: `approved:${approvalEventId}`,
          severity: "warning",
          message: "An account approval email could not be queued immediately.",
          context: { stage: "admin_approval" },
        });
      }
    });
  }

  revalidatePath("/");
  revalidatePath("/profile");
  revalidatePath("/admin");

  return {
    status: "success",
    message:
      parsed.data.intent === "approve"
        ? "Player access approved."
        : "Player access removed. Their records were preserved.",
  };
}
