# Hosted release checklist

Owner: Ted. Record the date, commit SHA, project names, regions, and evidence
links in the release PR. Never paste keys or tokens into the PR.

Latest recorded review: [2026-09-18 readiness evidence](release-readiness-2026-09-18.md).
A successful deployment is not release sign-off; retain the evidence boundaries
and unresolved connected-job gates in that record.
Ask MGR's hosted composer gate (#329) has its own runbook: [Ask MGR hosted verification](ask-mgr-hosted-verification.md).

## Stop gates

- `main` CI is green on the release SHA.
- The ordering walkthrough PR is merged and #304/#305 are closed and retested.
- #278 is either closed or its non-pilot screens are explicitly deferred.
- Ted has approved hosted Supabase provisioning, Vercel provisioning, and the
  deployment. Approval of one does not imply the others.
- Every pilot blocker in the [pilot gate status](pilot-gate-status.md) record is done (#311).
- Re-run `bun audit --json` on the release SHA and review the dependency
  disposition below; a nonzero scanner exit is not itself proof of a reachable
  application vulnerability.

## Dependency hygiene — 2026-10-30 (#1667)

The local maintenance change starts at `18df6c892`. It upgrades the existing
`shadcn` dev dependency from 4.22.0 to 4.23.0 and its registry from 0.2.0 to
0.2.1. The new MCP server dependency replaces the old SDK graph, removing
`body-parser` from the lock. No direct dependency is added.

After the shadcn upgrade but before the approved overrides, `bun audit --json`
with Bun 1.3.10 exited 1 with six advisories across three dev-only packages.
`bun audit --prod --json` exited 0 with `{}`. The paths below came from
`bun why`, not the old issue's ancestry summary:

| Pre-override lock / advisory | Path and disposition |
| --- | --- |
| `deepmerge@4.3.1`, [prototype poisoning](https://github.com/advisories/GHSA-gcqx-w48m-w2h4) (low) | `shadcn` directly and through `@shadcn/registry`. No application or script import was found. Do not accept untrusted objects into the CLI's merge API. An override or replacement remains ask-first. |
| `fast-uri@3.1.8`, four URI-normalization advisories (two moderate, two low) | `shadcn` directly or through `@shadcn/registry` → `@dotenvx/dotenvx` → `conf` → `ajv` (also through `ajv-formats`). The audit names 3.1.9 as the fixed boundary. No application or script import was found; the existing lock remains unchanged by the shadcn update. |
| `systeminformation@5.33.15`, [Windows services command injection](https://github.com/advisories/GHSA-3f7j-7jwc-fxfj) (high) | `shadcn` directly or through `@shadcn/registry` → `@dotenvx/dotenvx`. Fixed boundary: 5.33.16. The prerequisite is attacker-controlled service names reaching `services()` on Windows; no application or script import was found. The lock remains unchanged by the shadcn update. |

The owner subsequently approved root overrides of `fast-uri` to 3.1.9 and
`systeminformation` to 5.33.16, retaining `katex` at 0.19.0. Both are published
patch releases within the actual parent ranges (`ajv` requires `^3.0.1`;
`@dotenvx/dotenvx` requires `^5.22.11`). After lock regeneration and a forced
frozen install, `bun why` resolves those exact patched versions.

Before the redirect patch, on 2026-10-31 after a forced frozen install with
Bun 1.3.10, `bun audit --json` exited 1 with three affected packages.
The production-only audit also exited 1, reporting `follow-redirects`.

On 2026-11-01, the owner approved an exact `follow-redirects` override from
1.16.1 to 1.16.2, within Axios's `^1.16.0` dependency range. A forced frozen
install retained the existing approved versions; lock regeneration changed
only the redirect package and its override.
`bun why` resolves the patched production chain:
`@chat-adapter/slack@4.42.0` → `@slack/web-api@7.19.0` (also through
`@slack/socket-mode@2.0.7`) → `axios@1.20.0` → `follow-redirects@1.16.2`.
The patch fixes [GHSA-mrwp-f3q8-3g9p](https://github.com/advisories/GHSA-mrwp-f3q8-3g9p),
the cross-realm sensitive-header redirect advisory. After this install,
`bun audit --prod --json` exited 0 with `{}`; `bun audit --json` exited 1
with only the two development-tooling packages below.

The installed Slack client sets `maxRedirects: 0`; no matching MGR exploit
path was established. The local native proof exercises the resolved package
from the production dependency graph, not actual Slack traffic.
Remove this override only when the upstream dependency floor excludes the
vulnerable versions. Review newer advisories for a suitable patched version;
do not simply drop the pin when another advisory appears.

| Residual locked package / advisory | Reachability and disposition |
| --- | --- |
| `deepmerge@4.3.1`, [GHSA-gcqx-w48m-w2h4](https://github.com/advisories/GHSA-gcqx-w48m-w2h4) (low) | Development-only shadcn/registry merge APIs, as above. No patched release exists (`first_patched_version` is null; registry `latest` is 4.3.1), and a downgrade below the affected range is not an established fix. Do not accept untrusted merge objects. |
| `minimatch@10.2.6` and nested `3.1.5`, [GHSA-g3hv-75wg-m249](https://github.com/advisories/GHSA-g3hv-75wg-m249) (moderate) | Development-only ESLint/config/plugins and shadcn → ts-morph. The advisory describes attacker-controlled glob amplification with `optimizationLevel >= 2`; no application/script import was found. The advisory marks versions below 11.0.1 affected. That major-version override is outside this approved change; keep untrusted glob patterns away from tooling. |

`bun outdated` also reports newer direct dependencies. No broader upgrade
was applied: this change retains the specifically approved versions and the
TypeScript compatibility-tarball policy. Re-review redirect handling if the
Slack client configuration, transport, or custom-header inputs change.

This is not an advisory-free claim or release approval. Do not expose these
tooling APIs to request input. Re-audit the eventual release SHA and retain
the existing KaTeX override alongside the three approved patch overrides.

Weekly Bun version-update PRs are configured alongside the existing Actions
updates. Bun security updates are not supported by Dependabot; audit remains
a separate release check. The TypeScript compatibility tarball is deliberately
retained, with its manual update procedure in the README.

Owner dispositions and the remaining hosted gate:

- **Frozen hosted install:** the owner declined the Vercel install-command
  change; `vercel.json` is unchanged. Local frozen-install proof does not
  verify Vercel's configured install command. This acceptance item remains
  blocked, so #1667 is only partially addressed.
- **Provider icons:** retain the current deep SVG imports in
  `ai-model-icon.tsx`. Local SVGs could remove the unused `@lobehub/ui` peer
  tree, but need license preservation and visual checks for every provider
  mark. No icon-rendering defect was established; replacement is outside
  this bounded hygiene change, not a completed consolidation.
- **Icon/primitive consolidation:** retain Lucide in shadcn primitives and
  `sort-head.tsx`, Hugeicons in the product wrapper, and the actively used
  Radix and Base UI primitives. Their overlap is not evidence of a bug.
  No primitive is hand-edited or claimed consolidated here.
- **License policy:** retain the existing AGPL-3.0-only license in
  `package.json` and `LICENSE`, and retain current repository visibility.
  A future owner request is required to change that policy.

## Dependency advisory disposition — 2026-10-16 (#934)

Baseline inventory revision: `b74c620869b7fa98e61b588ab36e8b183d8b2708`.
`bun audit --json` with Bun 1.3.10 exited 1 and reported the two advisories
below. After the approved KaTeX fix, only Braces remains. This is a
revision-bound applicability review, not hosted release sign-off or a claim
that the dependency graph is advisory-free.

### Authority and completed upgrades

`package.json` declares `bun@1.3.10`; tracked `bun.lock` and
`bun install --frozen-lockfile` are installation authority. `package-lock.json`
is ignored, not an alternative deployment lock. No tracked npm lock exists at
the baseline revision; this change does not remove a user's local lock.

[PR #938](https://github.com/energee/mgr-zero/pull/938) already merged the
dependency upgrades: Next 16.4.2, Undici 7.30.1, Sharp 0.35.5, and MCP SDK
1.32.1 are locked and absent from this audit's findings. Its commits are
ancestors of the inventory revision; do not duplicate those upgrades.

The [owner's issue approval](https://github.com/energee/mgr-zero/issues/934#issuecomment-6221592817)
allows patch bumps within the existing minor. The owner separately authorized
the KaTeX security upgrade on 2026-10-16, including a global override to the
already-installed fixed 0.19.0. Bun 1.3.10 warns that nested overrides and nested
resolutions are unsupported, so a targeted parent-only rule cannot enforce
the fix with this package manager. Root `overrides.katex` pins 0.19.0 for all
three consumers without downgrading either previously fixed copy. No other
dependency version is changed; no provider operation is authorized.

For an existing install after this override changes, run
`bun install --force --frozen-lockfile` before runtime proof: an ordinary or
frozen install can keep the obsolete nested 0.16.47 directory even after the
lock no longer lists it. Lock inventory alone does not prove which installed
module a process loads.

### Advisory inventory and exact lock paths

Paths start at root `package.json`; arrows name the installed dependency
ancestry from `bun why`. Versions are the resolved `bun.lock` entries, not
manifest ranges.

| Advisory / affected lock key | Installed paths | Upstream fix / disposition |
| --- | --- | --- |
| [GHSA-vfj7-8cjw-p6xm](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm), `braces` = 3.0.3 (affected: ≤3.0.3) | dev `shadcn@4.22.0` → `fast-glob@3.3.3` → `micromatch@4.0.8` → `braces@3.0.3`; dev `shadcn@4.22.0` → `@shadcn/registry@0.2.0` → the same `fast-glob` suffix; dev `shadcn@4.22.0` → `ts-morph@26.0.0` → `@ts-morph/common@0.27.0` → the same `fast-glob` suffix; dev `eslint-config-next@16.4.2` → `@next/eslint-plugin-next@16.4.2` → `fast-glob@3.3.1` → the same `micromatch` suffix | No patched release is listed upstream. Development/build tooling, not an established request-controlled matching path. Remains in the lock. |
| [GHSA-238p-pmpm-9mq7](https://github.com/advisories/GHSA-238p-pmpm-9mq7), baseline `micromark-extension-math/katex` = 0.16.47 (affected: ≥0.11.0, <0.18.2) | `@lobehub/icons@6.0.0` → peer `@lobehub/ui@6.0.2` → `remark-math@6.0.0` → `micromark-extension-math@3.1.0` → `katex` | Fixed upstream in 0.18.2. Upgraded to 0.19.0 by the approved global override, beyond the parent's original `^0.16.0` range. The nested vulnerable lock entry is removed. |

The baseline's other KaTeX locks were `katex` = 0.19.0 and
`@lobehub/streamdown/katex` = 0.18.11. The override converges all consumers on
0.19.0 rather than retaining a vulnerable nested copy.

### Reachability evidence and re-review gates

- **Braces:** exploitation requires an attacker-controlled, deeply nested brace
  pattern reaching the recursive compile/expand walkers. The installed paths
  above belong to shadcn's component-generation CLI and Next's ESLint globbing.
  Repository searches of `app`, `components`, `lib`, and `scripts` found no
  `braces`, `micromatch`, or `fast-glob` consumer accepting application input.
  `app/globals.css` imports `shadcn/tailwind.css`, not its CLI. Installing dev
  dependencies in a build is not proof that their matching APIs are served to
  users. Re-review before accepting untrusted build/glob patterns or invoking
  these tools from a request; no-fix status is not permission to expose them.
- **KaTeX:** the upstream advisory requires prior prototype pollution (or
  attacker influence over the options object's prototype), attacker-controlled
  math, and unsanitized insertion of renderer output. The affected
  `micromark-extension-math/lib/html.js` exposes `mathHtml`, which calls
  `katex.renderToString`; its `remark-math/lib/index.js` parent imports only the
  `math` syntax extension, not `mathHtml`. MGR imports neither API.
  `components/mgr/ai-model-icon.tsx` uses deep SVG icon components, not the
  `@lobehub/ui` markdown renderer. The actual assistant transcript in
  `components/mgr/views/composer-conversation.tsx` renders with `streamdown@2.7.0`,
  whose locked graph has no KaTeX/math plugin. No renderer-options or prototype
  pollution prerequisite was established; this is not a blanket assertion that
  prototype pollution is impossible. Re-review before enabling math rendering,
  changing those deep imports to a UI barrel, or accepting renderer options.
- **Patch/enablement gate:** if a vulnerable API becomes reachable, patch or
  remove that path before enabling it. Braces still needs an upstream fix or
  an approved removal/replacement of the affected consumer. Keep the KaTeX
  override until all parents require a fixed range and a fresh audit confirms
  the vulnerable copy cannot return. Repeat the inventory if the release SHA,
  lock graph, or upstream advisory changes.

PR #938 records successful lint, TypeScript, build, full Vitest, and local
database verification for its upgrades. That evidence belongs to that PR, not
this change. This change adds behavior checks for inline/display math through
the affected micromark HTML extension, rejection of inherited `trust`, explicit
trusted links, and unchanged literal math in the actual composer view. Real
AI-provider calls and hosted smoke remain separate approval gates; neither is
implied by local rendering checks or the absence of a scanner finding.

## Provisioning

1. Production is the only Supabase project; the owner decided on 2026-11-12
   not to keep a Preview project (#1616). Record its name, ref, region, and
   owner; colocate Vercel functions with the database region.
2. Configure Supabase Auth site URLs, exact redirect allowlists, SMTP, and rate
   limits for Production.
3. Create/link the Vercel project and restrict Production to `main`.
4. Set environment-scoped values from `.env.example`. At minimum:
   `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`,
   `SUPABASE_SECRET_KEY`, `POSTGRES_URL_NON_POOLING`, and `APP_URL`.
   Integration credentials are added only for the approved environment.
5. Vercel Preview must hold no Production Supabase credentials. Confirm no
   secret is present in logs, browser bundles, screenshots, or PR text.

## Database and deploy

1. Take and identify a pre-migration backup. Confirm who can restore it.
2. Review the pending schema diff against the release SHA.
3. Deploy through the existing `vercel.json` build command. Production builds
   run `scripts/vercel-build.sh`, which pushes migrations before building.
4. Stop on any migration, build, or required-check failure; do not retry with a
   changed schema or environment under the same release record.
5. Run hosted Supabase security and performance advisors and attach sanitized
   results. Local `db lint` is not hosted-advisor evidence.

## Hosted smoke

Run against Production. There is no Preview database (#1616):

- Sign in as a real invited staff user; verify session expiry and sign out.
- Complete README's login → catalog → inventory path.
- Create a customer and ship-to, invite a portal user, submit one order, and
  confirm staff can see it without crossing tenant boundaries.
- Execute one unchanged command retry and verify one effect.
- Check narrow-phone and desktop navigation, including sidebar collapse and
  modal Close.
- Connect only approved sandboxes. Verify disconnect/reconnect and a failed
  provider request without exposing credentials.
- Run chat integration-log pruning before traffic and confirm scheduled job
  ownership if chat delivery is enabled.

Record the account role, route, expected result, observed result, timestamp,
and evidence link for every check. Use synthetic brewery/customer data.

Smoke does not measure latency at pilot volumes; see the [pilot latency protocol](pilot-latency-protocol.md) (#728).

## Rollback and recovery

- Application-only failure: promote the previous known-good Vercel deployment
  only after confirming its code is compatible with the current schema.
- Backward-incompatible database failure: stop writes and prefer a reviewed
  forward fix. Restore the identified backup only when the owner accepts the
  data-loss window and the restore has been rehearsed.
- Credential exposure: disconnect the integration, rotate the affected secret,
  invalidate sessions/tokens where supported, and preserve sanitized incident
  evidence.
- Record the decision, operator, timestamps, affected environment, data-loss
  window, verification result, and follow-up owner.

## Release sign-off

- Required CI checks and production build passed on the deployed SHA.
- Hosted advisors have no unowned launch blocker.
- Hosted smoke passed in Production.
- Backup/restore owner, rollback-compatible deployment, integration owners, and
  scheduler owners are recorded.
- Open deferrals name an owner and trigger; none can affect stock, money,
  tenancy, authentication, or recovery truth in the released pilot.
- The [pilot scorecard](pilot-scorecard.md) Part A is signed off (#729); release sign-off is not pilot success.
