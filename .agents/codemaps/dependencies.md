<!-- Generated: 2026-10-31 | Commit: b8cb91afd | Tracked files scanned: 1878 -->
# Dependencies

## External services
| Service | Use | Code | Env |
|---|---|---|---|
| Supabase | Postgres, Auth, RLS | `lib/supabase/{server,admin}.ts`, `proxy.ts` | `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SECRET_KEY` |
| Vercel | Hosting (iad1) | `vercel.json`, `scripts/vercel-build.sh` | `VERCEL`, `VERCEL_ENV`, `VERCEL_OIDC_TOKEN` |
| Vercel AI Gateway | Ask MGR model calls | `app/api/chat/route.ts`, `lib/chat/models.ts` | `AI_GATEWAY_API_KEY` |
| Slack | Notifications, App Home, linking | `lib/chat/slack-*.ts`, `lib/chat/oauth.ts` | Slack app manifest (`slack-app-manifest.template.yml`) |
| QuickBooks Online | Invoices, payments, customer/item mapping, receipt bills | `lib/qbo.ts`, `lib/commands/qbo.ts` | `QBO_CLIENT_ID`, `QBO_CLIENT_SECRET`, `QBO_REDIRECT_URI`, `QBO_API_BASE`, `QBO_TAX_API_BASE` |
| Square | POS catalog publish, sales | `lib/pos.ts`, `lib/commands/pos.ts` | `SQUARE_APPLICATION_ID`, `SQUARE_APPLICATION_SECRET`, `SQUARE_ENVIRONMENT`, `SQUARE_REDIRECT_URI` |
| Resend | Order confirmation email | `lib/email/transport.ts` | `RESEND_API_KEY`, `ORDER_EMAIL_FROM` |
| TTB COLA registry | Label approval search (public, no key) | `lib/ttb/colas.ts` | — |
| GitHub Actions | CI, hosted job cron, doc/dream agents | `.github/workflows/*.yml` (8) | — |

Other env: `APP_URL` (public origin, never from Host), `MGR_DEDICATED`.
Parsed in `lib/env/{public,server,server-parser}.ts`.

## Runtime packages
```
framework   next, react, react-dom
data        @supabase/ssr, @supabase/supabase-js, pg, @tanstack/react-query, @tanstack/react-table, zod
ai/chat     ai, @ai-sdk/react, chat, @chat-adapter/slack, @chat-adapter/state-pg, streamdown
docs        fumadocs-core, fumadocs-mdx, fumadocs-ui
ui          radix-ui, @base-ui/react, cmdk, sonner, react-day-picker,
            class-variance-authority, cn, tw-animate-css
icons       @hugeicons/react, @hugeicons/core-free-icons, lucide-react, @lobehub/icons
telemetry   @vercel/speed-insights
```

## Dev tooling
vitest, typescript + @typescript/native, eslint + eslint-config-next, tailwindcss 4
(@tailwindcss/postcss), shadcn CLI, supabase CLI, agent-browser (only browser tool),
tsx, vite, @mdx-js/mdx. Package manager: bun (`bun.lock`).

## Scripts
```
bun run dev | build (mdx-safety test + next build) | test | lint
bun run docs:api        scripts/write-api-docs.ts
bun run types:database  scripts/generate-db-types.sh
bun run migrations:lock scripts/lock-migrations.ts
scripts/worktree.sh     only way to create worktrees (.agents/worktrees/<branch>)
scripts/land-pr.sh      merge main, relock, prove, push, wait CI; --merge opts into merge
scripts/test-db.sh      test stack reset (MGR_TEST_DB_RESET=1 forces)
scripts/seed-dev*.ts    idempotent dev seed
```
