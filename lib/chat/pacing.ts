// lib/chat/pacing.ts — per-conversation send pacing for chat delivery.
// Split out of lib/chat/jobs.ts so it can be exercised without dragging in the
// service-role client: a rate limiter has no business behind that import.
//
// ponytail: in-process (one send/second per conversation); a shared limiter is
// needed only if the worker ever runs on more than one instance.

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const lastSend = new Map<string, number>();

/**
 * Runs `call` no sooner than a second after the previous call for `key`.
 *
 * The stamp is taken when the call *returns*, not before it is issued. Pacing
 * from a pre-send stamp measures the wait rather than the sends, so any work
 * between the two lands inside the second and consecutive sends can be under a
 * second apart — which is the gap a provider rate limit actually counts.
 * Stamping in `finally` also charges a failed attempt, which the provider
 * counted too.
 */
export async function paced<T>(key: string, call: () => Promise<T>): Promise<T> {
  const until = (lastSend.get(key) ?? 0) + 1000;
  // Re-check rather than trusting one sleep: setTimeout wakes up to a
  // millisecond before its nominal deadline as Date.now() measures it (~1% of
  // sleeps here), which would release the next send at until - 1.
  for (let wait = until - Date.now(); wait > 0; wait = until - Date.now()) await sleep(wait);
  try {
    return await call();
  } finally {
    lastSend.set(key, Date.now());
  }
}
