# Per-page help: a "?" that opens the page's guide section (#1741)

Status: Phase 1 plan, awaiting owner approval of the map. No implementation
code yet. Implementation runs on a new branch from `main` after approval;
this PR adds only this file.

Source: issue #1741, split from #1517 item 10b and deferred by the owner in
#1591. Today the only way into help is Me → **Guide**, which opens the top of
the staff guide (`components/mgr/me-sheet.tsx`, `MeSheetActions`). The
guide is long, so a reader lands far from the page they were on.

## Goal

Every page header carries a small "?" that opens that page's section of the
guide in a new tab. Staff pages go to `staff-guide.mdx`, portal pages to
`portal-guide.mdx`. One route-to-anchor map drives it, and a test proves that
every anchor in the map exists in the guide it points at.

## Shape (smallest version)

- `lib/mgr/guide-anchors.ts`: one exported map from route prefix to
  `{ guide, anchor }`, plus `guideAnchorFor(pathname)` that takes the longest
  matching prefix. Pure, so the test needs no DOM.
- `E.hd` and `E.back` in `components/mgr/e.tsx` render one `<HelpLink />`
  beside the `<h1>`. `HelpLink` is a client component that reads
  `usePathname()` and renders nothing when the map has no entry. Two edit
  sites, so every existing page gets the "?" without touching the pages.
- Me → **Guide** also deep-links through the same map, so the two entries
  agree.
- `tests/guide-anchors.test.ts`: every `anchor` in the map appears as
  `[#anchor]` in the named guide; every top-level route under `app/(app)` and
  `app/(portal)` resolves to an entry (or is on a short allowlist: `/denied`,
  `/[...missing]`).

Skipped on purpose: a per-page override prop, a hover tooltip, and new guide
sections. Add an override only when a page proves the prefix rule wrong.

## The map (needs owner sign-off)

Prefix match, longest wins. Dynamic segments inherit the parent's row unless
listed. Anchors are the existing `[#id]` headings as of `main` 7a705dcee.

### Staff guide (`/docs/staff-guide`)

| Route prefix | Anchor | Note |
| --- | --- | --- |
| `/` (Today) | `#navigation` | |
| `/work` | `#navigation` | |
| `/work/deliveries` | `#deliveries` | |
| `/orders` | `#orders` | |
| `/orders/[id]/pick`, `/pick` | `#pick-sheet` | |
| `/routes` | `#deliveries` | |
| `/transfers` | `#transfers` | |
| `/invoices` | `#invoices` | return and mapping pages inherit |
| `/customers` | `#customers` | |
| `/pricing` | `#pricing` | |
| `/beer`, `/catalog` | `#catalog` | **confirm**: `/beer` is the beer hub |
| `/inventory` | `#inventory` | |
| `/locations` | `#locations` | |
| `/kegs` | `#kegs` | |
| `/menu` | `#menu` | |
| `/replenishment` | `#replenishment` | |
| `/taproom` | `#taproom-counts` | |
| `/taproom/board` | `#tap-intervals` | **confirm** |
| `/taproom/variance` | `#taproom-variance` | |
| `/recipes` | `#recipes` | |
| `/batches` | `#batches` | |
| `/cellar` | `#cellar` | |
| `/packaging` | `#packaging` | |
| `/materials`, `/vendors`, `/purchase-orders`, `/planning` | `#purchasing` | |
| `/compliance` | `#compliance` | licenses, lots, material lots inherit |
| `/proposals` | `#agent-proposals` | |
| `/settings` | `#settings` | accounting and pos inherit |
| `/settings/team` | `#team` | |
| `/settings/channels` | `#channels` | |
| `/settings/chat` | `#slack` | |
| `/settings/import` | `#import` | |
| `/settings/agents` | `#agents` | |
| `/settings/agents/activity` | `#agent-activity` | |
| `/more` | `#navigation` | |
| `/denied` | `#no-access` | |

### Portal guide (`/docs/portal-guide`)

| Route prefix | Anchor | Note |
| --- | --- | --- |
| `/portal` | `#shop` | |
| `/portal/coming-up` | `#shop` | **confirm**: no own section today |
| `/portal/orders` | `#orders` | |
| `/portal/invoices` | `#invoices` | |
| `/portal/account` | `#account` | |

## Questions for the owner

1. The three **confirm** rows above.
2. Should the "?" sit on the title row for detail pages (`E.back`) too, or
   only on list and hub pages (`E.hd`)? The plan says both.
3. Open in a new tab, like Me → **Guide** does today? The plan says yes.

## Tasks after approval

1. `tests/guide-anchors.test.ts` (red): map anchors exist; every route resolves.
2. `lib/mgr/guide-anchors.ts` (green).
3. `HelpLink` in `components/mgr/e.tsx`, rendered by `hd` and `back`; Me →
   **Guide** uses the map. Browse check on one staff and one portal page.
4. Docs: a line in `staff-guide.mdx` `#navigation` and `portal-guide.mdx`
   `#access` saying what the "?" does; screen inventory unchanged (the "?"
   is part of `E.hd`, so frames pick it up).

Proof: `bunx tsc --noEmit && bun run lint`, the screen-only vitest list in
`AGENTS.md`, plus the new test.
