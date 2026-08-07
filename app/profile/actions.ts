"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { requireAppUser } from "@/lib/auth/app-user";
import { getDb } from "@/lib/db";
import { auditEvents, displayNameHistory, profiles, users } from "@/lib/db/schema";
import {
  addDays,
  isAtLeast21,
  normalizeDisplayName,
  profileInputSchema,
} from "@/lib/profile-validation";

export type ProfileActionState = {
  status: "idle" | "success" | "error";
  message: string;
  fieldErrors?: { displayName?: string[]; birthDate?: string[] };
};

export const initialProfileActionState: ProfileActionState = {
  status: "idle",
  message: "",
};

function isUniqueConstraintError(error: unknown): boolean {
  return Boolean(
    error &&
      typeof error === "object" &&
      "code" in error &&
      (error as { code?: string }).code === "23505",
  );
}

export async function saveProfileAction(
  _previousState: ProfileActionState,
  formData: FormData,
): Promise<ProfileActionState> {
  const parsed = profileInputSchema.safeParse({
    displayName: formData.get("displayName"),
    birthDate: formData.get("birthDate"),
  });

  if (!parsed.success) {
    return {
      status: "error",
      message: "Check the highlighted profile fields.",
      fieldErrors: parsed.error.flatten().fieldErrors,
    };
  }

  const appUser = await requireAppUser();
  if (appUser.accountState !== "active") {
    return {
      status: "error",
      message:
        appUser.stateReason === "awaiting_admin_approval"
          ? "An administrator must approve your account before you can create a player card."
          : "This account cannot create or update a player card right now.",
    };
  }
  const db = getDb();
  const now = new Date();
  const displayName = parsed.data.displayName.replace(/\s+/g, " ");
  const normalizedDisplayName = normalizeDisplayName(displayName);
  const ageEligible = isAtLeast21(parsed.data.birthDate, now);

  try {
    await db.transaction(async (transaction) => {
      const [currentAccount] = await transaction
        .select({ accountState: users.accountState })
        .from(users)
        .where(eq(users.id, appUser.id))
        .for("update")
        .limit(1);

      if (!currentAccount || currentAccount.accountState !== "active") {
        throw new Error("ACCOUNT_ACCESS_RESTRICTED");
      }

      const [existingProfile] = await transaction
        .select()
        .from(profiles)
        .where(eq(profiles.userId, appUser.id))
        .limit(1);

      const displayNameChanged =
        !existingProfile || existingProfile.displayName !== displayName;

      if (existingProfile && displayNameChanged) {
        const nextChangeAt = addDays(existingProfile.displayNameChangedAt, 30);
        if (nextChangeAt > now) {
          const formatter = new Intl.DateTimeFormat("en-US", {
            dateStyle: "medium",
            timeZone: "America/Indiana/Indianapolis",
          });
          throw new Error(`DISPLAY_NAME_LOCKED:${formatter.format(nextChangeAt)}`);
        }
      }

      await transaction
        .insert(profiles)
        .values({
          userId: appUser.id,
          displayName,
          normalizedDisplayName,
          birthDate: parsed.data.birthDate,
          ageEligible,
          ageCheckedAt: now,
          displayNameChangedAt: now,
          updatedAt: now,
        })
        .onConflictDoUpdate({
          target: profiles.userId,
          set: {
            displayName,
            normalizedDisplayName,
            birthDate: parsed.data.birthDate,
            ageEligible,
            ageCheckedAt: now,
            displayNameChangedAt: displayNameChanged
              ? now
              : existingProfile?.displayNameChangedAt ?? now,
            updatedAt: now,
          },
        });

      if (displayNameChanged) {
        await transaction.insert(displayNameHistory).values({
          userId: appUser.id,
          displayName,
          normalizedDisplayName,
          reason: existingProfile ? "user_update" : "profile_created",
          changedAt: now,
        });
      }

      await transaction.insert(auditEvents).values({
        actorUserId: appUser.id,
        targetUserId: appUser.id,
        action: existingProfile ? "profile.updated" : "profile.created",
        entityType: "profile",
        entityId: appUser.id,
        metadata: { ageEligible, displayNameChanged },
      });
    });
  } catch (error) {
    if (isUniqueConstraintError(error)) {
      return {
        status: "error",
        message: "That display name is already in use. Try another play call.",
        fieldErrors: { displayName: ["Display names must be unique."] },
      };
    }

    if (error instanceof Error && error.message.startsWith("DISPLAY_NAME_LOCKED:")) {
      const availableDate = error.message.split(":")[1];
      return {
        status: "error",
        message: `Your display name can be changed again on ${availableDate}.`,
        fieldErrors: { displayName: ["Display names can be changed once every 30 days."] },
      };
    }

    if (error instanceof Error && error.message === "ACCOUNT_ACCESS_RESTRICTED") {
      return {
        status: "error",
        message: "Your account access changed before this player card could be saved.",
      };
    }

    throw error;
  }

  revalidatePath("/");
  revalidatePath("/profile");

  return {
    status: "success",
    message: ageEligible
      ? "Profile saved. Verify your Indiana location to finish eligibility."
      : "Profile saved. Participation is limited to adults 21 and older.",
  };
}
