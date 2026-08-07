import "server-only";

import { clerkClient } from "@clerk/nextjs/server";
import { and, desc, eq, inArray } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { profiles, roles, userRoles, users } from "@/lib/db/schema";

export type AdminUserAccessStatus = "pending" | "approved" | "removed" | "restricted";

export type AdminUserListItem = {
  id: string;
  email: string | null;
  name: string | null;
  displayName: string | null;
  status: AdminUserAccessStatus;
  statusLabel: string;
  isAdmin: boolean;
  isSelf: boolean;
  identityKnown: boolean;
  joinedLabel: string;
  lastSeenLabel: string;
};

export type AdminUserDirectory = {
  users: AdminUserListItem[];
  pendingCount: number;
  identityDirectoryAvailable: boolean;
  truncated: boolean;
};

type AppUserRow = typeof users.$inferSelect;

const formatter = new Intl.DateTimeFormat("en-US", {
  dateStyle: "medium",
  timeZone: "America/Indiana/Indianapolis",
});

function accessStatus(accountState: AppUserRow["accountState"], stateReason: string | null) {
  if (accountState === "active") {
    return { status: "approved" as const, statusLabel: "Approved" };
  }
  if (accountState === "read_only" && stateReason === "awaiting_admin_approval") {
    return { status: "pending" as const, statusLabel: "Pending approval" };
  }
  if (accountState === "suspended" && stateReason === "removed_by_admin") {
    return { status: "removed" as const, statusLabel: "Access removed" };
  }
  return { status: "restricted" as const, statusLabel: "Restricted" };
}

export async function listAdminUsers(currentUserId: string): Promise<AdminUserDirectory> {
  const db = getDb();
  const localUsers = await db
    .select({
      id: users.id,
      clerkUserId: users.clerkUserId,
      accountState: users.accountState,
      stateReason: users.stateReason,
      createdAt: users.createdAt,
      lastSeenAt: users.lastSeenAt,
      displayName: profiles.displayName,
    })
    .from(users)
    .leftJoin(profiles, eq(profiles.userId, users.id))
    .orderBy(desc(users.createdAt))
    .limit(101);

  const visibleUsers = localUsers.slice(0, 100);
  const userIds = visibleUsers.map((user) => user.id);
  const adminRows = userIds.length
    ? await db
        .select({ userId: userRoles.userId })
        .from(userRoles)
        .innerJoin(roles, eq(roles.id, userRoles.roleId))
        .where(
          and(
            inArray(userRoles.userId, userIds),
            inArray(roles.key, ["admin", "super_admin"]),
          ),
        )
    : [];
  const adminUserIds = new Set(adminRows.map((row) => row.userId));

  let identityDirectoryAvailable = true;
  const clerkUsers = new Map<
    string,
    { email: string | null; name: string | null; identityKnown: boolean }
  >();

  if (visibleUsers.length > 0) {
    try {
      const clerk = await clerkClient();
      const { data } = await clerk.users.getUserList({
        userId: visibleUsers.map((user) => user.clerkUserId),
        limit: 100,
      });

      for (const user of data) {
        const primaryEmail = user.emailAddresses.find(
          (email) => email.id === user.primaryEmailAddressId,
        );
        const verifiedEmail =
          primaryEmail?.verification?.status === "verified"
            ? primaryEmail
            : user.emailAddresses.find((email) => email.verification?.status === "verified");
        clerkUsers.set(user.id, {
          email: verifiedEmail?.emailAddress ?? null,
          name: user.fullName,
          identityKnown: Boolean(verifiedEmail?.emailAddress),
        });
      }
    } catch {
      identityDirectoryAvailable = false;
    }
  }

  const list = visibleUsers
    .map((user): AdminUserListItem => {
      const identity = clerkUsers.get(user.clerkUserId);
      const access = accessStatus(user.accountState, user.stateReason);
      return {
        id: user.id,
        email: identity?.email ?? null,
        name: identity?.name ?? null,
        displayName: user.displayName,
        status: access.status,
        statusLabel: access.statusLabel,
        isAdmin: adminUserIds.has(user.id),
        isSelf: user.id === currentUserId,
        identityKnown: identity?.identityKnown ?? false,
        joinedLabel: formatter.format(user.createdAt),
        lastSeenLabel: formatter.format(user.lastSeenAt),
      };
    })
    .sort((left, right) => {
      if (left.status === right.status) return 0;
      if (left.status === "pending") return -1;
      if (right.status === "pending") return 1;
      return 0;
    });

  return {
    users: list,
    pendingCount: list.filter((user) => user.status === "pending").length,
    identityDirectoryAvailable,
    truncated: localUsers.length > 100,
  };
}
