import type { Instrumentation } from "next";

export function register() {}

function requestErrorIdentity(error: unknown): { digest: string | null; name: string } {
  if (!error || typeof error !== "object") return { digest: null, name: "UnknownError" };
  const candidate = error as { digest?: unknown; name?: unknown };
  return {
    digest: typeof candidate.digest === "string" ? candidate.digest : null,
    name: typeof candidate.name === "string" ? candidate.name : "UnknownError",
  };
}

export const onRequestError: Instrumentation.onRequestError = async (
  error,
  request,
  context,
) => {
  const route = context.routePath || request.path.split("?")[0] || "unknown";
  const errorIdentity = requestErrorIdentity(error);
  if (process.env.NEXT_RUNTIME !== "nodejs") {
    console.error(JSON.stringify({
      level: "error",
      event: "edge_request_error",
      route,
      digest: errorIdentity.digest,
    }));
    return;
  }
  const { reportOperationalIssue } = await import("./lib/monitoring/operational-alerts");
  await reportOperationalIssue({
    kind: "application_error",
    identity: `${route}:${errorIdentity.digest || errorIdentity.name}`,
    severity: "error",
    message: `Unhandled ${context.routeType} error on ${route}.`,
    context: {
      route,
      method: request.method,
      routeType: context.routeType,
      digest: errorIdentity.digest,
      errorName: errorIdentity.name,
    },
  });
};
