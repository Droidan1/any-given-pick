import "server-only";

import { createHash } from "node:crypto";
import { desc, eq, isNull, sql } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { operationalAlerts } from "@/lib/db/schema";
import { sendSystemEmail } from "@/lib/email/system-email";

const NOTIFICATION_COOLDOWN_MS = 30 * 60 * 1_000;

export type OperationalAlertSummary = {
  fingerprint: string;
  kind: string;
  severity: "warning" | "error";
  message: string;
  occurrenceCount: number;
  lastSeenAt: string;
  lastNotifiedAt: string | null;
};

function alertFingerprint(kind: string, identity: string): string {
  return createHash("sha256").update(`${kind}:${identity}`).digest("hex");
}

function safeMessage(value: string): string {
  return value.replace(/\s+/g, " ").trim().slice(0, 500) || "Operational issue detected.";
}

async function sendAlertEmail(input: {
  fingerprint: string;
  kind: string;
  severity: "warning" | "error";
  message: string;
  context: Record<string, unknown>;
  now: Date;
}) {
  return sendSystemEmail({
    subject: `[Any Given Pick] ${input.severity === "error" ? "Error" : "Warning"}: ${input.kind}`,
    text: [
      input.message,
      "",
      `Severity: ${input.severity}`,
      `Kind: ${input.kind}`,
      `Detected: ${input.now.toISOString()}`,
      `Fingerprint: ${input.fingerprint}`,
      `Context: ${JSON.stringify(input.context)}`,
      "",
      "Review the Admin settings operations panel and Vercel runtime logs.",
    ].join("\n"),
    idempotencyKey: `operational-${input.fingerprint}-${Math.floor(input.now.getTime() / NOTIFICATION_COOLDOWN_MS)}`,
  });
}

export async function reportOperationalIssue(input: {
  kind: string;
  identity: string;
  severity: "warning" | "error";
  message: string;
  context?: Record<string, unknown>;
  now?: Date;
}): Promise<void> {
  const now = input.now ?? new Date();
  const fingerprint = alertFingerprint(input.kind, input.identity);
  const message = safeMessage(input.message);
  const context = input.context ?? {};
  const logPayload = {
    level: input.severity,
    event: "operational_alert",
    kind: input.kind,
    fingerprint,
    message,
    context,
  };
  console.error(JSON.stringify(logPayload));

  try {
    const db = getDb();
    const [existing] = await db
      .select({ lastNotifiedAt: operationalAlerts.lastNotifiedAt })
      .from(operationalAlerts)
      .where(eq(operationalAlerts.fingerprint, fingerprint))
      .limit(1);
    const shouldNotify = !existing?.lastNotifiedAt
      || now.getTime() - existing.lastNotifiedAt.getTime() >= NOTIFICATION_COOLDOWN_MS;

    await db
      .insert(operationalAlerts)
      .values({
        fingerprint,
        kind: input.kind,
        severity: input.severity,
        message,
        context,
        firstSeenAt: now,
        lastSeenAt: now,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: operationalAlerts.fingerprint,
        set: {
          severity: input.severity,
          message,
          context,
          occurrenceCount: sql`${operationalAlerts.occurrenceCount} + 1`,
          lastSeenAt: now,
          resolvedAt: null,
          updatedAt: now,
        },
      });

    if (!shouldNotify) return;
    const delivery = await sendAlertEmail({
      fingerprint,
      kind: input.kind,
      severity: input.severity,
      message,
      context,
      now,
    });
    if (delivery.sent) {
      await db
        .update(operationalAlerts)
        .set({ lastNotifiedAt: now, updatedAt: now })
        .where(eq(operationalAlerts.fingerprint, fingerprint));
    }
  } catch (monitoringError) {
    console.error(JSON.stringify({
      level: "error",
      event: "operational_alert_persistence_failed",
      kind: input.kind,
      error: monitoringError instanceof Error ? monitoringError.message : "Unknown monitoring error",
    }));
    await sendAlertEmail({
      fingerprint,
      kind: input.kind,
      severity: input.severity,
      message,
      context,
      now,
    });
  }
}

export async function resolveOperationalIssue(kind: string, identity: string): Promise<void> {
  const now = new Date();
  try {
    await getDb()
      .update(operationalAlerts)
      .set({ resolvedAt: now, updatedAt: now })
      .where(eq(operationalAlerts.fingerprint, alertFingerprint(kind, identity)));
  } catch (error) {
    console.error(JSON.stringify({
      level: "warning",
      event: "operational_alert_resolution_failed",
      kind,
      error: error instanceof Error ? error.message : "Unknown monitoring error",
    }));
  }
}

export async function listActiveOperationalAlerts(limit = 5): Promise<OperationalAlertSummary[]> {
  const rows = await getDb()
    .select()
    .from(operationalAlerts)
    .where(isNull(operationalAlerts.resolvedAt))
    .orderBy(desc(operationalAlerts.lastSeenAt))
    .limit(limit);
  return rows.map((row) => ({
    fingerprint: row.fingerprint,
    kind: row.kind,
    severity: row.severity as "warning" | "error",
    message: row.message,
    occurrenceCount: row.occurrenceCount,
    lastSeenAt: row.lastSeenAt.toISOString(),
    lastNotifiedAt: row.lastNotifiedAt?.toISOString() ?? null,
  }));
}
