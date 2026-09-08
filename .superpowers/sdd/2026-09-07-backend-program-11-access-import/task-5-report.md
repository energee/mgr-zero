# Program 11 Task 5 — final integration

Status: DONE. Parent owns whole-branch suite/build, final independent review, and the Program 11 acceptance/PR claim.

## Implementation and interfaces

- `InviteForm({ customerId? })` is shared by Team and first-run staff invitations, and by customer detail for buyer membership. Staff select exactly one existing role. Customer detail shows the action only to Admin/Sales; Team and first-run retain their existing admin gates.
- `invitationRequest(previous, breweryId, name, input)` retains identity only for the same submitted intent. `useCommandAction.run` accepts an optional fourth request ID and forwards the existing optional transport argument. Failed invitations preserve fields and ID even if the sheet closes/reopens on the page; success clears both. Reload recovery is explicitly not promised.
- Settings and the admin rail link to `/settings/import`; removed the obsolete planned `/settings/team#import` target. First-run Import and Invite staff are live, without changing the existing location/brand completion condition. Settings displays actual dedicated/hosted mode.
- Inventory ungates invitation acceptance/expiry, reset expiry, staff/buyer invites, import, provisioning, and the supported single-role member editor. Added live route mappings and an Invite staff sheet, removed its inert tap rule, and aligned first-run with that same form. Removed misleading pending-acceptance roster counts and selectable Account admin/multiple-role controls. Existing unrelated gates, including Taproom, remain.
- Generated API operation metadata carries `scope`; provisioning is authenticated pre-tenant, its example omits breweryId and uses a valid timezone. Tenant-role cells for provisioning are blank with an explicit scope explanation. Updated errors for the scope envelope and `502 invite_failed`, and corrected the error-source test to inspect the actual invitation boundary (and semicolons inside quoted errors).
- `bun run docs:api` initially failed because invitation registration eagerly loaded the `server-only` Auth boundary. The handler now dynamically imports that boundary on execution, so registry metadata remains usable in docs tooling. Auth guards and eslint service-client exceptions are unchanged.
- Updated all three customer guides, HTTP prose/generated blocks/backlog, architecture ownership/gate evidence, `.env.example`, and README. The CSV mapping table matches `IMPORT_FIELDS`, including historical product/style/abv/sku_name/upc plus existing formatId. Guides explain durable blocked outcomes, blocked-only correction, and no automatic reload recovery.
- Added known-ceiling comments for open-page batch identity and the sequential 5000-row import loop.
- Parent's real recovery walkthrough found local Auth redirect rejection. Both local configs now allow only the loopback callback prefixes on localhost/127.0.0.1 ports 3000/3002. README explains local restart and hosted configuration responsibility. Parent restarted the isolated stack preserving data and verified recovery end to end.

## API inventory counts

Before Program 11, baseline `81d4a86`: **182 total / 156 available / 26 designed**.

Final: **181 total / 157 available / 24 designed**.

Provisioning moved from designed to available. `update_staff_roles` was removed as a misleading unsupported array-role promise; the single-role editor names the existing `update_staff_role`. Invitations/import were already registered in the baseline counts, but are now callable rather than fail-closed.

## TDD and validation

All database tests use `.env.test.local`, isolated API54351/DB54352. No dev DB was used. Parent reset the test baseline before validation and later restarted from backup for Auth config changes; this task changed no SQL and performed no reset.

RED:

- `bunx vitest run tests/invite-form.test.ts`: failed because `lib/invite-form` did not exist. GREEN after implementing stable identity: 1 test passed.
- `bunx vitest run tests/api-docs.test.ts -t 'documents provisioning'`: failed because provision metadata had roles:any and no pretenant scope. GREEN after metadata/example changes: 1 passed, 28 skipped.
- `bunx vitest run tests/auth-config.test.ts`: failed on missing loopback callback allowlist. GREEN after config change: 1 passed.
- `bunx vitest run tests/screen-links.test.ts -t 'opens the live'`: failed because Invite staff was still inert. GREEN after removing the stale rule and updating Import's route.
- Existing inventory expectations detected the changed frame count, obsolete pending invitation and array-role drawings, missing import page E header, and hidden admin Import rail entry. Updated only expectations that intentionally changed with the supported product scope.

Added real-DB regression: inviter loses admin in the afterAuth hook; handler refuses, direct completion RPC also refuses, the Auth user stays bound pending_membership, and no membership is attached. Existing Auth-success/membership-failure and opening-balance rerun tests remain and pass. Added transport regression for the caller-owned stable ID; default transport UUID test remains.

Final focused command:

```sh
bunx vitest run tests/commands-invites.test.ts tests/commands-import.test.ts tests/provision-brewery.test.ts tests/api-command.test.ts tests/api-docs.test.ts tests/invite-form.test.ts tests/auth-config.test.ts tests/app-screen-parity.test.ts tests/data-api-boundary.test.ts tests/write-atomicity.test.ts tests/mgr-screens.test.ts tests/tap-coverage.test.ts tests/screen-links.test.ts tests/screen-command-gates.test.ts tests/screen-persona.test.ts tests/docs.test.ts tests/design-docs.test.ts tests/theme-contrast.test.ts tests/mgr-nav.test.ts tests/nav-ready-links.test.ts
```

**Final: 20 test files passed, 237 tests passed (21.98s), output pristine.** Log: `/tmp/task-5-final-tests.log`.

`bun run docs:api`: success; generator output matches source. `bunx tsc --noEmit && bun run lint`: success. `git diff --check`: clean. Self-reviewed all changed source and generated diffs; no NUL/binary files, dependency additions, migration edits, or progress/memory/drift edits.

## Browser evidence (parent performed)

Parent reports screenshots viewed and sessions closed: Team staff invite → actual Mailpit email → accept/name/password → staff Today; customer detail buyer invite → email → acceptance → correct customer Shop; Brewer denied Import; Settings Import live; fresh first-run checklist showed Import and Invite staff. Recovery mail retained localhost3002/auth/confirm?next=/password, opened Set new password, and a fresh login with the changed password reached the correct buyer portal. Earlier Task 4 browser report proves mixed rows, same-ID retry, blocked-only correction and one opening movement.

## Scope decisions and limits

Single staff role and buyer membership only. No roles-array migration, customer Account admin, invite resend/revocation, or existing-account attachment. Removed staff access is not repaired by replay. Invitation email delivery itself is not exactly-once. Wizard/invite request identity survives only while the page stays open; no offline outbox or reload restoration. Sequential import RPCs remain capped at 5000 rows. `MGR_DEDICATED=1` disables hosted web creation only; authenticated API/database bootstrap remain available.

No unresolved task-local issue found. Whole-program completion is deliberately left for parent validation/review.

## Review fix round 1

- Corrected first-run guide prose and screen spec to the existing `!hasLocation && !hasBrand` condition: it appears only while neither exists; adding either a location or a brand ends the checklist. No application behavior changed.
- `bunx vitest run tests/docs.test.ts tests/design-docs.test.ts`: 2 files passed, 15 tests passed (3.43s), output pristine.
- `git diff --check`: clean. API counts unchanged.
