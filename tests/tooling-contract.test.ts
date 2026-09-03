// tests/tooling-contract.test.ts — locks the production runtime, framework patch, and ESM Vitest configuration.
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = resolve(__dirname, "..");
const packageJson = JSON.parse(
  readFileSync(resolve(root, "package.json"), "utf8")
) as {
  engines?: { node?: string };
  packageManager?: string;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
};

describe("production tooling contract", () => {
  it("pins the Node 22 runtime across local and package metadata", () => {
    expect(readFileSync(resolve(root, ".node-version"), "utf8").trim()).toBe("22");
    expect(packageJson.engines?.node).toBe("22.x");
  });

  it("uses Bun as the package manager and pins its version", () => {
    expect(packageJson.packageManager).toMatch(/^bun@1\./);
    expect(readFileSync(resolve(root, ".bun-version"), "utf8").trim()).toBe("1.3.10");
    expect(existsSync(resolve(root, "bun.lock"))).toBe(true);
    expect(existsSync(resolve(root, "package-lock.json"))).toBe(false);
    expect(existsSync(resolve(root, "pnpm-lock.yaml"))).toBe(false);
    expect(existsSync(resolve(root, "pnpm-workspace.yaml"))).toBe(false);
    expect(existsSync(resolve(root, "yarn.lock"))).toBe(false);
  });

  it("does not mention pnpm in tracked project files", () => {
    const result = spawnSync(
      "git",
      [
        "grep",
        "-I",
        "-n",
        "pnpm",
        "--",
        ".",
        ":!bun.lock",
        ":!tests/tooling-contract.test.ts",
        ":!tests/workflow-contract.test.ts",
      ],
      { cwd: root, encoding: "utf8" }
    );

    // git grep exits 1 when it finds nothing; anything else (or a spawn failure)
    // would leave stdout empty and pass the assertion without checking anything.
    expect(result.error).toBeUndefined();
    expect([0, 1]).toContain(result.status);
    expect(result.stdout).toBe("");
  });

  it("pins the Next.js framework and lint preset to the approved patch", () => {
    expect(packageJson.dependencies?.next).toBe("16.3.4");
    expect(packageJson.devDependencies?.["eslint-config-next"]).toBe("16.3.4");
  });

  it("uses Next's compiler-owned server marker without a standalone dependency", () => {
    expect(packageJson.dependencies?.["server-only"]).toBeUndefined();
    expect(packageJson.devDependencies?.["server-only"]).toBeUndefined();
    const bunLock = readFileSync(resolve(root, "bun.lock"), "utf8");
    expect(bunLock).not.toMatch(/"server-only"\s*:/);
  });

  it("loads an ESM-safe Vitest configuration with Next's server marker implementation", () => {
    const config = readFileSync(resolve(root, "vitest.config.mts"), "utf8");

    expect(existsSync(resolve(root, "vitest.config.mts"))).toBe(true);
    expect(existsSync(resolve(root, "vitest.config.ts"))).toBe(false);
    expect(config).toContain('import { fileURLToPath } from "node:url"');
    expect(config).toContain('new URL(".", import.meta.url)');
    expect(config).not.toContain("__dirname");
    expect(config).toContain("next/dist/compiled/server-only/empty.js");
  });

  it("resolves the server marker to Next's empty implementation", async () => {
    // Dynamic import exercises Vitest's runtime alias for the compiler marker.
    const marker = await import("server-only");

    expect(marker.default).toEqual({});
  });
});
