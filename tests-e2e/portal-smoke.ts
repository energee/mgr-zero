// tests-e2e/portal-smoke.ts — local-only E2E smoke: a customer portal user
// logs in, adds a sku to the cart, submits an order, and sees it on the
// orders list. Seeds its own brewery/customer via the admin client (same
// pattern as tests/commands-portal.test.ts); not part of the vitest suite
// or CI — run with `bun run test:e2e` against a running `bunx supabase
// start` + `.env.local`.
//
// Drives the browser with `agent-browser` (Vercel's browser automation
// CLI, https://www.npmjs.com/package/agent-browser) instead of Playwright.
// Chrome-only: agent-browser's bundled Chrome is the sole engine tried on a
// normal run. Lightpanda is NOT attempted — its `fill`/`type` don't reliably
// drive React's controlled-input state here (the DOM value updates but the
// qty state gating the Submit button never does — see the `submitState`
// assertion below), so trying it first was pure latency. Benchmark and
// status: `.ecc/benchmarks/e2e-engines-2026-08-31.json`.
//
// The engine list is still a loop, so re-testing a newer lightpanda nightly
// is `E2E_ENGINES=lightpanda,chrome bun run test:e2e`: each engine gets a
// fresh seed and the full flow, on ANY failure (connect error, crash, page
// error, or failed assertion) it moves to the next, and the name of the
// engine that satisfied every assertion is printed.
//
// Starts its own `next dev` on port 3100 (not 3000, so it never collides
// with another worktree's dev server checked out from the same repo) if
// one isn't already answering there, and stops it again — on both success
// and failure/interruption.
import { execFileSync, spawn, type ChildProcess } from "node:child_process";
import { loadEnv } from "vite";

// agent-browser doesn't read .env.local itself; reuse the same loader
// vitest.config.mts uses so tests-e2e's seeding via tests/helpers.ts sees
// NEXT_PUBLIC_SUPABASE_URL etc., and so the spawned `next dev` inherits it.
Object.assign(process.env, loadEnv("", process.cwd(), ""));

const PORT = 3100;
const BASE_URL = `http://localhost:${PORT}`;
const SESSION_PREFIX = `portal-smoke-${process.pid}`;

type Engine = "lightpanda" | "chrome";
type AbResult = { success: boolean; data: unknown; error: string | null };

/** Run one agent-browser command against `session`, returning its `data` on success and throwing on any failure (non-zero exit, `success:false`, or non-JSON output). */
function ab(session: string, args: string[], engine?: Engine): unknown {
  const engineArgs = engine ? ["--engine", engine] : [];
  const argv = ["agent-browser", "--session", session, ...engineArgs, ...args, "--json"];
  let out: string;
  try {
    out = execFileSync("bunx", argv, { encoding: "utf8", timeout: 35000, stdio: ["ignore", "pipe", "pipe"] });
  } catch (err) {
    // execFileSync throws on non-zero exit; agent-browser still writes its
    // JSON error envelope to stdout in that case, so surface it if we can.
    const stdout = (err as { stdout?: string }).stdout;
    let message = err instanceof Error ? err.message : String(err);
    if (stdout) {
      try {
        const parsed = JSON.parse(stdout) as AbResult;
        if (parsed.error) message = parsed.error;
      } catch {
        // stdout wasn't JSON (e.g. the bunx/spawn error itself); keep the raw message
      }
    }
    throw new Error(`agent-browser ${args.join(" ")} failed: ${message}`);
  }
  let parsed: AbResult;
  try {
    parsed = JSON.parse(out);
  } catch {
    throw new Error(`agent-browser ${args.join(" ")} produced non-JSON output: ${out.slice(0, 500)}`);
  }
  if (!parsed.success) {
    throw new Error(`agent-browser ${args.join(" ")} failed: ${parsed.error}`);
  }
  return parsed.data;
}

function closeSession(session: string) {
  try {
    execFileSync("bunx", ["agent-browser", "--session", session, "close", "--json"], {
      encoding: "utf8",
      timeout: 15000,
      stdio: ["ignore", "pipe", "pipe"],
    });
  } catch {
    // best-effort cleanup; the daemon's own idle timeout reaps it otherwise
  }
}

/** Seeds a brewery/warehouse/product/sku/price-list/customer/ship-to/inventory + a customer-portal login, mirroring the old Playwright spec's beforeAll. */
async function seed() {
  const { admin, makeBrewery, makeStaffCtx, makeCustomerUser } = await import("../tests/helpers");

  const b = await makeBrewery();
  const staff = await makeStaffCtx(b.id, "admin");
  await admin.from("locations").insert({ brewery_id: b.id, name: "WH", kind: "warehouse" });
  const { data: p } = await admin.from("products").insert({ brewery_id: b.id, name: "IPA" }).select().single();
  const { data: s } = await admin
    .from("skus")
    .insert({ brewery_id: b.id, product_id: p!.id, name: "IPA case", package_type: "can", bbl_per_unit: 0.0645 })
    .select()
    .single();
  const { data: pl } = await admin.from("price_lists").insert({ brewery_id: b.id, name: "std" }).select().single();
  await admin
    .from("price_list_items")
    .insert({ brewery_id: b.id, price_list_id: pl!.id, sku_id: s!.id, unit_price_cents: 3600 });
  const { data: c } = await admin
    .from("customers")
    .insert({ brewery_id: b.id, name: "Bar", type: "retailer", state: "PA", price_list_id: pl!.id })
    .select()
    .single();
  await admin
    .from("ship_tos")
    .insert({ brewery_id: b.id, customer_id: c!.id, label: "Main", address1: "1 Main St", city: "Philadelphia", state: "PA", zip: "19100" });
  const { data: loc } = await admin.from("locations").select("id").eq("brewery_id", b.id).eq("kind", "warehouse").single();
  await admin.from("breweries").update({ portal_fulfillment_location_id: loc!.id }).eq("id", b.id);
  await admin.from("inventory_movements").insert({
    brewery_id: b.id,
    sku_id: s!.id,
    location_id: loc!.id,
    qty: 100,
    bbl: 100 * 0.0645,
    type: "production_in",
    created_by: staff.userId,
  });
  const custUser = await makeCustomerUser(c!.id);
  return { customerEmail: custUser.email, skuName: s!.name as string };
}

/** Drives the full login → shop → submit → orders flow on `session`/`engine`, throwing on the first failed step or failed assertion. */
function runFlow(session: string, engine: Engine, customerEmail: string, skuName: string) {
  ab(session, ["open", `${BASE_URL}/login`], engine);
  ab(session, ["find", "label", "Email", "fill", customerEmail]);
  ab(session, ["find", "label", "Password", "fill", "test-password-1"]);
  ab(session, ["find", "role", "button", "click", "--name", "Sign in"]);
  ab(session, ["wait", "--url", "**/portal"]);
  ab(session, ["wait", "--text", "Shop"]);

  const catalogRow = ab(session, ["get", "text", "table tbody tr"]) as { text: string };
  if (!catalogRow.text.includes(skuName)) {
    throw new Error(`catalog row missing seeded sku "${skuName}": ${JSON.stringify(catalogRow)}`);
  }

  ab(session, ["fill", "table tbody tr input[type=number]", "2"]);
  ab(session, ["find", "label", "Ship to", "click"]);
  ab(session, ["find", "role", "option", "click", "--name", "Main"]);

  // Real assertion, not just "the click didn't error": confirm the cart's
  // React state actually picked up the qty fill and ship-to selection
  // (Submit order is disabled until both are set) before clicking it — this
  // is what catches Lightpanda's fill not propagating to React, instead of
  // discovering it 25s later via a `wait --url` timeout.
  const submitState = ab(session, [
    "eval",
    "(() => { const b = Array.from(document.querySelectorAll('button')).find(x => x.textContent.trim() === 'Submit order'); return b ? !b.disabled : null; })()",
  ]) as { result: boolean | null };
  if (submitState.result !== true) {
    throw new Error(`Submit order button still disabled after filling qty + ship-to (cart state didn't update): ${JSON.stringify(submitState)}`);
  }

  ab(session, ["find", "role", "button", "click", "--name", "Submit order"]);
  try {
    ab(session, ["wait", "--url", "**/portal/orders/*"]);
  } catch (err) {
    const page = ab(session, ["get", "text", "body"]) as { text: string };
    throw new Error(`${err instanceof Error ? err.message : String(err)}; page: ${page.text.slice(-1000)}`);
  }

  ab(session, ["find", "role", "link", "click", "--name", "Orders"]);
  ab(session, ["wait", "--url", "**/portal/orders"]);

  const orderRow = ab(session, ["get", "text", "tbody tr"]) as { text: string };
  if (!orderRow.text.includes("submitted")) {
    throw new Error(`orders list did not show "submitted": ${JSON.stringify(orderRow)}`);
  }
}

async function isServerUp(): Promise<boolean> {
  try {
    const res = await fetch(`${BASE_URL}/login`, { signal: AbortSignal.timeout(2000) });
    return res.status < 500;
  } catch {
    return false;
  }
}

async function waitForServer(timeoutMs = 60000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (await isServerUp()) return;
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`next dev did not become ready on ${BASE_URL} within ${timeoutMs}ms`);
}

function startDevServer(): ChildProcess {
  // detached so the process group (bun + the `next` it spawns) can be
  // killed together via a negative pid, instead of leaking `next`'s child.
  const child = spawn("bun", ["run", "dev", "--", "-p", String(PORT)], {
    stdio: ["ignore", "pipe", "pipe"],
    detached: true,
  });
  child.stdout?.on("data", () => {});
  child.stderr?.on("data", () => {});
  return child;
}

function stopDevServer(child: ChildProcess) {
  if (child.pid) {
    try {
      process.kill(-child.pid, "SIGTERM");
    } catch {
      // already dead
    }
  }
}

async function main() {
  let dev: ChildProcess | null = null;
  const cleanup = () => {
    if (dev) stopDevServer(dev);
  };
  process.on("SIGINT", () => {
    cleanup();
    process.exit(130);
  });
  process.on("SIGTERM", () => {
    cleanup();
    process.exit(143);
  });

  let passedEngine: Engine | null = null;
  let lastError: unknown = null;

  try {
    if (await isServerUp()) {
      console.log(`[test:e2e] reusing server already running at ${BASE_URL}`);
    } else {
      console.log(`[test:e2e] starting next dev on port ${PORT}...`);
      dev = startDevServer();
      await waitForServer();
    }

    // Chrome-only by default: lightpanda's nightly can't drive React
    // controlled inputs yet (see .ecc/benchmarks/e2e-engines-2026-08-31.json),
    // so the attempt is pure overhead. E2E_ENGINES=lightpanda,chrome re-enables
    // the fallback chain for re-testing newer nightlies.
    // ?? only covers undefined: E2E_ENGINES="" yielded [""] and the suite ran once
    // against a nameless engine, failing deep inside agent-browser. Trim too, so
    // "lightpanda, chrome" does not pass " chrome".
    const engines = (process.env.E2E_ENGINES || "chrome")
      .split(",")
      .map((e) => e.trim())
      .filter(Boolean) as Engine[];
    for (const engine of engines) {
      console.log(`[test:e2e] trying engine: ${engine}`);
      const session = `${SESSION_PREFIX}-${engine}`;
      try {
        // Fresh seed per attempt: a partially-completed prior attempt can
        // never leave state (e.g. a submitted order) for this one to trip
        // over or false-positive on.
        const { customerEmail, skuName } = await seed();
        runFlow(session, engine, customerEmail, skuName);
        passedEngine = engine;
        closeSession(session);
        break;
      } catch (err) {
        lastError = err;
        console.error(`[test:e2e] ${engine} engine failed: ${err instanceof Error ? err.message : String(err)}`);
        closeSession(session);
      }
    }
  } finally {
    cleanup();
  }

  if (!passedEngine) {
    console.error(
      `[test:e2e] FAILED — every engine failed. Last error: ${lastError instanceof Error ? lastError.message : String(lastError)}`
    );
    process.exitCode = 1;
    return;
  }

  console.log(`[test:e2e] PASSED using engine: ${passedEngine}`);
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
