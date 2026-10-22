<!-- Owner runbook and evidence record for the hosted Ask MGR composer gate (#329). -->
# Ask MGR hosted verification

Status: **open, owner action required**. Owner: Ted. Tracks
[#329](https://github.com/energee/mgr-zero/issues/329); the release index is
[#311](https://github.com/energee/mgr-zero/issues/311).

Per the #311 decision of 2026-10-11, this gate is **deferred past the pilot**.
Run it when Ask MGR is brought into scope, not before.

Every hosted step below is the owner's: AI Gateway billing, model choice,
environment variables, and deployments. An agent may only read the result
afterwards. Never paste keys, tokens, or full request headers into the issue.

## What is already known

| Date | Finding | Source |
| --- | --- | --- |
| 2026-09-20 | Cold start needed one **Retry setup**, then the composer enabled | #329 comment |
| 2026-09-20 | `503 Chat is not configured` on Vercel; fixed in #412 | #329 comment |
| 2026-09-20 | Stream failed: `GatewayInternalServerError: Free tier users do not have access to this model` for `anthropic/claude-sonnet-4.5` | #329 comment |
| 2026-09-30 | That diagnosis is historical; credits, model and deployed SHA must be re-checked | #329 review |

Credits alone, or an HTTP 200 stream, do not close #329.

## How the model is chosen (code)

The route resolves the model per brewery, in this order:

1. The brewery's saved model, `breweries.settings.ai_model`.
   An admin sets it in **Settings → AI model** (`set_brewery_ai_model`).
2. The `AI_GATEWAY_MODEL` environment variable.
3. `DEFAULT_CHAT_MODEL` in `lib/chat/models.ts`: `anthropic/claude-sonnet-4.5`.

`get_brewery_ai_model` in `lib/commands/settings.ts` applies this order.
`app/api/chat/route.ts` passes the result to `gateway(model)`.

Gateway access is a separate check. `isChatConfigured` in
`lib/env/server-parser.ts` accepts `AI_GATEWAY_API_KEY`, `VERCEL_OIDC_TOKEN`,
or `VERCEL=1`. On Vercel it passes through OIDC with no key.
It proves configuration, not that the team may call the model.

## Step 1: owner chooses one access path

Record the choice in the results table.

**A. Add AI Gateway credits.**
In the Vercel dashboard, open the team that owns the MGR project, then
**AI Gateway → Credits**. Add credits. Keep the default model.

**B. Pick a model the team can already call.**
Sign in to the hosted app as an admin of the test brewery.
Open **More → Settings → AI model**, search, and choose a model.
Select **Save AI model**. This writes only that brewery's setting.
Check the model's availability on the Vercel AI Gateway models page first.

**C. Change the environment default.**
Set `AI_GATEWAY_MODEL` for the target Vercel environment, then redeploy.
A brewery with a saved model (path B) ignores this value.

Do not change Preview and Production together.
A `vercel env rm` on a shared record deletes both
(see [2026-09-18 readiness](release-readiness-2026-09-18.md), Actions).

## Step 2: name the target

Fill these before testing.

| Field | How to read it |
| --- | --- |
| Environment | Preview or Production. Preview is Supabase `ugzhwxzictzvrzlacjmv`; Production is `uogrvqmrbmolvtftotsf` |
| URL | The deployment URL opened in the browser |
| Deployed SHA | Vercel dashboard → Deployments → the deployment's commit, or `vercel inspect <url>` |
| Model | The name shown in the Ask MGR header after the drawer opens |
| Account | A synthetic staff user and its role; never a real customer |
| Brewery | A synthetic test brewery with at least one SKU, location and on-hand stock |

## Step 3: the verification journey

Run every row in order. Take a screenshot at each **Evidence** cell.

| # | Action | Expected | Evidence |
| --- | --- | --- | --- |
| J1 | Sign in, open any staff page, select the Ask MGR handle (or Command-K) | Drawer opens. Header shows **Retry setup** while setup loads, then **New chat** and the model name | Drawer with model name |
| J2 | If the composer stays disabled, select **Retry setup** once | Setup finishes and the message box enables. If setup takes over 15 seconds, the drawer shows "Ask MGR could not start. Check your connection, then try again." with **Try again**; selecting it once opens the same conversation, not a new one. Record how many retries it took and whether the timeout appeared | Enabled box, or the timeout error |
| J3 | Send `What inventory is available?` | Text streams in. It names real SKUs from the test brewery, with an observation time. **Stop response** shows while streaming | Finished answer |
| J4 | Note the SKU's on-hand, then send `Record an adjustment of +1 <a real SKU> at <a real location>, bin <a real bin>` | MGR asks one focused question if a field is missing. Then a **Composer proposal** card shows the server preview, with **Open as form**, **Dismiss**, and **Commit movement** | Proposal card |
| J5 | Before committing, check the SKU's on-hand in another tab. Then select **Dismiss** | On-hand is unchanged: a proposal records nothing. Record whether the card closes | On-hand, and the card after Dismiss |
| J6 | Select **Commit movement** once on the proposal (ask again if the card closed) | A status line reads `Recorded · <id>`. On-hand rises by exactly 1, and the movement appears once in inventory history | Receipt and history row |
| J7 | Reload the page and reopen the drawer | The same conversation and history load; on-hand has not changed again | Restored drawer |

J4 to J6 use `record_movement`, the only AI-exposed write today.
Only `admin` and `warehouse` roles may run it, so use one of those accounts.
Chat never commits by itself: only **Commit movement** records the preview.
J6 writes one real +1 adjustment. Use the test brewery only.

The live composer (`components/mgr/composer.tsx`) passes no `onDismiss` to
the proposal card, so **Dismiss** may do nothing visible. The staff guide
says Dismiss records nothing. If the card stays open, record it as a finding.

## Step 4: expected failure if access is missing

If credits or model access are missing, the run fails at J3.
Per the current source (not yet re-observed on hosted):

| Where | Expected |
| --- | --- |
| Drawer | An alert reading `An error occurred.` with **Try again**. The AI SDK hides provider details from the browser by default |
| Vercel function logs for `/api/chat` | The provider error, for example `GatewayInternalServerError` and the access message |
| Message box | Enables again; the app's ordinary forms still work |

A `Chat is not configured.` error means the configuration guard failed.
On Vercel that should not happen after #412; record it as a new finding.
If any error shows raw JSON such as `{"error":"…"}`, record it.
The 2026-09-20 retest saw this for a 503; it has not been re-checked since.

## Results table

Copy this into a #329 comment and fill it in. Use the full deployed SHA and
give the date with its timezone. Crop keys, tokens, emails and customer data
out of screenshots, and remove secrets from any function-log line.

```markdown
## Ask MGR hosted verification — <date>

| Field | Value |
| --- | --- |
| Environment | |
| URL | |
| Deployed SHA | |
| Access path (A credits / B brewery model / C env default) | |
| Model shown in header | |
| Account role | |
| Operator | |

| # | Check | Result (pass/fail) | Observed | Screenshot |
| --- | --- | --- | --- | --- |
| J1 | Drawer opens, model shown | | | |
| J2 | Composer enables (retries needed: _) | | | |
| J3 | Real prompt streams a grounded answer | | | |
| J4 | Proposal card with server preview | | | |
| J5 | Proposal and Dismiss record nothing (card closed: yes/no) | | | |
| J6 | Commit movement records exactly once (+1 on-hand) | | | |
| J7 | Reload restores conversation, no second effect | | | |
| F1 | Failure message, if any (drawer text + log line) | | | |

Verdict: <pass / fail>. Follow-up issues: <links or none>.
```

#329 closes only when J1 to J7 pass on a named environment and SHA.
A failure gets its own issue, linked from #329.
