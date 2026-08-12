import "server-only";

import { timingSafeEqual } from "node:crypto";

export type CronAuthorization = "authorized" | "unconfigured" | "unauthorized";

export function authorizeCronRequest(request: Request): CronAuthorization {
  const expected = process.env.CRON_SECRET;
  if (!expected) return "unconfigured";

  const authorization = request.headers.get("authorization") ?? "";
  const received = authorization.startsWith("Bearer ")
    ? authorization.slice("Bearer ".length)
    : "";
  const receivedBuffer = Buffer.from(received);
  const expectedBuffer = Buffer.from(expected);
  return receivedBuffer.length === expectedBuffer.length
    && timingSafeEqual(receivedBuffer, expectedBuffer)
    ? "authorized"
    : "unauthorized";
}
