<!-- Performance baseline for production-readiness bundle decisions and future comparisons. -->
# Performance baseline

⤳ skill: nextjs

## Scope and method

This is a focused bundle-composition baseline, not a Core Web Vitals measurement. Before changing any imports, the installed Next.js analyzer was run with:

```sh
npx next experimental-analyze --output
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

## Follow-up production measurement

No deployed URL or real-user sample exists yet, so LCP, INP, CLS, FCP, and TTFB remain unmeasured. After deployment, establish field baselines in Vercel Speed Insights against LCP < 2.5 s, INP < 200 ms, CLS < 0.1, FCP < 1.8 s, and TTFB < 800 ms. Configure any observability drains through the Vercel Dashboard or REST API rather than application bundle code.
