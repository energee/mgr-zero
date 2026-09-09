import assert from "node:assert/strict";
import { execFileSync, spawn } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { loadEnv } from "vite";
Object.assign(process.env, loadEnv("test", process.cwd(), ""));
assert.equal(process.env.MGR_TEST_STACK, "1");
assert.equal(new URL(process.env.NEXT_PUBLIC_SUPABASE_URL!).port, "54351");
const PORT = 3104;
const BASE = `http://localhost:${PORT}`;
const SHOTS = "/tmp/mgr-remainder-evidence";
mkdirSync(SHOTS, { recursive: true });
function ab(...args: string[]) {
  const result = JSON.parse(execFileSync("bunx", ["agent-browser", "--session", "taproom-intervals", ...args, "--json"], { encoding: "utf8", timeout: 35000, stdio: ["ignore", "pipe", "pipe"] }));
  assert(result.success, result.error);
  return result.data as { result?: unknown; text?: string };
}
function noOverflow() {
  assert.equal(ab("eval", "document.documentElement.scrollWidth <= document.documentElement.clientWidth").result, true);
}
async function main() {
  const { makeBrewery, makeStaff, asUser, seedCatalog, seedLocation, sql } = await import("../tests/helpers");
  const { runCommand } = await import("../lib/commands/registry");
  await import("../lib/commands/all");
  const brewery = await makeBrewery("Exact reversal browser");
  const staff = await makeStaff(brewery.id);
  const sales = await makeStaff(brewery.id, "sales");
  const ctx = { db: await asUser(staff.email), userId: staff.id, breweryId: brewery.id, role: "admin" as const };
  const cat = await seedCatalog(brewery.id, { sku: "Browser exact keg", packageType: "keg", bblPerUnit: 0.5 });
  const loc = await seedLocation(brewery.id);
  const originals: string[] = [];
  for (const [qty, type] of [[5, "adjustment"], [-1, "loss"]] as const) {
    const row = await runCommand("record_movement", { skuId: cat.skuId, locationId: loc.id, binId: loc.binId, qty, type }, ctx) as { id: string };
    originals.push(row.id);
  }
  // Restore enough exact stock for the positive-adjustment reversal.
  await runCommand("record_movement", { skuId: cat.skuId, locationId: loc.id, binId: loc.binId, qty: 1, type: "opening_balance" }, ctx);
  const server = spawn("bun", ["run", "dev", "--", "-p", String(PORT)], { detached: true, env: process.env, stdio: ["ignore", "pipe", "pipe"] });
  let serverLog = "";
  server.stdout?.on("data", data => { serverLog += data.toString(); });
  server.stderr?.on("data", data => { serverLog += data.toString(); });
  const login = (email: string) => {
    ab("open", `${BASE}/login`); ab("snapshot", "-i");
    ab("find", "label", "Email", "fill", email);
    ab("find", "label", "Password", "fill", "test-password-1");
    ab("find", "role", "button", "click", "--name", "Sign in");
    ab("wait", "--url", "**/");
  };
  try {
    const until = Date.now() + 60000;
    let ready = false;
    while (Date.now() < until) {
      try { if ((await fetch(`${BASE}/login`)).status < 500) { ready = true; break; } } catch { /* server starting */ }
      await new Promise(r => setTimeout(r, 500));
    }
    assert(ready, "server did not start");
    assert(serverLog.includes(`localhost:${PORT}`), "verify owned server port");
    login(staff.email);
    ab("open", `${BASE}/inventory`); ab("snapshot", "-i");
    ab("find", "role", "link", "click", "--name", "Review", "--exact");
    ab("wait", "--url", `**/inventory/${cat.skuId}`);
    for (const [index, width] of [1440, 375].entries()) {
      ab("set", "viewport", String(width), "900"); ab("snapshot", "-i"); noOverflow();
      ab("screenshot", `${SHOTS}/reversal-${width}-detail.png`, "--full");
      ab("click", `#movement-${originals[index]} button`); ab("snapshot", "-i");
      ab("find", "label", "Correction note", "fill", `Browser exact ${width}`);
      noOverflow(); ab("screenshot", `${SHOTS}/reversal-${width}-form.png`, "--full");
      ab("find", "role", "button", "click", "--name", "Confirm reversal", "--exact");
      ab("wait", `#movement-${originals[index]} a`); ab("snapshot", "-i");
      const readback = sql(`select qty||':'||bbl||':'||package_type||':'||coalesce(lot_id::text,'NULL')||':'||bin_id from inventory_movements where compensates_id='${originals[index]}'`);
      assert.equal(readback.length, 1);
      assert(readback[0].startsWith(index ? "1.00:0.50000000:keg:NULL:" : "-5.00:-2.50000000:keg:NULL:"));
      assert(readback[0].endsWith(loc.binId));
      writeFileSync(`${SHOTS}/reversal-${width}-readback.txt`, readback.join("\n"));
    }
    ab("click", `#movement-${originals[0]} a`); ab("snapshot", "-i");
    assert((ab("get", "text", "body").text ?? "").includes("Original movement"));
    ab("close"); login(sales.email);
    ab("open", `${BASE}/inventory/${cat.skuId}`); ab("snapshot", "-i");
    assert.equal(ab("eval", "Array.from(document.querySelectorAll('button')).some(b=>b.textContent==='Reverse movement')").result, false);
    noOverflow(); ab("screenshot", `${SHOTS}/reversal-sales.png`, "--full");
    console.log("Passed desktop/phone exact reversal, linked history, Sales readonly, no overflow and SQL readback.");
  } catch (error) {
    writeFileSync(`${SHOTS}/reversal-browser-failure.txt`, JSON.stringify(ab("snapshot")));
    ab("screenshot", `${SHOTS}/reversal-browser-failure.png`, "--full");
    throw error;
  } finally {
    try { ab("close"); } catch { /* close owned browser */ }
    if (server.pid) { try { process.kill(-server.pid, "SIGTERM"); } catch { /* already stopped */ } }
    writeFileSync(`${SHOTS}/reversal-server.log`, serverLog);
  }
}
await main();
