# Notification worker capacity, local measurement (2026-10-23)

Measured evidence for [#936](https://github.com/energee/mgr-zero/issues/936). The 2026-10-23 run covers the order-email worker, chat delivery and the chat scan. A 2026-10-26 follow-up below checks the fixed production Slack client. Both runs were local only. They do not observe hosted scheduler cadence, hosted function deadlines or real provider latency.

**Local measurements suggest headroom for a one-brewery pilot; agreed targets remain open.** Email tops out at 10 messages per configured 5-minute cron run (120 an hour), whatever the provider latency. Chat delivery measured 40–55 messages per minute to one conversation and 111–583 per minute across ten. A scan took about 8 ms per brewery. The unbounded Slack call found in the original run was fixed by [PR #1249](https://github.com/energee/mgr-zero/pull/1249); see the follow-up for local timing evidence.

## Method

| Field | Value |
| --- | --- |
| Source | `a7e6f3008f9f33bf0998349285f5bf5366aa0ab8` (`origin/main`), latest migration `20261023210000` |
| Database | Isolated Supabase test stack `mgr_test_936` on ports 5447x, Postgres 17.11, reset from migrations |
| Machine | Apple M4, 32 GB, macOS 27.0.1, Node 24.19.0, Bun 1.3.10; loopback network |
| Harness | Vitest files kept outside the repository; they call the real worker functions |
| Providers | No Slack or email request left the machine (details below) |

How each queue was filled and each provider was replaced:

- **Email.** `confirm_order` on wholesale orders filled `private.order_email_deliveries`. `runOrderEmailBatch` ran unchanged. A fake `fetch` answered only `https://api.resend.com/` after a set latency; Supabase calls went to the local stack.
- **Chat delivery.** `submit_order` fanned out deliveries to linked sales users' DMs. `runChatDeliveryBatch` got a fake `ChatProviderTransport` that waits a set latency. Pacing was the real `lib/chat/pacing.ts`.
- **Chat scan.** `runChatScan` ran over N breweries. Each had an active installation, one linked user and 20 submitted orders. A thin wrapper timed each `scan_chat_notification_occurrences` call.
- **Slack client.** The real `slackAdapter()` posted to a fake Slack API on `127.0.0.1` through `SLACK_API_URL`.

Latency means the fake provider's delay per call: 0, 100, 300 or 500 ms, or uniform 100–500 ms. A "cycle" is the gap between the starts of consecutive sends; it includes pacing and database work. Workers were called back to back, with a 1 s pause when nothing was leasable. That shows capacity, not a schedule.

## Email worker

Each call leases at most 10 rows for 10 minutes (`lease_order_emails`). It then sends them one at a time. `hosted-jobs.yml` calls it every 5 minutes, and curl gives up after 240 s.

| Provider latency | N | Calls | Time per call (p50 / p95) | Send cycle (p50 / p95) | Sends per minute while running |
| --- | ---: | ---: | --- | --- | ---: |
| 0 ms | 50 | 5 | 44 / 51 ms | 4 / 7 ms | 13,761 |
| 100 ms | 50 | 5 | 1.10 / 1.11 s | 110 / 119 ms | 545 |
| 300 ms | 50 | 5 | 3.11 / 3.12 s | 311 / 315 ms | 193 |
| 500 ms | 50 | 5 | 5.10 / 5.11 s | 510 / 515 ms | 118 |
| 100–500 ms | 50 | 5 | 3.31 / 3.73 s | 315 / 482 ms | 182 |
| 100–500 ms burst | 100 | 10 | 2.77 / 3.61 s | 279 / 484 ms | 206 |

Failure cases, 10 rows each:

| Case | Result |
| --- | --- |
| Every send hangs until the transport's 15 s timeout | One call took 150.3 s; all 10 rows were kept for retry |
| Every other send gets HTTP 429 | 5 accepted, 5 kept for retry, each due again in 300 s |
| A worker leases rows, then dies | The next call leased nothing. 600 s of lease remained. After expiry the rows were sent once, with `attempt_count` 2 and the same `order-confirmation/<id>` idempotency key |

Where email stops fitting:

- **Schedule, not speed, sets the ceiling.** One call finishes its 10 sends in about 5 s even at 500 ms per send. The ceiling stays at 10 per 5 minutes: 2 a minute, 120 an hour.
- **A burst waits for cron runs.** A burst of B messages needs ⌈B/10⌉ runs. At the nominal cadence, 100 confirmations take 50 minutes to drain. GitHub may delay or skip runs, which adds to that.
- **Lease and curl cap hold.** The 15 s transport timeout bounds a call at about 150 s. That is under the 240 s curl cap and the 600 s lease. The cap would be exceeded only if each send cycle passed 24 s.
- **A failure costs one or two cron runs.** A throttled send waits 5 minutes, one run. A dead worker's rows wait out the 10-minute lease, two runs.
- **Function deadline: not checked.** No route sets `maxDuration`, so the hosted limit is the Vercel project default.

## Chat delivery

Each batch leases up to 50 rows (the RPC caps it at 100) for 60 s. It sends one at a time and stops once less than 5 s of lease is left (#1186). Pacing keeps sends to one conversation at least 1 s apart, measured from when the previous call returned. So one conversation's cycle is about 1 s plus the provider latency.

**One conversation**, 100 rows to a single DM, limit 50:

| Latency | Sent per full batch | Row cycle (p50 / p95) | Batches | Duplicates | Messages per minute |
| --- | --- | --- | ---: | ---: | ---: |
| 100 ms | 50 of 50 in 54.2–55.5 s (rerun ×3) | 1.10 / 1.11 s | 2 | 0 | 55 |
| 300 ms | 43 of 50, 7 stopped | 1.30 / 1.30 s | 4 | 0 | 46 |
| 500 ms | 37–38 of 50, 12–13 stopped | 1.50 / 1.50 s | 4 | 0 | 40 |

**Spread**, 100 rows over 10 DMs:

| Latency | Limit | Batch time | Row cycle (p50 / p95) | Duplicates | Messages per minute |
| --- | ---: | --- | --- | ---: | ---: |
| 0 ms | 50 | 4.2–6.0 s | 22 / 803 ms | 0 | 583 |
| 100 ms | 50 | 9.4–10.5 s | 136 / 830 ms | 0 | 302 |
| 300 ms | 50 | 16.7–18.3 s | 337 / 350 ms | 0 | 171 |
| 500 ms | 50 | 26.7–27.2 s | 537 / 544 ms | 0 | 111 |
| 100–500 ms | 50 | 14.7–17.5 s | 319 / 525 ms | 0 | 186 |
| 500 ms | 100 | 53.3 s for 100 | 535 / 540 ms | 0 | 113 |

A row costs about 20–40 ms of database work beyond the provider call: context, two action intents and the outcome write. The p95 of 800 ms at low latency is pacing: a DM's turn came back within its 1 s.

Other chat cases:

| Case | Result |
| --- | --- |
| Two workers at once, 100 rows over 10 DMs, 300 ms | 50 rows each, 17.3 s, 0 duplicates (`skip locked`) |
| Every 5th send rate limited, `Retry-After` 1 s | 50 of 50 delivered in 3 batches, 0 duplicates |
| Before #1249: a send still in flight when its lease lapses, second worker at 61 s | Worker A sent 5 and stopped 14. Worker B re-leased 15 and sent them. **1 duplicate post** with the simulated slow transport; this is not a measurement of the fixed Slack client |

Where chat delivery stops fitting its lease:

- **One conversation:** about 55 s ÷ (1 s + latency) rows per batch. The default 50 fits only up to about 100 ms latency. Above that, the tail is stopped and re-leased by the next batch, without a duplicate. Throughput is bounded by pacing at 60 ÷ (1 + latency) a minute.
- **Many conversations:** about 55 s ÷ (latency + 40 ms) rows per batch. The cap of 100 fits up to about 0.5 s latency. 50 fits up to about 1 s.
- **A single slow send:** a send longer than the 5 s margin can be posted twice if another worker runs. The shared production Slack client now has a 3 s HTTP timeout and no retries or in-call 429 waits (#1249). The original simulated slow transport did not enforce those bounds.
- **No schedule yet:** `hosted-jobs.yml` calls only email and retention, so the chat workers have no cadence to measure. Scheduling belongs to #311.

The first single-conversation run at 100 ms had one batch stall for 243 s. It sent 41 and stopped 9, with no duplicate. Three instrumented reruns did not repeat it: 1,206 RPCs, p50 8 ms, p95 22 ms, max 1.26 s. The stall overlapped a local Postgres checkpoint. Its cause is unknown, so its row is excluded from the table above.

## Production Slack client timing (#1247)

### Historical result: 2026-10-23, before #1249

At the original source revision above, `configuredSlackAdapter()` passed no `webClientOptions`. The `@slack/web-api` 7.19.0 defaults applied: no HTTP timeout, up to 10 retries over about 30 minutes, and in-call sleeps on 429. One `chat.postMessage` against the fake Slack API:

| Fake Slack behaviour | Result |
| --- | --- |
| 429 with `Retry-After: 2`, three times, then ok | Resolved after 15.6 s and 4 requests; no rate-limit error reached the worker |
| HTTP 500 three times, then ok | Resolved after 11.2 s and 4 requests |
| No response | Still pending after 70 s |

All three exceeded the 5 s margin that `LEASE_SAFETY_MS` assumes. The worker's own `ratelimited` and `Retry-After` handling did not run for a real Slack 429. [#1247](https://github.com/energee/mgr-zero/issues/1247) was fixed by [PR #1249](https://github.com/energee/mgr-zero/pull/1249), merged on 2026-10-23. These historical timings do not describe the current shared Slack client.

### Fixed-client follow-up: 2026-10-26

Source: `97e4951e43cf880bc82a04bb22f33323b9fc7cf5`. The shared adapter in `lib/chat/slack-adapter.ts` sets `timeout: 3_000`, `retryConfig: { retries: 0 }` and `rejectRateLimitedCalls: true`. The OAuth exchange uses a separate adapter without a delivery lease; its defaults are unchanged.

Ran the existing `tests/chat-slack-client.test.ts` against its real HTTP server on an ephemeral `127.0.0.1` port. The test uses the production adapter and a fake Slack endpoint selected through `SLACK_API_URL`. The worker test replaces its database RPCs with recorded responses. No database was contacted or reset, and no request went to a real provider.

| Case | Vitest test duration | Verified result |
| --- | ---: | --- |
| First request returns 429, `Retry-After: 2`; a second request would succeed | 213 ms | Rejected after one request, in under 1 s; classified `ratelimited`, retry after 2,000 ms |
| Server accepts the request but never responds | 3,009 ms | Rejected after one request, in under 4 s; classified retryable `network` |
| Delivery worker sends through the production client and receives 429 | 15 ms | One request, zero sent, one retried; `retry_chat_delivery` scheduled exactly 2 s later; no completion write |

Durations are whole-test elapsed times reported by Vitest, not isolated HTTP latency samples or percentiles. The three tests passed (exit 0; Vitest 5.0.5). This is a focused lease-budget check, not a repeat of the burst/drain measurements or a measured throughput speedup.

The hung call returned inside the 5 s margin. Adding the worker's up-to-1 s pacing wait to the observed test duration gives about 4.01 s. This supports the configured local budget, but does not guarantee completion before lease expiry under event-loop stalls, slow database calls or a shorter hosted function deadline. A provider can also accept a post before the client times out; an ambiguous outcome is not proof of exactly-once delivery.

#### Repeat locally without a database

From a disposable issue worktree with dependencies installed, create a temporary config beside `package.json`. It selects only this database-free test and resolves the same aliases as the main Vitest config. The main config classifies this file in the database project, so its normal invocation also requires that project's schema guard.

```sh
(
  set -eu
  config=$(mktemp "$PWD/.worker-capacity-XXXXXX.mts")
  trap 'rm -f "$config"' EXIT
  cat > "$config" <<'EOF'
import { defineConfig } from "vitest/config";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
export default defineConfig({
  resolve: { alias: {
    "@": import.meta.dirname,
    "server-only": require.resolve("next/dist/compiled/server-only/empty.js"),
  } },
  test: { include: ["tests/chat-slack-client.test.ts"], testTimeout: 20_000, fileParallelism: false },
});
EOF
  NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:1 \
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=local-unused \
    bunx vitest run --config "$config" --reporter=verbose
)
```

The two public environment values satisfy import-time validation only. They are not credentials and the tests do not use that URL. The first follow-up attempt omitted them and stopped before running tests with `Missing required environment variable: NEXT_PUBLIC_SUPABASE_URL`; the corrected command passed. The temporary config was removed after the run.

## Chat scan

| Breweries | Scan time | Per brewery (p50 / p95 / max) |
| ---: | ---: | --- |
| 1 | 12–17 ms | 9–14 ms |
| 5 | 42–44 ms | 8 / 9 / 9 ms |
| 10 | 82 ms | 8 / 9 / 9 ms |
| 25 | 196 ms | 7–8 / 9 / 10 ms |
| 50 | 383–386 ms | 7–8 / 8 / 18 ms |

One brewery's scan by open submitted orders: 0 → 5 ms, 20 → 8 ms, 100 → 9 ms, 500 → 16 ms (p50 of 5 runs each).

The scan grows linearly, about 8 ms per brewery on loopback. Breweries are scanned one after another, so hosted time adds one network round trip per brewery. That round trip was not measured. Even at 100 ms per brewery, 50 breweries take 5 s. The scan does not limit a pilot. Only submitted-order candidates were seeded; picks, deliveries and fermentation readings were not.

## Not covered

- Hosted scheduler cadence and delay, hosted function deadlines, and Supabase round trips from Vercel.
- Real Resend or Slack latency and throttling.
- Agreed burst size, arrival rate and acceptable delay. Those belong to the owner; the numbers above let them be checked once agreed.
- A database failure while recording an outcome. Existing tests cover it (`tests/order-email-job.test.ts`, #462).

## Parked measurement: resumption criteria

The [2026-10-26 owner review](https://github.com/energee/mgr-zero/issues/936#issuecomment-6405906115) keeps #936 parked. The local fixed-client check above completes the remaining local request from that review. It does not close the issue or authorize hosted changes.

- **Owner:** agree burst size, sustained arrival rate and acceptable delivery delay separately for email and chat. The local capacity numbers are inputs to that decision, not agreed targets.
- **Hosted operator, with approval:** record queue depth, oldest pending-job age, actual invocation start times and function deadlines. Distinguish the configured email cron from observed execution. Chat has no hosted cadence until #311 schedules it.
- **Provider access, with approval:** measure real Resend and Slack latency and throttling. The fake endpoint results are not provider observations.
- **Resume code work only on evidence:** an email backlog older than one cron interval, or scheduled chat runs accumulating stopped tails. Keep existing lease/retry mechanisms; do not add concurrency or change schedules speculatively.
