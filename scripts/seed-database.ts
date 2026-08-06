import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { roles } from "../lib/db/schema";

const connectionString = (process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL)?.replace(
  "sslmode=require",
  "sslmode=verify-full",
);

if (!connectionString) {
  throw new Error("DATABASE_URL_UNPOOLED or DATABASE_URL is required.");
}

async function main() {
  const pool = new Pool({ connectionString, max: 1 });
  const db = drizzle(pool);

  try {
    await db
      .insert(roles)
      .values([
        { key: "user", description: "Standard contest participant" },
        { key: "admin", description: "Contest operations administrator" },
        { key: "super_admin", description: "Platform administrator" },
      ])
      .onConflictDoNothing({ target: roles.key });
    console.log("Database roles seeded.");
  } finally {
    await pool.end();
  }
}

void main();
