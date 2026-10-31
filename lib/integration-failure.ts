/** Provider diagnostics never include messages, bodies, URLs, or credentials. */
export function integrationFailureCause(error: unknown, stage: string) {
  const cause = error && typeof error === "object" ? error as { name?: unknown; status?: unknown; statusCode?: unknown } : null;
  const status = cause?.status ?? cause?.statusCode;
  return {
    name: typeof cause?.name === "string" ? cause.name : typeof error,
    status: typeof status === "number" && Number.isInteger(status) ? status : null,
    stage,
  };
}
