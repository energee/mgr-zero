# Hosted release checklist

Owner: Ted. Record the date, commit SHA, project names, regions, and evidence
links in the release PR. Never paste keys or tokens into the PR.

## Stop gates

- `main` CI is green on the release SHA.
- The ordering walkthrough PR is merged and #304/#305 are closed and retested.
- #278 is either closed or its non-pilot screens are explicitly deferred.
- Ted has approved hosted Supabase provisioning, Vercel provisioning, and the
  deployment. Approval of one does not imply the others.

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
