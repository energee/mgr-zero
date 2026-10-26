// instrumentation.ts — logs every server error Next.js captures as one
// structured line keyed by its digest, the reference the error card shows
// (#1299). The message is left out: it may carry database text. Client render
// and chunk-load failures never reach here; they have no digest.
import type { Instrumentation } from "next";

export const onRequestError: Instrumentation.onRequestError = (error, request, context) => {
  const digest = error instanceof Error && "digest" in error ? String(error.digest) : undefined;
  console.error(JSON.stringify({ event: "request_error", digest, path: request.path, routePath: context.routePath, routeType: context.routeType }));
};
