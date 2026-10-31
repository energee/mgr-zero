# COLA search on the Brand approval sheet

Staff recording a brand's COLA type the TTB ID by hand today. TTB's public
COLA registry can be searched by the brewery's permit (the TTB registry number
on /settings, `breweries.ttb_registry_no`, e.g. `BR-PA-12345`). This adds a
**Find COLA** list to the Brand approval sheet: MGR searches TTB by that
permit, shows the brewery's COLAs whose fanciful name matches the brand, and
picking one fills the TTB ID, serial and approval date. Saving still goes through
`upsert_brand_approval`; nothing new is written.

## Verified facts (2026-10-14)

- Form: `POST https://ttbonline.gov/colasonline/publicSearchColasAdvancedProcess.do?action=search`,
  fields `searchCriteria.permitId`, `searchCriteria.dateCompletedFrom`,
  `searchCriteria.dateCompletedTo` (MM/DD/YYYY), `searchCriteria.productNameSearchType=E`.
  No captcha, no login.
- Results: 20 rows per page in `<tr class="lt|dk">`, columns TTB ID, permit,
  serial, completed date, fanciful name, brand name, origin code, origin,
  class code, class. `Total Matching Records: N`. Next page:
  `GET publicPageAdvancedCola.do?action=page&pgfcn=nextset` with the same
  session cookie. The synthetic fixture exercises a first page with more results available.
- TLS: ttbonline.gov omits its intermediate (Entrust OV TLS Issuing RSA CA 2,
  expires 2027-12-10). Node/Bun `fetch` fails `UNABLE_TO_VERIFY_LEAF_SIGNATURE`;
  passing `[...tls.rootCertificates, intermediate]` as `ca` succeeds with
  verification on. Never `rejectUnauthorized: false`.
- Fanciful names repeat (WAVES: 230003 and 230017) and one serial repeats
  (230016 on two COLAs), so the user picks; nothing auto-matches.

## Decisions

- **Read-only query**, not a write: `search_colas` (defineQuery) in
  `lib/commands/compliance.ts`, same roles as `upsert_brand_approval`. Input
  `{ name?: string }`. It reads the brewery's `ttb_registry_no`; with none it
  throws a `CommandError` saying to set the TTB registry number on Settings (no
  name-only fallback, AGENTS.md negative 5).
- **Filter in the query** (negative 12): the query returns only rows whose
  fanciful or brand name contains `name` (case-insensitive). Without `name`,
  all rows.
- **Date range**: the last 15 years less a day, through today. TTB rejects a
  range of 15 years or more with an error page (checked live 2026-10-14), so
  older COLAs cannot be searched. Pages are fetched until the total is
  reached; a missing Next link before then is an error, not a short list.
- **Date fill**: the sheet records *Date approved* (the existing `approved_on`
  column; no migration) and Use fills it from TTB's completed date, which is
  the approval date. (Changed in review from "no date fill".)
- **No caching, no stored scrape.** One search per click, on demand.

## Tasks

Sequential unless marked parallel.

1. **TTB client + parser** — create `lib/ttb/colas.ts` (module comment:
   scrapes TTB's public COLA search; why the bundled intermediate).
   Type: `ColaRecord = { ttbId: string; permit: string; serial: string | null; completedOn: string /* YYYY-MM-DD */; fancifulName: string; brandName: string; classCode: string; className: string }`.
   Pure `parseColaPage(html): { total: number; rows: ColaRecord[]; hasNext: boolean }`,
   pure `matchColas(rows, name)`, and `searchColasByPermit(permit, fetchImpl?)`
   that pages with one cookie over an `https` agent whose `ca` adds
   the intermediate (inlined as a constant in `colas.ts` after review, so the deployed function needs no file).
   - Test first: `tests/ttb-colas.test.ts` against
     `tests/fixtures/ttb-cola-results.html` (a saved real results page,
     public data): 20 rows, total 144, first row fields, `hasNext`; a page
     with no table throws; the pager stops at total with a stubbed fetch; a
     missing Next link before total throws; `matchColas` is case-insensitive
     over fanciful and brand name.
   - Accept: `bunx vitest run tests/ttb-colas.test.ts`, `bunx tsc --noEmit`.
2. **`search_colas` query** (depends on 1) — `lib/commands/compliance.ts`:
   reads `breweries.ttb_registry_no` for `ctx.breweryId`, calls
   `searchColasByPermit`, applies `matchColas`, newest completed first.
   - Test first: `tests/registry.test.ts` — rejects a brewery with no
     registry number; with the TTB client stubbed, returns only matching rows
     (DB-backed, `mgr_test` stack).
   - Accept: that test, `bunx tsc --noEmit`; `bun run docs:api` with an
     API_AREAS rule, then `tests/api-docs.test.ts` green.
3. **Sheet UI** (depends on 2) — `components/mgr/views/brand-approval.tsx`:
   for a COLA, a `Find COLA` slot listing matches (TTB ID, serial, fanciful,
   completed date, class), each with `Use`;
   `app/(app)/catalog/brands/[id]/compliance-forms.tsx` runs
   `search_colas({ name: brand.name })` on click, and `Use` sets `ttbId`, `serialNumber` and
   `approvedOn`. Reuse `E` controls and rows; no native inputs. Empty:
   "No COLAs on TTB under <permit> match <name>." Errors via
   `CommandFormMessage`.
   - Test first: pure `colaChoice(record) → { ttbId, serialNumber, approvedOn }` in
     `tests/compliance-view.test.ts`; render checked with `/browse`; inventory
     frame gets fixture rows (screen parity).
   - Accept: AGENTS.md screen-only proof list plus the eyeball check.
4. **Screen inventory + docs** (parallel with 3 once 2 lands) —
   `components/mgr/screens.tsx` Brand approval: `search_colas` in `reads`,
   states `searching`, `no registry number`, `no match`, and the spec
   sentence; `content/docs/staff-guide.mdx` Brand approval section;
   `.agents/ARCHITECTURE.md` owner row for `lib/ttb/`.
   - Accept: `tests/mgr-screens.test.ts tests/docs.test.ts tests/design-docs.test.ts`.
5. **Full proof** — `bun run test && bunx tsc --noEmit && bun run lint`,
   `/simplify`, re-run, PR to `main` with the TODO/DOCS/API lines.

No migration. No new dependency (`node:https` and `node:tls` are stdlib).

## Open questions

1. Resolved: the sheet records the approval date (see Date fill).
2. Bulk: a one-off script could match a brewery's COLAs to brands by fanciful
   name. Out of scope here; keep tenant-specific registry captures private.
