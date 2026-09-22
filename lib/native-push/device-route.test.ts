import { beforeEach, describe, expect, it, vi } from "vitest";
import { PgDialect } from "drizzle-orm/pg-core";
import type { SQL } from "drizzle-orm";
const mock = vi.hoisted(() => ({ auth: vi.fn(), user: vi.fn(), rate: vi.fn(), db: vi.fn() }));
vi.mock("@clerk/nextjs/server", () => ({ auth: mock.auth }));
vi.mock("@/lib/auth/app-user", () => ({ requireAppUser: mock.user }));
vi.mock("@/lib/db", () => ({ getDb: mock.db }));
vi.mock("@/lib/security/rate-limit", () => ({ consumeRateLimit: mock.rate }));
vi.mock("@/lib/native-push/apns", () => ({ nativePushEnabled: () => true, apnsConfigured: () => true }));
import { GET, PUT, DELETE } from "@/app/api/mobile/v1/notifications/device/route";
import { defaultNativePushPreferences } from "./policy";

const installationId = "2d1972af-b99e-4f8c-b6c3-5340a02c641f";
const userId = "3d1972af-b99e-4f8c-b6c3-5340a02c641f";
let conditions: SQL[];
let inserted: unknown;
const input = { installationId, deviceToken: "a".repeat(64), environment: "sandbox", preferences: defaultNativePushPreferences };
function request(method: string, body?: unknown) {
  return new Request(`https://anygivenpick.app/api/mobile/v1/notifications/device?installationId=${installationId}&environment=sandbox`, {
    method, ...(body === undefined ? {} : { body: JSON.stringify(body), headers: { "Content-Type": "application/json" } }),
  });
}
beforeEach(() => {
  vi.clearAllMocks(); conditions = []; inserted = undefined;
  mock.auth.mockResolvedValue({ userId: "clerk-user", sessionId: "session-1" });
  mock.user.mockResolvedValue({ id: userId, accountState: "active" });
  mock.rate.mockResolvedValue({ allowed: true });
  const chain = {
    from: () => chain,
    where: (condition: SQL) => { conditions.push(condition); return chain; },
    limit: async () => [], for: async () => [],
    values: async (value: unknown) => { inserted = value; },
  };
  const db = { select: () => chain, delete: () => chain, insert: () => chain, execute: vi.fn(), transaction: async (fn: (tx: unknown) => unknown) => fn(db) };
  mock.db.mockReturnValue(db);
});

describe("native device API authorization", () => {
  it("requires a signed-in Clerk session before reading or writing", async () => {
    mock.auth.mockResolvedValue({ userId: null, sessionId: null });
    for (const [method, handler] of [["GET", GET], ["PUT", PUT], ["DELETE", DELETE]] as const) {
      expect((await handler(request(method, method === "GET" ? undefined : input))).status).toBe(401);
    }
    expect(mock.db).not.toHaveBeenCalled();
  });
  it("never trusts a client-supplied owner", async () => {
    expect((await PUT(request("PUT", { ...input, userId: "other-user" }))).status).toBe(400);
    expect(inserted).toBeUndefined();
  });
  it("binds registration to the authenticated account and session", async () => {
    expect((await PUT(request("PUT", input))).status).toBe(200);
    expect(inserted).toMatchObject({ userId, clerkSessionId: "session-1", installationId });
  });
  it("scopes reads and deletes to this user's installation", async () => {
    const dialect = new PgDialect();
    const response = await GET(request("GET"));
    expect(response.headers.get("cache-control")).toContain("no-store");
    await DELETE(request("DELETE", { installationId }));
    expect(conditions).toHaveLength(2);
    for (const condition of conditions) {
      const query = dialect.sqlToQuery(condition);
      expect(query.params).toContain(userId);
      expect(query.params).toContain(installationId);
    }
  });
  it("blocks registration for removed/read-only players but allows deregistration", async () => {
    mock.user.mockResolvedValue({ id: userId, accountState: "read_only" });
    expect((await PUT(request("PUT", input))).status).toBe(403);
    expect((await DELETE(request("DELETE", { installationId }))).status).toBe(200);
  });
  it("rate limits notification changes", async () => {
    mock.rate.mockResolvedValue({ allowed: false });
    expect((await PUT(request("PUT", input))).status).toBe(429);
    expect(mock.db).not.toHaveBeenCalled();
  });
  it("rejects malformed and oversized payloads", async () => {
    expect((await PUT(new Request("https://anygivenpick.app/api/mobile/v1/notifications/device", { method: "PUT", body: "{" }))).status).toBe(400);
    expect((await PUT(request("PUT", { extra: "x".repeat(4097) }))).status).toBe(413);
  });
});
