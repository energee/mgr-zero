<!-- Performance baseline for production-readiness bundle decisions and future comparisons. -->
# Performance baseline

## Today and Work history indexes

The restock queue uses `orders_needs_restock_idx` on `orders (brewery_id)`
for rows with `needs_restock`. It includes cancelled orders because staged
beer must still be put back after cancellation. Refused returns use
`order_lines_refused_idx` on `order_lines (order_id)` for `qty_refused > 0`,
so the join can start from refused lines instead of completed deliveries.
Neither index changes queue visibility or return accounting.

Both indexes ship in `20261030031050_today_pending_history_indexes.sql`,
ordered after the existing main-branch migrations so normal migration pushes
can apply them without out-of-order flags.

The database regression in `tests/commands-today.test.ts` seeds 9,000 orders,
lines, shipments and completed deliveries inside a rolled-back transaction.
Two orders need restocking and one delivery has refused beer. After refreshing
planner statistics, it runs `EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON)` over both
`private.today_candidates` reasons and checks the partial-index paths and
returned work. Run it on the named local test database (`:54352`) through the
repository test harness; it is not hosted performance evidence.

⤳ skill: nextjs

## Scope and method

This is a focused bundle-composition baseline, not a Core Web Vitals measurement. Before changing any imports, the installed Next.js analyzer was run with:

```sh
bunx next experimental-analyze --output
```

The pre-change run used Next.js 16.3.3, completed its analysis in 2.6 seconds, and wrote the interactive report to `.next/diagnostics/analyze`. The report was inspected by route with the environment filter set to **Client**, then `/api/command` was inspected with the filter set to **Server**. The analyzer reports estimated compressed module totals; they are not equivalent to transferred page weight or field CWV data.

The installed Next.js 16.3.4 documentation was then checked at:

- `node_modules/next/dist/docs/01-app/02-guides/package-bundling.md`
- `node_modules/next/dist/docs/01-app/03-api-reference/06-cli/next.md`
- `node_modules/next/dist/docs/01-app/03-api-reference/05-config/01-next-config-js/index.md`
- `node_modules/next/dist/docs/01-app/03-api-reference/05-config/01-next-config-js/optimizePackageImports.md`

Those documents describe `experimental-analyze` as a Turbopack module-graph inspection that does not produce application build artifacts. They recommend `experimental.optimizePackageImports` only when analysis identifies a package with many exports and confirm that no Next configuration option is required by default.

## Routes inspected

Every route present in the analyzer route index was checked in the Client environment:

`/`, `/_not-found`, `/api/command`, `/catalog`, `/customers`, `/customers/[id]`, `/favicon.ico`, `/inventory`, `/invoices`, `/invoices/[id]`, `/login`, `/orders`, `/orders/[id]`, `/pick`, `/portal`, `/portal/invoices`, `/portal/orders`, `/portal/orders/[id]`, `/pricing`, `/replenishment`, `/settings/import`, and `/settings/team`.

Representative route totals were:

| Client route | Estimated compressed | Uncompressed | Client modules |
| --- | ---: | ---: | ---: |
| `/orders` | 402.81 KB | 1.05 MB | 246 |
| `/portal` | 396.96 KB | 1.03 MB | 242 |
| `/settings/import` | 397.64 KB | 1.04 MB | 243 |
| `/settings/team` | 401.47 KB | 1.05 MB | 246 |

The `/api/command` Server view contained 358 modules totaling an estimated 716.02 KB compressed and 2.32 MB uncompressed.

## Findings and decisions

### Command registration boundary

**Issue** → The side-effect entry `lib/commands/all.ts` would unnecessarily increase client JavaScript and could worsen FCP/INP if command registration crossed the Server/Client boundary.

**Impact** → No client route included `lib/commands/all.ts` or the registration modules `catalog.ts`, `context.ts`, `customers.ts`, `import.ts`, `inventory.ts`, `invites.ts`, `orders.ts`, `portal.ts`, or `registry.ts`. Client routes contained only the expected browser helpers `client.ts` and `use-command-form.ts`; `/settings/import` also contained the shared, non-registering `import-limits.ts`. Measured client impact from server command registration is therefore zero.

**Recommendation** → Keep the side-effect import at `app/api/command/route.ts`. Make no command import changes.

**Expected improvement** → No metric delta is claimed; the measured Server/Client boundary is already correct and should be preserved.

### Radix barrel tree-shaking

**Issue** → Shipping the complete `radix-ui` barrel could increase parse and execution work, primarily affecting FCP and INP.

**Impact** → Across all inspected client routes, the analyzer found no emitted module under `[project]/node_modules/radix-ui/`. It emitted only used `@radix-ui` primitive modules, including `react-dialog`, `react-label`, `react-select`, `react-separator`, and `react-slot`, plus their transitive helper primitives. The complete barrel did not enter a client chunk.

**Recommendation** → Keep the existing supported `radix-ui` imports. Do not rewrite shadcn component imports and do not add `experimental.optimizePackageImports` for `radix-ui`.

**Expected improvement** → No metric delta is claimed; the current build already tree-shakes the barrel to the primitives in use, so an import rewrite would add churn without measured benefit.

### Next.js configuration

**Issue** → A speculative bundling option could create an unsupported second optimization path without evidence.

**Impact** → The installed 16.3.4 config documentation requires no option for this application, and the analyzer found neither command-registration leakage nor a full Radix barrel in client output.

**Recommendation** → Leave `next.config.ts` unchanged.

**Expected improvement** → Stable, documented defaults with no expected CWV regression from an unnecessary experimental configuration.

### Composer bundle isolation

The focused October 2026 audit used `origin/main` at
`dcc7e2cf09bf343b2166ba67b64360c0065117ff`. Its Client analyzer baseline was
**1788.1 KiB for `/orders`** and **1606.1 KiB for `/portal`**. These are estimated
compressed totals of reachable modules, not browser transfers or initial
JavaScript sizes. They are a separate snapshot from the older route table above.

The local production-browser comparison used `next build` / `next start`,
isolated Chrome sessions, and the same fictional staff and buyer accounts.
Each route was opened directly after login, with the staff drawer still closed.
The table sums JavaScript resource-timing body sizes; cache hits can still report
body sizes, so these are not wire-transfer totals or field metrics.

| Route | Before encoded bytes | After encoded bytes | Before decoded bytes | After decoded bytes |
| --- | ---: | ---: | ---: | ---: |
| `/orders` | 623,446 | 418,551 | 2,157,304 | 1,457,034 |
| `/portal` | 550,431 | 396,379 | 1,886,158 | 1,382,398 |

The shared `E` controls imported the Composer drawer and strip through
`views/composer.tsx`, which also imported Streamdown and `E`. That made markdown
reachable through ordinary controls, including portal controls that never mount
a staff conversation. The drawer and strip now have direct, lightweight imports
in `E`; the markdown conversation view has its own module. No re-export through
the old mixed view restores that dependency path.

The staff layout still mounts `Composer`, but that client component now owns only
the existing drawer handle, keyboard shortcut, and actor/brewery/role-scoped
outbox lifecycle. Its `React.lazy` conversation import mounts on the first
open and stays mounted when minimized so drafts, transcript, and streaming state
survive. The deferred module owns the AI SDK, markdown conversation view, setup,
proposal, and commit recovery. A keyboard focus request waits for both the module
and conversation setup before focusing the enabled prompt.

The eager loading/error view keeps the same Outbox control and scoped outbox
panel available while chat input is disabled. A local error boundary contains a
failed conversation chunk; it asks the operator to reconnect and reload without
replacing the staff page or removing outbox access.

Conversation setup was already open-gated before this change. This split defers
code loading and initialization; it does not remove eager conversation network
reads, because there were none. Outbox startup/online flushing remains active
without opening Ask MGR. The shared drawer, strip, conversation, proposal, and
outbox views retain the same controls and layout in live and inventory adapters.

The post-change Client analyzer reports 1790.1 KiB for `/orders`, including its
deferred conversation, and 1159.7 KiB for `/portal`. No Streamdown or AI SDK
modules remain in the portal Client graph. The staff graph still contains them;
the browser comparison above establishes deferred initial delivery instead.

The production-browser smoke also opened Ask MGR for the first time while
offline, observed the locally contained chunk failure, and opened a saved
reading in the eager outbox without replacing Orders. Reconnecting and reloading
restored conversation setup and shortcut focus. Desktop and 390-pixel mobile
checks preserved an unsent draft through expand, minimize, and reopen.
No model request or field Core Web Vitals improvement is claimed.

## Follow-up production measurement

A production deployment exists, but no field Web Vitals sample has been collected, so LCP, INP, CLS, FCP, and TTFB remain unmeasured. The root layout (`app/layout.tsx`) mounts `<SpeedInsights />` from `@vercel/speed-insights`; it reports nothing until Speed Insights is enabled for the project in the Vercel Dashboard (an ask-first hosted change). Establish field baselines in Vercel Speed Insights against LCP < 2.5 s, INP < 200 ms, CLS < 0.1, FCP < 1.8 s, and TTFB < 800 ms. Configure any observability drains through the Vercel Dashboard or REST API rather than application bundle code.
