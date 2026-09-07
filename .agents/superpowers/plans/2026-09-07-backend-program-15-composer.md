# Program 15 — Composer preview and offline outbox Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Typed (or spoken-later) intent becomes a **server** preview of one registered command. Commit is an explicit click with the same `requestId` + `previewToken`. Offline, only commands marked eligible queue locally. Voice is deferred.

**Architecture:** Registry metadata per write: `risk`, `preview()`, `compensation`, `offlineReplay`. Internal query `preview_command` (not AI-exposed) canonicalizes. Language layer (optional LLM) emits `{ name, input }` only. **Ask before adding `@anthropic/sdk` or any LLM package.** A first slice can ship **without an LLM**: the composer is a command picker + preview. LLM is a later task in this same program if approved.

**Tech Stack:** Existing registry. Device-local history (`localStorage`). No server chat history.

**Spec:** `.agents/ARCHITECTURE.md` AI proposals gate. UI plan composer rows. Screens: Composer proposal, question, answer, Offline outbox. Remainder bucket G. Do not execute blocked 1C composer tasks as written.

## Global Constraints

- Worktree `.agents/worktrees/backend`.
- `preview_command` re-resolves on the server; never trusts the model or a cached proposal.
- Stale `previewToken` → reject, ask to preview again.
- `import_csv` / `invite_*` stay untagged (not AI-exposed) even after Program 11.
- Offline outbox is **client state**; it cannot call a command whose metadata `offlineReplay !== true`. Until durable result replay exists for that command, the flag is false. Program 0 request ledger already replays identical requestIds — a command is eligible only if it is also safe without re-reading stale ATP (e.g. `record_fermentation_reading` yes, `record_pick` no).
- TDD, docs:api, staff-guide. LLM dependency = ask first.

## File map

| File | Responsibility |
| --- | --- |
| `lib/commands/registry.ts` | optional `preview`, `offlineReplay`, `aiExposed` on `defineCommand` |
| `lib/commands/preview.ts` | `preview_command` query |
| `lib/composer/canonicalize.ts` | pure mapping of candidate → command input (test without LLM) |
| `components/mgr/composer.tsx` | proposal / question / answer UI already sketched as `E.comp` |
| `tests/preview-command.test.ts`, `tests/composer.test.ts` | Proof |

---

### Task 1: Registry preview metadata + `preview_command`

**Files:** registry.ts, preview.ts, tests

**Interfaces:**
```ts
preview?: (ctx, input) => Promise<{ effects: { label: string; qty?: string }[]; warnings: string[]; version: string }>
offlineReplay?: boolean
aiExposed?: boolean
```

- `preview_command({ name, input })` roles = caller's; runs role check; calls `preview`; returns `{ name, input, effects, warnings, previewToken }` where token is HMAC of canonical `{ name, input, version, breweryId }` (use existing env — if HMAC secret was deleted, derive from server env already used for cookies, **do not reintroduce COMMAND_RATE_LIMIT_HMAC_SECRET**). Simpler: token = `sha256(JSON.stringify({ name, input, version, breweryId, userId }))` stored in `private.command_previews (token, payload, expires_at)` for 10 minutes.

- [ ] **Step 1:** `record_movement` preview of qty −1 depletion returns an effect line and a token; committing `record_movement` with a stale token (version changed because on-hand changed) raises `stale_preview`. Warehouse cannot preview `upsert_customer`.

- [ ] **Step 2–5:** Implement preview for `record_movement` only first. Commit `feat(composer): preview_command issues a server version token`

---

### Task 2: Commit with previewToken

**Files:** `app/api/command/route.ts` accepts optional `previewToken` on writes whose definition has `preview`. If present, re-run preview, compare version, reject mismatch.

- [ ] **Step 1:** Same token + unchanged on-hand succeeds; after another movement, same token fails; retry without token still works for form commits (forms are not composer).

- [ ] **Step 2–5:** Commit `feat(composer): commit revalidates previewToken`

---

### Task 3: Composer UI (no LLM)

**Files:** `components/mgr/composer.tsx` — strip already in shell. Ambiguous candidate (pure function `disambiguate(text)`) returns question chips, no Commit. Resolved shows proposal matching the screen. History is a visible control, localStorage only.

- [ ] **Step 1:** `tests/composer.test.ts` — `"Blew a half of Hazy at the taproom"` with two Hazy SKUs → question; after choosing ½ bbl → proposal effects. No network.

- [ ] **Step 2–5:** Wire strip. Commit `ui: composer proposal and question without an LLM`

---

### Task 4: Offline outbox

**Files:** client module `lib/composer/outbox.ts`

**Interfaces:** Queue `{ name, input, requestId, previewToken? }` only if `offlineReplay === true`. Flush when online via `/api/command`. Discard and Fix actions match the screen.

- [ ] **Step 1:** `record_pick` is not queueable; `record_fermentation_reading` is (set the flag in Program 5's definition in this task if not set). Queued item survives reload (localStorage).

- [ ] **Step 2–5:** Commit `feat(composer): offline outbox only for eligible commands`

---

### Task 5: Optional LLM (stop if not approved)

If Ted approves a provider: language layer calls `generateText` with **only** `aiExposed` command JSON schemas, must return `{ name, input }`. Then Task 3's `disambiguate` receives that candidate. **Do not start this task without a yes and a package name.**

---

### Task 6: Ungate, docs

Ungate composer screens. `bun run docs:api`. Staff-guide: explicit commit, no auto-send.

Commit `docs: composer screens live`

---

## Validation

```bash
bunx vitest run tests/preview-command.test.ts tests/composer.test.ts tests/write-atomicity.test.ts
bunx tsc --noEmit && bun run lint
```

## Acceptance

- [ ] Preview is a registered internal query
- [ ] Stale token cannot commit
- [ ] No LLM unless separately approved
- [ ] Outbox cannot queue `record_pick`
