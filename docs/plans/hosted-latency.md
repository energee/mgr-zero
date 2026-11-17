<!-- Plan for making live (hosted) staff pages measurably faster. Written 2026-11-13 from the first signed-in hosted measurement. -->
# Hosted page latency

Status: approved by the owner on 2026-11-13, with decisions D1–D3 as recommended. Tasks 1, 3 and 4 ship with this plan; the rest follow the baseline in task 2.
Branch: `perf/hosted-latency` (worktree `.agents/worktrees/docs-hosted-latency-plan`), based on `main` @ 43181bf4d.

## Goal

Live staff pages feel slower than local ones.
This plan names the causes that were measured on live, and one fix per cause, each with a number to beat.

The limits are the owner's from 2026-10-28 (`docs/operations/work-and-more-latency-2026-10-28.md`):

| Measure | Limit |
| --- | --- |
| Page | Main content and primary action usable within 2 s |
| Save, warm | Result shown within 1 s |
| Save, cold | Result shown within 3 s |

This is also the hosted signed-in measurement that #1490's record left open, and it feeds #728.

## What was measured (2026-11-13)

The owner clicked through live staff pages after the dev data was copied to Production.
Two sources were read for that window.

| Source | How | What it shows |
| --- | --- | --- |
| Postgres | `pg_stat_statements`, reset before the click-through | Time spent inside the database |
| Vercel | `vercel logs --project mgr-zero --environment production --json` | Every server request, and the `server_timing` stage lines the app already writes |
| Supabase API | `curl` on one warm connection from a desk machine | The cost of one round trip that does almost no database work |

Production data at the time: 240 orders, 218 batches, 184 recipes, 448 SKUs, 25 vessels.

### Numbers

| Measure | Result |
| --- | --- |
| Statements Postgres ran | 484 |
| Total time inside Postgres | 1.25 s |
| Average per statement | 2.6 ms |
| Slowest statement | 80 ms average, 171 ms worst (a label-image call) |
| Server requests logged in 12 minutes | 379 rows, none served from cache |
| A page read as the app saw it | 30–270 ms |
| One trivial Supabase API call, warm connection | 57–119 ms, of which Supabase reports 7 ms behind its gateway |
| Home page shell, first load | 600 ms, seen once |

The Postgres window is shorter than the Vercel window.
The statement counters were reset partway through, so they cover only the last bursts.

## Findings

Each finding has its evidence and the file that causes it.

### F1. The database is not the slow part

Postgres averaged 2.6 ms per statement.
The same reads cost the app 30–270 ms each.
`get_atp` took 7–10 ms in Postgres and 243 ms in the app.
The difference is spent on the round trip through Supabase's API, not on the query.

### F2. Each round trip has a floor of roughly 40–100 ms

A Supabase API call that the database rejects at once took 57–119 ms on a warm connection.
Supabase's own header (`x-envoy-upstream-service-time`) put the work behind its gateway at 7 ms.
`list_vessels` is a single round trip and took a median of 48 ms on live (52 samples, 29–215 ms).
So a page pays this floor once for every round trip it makes in sequence.

The desk measurement includes the desk's own network distance (about 12 ms).
The floor from inside Vercel is not yet measured directly; task 1 measures it.

### F3. Opening a list sends one server request per row

A row that opens a record sheet links to the same page with `?<param>=<id>` added.
`SheetLink` (`components/mgr/order-sheet-link.tsx`) gives that link no prefetch rule, so Next requests it as soon as the row is in view.

| Page opened | Requests to the same page |
| --- | --- |
| `/orders` | 22 in each burst, 48 in all |
| `/` (Today) | 19 |
| `/customers` | 17 |
| `/catalog` | 13 |

#1606 turned prefetch off for record links through `rowLinkPrefetch` (`lib/mgr/row-link-prefetch.ts`).
`SheetLink` was not one of its callers.

### F4. Opening Cellar loads every vessel page

Each vessel tile links to `/cellar/vessels/<id>`.
The tile link in `E.tiles` (`components/mgr/e.tsx`) has no prefetch rule either.
Opening `/cellar` sent 29 vessel-page requests in about one second, and each ran `list_vessels` through the page's `generateMetadata`.
That is the same defect #1606 fixed for table rows, on a link that fix did not cover.

### F5. Every full page load requests every navigation page, twice

A full load of a staff page was followed by requests for about 30 navigation pages, in two rounds about 1.5 s apart (80 log rows in 5 s).
The navigation links are in `components/mgr/app-shell.tsx` (sidebar tabs, sidebar children and the phone tab bar).
This version's Next.js guide says a dynamic page is not prefetched unless it has a `loading.js`.
No staff route has one, by the owner's decision in #381.
So these requests reach the server and bring back nothing that makes the later click faster.

What each of these requests returns was not inspected.
Task 5 confirms it before anything is turned off.

### F6. Some first reads cost about 240 ms and the cause is not known

`get_atp` (243 and 244 ms) and `daily_pick_sheet` (244 and 272 ms) were far above the floor in F2.
Their database time was about 10 ms.
The stage timer wraps a whole read, so it cannot say whether the time went to a new connection, to waiting behind the request bursts in F3–F5, or to the API itself.
Task 1 splits it.

### F7. A few pages read in sequence

Most pages already read in parallel: 54 of the 90 staff pages use `Promise.all`.
Two do not:

- `app/(app)/taproom/page.tsx` reads locations, then a count snapshot, then print labels, one after another.
- `app/(app)/cellar/vessels/[id]/page.tsx` reads all vessels, then occupancies and the unit, then readings: three steps.

At the F2 floor, each extra step costs about 40–100 ms.

## Ruled out

| Suspect | Evidence | Outcome |
| --- | --- | --- |
| Slow queries or missing indexes | 2.6 ms average, 171 ms worst | No index work in this plan |
| Stale planner statistics after the copy | 18 of 42 tables had none; `ANALYZE` was run on 2026-11-13 | Done |
| Vercel and Supabase in different regions | Functions run in `iad1`; the database is in `us-east-1` | No change |
| Session check on every navigation | `proxy.ts` verifies the token locally with `getClaims` | No change |
| Database compute size | Supabase reports 7 ms behind its gateway | Not recommended; see decision D3 |
| Membership lookup per request | Two reads, already parallel and cached per request | No change |

## Not proposed

- **Route loading skeletons.** The owner rejected them in #381 and `tests/page-loading.test.ts` pins that.
- **Connecting to Postgres directly from Vercel.** Every read goes through the API so row-level security applies. Changing that is an architecture decision, not a latency fix.
- **Caching page data.** Nothing measured here needs it yet.

## Tasks

Each code task starts with its failing test, per the operating loop.
Link rendering is the exception: the rule is tested, and the rendered page is checked by counting requests.

### Phase A: measure per round trip (do first)

**1. Log round trips per request.**
- Files: `lib/supabase/server.ts`, `lib/server-timing.ts`.
- Change: the server client gets a `fetch` (`timedFetch`) that logs each round trip on its own line: `db` for a database read, `supabase` for any other call, and `<name>_upstream` for the time Supabase reports behind its gateway. No ids, paths or query text are logged, matching the existing rule in `lib/server-timing.ts`.
- Reuse: `timeStage`, `logServerTiming` and the `Stages` type. No new log format.
- Test first: `tests/server-timing.test.ts`, cases for a database trip with its upstream time, a non-database trip, and a failed trip.
- Accept: `bunx vitest run tests/server-timing.test.ts`, `bunx tsc --noEmit`.
- Depends on: nothing.

**2. Record the hosted baseline.**
- File: `docs/operations/hosted-latency-2026-11-13.md` (new), linked from `docs/operations/pilot-latency-protocol.md`.
- Content: the numbers in this plan, the exact `vercel logs` and `pg_stat_statements` commands, and a per-page table of requests, round trips and stage time once task 1 is live.
- Accept: `bunx vitest run tests/docs.test.ts tests/design-docs.test.ts`.
- Depends on: task 1 deployed, then one owner click-through.

### Phase B: stop requests that buy nothing

**3. Sheet links follow the record-link rule.**
- File: `components/mgr/order-sheet-link.tsx`.
- Change: `SheetLink` passes `prefetch={rowLinkPrefetch(href)}`. The href already carries the record id, so the existing rule returns `false`.
- Test first: `tests/row-link-prefetch.test.ts`, a case that a sheet href (`/orders?order=<uuid>`) is not prefetched.
- Accept: the test, plus a request count: opening `/orders` sends no request per row (48 before).
- Depends on: nothing. Parallel with 4.

**4. Tile and other `E` links follow the record-link rule.**
- File: `components/mgr/e.tsx` (`E.tiles`, and the three other `<Link>` sites that take a caller's href).
- Change: each passes `prefetch={rowLinkPrefetch(href)}`.
- Test first: `tests/row-link-prefetch.test.ts`, a case for a vessel href; `tests/mgr-screens.test.ts` must stay green.
- Accept: opening `/cellar` sends no vessel-page request (29 before).
- Depends on: nothing. Parallel with 3.

**5. Navigation links: confirm, then decide (D1).**
- File: `components/mgr/app-shell.tsx`.
- First: on a preview deployment, compare click-to-content for five navigation pages with prefetch on and off, and record what a prefetch response contains.
- Then, if the owner chooses D1: the three navigation `<Link>` sites pass `prefetch={false}`.
- Accept: a full page load sends no navigation-page requests (about 60 before), and click-to-content is not slower.
- Depends on: task 1, for the comparison numbers.

### Phase C: fewer steps per page

**6. Taproom reads in parallel.**
- File: `app/(app)/taproom/page.tsx`.
- Change: reads that do not need each other's result start together. The print labels need the snapshot's revision, so that pair stays in order.
- Test first: the page's existing view test covers the output; the gain is read from task 1's `db` lines and the read's stage time.
- Accept: `/taproom` stage time drops by at least one round trip.
- Depends on: task 1.

**7. Vessel detail reads in two steps, not three.**
- File: `app/(app)/cellar/vessels/[id]/page.tsx`.
- Change: occupancies and the unit start together with the vessel list.
- Accept: the vessel page's stage time drops by one round trip; a missing vessel is still a real 404.
- Depends on: task 1.

**8. Explain the 240 ms reads (F6), then fix what it shows.**
- No file yet. Task 1's numbers say whether `get_atp` and `daily_pick_sheet` are slow alone or only during the bursts that tasks 3–5 remove.
- If they are fast once the bursts are gone, this task closes with that evidence.
- If not, it becomes one filed issue with its numbers, per the owner's one-fix-per-cause rule.
- Depends on: tasks 1, 3, 4.

### Order and parallelism

| Step | Tasks | Notes |
| --- | --- | --- |
| 1 | 1 | Alone; everything else is measured with it |
| 2 | 3, 4 | In parallel; one PR each or one together, both small |
| 3 | 2, 5 | After a deploy and one click-through |
| 4 | 6, 7, 8 | In parallel; each needs task 1's numbers |

Every PR is based on `main`.
There is no migration in this plan.
Merging to `main` deploys Production, so each merge is ask-first.

## Owner decisions

**D1. Turn off prefetch for navigation links?**
Decided 2026-11-13: yes, on the condition below.
Recommended: yes, if task 5 confirms the click is not slower.
It removes about 60 server requests from every full page load.
The alternative is to prefetch a navigation link only on hover or touch, which this Next.js version documents; it keeps a head start on desktop and costs one small wrapper component.

**D2. Turn on Vercel Speed Insights?**
Decided 2026-11-13: yes.
Recommended: yes.
The app already mounts it and it reports nothing until it is enabled in the Vercel dashboard.
It gives page timings from real browsers, which the server logs cannot.
It is an ask-first hosted change.

**D3. Raise the Supabase compute tier?**
Decided 2026-11-13: no, for now.
Recommended: no, for now.
The measured cost is the round trip and the number of requests, and Supabase reports 7 ms of work behind its gateway.
Revisit only if task 1 shows calls waiting on the database during bursts after tasks 3–5 ship.

## How each fix is proved

The same three readings, before and after, on live:

1. **Requests per page.** Count log rows per page open from `vercel logs --json`. Tasks 3–5 move this.
2. **Round trips and stage time per page.** Count the `db` lines and read the stage times from the same log. Tasks 6–8 move this.
3. **Database time.** Reset `pg_stat_statements`, click through, read it back. It should stay near 2.6 ms per statement; a rise means a new slow query.

Live timing stays read-only page loads, as the owner decided on 2026-10-27.
Live saves are not timed.
