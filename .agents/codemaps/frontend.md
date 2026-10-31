<!-- Generated: 2026-10-31 | Commit: b8cb91afd | Tracked files scanned: 1878 -->
# Frontend

## Route groups (106 pages)
```
app/layout.tsx           tokens, fonts, theme boot (app/globals.css)
├─ (app)/   86 pages     staff; layout mounts AppShell + brewery provider
├─ (auth)/  10 pages     login, accept, invitations, reset, create-brewery, portal/login
├─ (portal)/ 8 pages     customer shop/cart, orders, invoices, account, coming-up, not-found catch-all
├─ (docs)/docs/[[...slug]]  Fumadocs over content/docs/*.mdx
└─ (frames)/screens/frame/[s]  one inventory screen full-viewport, static
```

## Staff areas, (app)/ (pages)
```
settings 13  accounting, chat, pos, import, team, channels
orders 9     list, [id], [id]/{complete,confirm,edit,pick,restock,ship}, new
catalog 5 · compliance 5 · invoices 4 · kegs 4 · purchase-orders 4 · recipes 4
cellar 3 · routes 3 · taproom 3 · work 3
batches 2 · customers 2 · inventory 2 · locations 2 · menu 2 · packaging 2 · transfers 2 · vendors 2
home · [...missing] · beer · denied · materials · more · pick · planning · pricing · replenishment
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
components/mgr/          48  top-level files: app-shell, command-form, e.tsx (E.* vocab),
                             search-palette, composer-conversation, me-sheet, qty
components/mgr/views/   170  shared screen drawings (live pages + inventory)
lib/mgr/*-view.ts       119  pure payload adapters for those views
lib/mgr/fixtures/        46  inventory snapshots
```

## Screen inventory (source of truth for screens)
`components/mgr/screens.tsx` (3352 lines) → `/docs/screens`,
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
