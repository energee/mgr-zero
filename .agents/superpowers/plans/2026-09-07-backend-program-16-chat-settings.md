# Program 16 — Chat settings and Slack actions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Finish the Slack-first chat plan so MGR has a real Chat settings page and Slack has snooze/mute/preferences actions. Slack **venue** frames stay in the explorer; this program makes the MGR screens and the live Slack actions those frames describe.

**Architecture:** Do not rewrite chat. Execute Tasks 11–14 of `.agents/superpowers/plans/2026-09-01-chat-notifications.md` **in this worktree**. Commands `set_notification_preference`, `unlink_chat_user`, `consume_chat_link_proof` already exist — Task 11 extends them with snooze + Slack action intents.

**Tech Stack:** Existing Chat SDK + `lib/chat/*`.

**Spec:** Chat design spec + chat plan Tasks 11–14. Screens: Chat disconnected, Chat settings, Linked people, Link your Slack, Disconnect Slack, Reauthorization. Remainder bucket H.

## Global Constraints

- Worktree `.agents/worktrees/backend`, branch `backend`. Ignore the chat plan header that names `plan/chat-notifications`.
- No operational Slack mutation of MGR domain commands (`record_fermentation_reading`, `confirm_order` stay `open_mgr` only).
- `lib/chat/jobs.ts` remains the only service-role owner besides tokens/invites.
- TDD as in the chat plan; use `bunx` not `npx`.
- After Task 12, add SCREEN_ROUTES for the six MGR chat screens.

## Tasks

### Task 1: Execute chat plan Task 11 (Slack actions)

Open `.agents/superpowers/plans/2026-09-01-chat-notifications.md` at Task 11. Run its failing tests, implement, commit. Replace `npx` with `bunx` and `npx supabase db reset` with `scripts/test-db.sh`.

`snooze_notification` is a designed operation in the API backlog — this task registers it.

### Task 2: Execute chat plan Task 12 (Chat settings page)

Same file, Task 12. Create `app/(app)/settings/chat/page.tsx` (link page already exists). Match Chat settings / disconnected / reauthorization / linked people records with `E.*`. Health query never returns tokens.

### Task 3: Execute chat plan Task 13 (manifest, sandbox, browser)

Same file, Task 13. Browse `/settings/chat` and `/docs/integrations` Slack frames. Do not require a live Slack workspace to merge if fixtures + unit tests cover actions; the chat plan's sandbox matrix is then a **manual** checklist in the PR description.

### Task 4: Execute chat plan Task 14 (docs)

`bun run docs:api`, staff-guide Chat, ungate MGR chat writes that are now registered. Slack venue frames remain venue.

---

## Validation

```bash
bash scripts/test-db.sh
bunx vitest run tests/commands-chat.test.ts tests/chat-webhook.test.ts tests/chat-slack-renderer.test.ts tests/chat-jobs.test.ts tests/app-screen-parity.test.ts
bunx tsc --noEmit && bun run lint
```

If `tests/chat-jobs.test.ts` times out, leftover `chat_installations` on a shared DB — Program 0 `mgr_test` should have eliminated that. If it still fires, disconnect leftovers as AGENTS.md says; do not skip the file.

## Acceptance

- [ ] `/settings/chat` exists and matches the Chat settings record
- [ ] Slack snooze/mute do not change MGR Today
- [ ] Domain forms in Slack still have no executable write intent
- [ ] Venue frames are not live MGR routes
