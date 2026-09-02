---
name: browse
description: Drive a browser against the running app — view a page, click through a flow, screenshot, read console errors, or verify a UI change actually renders. Use for the AGENTS.md step-4 eyeball check, for reproducing a UI bug, or whenever you need to see what a customer would see. Wraps `agent-browser`, the repo's only browser tool; never use `mcp__claude-in-chrome__*`.
allowed-tools: Bash(npx agent-browser:*), Bash(agent-browser:*), Read
---

# browse

`agent-browser` (a devDep, `node_modules/.bin/agent-browser`) is the only browser
tool in this repo. Its instructions ship with the binary and are version-matched,
so read them live rather than from this file:

```bash
npx agent-browser skills get core --full
```

Then follow that guide. Repo-specific rules on top of it:

1. **Always pass `--session <name>`**, with `/` turned into `-` — agent-browser's
   daemon fails to start on a name containing a slash, and every branch here is
   `type/name`:
   `S=$(git branch --show-current | tr / -)` then `npx agent-browser --session "$S" …`.
   Sessions isolate cookies/tabs; without one, parallel `.agents/worktrees/<branch>`
   runs share a browser and log each other out.
2. **Target the right port.** `npm run dev` is 3000; `npm run test:e2e` runs its own
   `next dev` on 3100. Log in via the dev accounts in `README.md`.
3. **Close your session when done:** `npx agent-browser --session "$S" close`.
4. **Prefer `snapshot` → `@ref` clicks** over guessing CSS selectors; prefer
   `get text` / `eval` over screenshots when you need a value, not a look.
5. Lightpanda is not a supported engine here (see `tests-e2e/portal-smoke.ts`);
   stay on the default Chrome.
