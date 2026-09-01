// tests/tooling-contract.test.ts — locks the production runtime, framework patch, and ESM Vitest configuration.
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = resolve(__dirname, "..");
const packageJson = JSON.parse(
  readFileSync(resolve(root, "package.json"), "utf8")
) as {
  engines?: { node?: string };
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
};
const packageLock = JSON.parse(
  readFileSync(resolve(root, "package-lock.json"), "utf8")
) as {
  packages?: Record<string, { dependencies?: Record<string, string> }>;
};

describe("production tooling contract", () => {
  it("pins the Node 22 runtime across local and package metadata", () => {
    expect(readFileSync(resolve(root, ".node-version"), "utf8").trim()).toBe("22");
    expect(packageJson.engines?.node).toBe("22.x");
  });

  it("pins the Next.js framework and lint preset to the approved patch", () => {
    expect(packageJson.dependencies?.next).toBe("16.3.4");
    expect(packageJson.devDependencies?.["eslint-config-next"]).toBe("16.3.4");
  });

  it("uses Next's compiler-owned server marker without a standalone dependency", () => {
    expect(packageJson.dependencies?.["server-only"]).toBeUndefined();
    expect(packageLock.packages?.[""]?.dependencies?.["server-only"]).toBeUndefined();
    expect(packageLock.packages?.["node_modules/server-only"]).toBeUndefined();
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
