// lib/server-timing.ts — request stage timings in the Server-Timing format
// (`name;dur=ms`), so hosted page and save latency can be split by stage
// (#1490, #1491). Only fixed stage names, command names and durations are
// written: never ids, secrets or query text. How to read them:
// docs/operations/pilot-latency-protocol.md, "Stage timings".

/** Stage name → milliseconds. */
export type Stages = Record<string, number>;

/** Awaits `work` and stores its wall time, in ms to one decimal, as
 *  `stages[name]`. A failed stage is timed too; its error still reaches the caller. */
export async function timeStage<T>(stages: Stages, name: string, work: () => Promise<T>): Promise<T> {
  const start = performance.now();
  try {
    return await work();
  } finally {
    stages[name] = Math.round((performance.now() - start) * 10) / 10;
  }
}

/** `{ auth: 12.3, command: 40 }` → `auth;dur=12.3, command;dur=40`, a Server-Timing header value. */
export function serverTiming(stages: Stages): string {
  return Object.entries(stages).map(([name, dur]) => `${name};dur=${dur}`).join(", ");
}

/** Writes render stages to the function log as one JSON line. Server
 *  components cannot set response headers, so the staff shell's reads and
 *  each page read are logged instead of sent in the header. */
export function logServerTiming(stages: Stages) {
  console.info(JSON.stringify({ event: "server_timing", timing: serverTiming(stages) }));
}
