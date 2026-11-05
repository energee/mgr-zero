// scripts/dev.sh gives each checkout its own fixed `next dev` port. git and next
// are stubbed on PATH, so this never touches a real repository or starts a server.
import { execFileSync } from "node:child_process";
import { chmodSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";

const bin = mkdtempSync(join(tmpdir(), "dev-port-"));
for (const [name, body] of [["git", 'echo "$FAKE_ROOT"'], ["next", 'echo "$PORT $*"']] as const) {
  writeFileSync(join(bin, name), `#!/bin/sh\n${body}\n`);
  chmodSync(join(bin, name), 0o755);
}
afterAll(() => rmSync(bin, { recursive: true }));

const dev = (root: string, env: Record<string, string> = {}, args: string[] = []) =>
  execFileSync("bash", ["scripts/dev.sh", ...args], {
    encoding: "utf8",
    env: { NODE_ENV: "test", PATH: `${bin}:${process.env.PATH}`, FAKE_ROOT: root, ...env },
  }).trim();

describe("scripts/dev.sh", () => {
  it("keeps 3000 for the main checkout", () => {
    expect(dev("/repos/mgr-zero")).toBe("3000 dev");
  });

  it("gives a worktree the same port every run", () => {
    const root = "/repos/mgr-zero/.agents/worktrees/feat-x";
    expect(dev(root)).toBe("3847 dev");
    expect(dev(root)).toBe("3847 dev");
    expect(dev("/repos/mgr-zero/.agents/worktrees/fix-issue-1665")).toBe("3334 dev");
  });

  it("lets an explicit PORT win and passes arguments through to next dev", () => {
    expect(dev("/repos/mgr-zero/.agents/worktrees/feat-x", { PORT: "4100" }, ["--turbopack"])).toBe("4100 dev --turbopack");
  });
});
