import "server-only";

import { attachDatabasePool } from "@vercel/functions";
import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema";

type Database = NodePgDatabase<typeof schema>;

const databaseGlobal = globalThis as typeof globalThis & {
  anyGivenPickPool?: Pool;
  anyGivenPickDb?: Database;
};

export function getDb(): Database {
  if (databaseGlobal.anyGivenPickDb) return databaseGlobal.anyGivenPickDb;

  const connectionString = process.env.DATABASE_URL?.replace(
    "sslmode=require",
    "sslmode=verify-full",
  );
  if (!connectionString) {
    throw new Error("DATABASE_URL is not configured.");
  }

  const pool =
    databaseGlobal.anyGivenPickPool ??
    new Pool({
      connectionString,
      max: 5,
      idleTimeoutMillis: 5_000,
      connectionTimeoutMillis: 10_000,
    });

  attachDatabasePool(pool);
  const database = drizzle(pool, { schema });

  databaseGlobal.anyGivenPickPool = pool;
  databaseGlobal.anyGivenPickDb = database;

  return database;
}
