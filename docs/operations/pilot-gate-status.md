<!-- Status record for the pilot release gate decided on #311 (2026-10-11): owner steps, read-only checks, evidence. -->
# Pilot gate status

Each row's **Status** column is the record. Owner: Ted. Tracks the release index
[#311](https://github.com/energee/mgr-zero/issues/311).
Source: the "Pilot gate decisions (2026-10-11)" comment on #311.

Scope is **pilot first**: one or two breweries.
Full-v1 provider acceptance comes after the pilot.

Every hosted change, credential, spend and deploy is the owner's.
An agent only verifies, **read-only**; it never changes a hosted setting, sends mail, or deploys.
Never paste keys, tokens, SMTP passwords or backup download links here.

The general procedure stays in [`release-checklist.md`](release-checklist.md).
This file only tracks the pilot gate.
The historical hosted reading is [2026-09-18](release-readiness-2026-09-18.md).
Each dated entry below is evidence for that row, not a release sign-off.
Re-read each setting before marking a row done.

## How to use this record

1. The owner does the step in **What the owner does**.
2. The owner comments on #311 with the date and what changed.
3. An agent runs the **Read-only check** and links its output in **Evidence**.
4. The row becomes **done** only when the evidence matches the release SHA
   and environment it claims.

Project refs, from the 2026-09-18 record:
Production Supabase is `uogrvqmrbmolvtftotsf`; Preview is `ugzhwxzictzvrzlacjmv`.

## Pilot blockers

| # | Item | What the owner does | Read-only check afterwards | Evidence | Status |
| --- | --- | --- | --- | --- | --- |
| E1 | Sending domain | Create a Resend sending subdomain (e.g. `mail.<domain>`). Add its SPF and DKIM DNS records | `dig +short TXT <subdomain>` and the DKIM selector record match what Resend shows; Resend dashboard says verified (owner screenshot) | | open |
| E2 | Supabase Auth SMTP | Point Production Auth SMTP at Resend: host, port, user, sender address | Management API `GET /v1/projects/<ref>/config/auth` shows `smtp_host` and `smtp_admin_email` set. Do not print `smtp_pass` | | open |
| E3 | App send key and scheduler | Set `RESEND_API_KEY`, `ORDER_EMAIL_FROM` and `ORDER_EMAIL_JOB_SECRET` for Production in Vercel. Set repository variable `MGR_URL` and secret `ORDER_EMAIL_JOB_SECRET`, equal to the Vercel value, for `.github/workflows/hosted-jobs.yml` | `vercel env ls production` lists all three names (values not pulled). The latest `hosted jobs` run's `order-email` job succeeded (`gh run list --workflow hosted-jobs.yml`) | 2026-10-30: [order-email run 41004814733](https://github.com/energee/mgr-zero/actions/runs/41004814733) returned 401. [#1598](https://github.com/energee/mgr-zero/issues/1598) records the suspected missing-or-mismatched job secret; Vercel CLI access remains forbidden (#1617), so no deployed value was verified | open |
| E4 | Staff invitation delivered (#580) | Invite a synthetic staff user; accept from that inbox | Owner reports receipt time and sender address. The invited account appears in the team list | | open |
| E5 | Password recovery delivered | Request a reset for that user; complete it | Owner reports receipt and a successful sign-in with the new password | | open |
| E6 | Buyer confirmation delivered (#625) | Confirm a wholesale order for a customer with a linked synthetic buyer | `get_order_email_status` for that order shows `accepted`. Owner confirms the inbox received it; `accepted` alone is not delivery | | open |
| A1 | Public signup off | Turn on `disable_signup` in Production Auth | Auth config shows `disable_signup: true` | 2026-10-26: Management API `GET /v1/projects/<ref>/config/auth` shows `disable_signup: true` | done |
| A2 | Leaked-password protection on | Turn it on in Production Auth | Auth config shows `password_hibp_enabled: true`; the `auth_leaked_password_protection` advisor no longer appears | 2026-10-26: `PATCH` with `password_hibp_enabled: true` returned 402. The setting needs a paid Supabase plan, and the advisor still appears. The owner deferred it past the pilot as an accepted risk: signup is off and a password change needs the current password | deferred |
| D1 | Production deploys from `main` only | Set the Vercel project's production branch to `main` | Owner screenshot of Settings → Git. Every Production deployment in `vercel ls --prod` comes from a `main` commit | | open |
| B1 | Restore rehearsed | Restore one Production backup into a scratch Supabase project | Owner records backup ID, restore duration and operator. Row counts of `breweries`, `orders` and `inventory_movements` match the source at backup time | | open |
| B2 | Pre-migration backup per release | Before each release migration, take an on-demand backup and record its ID here | The ID appears in `GET /v1/projects/<ref>/database/backups` with a time before the release deployment | | open |
| B3 | Rollback target named | Name the previous deployment to promote if the build fails after migrations | Its SHA is recorded and its code tolerates the new schema | | open |
| Q1 | QuickBooks invoice push and payment link | Connect the approved QuickBooks company. Push one real invoice; open its payment link | `get_qbo_sync_status` shows the push; owner screenshot of the invoice in QuickBooks | | open |
| Q2 | QuickBooks manual reconciliation (#646) | Run manual payment sync once | `get_qbo_sync_status` shows the operator, last success and no unexplained failure | | open |
| Q3 | QuickBooks recovery (#641) | Disconnect and reconnect, or let a refresh token lapse in a sandbox | `get_qbo_connection` shows state `recovery_required` while broken, then `connected` after reconnect | | open |
| V1 | VoiceOver pass on `/work` (#727) | Record the manual VoiceOver traversal described on #727 | On the chosen release SHA, confirm #789 ancestry and record a passing traversal of the selected tab, changed filter results and labelled tab panel | 2026-10-30: [#789](https://github.com/energee/mgr-zero/pull/789) merged as `3f1271b82a763409e5c58ae4ce90f34d3795fd3a`, verified ancestor of the reviewed `18df6c892`. The owner [closed #727](https://github.com/energee/mgr-zero/issues/727) as code-complete on 2026-10-23; no completed VoiceOver traversal is recorded | open |
| S1 | Pilot scorecard defined (#729) | Fill and sign Part A of the scorecard before any pilot user starts | Part A sign-off line is filled on `main`. Scorecard drafted in PR #883 | | open |
| R1 | Green CI on the release SHA | Choose the release SHA. Re-run Docker rate-limit failures; never waive them | `gh run list --commit <sha> --workflow ci.yml` shows a completed run with every job successful | | open |
| R2 | Hosted smoke | Run README's login → catalog → inventory on Production as a synthetic staff user | The Production deployment's SHA (`vercel inspect <url>`) equals R1's SHA. Owner records the result and timestamp | | open |

## Pilot-time, not a launch blocker

| # | Item | What the owner does | Read-only check afterwards | Evidence | Status |
| --- | --- | --- | --- | --- | --- |
| L1 | Latency thresholds (#728) | Agree volumes and limits before the pilot; measure in the first weeks | The filled results table is on #311 with the release SHA. Protocol drafted in PR #882 | | open |

## Deferred past the pilot

No code change. Credentials stay unconnected until the owner brings each into scope.

| Item | Runbook |
| --- | --- |
| Square sandbox acceptance: D7 publish, retire, retry, conflict; expected-sales reconciliation | none yet |
| Slack install and link, scheduled chat jobs and delivery | none yet |
| Ask MGR: AI Gateway credits and the hosted composer (#329) | Drafted in PR #892 (`ask-mgr-hosted-verification.md`) |
