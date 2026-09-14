# Route data cache evidence

User-directed change: replace the route skeleton with TanStack Query caching and lazy reads. No schema changes or production deploy.

## Guarantees

| Behavior | Proof |
| --- | --- |
| Deduplicated, scoped reads; five-second Orders checks and 30-second option checks; cached data remains during refresh | `tests/query-cache.test.ts` exercises real QueryClient/QueryObserver instances |
| Successful writes and uncertain outcomes invalidate; reads do not cause invalidation loops | Same file exercises the command transport and provider subscription |
| Authorization stays on server routes and the command endpoint | `tests/new-order-page.test.ts`, `tests/dependency-page-adapters.test.ts`; no RLS/auth bypass added |
| Cached adapters retain the shared form/view, active SKUs, ship-to defaults and role controls | `tests/cached-order-pages.test.ts`, existing page-adapter and inventory tests |
| No route skeleton; chat setup waits until opening | `tests/page-loading.test.ts`, `tests/composer.test.ts`, browser smoke |

## RED → GREEN

- `237d5b6b` / `831f4fb3`: cache tests failed on the missing cache module, then passed (6 tests).
- `5c5fa984` / `d1b7d560`: missing cached adapters and the still-present skeleton failed; cached adapter, page guard, and cache tests then passed (22 tests).
- `25a357dd` / `b5498453`: eager chat setup failed the first-open guard regression, then the composer file passed (17 tests).
- Expanded cache checks cover background refresh, failed-read loops, independent clients and cancellation.

## Verification

- 18 selected pure test files passed: 226 tests before the additional cache edge cases.
- `bunx tsc --noEmit`, `bun run lint`, `bun run build` passed. Lint retains the existing unused `_request` warning in the public-menu route.
- Browser against `next start --port 3002`: Orders → New Order → Orders → New Order recorded exactly `list_orders`, `list_customers`, `list_locations`, `list_skus`; revisits inside the freshness window made no additional data queries. Route/auth requests are not included in that count.
- Opening Ask MGR subsequently added `list_chat_conversations`, `get_brewery_ai_model`, `get_chat_history`; none ran during the preceding route navigation.
- Visually checked the existing New Order form and chat drawer. No test data or production data was created/deleted.

## Limits

The cache currently covers Orders and New Order, not every route. First uncached visits still fetch data; this is not an offline replica. Chat data is deferred, not its JavaScript bundle. Full database-backed tests remain for CI's fresh database. No coverage percentage or hosted latency gain is claimed. CodeScene was unavailable and skipped with user approval.

## Accepted freshness follow-up

The user chose last-known values with subtle refresh feedback and a 5–10-second target for other users' operational changes. Visible Orders now polls every five seconds; slower-changing New Order reference lists poll every 30 seconds. Both recheck on focus/reconnect, pause interval reads in hidden tabs, and stop polling after unmount. These are scheduling intervals, not maximum-age guarantees during slow requests or connection failures. No Realtime service, new dependency, or database change was needed.

- RED `3e7b4b1b`: `bunx vitest run tests/query-cache.test.ts tests/cached-order-pages.test.ts` executed 21 tests: seven new failures and 14 passes. Missing periodic reads, fresh-cache focus reconciliation, offline pause state, and last-checked feedback caused the failures.
- GREEN `8d34728c`: those files plus `tests/dependency-page-adapters.test.ts` passed 31 tests, including the added shared form-feedback check.
- Regression proof uses the real QueryObserver with a fake clock and controlled HTTP responses: cached rows remain until replacement data arrives, offline reads pause and reconcile, hidden tabs do not poll, and unmount stops polling. Mutation cancellation and tenant/actor/role isolation checks remain.
- The shared presentation chains are `Orders inventory → OrdersView + QueryFeedback ← OrdersClient ← OrdersPage` and `New order inventory → NewOrderView + QueryFeedback ← OrderForm ← NewOrderClient`. Form state remains owned by OrderForm. The retry button is explicitly non-submit; successful polling timestamps are not live announcements.
- The original CI revision exposed three outdated source checks. Orders' screen-source pointer now names its mounted client adapter; its test executes the page-to-client-to-view chain. The catalog check names the active-SKU filter's client owner, and the pure cached-adapter test executes that filter with active/inactive payloads. No authorization or inactive-SKU assertion was removed.

### Follow-up verification

- The 16 selected pure files passed 193 tests with `--maxWorkers=2`. The first broad run timed out importing the screen inventory in the docs test while build/lint ran; the docs file passed alone, and the subsequent broad run passed without changing its timeout or assertions.
- `bunx vitest run tests/app-screen-parity.test.ts tests/orders-list-view.test.ts tests/screen-view-composition.test.ts tests/cached-order-pages.test.ts tests/query-cache.test.ts --maxWorkers=2` passed 40 tests after correcting the source pointers. Combined with the preceding run, this covers 18 distinct pure files / 203 distinct tests.
- Typecheck, lint, and the production build passed. The public-menu unused-argument warning remains. The optional Vitest coverage provider is not installed; no percentage is claimed or dependency added.
- Local production-mode browser observed Orders reads approximately 5.2 seconds apart, retained its cached content while offline with explicit last-known feedback, and resumed checks after reconnect. New Order retained the same form DOM through option refresh, and Orders stopped polling after navigating away. No domain writes were submitted.
- Database-backed verification, including the catalog file's existing setup, stays on CI's fresh database. See the PR's checks for the pushed revision; local smoke tests do not establish hosted latency or multi-user transactional correctness.

## Behavior-preserving simplify pass

Reused the existing Orders payload type and removed two redundant async wrappers around chat setup. The 47 focused tests passed before cleanup; 171 tests across 11 pure files passed afterward, along with typecheck, lint (the same existing warning), and production build. No assertions or cache policies changed.

The local production-mode browser rendered Orders with Last checked feedback. A simulated first-open chat setup failure showed Try again; retry repeated setup, restored history, cleared the error, and enabled the composer. Browser error output was empty. No domain writes were submitted, and the isolated browser session/server were closed afterward. Coverage and CodeScene limitations above still apply.
