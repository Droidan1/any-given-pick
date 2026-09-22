import { EventEmitter } from "node:events";
import { generateKeyPairSync, verify } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const mock = vi.hoisted(() => ({ connect: vi.fn() }));
vi.mock("node:http2", () => ({ connect: mock.connect }));
import { APNsDeliveryError, sendNativePush } from "./apns";

const keys = generateKeyPairSync("ec", { namedCurve: "prime256v1" });
let headers: Record<string, string>;
let body: string;
let status = 200;
let reason = "";
let hang = false;
let client: EventEmitter & { destroy: ReturnType<typeof vi.fn> };

beforeEach(() => {
  vi.stubEnv("APNS_ENABLED", "true");
  vi.stubEnv("APNS_TEAM_ID", "TESTTEAM01");
  for (const env of ["SANDBOX", "PRODUCTION"]) {
    vi.stubEnv(`APNS_${env}_KEY_ID`, `TEST${env}`);
    vi.stubEnv(`APNS_${env}_PRIVATE_KEY`, keys.privateKey.export({ type: "pkcs8", format: "pem" }).toString());
  }
  status = 200; reason = ""; hang = false;
  mock.connect.mockImplementation(() => {
    client = Object.assign(new EventEmitter(), { destroy: vi.fn() });
    Object.assign(client, { request: (input: Record<string, string>) => {
      headers = input;
      const request = new EventEmitter();
      return Object.assign(request, { setEncoding: vi.fn(), end: (payload: string) => {
        body = payload;
        if (hang) return;
        request.emit("response", { ":status": status });
        request.emit("data", JSON.stringify({ reason }));
        request.emit("end");
      } });
    } });
    queueMicrotask(() => client.emit("connect"));
    return client;
  });
});
afterEach(() => { vi.unstubAllEnvs(); vi.useRealTimers(); vi.clearAllMocks(); });

const input = { environment: "sandbox" as const, deviceToken: "a".repeat(64), payload: { aps: { alert: "Test" } }, collapseKey: "event-id", expiresAt: new Date("2026-09-25T00:00:00Z") };
describe("APNs transport", () => {
  it("signs a valid ES256 JWT and sends the correct topic/environment/expiry", async () => {
    await sendNativePush(input);
    expect(mock.connect).toHaveBeenCalledWith("https://api.sandbox.push.apple.com");
    expect(headers["apns-topic"]).toBe("app.anygivenpick.ios");
    expect(headers["apns-push-type"]).toBe("alert");
    expect(headers["apns-expiration"]).toBe(String(input.expiresAt.getTime() / 1000));
    expect(headers["apns-collapse-id"]).toHaveLength(64);
    const [header, claims, signature] = headers.authorization.slice(7).split(".");
    expect(JSON.parse(Buffer.from(header, "base64url").toString()).alg).toBe("ES256");
    expect(JSON.parse(Buffer.from(claims, "base64url").toString()).iss).toBe("TESTTEAM01");
    expect(verify("sha256", Buffer.from(`${header}.${claims}`), { key: keys.publicKey, dsaEncoding: "ieee-p1363" }, Buffer.from(signature, "base64url"))).toBe(true);
    expect(JSON.parse(body)).toEqual(input.payload);
    expect(client.destroy).toHaveBeenCalledOnce();
  });
  it("uses the production host for distribution builds", async () => {
    await sendNativePush({ ...input, environment: "production" });
    expect(mock.connect).toHaveBeenCalledWith("https://api.push.apple.com");
  });
  it("returns a typed error for expired tokens", async () => {
    status = 410; reason = "Unregistered";
    await expect(sendNativePush(input)).rejects.toMatchObject({ status: 410, disposition: "invalid_device" });
    expect(client.destroy).toHaveBeenCalledOnce();
  });
  it("refuses to send without the rollout flag", async () => {
    vi.stubEnv("APNS_ENABLED", "false");
    await expect(sendNativePush(input)).rejects.toThrow("not configured");
    expect(mock.connect).not.toHaveBeenCalled();
  });
  it("rejects oversized APNs payloads before opening a connection", async () => {
    await expect(sendNativePush({ ...input, payload: { body: "x".repeat(4097) } })).rejects.toBeInstanceOf(APNsDeliveryError);
    expect(mock.connect).not.toHaveBeenCalled();
  });
  it("bounds a stalled connection and closes it", async () => {
    vi.useFakeTimers(); hang = true;
    const result = expect(sendNativePush(input)).rejects.toThrow("timed out");
    await vi.advanceTimersByTimeAsync(8000);
    await result;
    expect(client.destroy).toHaveBeenCalledOnce();
  });
});
