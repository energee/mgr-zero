// A later refusal cannot establish whether an earlier uncertain send committed.
// Admission refusals happen before command execution, unlike an arbitrary 5xx
// (including one with a JSON body) that may follow a database/provider commit.
export function canRetireCommandFailure(status: number, retrying: boolean, code?: string) {
  if (retrying || code === "context_changed") return false;
  if (status === 429) return code === "rate_limited" || code === "invite_rate_limited";
  if (status === 503) return code === "admission_unavailable";
  return status >= 400 && status < 500 && status !== 401 && status !== 408;
}
