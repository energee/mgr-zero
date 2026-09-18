# Hosted release readiness — 2026-09-18

Status: **not signed off**. Owner: Ted. Tracks [#311](https://github.com/energee/mgr-zero/issues/311).
Supersedes [2026-09-14](release-readiness-2026-09-14.md); the connected-job table there still applies.
Read-only evidence from the Vercel CLI and Supabase Management API. No hosted setting was changed.

Reviewed `main`: `eec7ada59745a3dc0ccf8271102f0f6166080242` (after #406, #408, #409; #407 pending CI).

## Environment separation (blocker)

| Check | Observed | Required |
| --- | --- | --- |
| Supabase project, Preview vs Production | Both Vercel environments point at `uogrvqmrbmolvtftotsf` (us-east-1) | Separate projects (checklist, Provisioning 1) |
| Secrets, Preview vs Production | `SUPABASE_SECRET_KEY`, `CHAT_STATE_DATABASE_URL`, `SLACK_SIGNING_SECRET` identical in both | Separate credentials (Provisioning 5) |
| Second project | `ugzhwxzictzvrzlacjmv` ("MGR", us-west-2, created 2026-09-09) is ACTIVE and retained per [region cutover](supabase-region-cutover.md) | Candidate Preview target, or a fresh Preview project |
| Production env extras | Legacy `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_ANON_KEY`, `SUPABASE_JWT_SECRET`, `POSTGRES_*` present (integration defaults); app reads only `.env.example` names | Remove or scope unused secrets |
| Preview `POSTGRES_URL_NON_POOLING` | Absent | Fine: `scripts/vercel-build.sh` pushes migrations only when `VERCEL_ENV=production` |
| Vercel production branch restriction | Not readable from CLI (`link: null`); Vercel MCP returned 403 | Confirm in dashboard: Production deploys from `main` only |

Consequence today: every preview deployment runs against the production database with production secrets. Nothing must be called "Preview smoke" until this is split.

## Auth (both projects identical)

| Setting | Observed | Note |
| --- | --- | --- |
| Site URL | `https://mgr-zero-mgr8.vercel.app/` | OK for the vercel.app origin; revisit if a custom domain lands |
| Redirect allowlist | site URL, `/**`, `/auth/confirm`, and `https://mgr-*-zero-mgr8.vercel.app` wildcard | Wildcard admits every preview URL; acceptable only once Preview has its own project |
| SMTP | Not configured (Supabase default sender) | Default sender is rate-limited to 2 emails/hour; invites at pilot scale will fail. Configure SMTP before inviting staff |
| Signups | `disable_signup=false` | App is invite-only; confirm the app gate suffices or disable public signup |
| Leaked-password protection | Off (advisor WARN) | Turn on |
| Captcha | Off | Decide |
| JWT expiry | 3600s | OK |

## Backups

| Project | PITR | WAL-G | Snapshots |
| --- | --- | --- | --- |
| `uogrvqmrbmolvtftotsf` | off | on | 0 listed |

No identified backup exists (checklist, Database and deploy 1). Pre-migration backup and a named restorer are still owed. Free/Pro daily backups appear here only after the first scheduled run; take a manual one before the release migration.

## Hosted advisors (Production)

| Advisor | Level | Count | Assessment |
| --- | --- | --- | --- |
| `authenticated_security_definer_function_executable` | WARN | 171 | The command RPC surface (`adjust_order_lines`, `begin_csv_import`, …). Intentional per the command architecture; each RPC checks membership internally. Record as accepted, or revoke `EXECUTE` from `authenticated` on any RPC that is only called through the service role |
| `rls_enabled_no_policy` | INFO | 21 | Service-role-only tables (`integration_tokens`, `chat_*`, `square_*`, `qbo_*`, `notification_*`). Deny-all by design |
| `auth_leaked_password_protection` | WARN | 1 | Enable |
| `multiple_permissive_policies` | WARN | 129 | Performance only; not a launch blocker |
| `unindexed_foreign_keys` | INFO | 219 | Review after pilot traffic |
| `unused_index` | INFO | 100 | Expected pre-traffic |

## Open runtime reports

- [#329](https://github.com/energee/mgr-zero/issues/329) Ask MGR: PR #400 merged; authenticated hosted retest still owed.

## Decisions (Ted, 2026-09-18)

1. **Pilot scope: J01 ordering, J02 picked-order adjustment, J06 recovery.** J03 production recall, J04 taproom, J05 delivery, and J07 tap-board review are deferred from the pilot. Deferral does not touch stock, money, tenancy, auth, or recovery truth.
2. **Preview target: reuse `ugzhwxzictzvrzlacjmv`** (us-west-2). Vercel Preview gets that project's keys; Production keeps `uogrvqmrbmolvtftotsf`.
3. **Auth SMTP: Resend**, via the Vercel Marketplace integration.
4. **RPC advisor: accepted as designed.** The 171 `authenticated`-executable functions are the command layer; each enforces brewery membership internally (`.agents/ARCHITECTURE.md`). No narrowing.

## Actions taken 2026-09-18 (after the decisions)

| Action | Result | Boundary |
| --- | --- | --- |
| Vercel Preview repointed to `ugzhwxzictzvrzlacjmv` | `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SECRET_KEY`, `CHAT_STATE_DATABASE_URL` set for Preview only; `mgr_chat_sdk` password rotated on that project. Project already at migration `20260920100000`, so no schema push. Redeployed preview `mgr-zero-21ofwb05w` built Ready and serves `/login` | Verified by `vercel env pull --environment=preview` and a 200 on `/login`; not an authenticated smoke |
| Incident: production vars deleted and restored | `vercel env rm NAME preview` removed the whole record for the four names above because each targeted both environments. Restored within minutes from the Supabase management API; the production `mgr_chat_sdk` password was rotated because the old value was unrecoverable. The live production deployment keeps its baked-in env; the next production deploy picks up the rotated chat credential | Production `/login` returned 200 before and after. Chat delivery, if any installation were active, would use the old password until redeploy |
| Resend installed via Vercel Marketplace | Blocked on terms acceptance: `https://vercel.com/mgr8/~/integrations/accept-terms/resend?source=cli`, then rerun `vercel integration add resend/resend-email --non-interactive --no-claim`. Resend also requires a verified sending domain before it will deliver to invitees; the app has no custom domain yet | No Supabase Auth SMTP fields set |
| Advisor acceptance recorded | Decision 4 above | — |

Still open: production-branch restriction (dashboard), pre-migration backup and restorer, SMTP fields once Resend has a domain, leaked-password protection, Auth `disable_signup`, #329 hosted retest, J01/J02/J06 fresh retests on the release SHA.
