<!-- Generated: 2026-10-16 | Commit: 239c3929 | Files scanned: 1541 | Token estimate: ~740 -->
# Frontend

## Route groups (113 pages)
```
app/layout.tsx           tokens, fonts, theme boot (app/globals.css)
├─ (app)/   94 pages     staff; layout mounts AppShell + brewery provider
├─ (auth)/  10 pages     login, accept, invitations, reset, create-brewery, portal/login
├─ (portal)/ 7 pages     customer shop/cart, orders, invoices, account, coming-up
├─ (docs)/docs/[[...slug]]  Fumadocs over content/docs/*.mdx
└─ (frames)/screens/frame/[s]  one inventory screen full-viewport, static
```

## Staff areas, (app)/ (pages)
```
settings 21  accounting, chat, pos, import, team, units, channels
orders 11    [id]/{adjust,complete,confirm,edit,pick,restock,ship,short-pick}, new
catalog 5 · compliance 5 · invoices 4 · kegs 4 · recipes 4
cellar 3 · locations 3 · purchase-orders 3 · routes 3 · taproom 3 · work 3
batches 2 · customers 2 · inventory 2 · menu 2 · packaging 2 · transfers 2
beer · denied · materials · more · pick · planning · pricing · replenishment · vendors
```
Tabs + rail: `lib/mgr/nav.ts` (role-filtered), `lib/mgr/sidebar-state.ts`.

## Page pattern
```
page.tsx (server) → getActiveBrewery + buildContext
                  → requirePagePermission / optionalPageQuery (lib/mgr/page-query.ts)
                  → <AreaClient> (client) → components/mgr/views/<screen>.tsx
mutation: E controls → command-form.tsx (Sheet phone / Dialog desk)
          → lib/commands/client.ts command() → POST /api/command
          → emits COMMAND_DATA_CHANGED → lib/commands/query-cache.ts invalidates
```
Missing ids: `lib/mgr/not-found.ts` `orNotFound()`.

## Component layers
```
components/ui/           31  shadcn primitives (CLI-managed)
components/mgr/          38  composites: app-shell, command-form, e.tsx (E.* vocab),
                             search-palette, composer-conversation, me-sheet, qty
components/mgr/views/   154  shared screen drawings (live pages + inventory)
lib/mgr/*-view.ts       115  pure payload adapters for those views
lib/mgr/fixtures/        44  inventory snapshots
```

## Screen inventory (source of truth for screens)
`components/mgr/screens.tsx` (3077 lines) → `/docs/screens`,
`/docs/screens-explore` (`screen-explorer.tsx`), `/docs/integrations` (`venue.tsx`).
Taps: `lib/mgr/screen-links.ts`. Route anchors: `lib/mgr/screen-routes.ts`.
Personas: `lib/mgr/demo-personas.ts`, `components/mgr/demo-screens.tsx`.

## Client state
- Server data: @tanstack/react-query (`components/mgr/query-provider.tsx`, `lib/commands/query-cache.ts`)
- Brewery: `lib/brewery-provider.tsx`; portal customer: `lib/portal.ts`
- Portal cart: `lib/portal-cart.ts` (localStorage draft, 7 days)
- Ask MGR composer: `@ai-sdk/react` + `lib/composer/{state,outbox,offline-policy}.ts`

## Lint gates
Lint rejects native `<select>` and number inputs in product screens; local
`(cents/100).toFixed(2)` banned (use `lib/mgr/money.ts`).
