/** Provider diagnostics never include messages, bodies, URLs, or credentials. */
export function integrationFailureCause(error: unknown, stage: string) {
  const cause = error && typeof error === "object" ? error as { name?: unknown; status?: unknown } : null;
  return {
    name: typeof cause?.name === "string" ? cause.name : typeof error,
    status: typeof cause?.status === "number" && Number.isInteger(cause.status) ? cause.status : null,
    stage,
  };
}
