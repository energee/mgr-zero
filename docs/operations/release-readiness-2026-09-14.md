# Hosted release readiness — 2026-09-14

Status: **not signed off**. Owner: Ted. Tracks [#311](https://github.com/energee/mgr-zero/issues/311).
This is a read-only evidence review, not authorization to provision, deploy,
change credentials, run hosted advisors, prune logs, or configure schedulers.

## Revision and observed infrastructure

Reviewed `main`: `c999b82b986e3f42dbda27a33a0f813f753f54dc`.

| Check | Evidence | Boundary |
| --- | --- | --- |
| CI on the reviewed revision | [CI run 34884076501](https://github.com/energee/mgr-zero/actions/runs/34884076501) completed successfully | Includes database-backed CI tests, typecheck, lint, and build; not a hosted smoke test. |
| Production deployment | [GitHub deployment 6444251367](https://api.github.com/repos/energee/mgr-zero/deployments/6444251367) and its [statuses](https://api.github.com/repos/energee/mgr-zero/deployments/6444251367/statuses): success at 2026-09-14 18:59:46 UTC, same SHA | Provider-reported deployment success; authenticated application behavior was not retested in this review. |
| Function region | `vercel.json` specifies `iad1` | Configuration only. README records the production Supabase ref `uogrvqmrbmolvtftotsf` in `us-east-1`; current hosted settings were not inspected. |
| Ordering walkthrough prerequisite | [PR #313](https://github.com/energee/mgr-zero/pull/313) merged; [#304](https://github.com/energee/mgr-zero/issues/304), [#305](https://github.com/energee/mgr-zero/issues/305), and [#278](https://github.com/energee/mgr-zero/issues/278) are closed | Issue closure and historical local evidence do not substitute for release-revision retests. |

Preview/Production credential separation, Auth redirect/SMTP settings, backup
ownership, and hosted project permissions remain unverified. Never copy secrets
into this record.

## Connected walkthrough gate

The [September 11 audit](../audits/2026-09-11-adversarial-walkthrough.md#connected-jobs-crosswalk)
already maps the connected jobs. Reuse its
[execution ledger](../audits/evidence/2026-09-11-f3-execution.md), rather than
starting a competing screen inventory. Its evidence is historical, not fresh
proof for the SHA above.

| Job | Recorded evidence | Required decision or verification |
| --- | --- | --- |
| J01 ordering pilot | Partial | Complete fresh cutover, buyer notification, remedies, and price-change review for the accepted pilot scope. |
| J02 picked-order adjustment | Proven locally | Retest the connected 10 ordered → 6 picked → 4 shipped path on the release revision. |
| J03 production recall | Source only | Accept or defer the production release scope explicitly; no complete material-to-recipient recall claim. |
| J04 taproom | Proven with local fixtures | Approved live integration evidence is still required before claiming hosted Square coverage. |
| J05 delivery | Partial | Resolve or explicitly exclude failed/partial/refused delivery and independent keg/deposit policy. |
| J06 recovery | Partial | Complete user-visible unknown-save, support/export, and restore recovery for the pilot. |
| J07 tap-board review | Gated in the historical audit | Reconcile subsequent implementation against the accepted destination/publication/correction contract before changing this status. |

Ted must name the accepted release scope and owners for unresolved in-scope
boundaries. Zero recorded test failures does not make partial connected jobs
complete. Deferrals cannot compromise stock, money, tenancy, authentication, or
recovery truth in the pilot.

## Open runtime reports

- [#329](https://github.com/energee/mgr-zero/issues/329): latest hosted retest
  reports disabled Ask MGR controls. [PR #400](https://github.com/energee/mgr-zero/pull/400)
  adds setup explanation/recovery and fixes direct handle clicks; authenticated
  hosted verification remains required.
- [#390](https://github.com/energee/mgr-zero/issues/390): Repack bookmark 404.
  [PR #399](https://github.com/energee/mgr-zero/pull/399) supplies the redirect
  and opens the existing form; it must be included and retested on the chosen
  release revision.
- [#260](https://github.com/energee/mgr-zero/issues/260): latest retest requests
  navigable Search destinations despite the older fixed label. Keep it in the
  verification queue until destination selection is exercised on the release.

## Remaining sign-off evidence

Use the [release checklist](release-checklist.md) for the actual operations.
Before asking for a deployment decision, attach:

1. Final release SHA and successful required checks after accepted fixes merge.
2. Explicit Preview/Production project refs, regions, access owners, and
   confirmation of separate environment credentials, without secret values.
3. Signed-in Preview then Production results for login → catalog → inventory,
   portal order handoff, unchanged-command retry, phone/desktop navigation,
   and the open reports above. Record role, route, time, expected/observed
   result, and evidence for each.
4. Approved hosted-advisor results, approved integration sandbox checks, and
   chat log-pruning/scheduler ownership before enabling traffic.
5. Backup identifier, restore operator, rehearsed recovery evidence, and the
   previous application deployment proven compatible with the current schema.
   No rollback target has been validated by this review.

No hosted mutation or authenticated hosted smoke was performed. #311 remains
open; this record does not assert that its launch gate has been met.
