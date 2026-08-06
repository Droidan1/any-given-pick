import { and, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { roles, userRoles, users } from "../lib/db/schema";

const clerkUserId = process.argv[2]?.trim();
const requestedRole = process.argv[3]?.trim() || "admin";

if (!clerkUserId) {
  throw new Error("Usage: npm run db:grant-admin -- <clerk_user_id> [admin|super_admin]");
}
if (!["admin", "super_admin"].includes(requestedRole)) {
  throw new Error("Role must be admin or super_admin.");
}

const connectionString = (process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL)?.replace(
  "sslmode=require",
  "sslmode=verify-full",
);
if (!connectionString) throw new Error("DATABASE_URL_UNPOOLED or DATABASE_URL is required.");

async function main() {
  const pool = new Pool({ connectionString, max: 1 });
  const db = drizzle(pool);

  try {
    const [assignment] = await db
      .select({ userId: users.id, roleId: roles.id })
      .from(users)
      .innerJoin(roles, eq(roles.key, requestedRole))
      .where(and(eq(users.clerkUserId, clerkUserId), eq(roles.key, requestedRole)))
      .limit(1);

    if (!assignment) {
      throw new Error(
        "User or role not found. Sign in once to create the app user, then seed roles and retry.",
      );
    }

    await db
      .insert(userRoles)
      .values(assignment)
      .onConflictDoNothing({ target: [userRoles.userId, userRoles.roleId] });

    console.log(`Granted ${requestedRole} to Clerk user ${clerkUserId}.`);
  } finally {
    await pool.end();
  }
}

void main();
