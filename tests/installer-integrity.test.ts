// Gates the Bun lockfile integrity boundary used for the bundled agent-browser CLI.
// Local synthetic registry only: no external registry or provider calls.
import { spawn, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync, existsSync } from "node:fs";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

function install(cwd: string, cache: string) {
  return new Promise<{ code: number | null; output: string }>((resolve, reject) => {
    const child = spawn("bun", ["install", "--frozen-lockfile", "--cache-dir", cache], {
      cwd,
      env: { ...process.env, BUN_INSTALL_CACHE_DIR: cache },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let output = "";
    child.stdout.on("data", (chunk) => { output += chunk; });
    child.stderr.on("data", (chunk) => { output += chunk; });
    child.on("error", reject);
    child.on("close", (code) => resolve({ code, output }));
  });
}

describe("locked installer distribution", () => {
  it("installs a verified artifact without its hook and rejects a substituted tarball", async () => {
    const root = mkdtempSync(join(tmpdir(), "mgr-integrity-"));
    const source = join(root, "source");
    const project = join(root, "project");
    mkdirSync(join(source, "package"), { recursive: true });
    mkdirSync(project);
    const manifest = {
      name: "mgr-provenance-fixture", version: "1.0.0",
      scripts: { postinstall: "node -e \"require('fs').writeFileSync('hook-ran', 'yes')\"" },
    };
    writeFileSync(join(source, "package", "package.json"), JSON.stringify(manifest));
    writeFileSync(join(source, "package", "binary"), "reviewed native artifact");
    const archive = join(root, "fixture.tgz");
    const pack = () => {
      const result = spawnSync("tar", ["-czf", archive, "-C", source, "package"], { encoding: "utf8" });
      if (result.status !== 0) throw new Error(result.stderr);
      return readFileSync(archive);
    };
    const verified = pack();
    const integrity = `sha512-${createHash("sha512").update(verified).digest("base64")}`;
    let artifact = verified;
    let downloads = 0;
    const server = createServer((request, response) => {
      if (request.url === "/fixture.tgz") {
        downloads++;
        response.end(artifact);
      } else {
        response.writeHead(404).end();
      }
    });
    try {
      await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
      const address = server.address();
      if (!address || typeof address === "string") throw new Error("No local registry address");
      const url = `http://127.0.0.1:${address.port}/fixture.tgz`;
      writeFileSync(join(project, "package.json"), JSON.stringify({
        name: "integrity-test", dependencies: { "mgr-provenance-fixture": url },
        trustedDependencies: [],
      }));
      // Same lock format and recorded integrity as the real agent-browser entry.
      writeFileSync(join(project, "bun.lock"), JSON.stringify({
        lockfileVersion: 1, configVersion: 1,
        workspaces: { "": { name: "integrity-test", dependencies: { "mgr-provenance-fixture": url } } },
        packages: { "mgr-provenance-fixture": [`mgr-provenance-fixture@${url}`, {}, integrity] },
      }));
      const good = await install(project, join(root, "good-cache"));
      expect(good.code, good.output).toBe(0);
      const installed = join(project, "node_modules", "mgr-provenance-fixture");
      expect(readFileSync(join(installed, "binary"), "utf8")).toBe("reviewed native artifact");
      expect(existsSync(join(installed, "hook-ran"))).toBe(false);
      rmSync(join(project, "node_modules"), { recursive: true });
      writeFileSync(join(source, "package", "binary"), "substituted native artifact");
      artifact = pack();
      const tampered = await install(project, join(root, "tampered-cache"));
      expect(downloads).toBe(2);
      expect(tampered.code, tampered.output).not.toBe(0);
      expect(tampered.output).toMatch(/integrity|checksum/i);
      expect(existsSync(join(installed, "binary"))).toBe(false);
    } finally {
      await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
      rmSync(root, { recursive: true, force: true });
    }
  }, 30_000);
});
