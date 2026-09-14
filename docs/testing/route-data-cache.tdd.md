# Route data cache evidence

User-directed change: replace the route skeleton with TanStack Query caching and lazy reads. No schema changes or production deploy.

## Guarantees

| Behavior | Proof |
| --- | --- |
| Deduplicated, scoped reads; 30-second freshness; stale data remains during refresh | `tests/query-cache.test.ts` exercises real QueryClient/QueryObserver instances |
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
