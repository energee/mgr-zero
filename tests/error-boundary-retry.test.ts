// tests/error-boundary-retry.test.ts — "Try again" on the error pages must
// re-fetch the server render (#445). In Next 16.3 `retry` re-runs the server
// render; `reset` only re-renders the children the server already sent, which
// throw again.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("error boundaries retry instead of reset", () => {
  for (const file of ["app/(app)/error.tsx", "app/(portal)/error.tsx"]) {
    it(file, () => {
      const source = readFileSync(file, "utf8");
      expect(source).toMatch(/\{ retry \}: \{ retry: \(\) => void \}/);
      expect(source).toContain("onClick={() => retry()}");
      expect(source).not.toMatch(/\{ reset \}|onClick=\{reset\}/);
    });
  }
});
