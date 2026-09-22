import "server-only";
import { createHash, createPrivateKey, sign } from "node:crypto";
import { connect } from "node:http2";
import { classifyAPNsFailure } from "./policy";

export type APNsEnvironment = "sandbox" | "production";
const credentials = new Map<string, { token: string; createdAt: number }>();

export function nativePushEnabled() { return process.env.APNS_ENABLED === "true"; }

function configuration(environment: APNsEnvironment) {
  const prefix = environment === "sandbox" ? "APNS_SANDBOX" : "APNS_PRODUCTION";
  const keyId = process.env[`${prefix}_KEY_ID`];
  const teamId = process.env.APNS_TEAM_ID;
  const privateKey = process.env[`${prefix}_PRIVATE_KEY`]?.replace(/\\n/g, "\n");
  return keyId && teamId && privateKey ? { keyId, teamId, privateKey } : null;
}

export function apnsConfigured(environment: APNsEnvironment) {
  return nativePushEnabled() && configuration(environment) !== null;
}

function providerToken(environment: APNsEnvironment) {
  const config = configuration(environment);
  if (!config) throw new Error("APNs is not configured.");
  const now = Math.floor(Date.now() / 1000);
  const cacheKey = createHash("sha256").update(JSON.stringify(config)).digest("hex");
  const cached = credentials.get(cacheKey);
  if (cached && now - cached.createdAt < 50 * 60) return cached.token;
  const header = Buffer.from(JSON.stringify({ alg: "ES256", kid: config.keyId })).toString("base64url");
  const claims = Buffer.from(JSON.stringify({ iss: config.teamId, iat: now })).toString("base64url");
  const content = `${header}.${claims}`;
  const signature = sign("sha256", Buffer.from(content), {
    key: createPrivateKey(config.privateKey), dsaEncoding: "ieee-p1363",
  }).toString("base64url");
  const token = `${content}.${signature}`;
  credentials.set(cacheKey, { token, createdAt: now });
  return token;
}

export class APNsDeliveryError extends Error {
  constructor(readonly status: number, readonly reason: string) {
    super("Apple could not accept this notification.");
  }
  get disposition() { return classifyAPNsFailure(this.status, this.reason); }
}

export async function sendNativePush(input: {
  environment: APNsEnvironment; deviceToken: string; payload: object;
  collapseKey: string; expiresAt: Date;
}): Promise<void> {
  if (!apnsConfigured(input.environment)) throw new Error("APNs is not configured.");
  const body = JSON.stringify(input.payload);
  if (Buffer.byteLength(body) > 4096) throw new APNsDeliveryError(413, "PayloadTooLarge");
  const token = providerToken(input.environment);
  const host = input.environment === "sandbox" ? "https://api.sandbox.push.apple.com" : "https://api.push.apple.com";
  // A bounded connection per message avoids keeping sockets alive in serverless functions.
  await new Promise<void>((resolve, reject) => {
    const client = connect(host);
    let settled = false;
    const finish = (error?: Error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      client.destroy();
      if (error) reject(error); else resolve();
    };
    const timeout = setTimeout(() => finish(new Error("Apple push request timed out.")), 8_000);
    client.on("error", () => finish(new Error("Apple push connection failed.")));
    client.on("connect", () => {
      const request = client.request({
        ":method": "POST", ":path": `/3/device/${input.deviceToken}`,
        authorization: `bearer ${token}`,
        "apns-topic": "app.anygivenpick.ios", "apns-push-type": "alert", "apns-priority": "10",
        "apns-expiration": String(Math.floor(input.expiresAt.getTime() / 1000)),
        "apns-collapse-id": createHash("sha256").update(input.collapseKey).digest("hex"),
        "content-type": "application/json",
      });
      let status = 0;
      let response = "";
      request.on("response", (headers) => { status = Number(headers[":status"]); });
      request.setEncoding("utf8");
      request.on("data", (chunk: string) => { if (response.length < 4096) response += chunk; });
      request.on("error", () => finish(new Error("Apple push request failed.")));
      request.on("end", () => {
        if (status === 200) return finish();
        let reason = "Unknown";
        try { reason = JSON.parse(response).reason ?? reason; } catch { /* No token or provider body is logged. */ }
        finish(new APNsDeliveryError(status, reason));
      });
      request.end(body);
    });
  });
}
