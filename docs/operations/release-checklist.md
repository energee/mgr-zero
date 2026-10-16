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
1.32.1 are locked and absent from this audit's findings. Its original
`chore/dependency-upgrades` worktree was clean when inspected; its commits are
already ancestors of the inventory revision. Do not duplicate those upgrades
or push to that merged branch.

The [owner's issue approval](https://github.com/energee/mgr-zero/issues/934#issuecomment-6221592817)
allows patch bumps within the existing minor. The owner separately authorized
the KaTeX security upgrade on 2026-10-16, including a global override to the
already-installed fixed 0.19.0. Bun 1.3.10 warns that nested overrides and nested
resolutions are unsupported, so a targeted parent-only rule cannot enforce
the fix with this package manager. Root `overrides.katex` pins 0.19.0 for all
three consumers without downgrading either previously fixed copy. No other
dependency version is changed; no provider operation is authorized.

For an existing install after this override changes, run
`bun install --force --frozen-lockfile` before runtime proof. In this worktree,
ordinary install and frozen install retained the obsolete nested 0.16.47
directory even after the lock audit stopped reporting KaTeX. The forced frozen
install removed it; the consumer then resolved the root 0.19.0 renderer.
Lock inventory alone does not prove which installed module a process loads.

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

1. Create separate Supabase Preview and Production projects. Record their
   project names, refs, regions, and owners; colocate Vercel functions with the
   chosen database region.
2. Configure Supabase Auth site URLs, exact redirect allowlists, SMTP, and rate
   limits for each environment.
3. Create/link the Vercel project and restrict Production to `main`.
4. Set environment-scoped values from `.env.example`. At minimum:
   `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`,
   `SUPABASE_SECRET_KEY`, `POSTGRES_URL_NON_POOLING`, and `APP_URL`.
   Integration credentials are added only for the approved environment.
5. Keep Preview and Production credentials separate. Confirm no secret is
   present in logs, browser bundles, screenshots, or PR text.

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

Run against Preview first, then Production:

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
- Hosted smoke passed in Preview and Production.
- Backup/restore owner, rollback-compatible deployment, integration owners, and
  scheduler owners are recorded.
- Open deferrals name an owner and trigger; none can affect stock, money,
  tenancy, authentication, or recovery truth in the released pilot.
- The [pilot scorecard](pilot-scorecard.md) Part A is signed off (#729); release sign-off is not pilot success.
