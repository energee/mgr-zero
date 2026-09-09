// A later refusal cannot establish whether an earlier uncertain send committed.
// Only a definitive first client refusal can retire an idempotent write attempt.
export function canRetireCommandFailure(status: number, retrying: boolean) {
  return !retrying && status >= 400 && status < 500 && ![401, 408, 429].includes(status);
}
