import "server-only";

import { and, eq, inArray } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { roles, userRoles } from "@/lib/db/schema";
import { requireAppUser, type AppUser } from "./app-user";

const ADMIN_ROLES = ["admin", "super_admin"] as const;

export async function hasAdminRole(userId: string): Promise<boolean> {
  const db = getDb();
  const [match] = await db
    .select({ role: roles.key })
    .from(userRoles)
    .innerJoin(roles, eq(userRoles.roleId, roles.id))
    .where(and(eq(userRoles.userId, userId), inArray(roles.key, [...ADMIN_ROLES])))
    .limit(1);

  return Boolean(match);
}

export async function requireAdminUser(): Promise<AppUser> {
  const appUser = await requireAppUser();
  if (!(await hasAdminRole(appUser.id))) throw new Error("ADMIN_REQUIRED");
  return appUser;
}
