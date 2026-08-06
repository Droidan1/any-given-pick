import { Pool } from "pg";

const expectedTables = [
  "audit_events",
  "auth_identities",
  "display_name_history",
  "eligibility_checks",
  "profiles",
  "roles",
  "user_roles",
  "users",
];

const connectionString = (process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL)?.replace(
  "sslmode=require",
  "sslmode=verify-full",
);

if (!connectionString) {
  throw new Error("DATABASE_URL_UNPOOLED or DATABASE_URL is required.");
}

function postgresErrorCode(error: unknown): string | null {
  return error && typeof error === "object" && "code" in error
    ? String((error as { code: unknown }).code)
    : null;
}

async function verifyDatabaseGuards(pool: Pool) {
  const client = await pool.connect();
  const suffix = Date.now().toString(36);

  try {
    await client.query("begin");
    const firstUser = await client.query<{ id: string }>(
      "insert into users (clerk_user_id) values ($1) returning id",
      [`db-verify-first-${suffix}`],
    );
    const secondUser = await client.query<{ id: string }>(
      "insert into users (clerk_user_id) values ($1) returning id",
      [`db-verify-second-${suffix}`],
    );
    const profileValues = [
      "Database Verify",
      `database-verify-${suffix}`,
      "1990-01-01",
      true,
      new Date(),
    ];

    await client.query(
      `insert into profiles
        (user_id, display_name, normalized_display_name, birth_date, age_eligible, age_checked_at, display_name_changed_at)
       values ($1, $2, $3, $4, $5, $6, $6)`,
      [firstUser.rows[0].id, ...profileValues],
    );
    await client.query("savepoint duplicate_display_name");

    let uniqueDisplayNameBlocked = false;
    try {
      await client.query(
        `insert into profiles
          (user_id, display_name, normalized_display_name, birth_date, age_eligible, age_checked_at, display_name_changed_at)
         values ($1, $2, $3, $4, $5, $6, $6)`,
        [secondUser.rows[0].id, ...profileValues],
      );
    } catch (error) {
      uniqueDisplayNameBlocked = postgresErrorCode(error) === "23505";
      if (!uniqueDisplayNameBlocked) throw error;
    }
    await client.query("rollback to savepoint duplicate_display_name");
    if (!uniqueDisplayNameBlocked) throw new Error("Unique display-name guard did not reject a duplicate.");
    await client.query("rollback");

    await client.query("begin");
    const auditRow = await client.query<{ id: string }>(
      `insert into audit_events (action, entity_type, metadata)
       values ('database.verify', 'verification', '{}') returning id`,
    );
    await client.query("savepoint mutate_audit_event");

    let auditMutationBlocked = false;
    try {
      await client.query("update audit_events set action = 'database.mutated' where id = $1", [
        auditRow.rows[0].id,
      ]);
    } catch (error) {
      auditMutationBlocked = postgresErrorCode(error) === "P0001";
      if (!auditMutationBlocked) throw error;
    }
    await client.query("rollback to savepoint mutate_audit_event");
    if (!auditMutationBlocked) throw new Error("Append-only audit guard allowed an update.");
    await client.query("rollback");
  } finally {
    await client.query("rollback").catch(() => undefined);
    client.release();
  }
}

async function main() {
  const pool = new Pool({ connectionString, max: 1 });

  try {
    const [tables, roleRows, triggerRows] = await Promise.all([
      pool.query<{ table_name: string }>(
        `select table_name
           from information_schema.tables
          where table_schema = 'public'
            and table_name = any($1::text[])
          order by table_name`,
        [expectedTables],
      ),
      pool.query<{ key: string }>("select key from roles order by key"),
      pool.query<{ trigger_name: string }>(
        `select distinct trigger_name
           from information_schema.triggers
          where event_object_schema = 'public'
            and event_object_table = 'audit_events'
            and trigger_name = 'audit_events_append_only'`,
      ),
    ]);

    const actualTables = tables.rows.map((row) => row.table_name);
    const missingTables = expectedTables.filter((table) => !actualTables.includes(table));
    if (missingTables.length) throw new Error(`Missing tables: ${missingTables.join(", ")}`);

    const actualRoles = roleRows.rows.map((row) => row.key);
    for (const role of ["admin", "super_admin", "user"]) {
      if (!actualRoles.includes(role)) throw new Error(`Missing role: ${role}`);
    }

    if (triggerRows.rowCount !== 1) throw new Error("Append-only audit trigger is missing.");

    await verifyDatabaseGuards(pool);

    console.log(
      "Database verified: 8 tables, 3 roles, unique display names, append-only audit events.",
    );
  } finally {
    await pool.end();
  }
}

void main();
