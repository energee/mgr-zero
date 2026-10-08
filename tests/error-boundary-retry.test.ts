// tests/error-boundary-retry.test.ts — every route group has an error page
// (#762), each renders the one shared body, and its "Try again" re-fetches the
// server render (#445). In Next 16.3 `retry` re-runs the server render; `reset`
// only re-renders the children the server already sent, which throw again.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("error boundaries", () => {
  it("the shared body retries instead of resetting", () => {
    const source = readFileSync("components/mgr/route-error.tsx", "utf8");
    expect(source).toMatch(/\{ retry \}: \{ retry: \(\) => void \}/);
    expect(source).toContain("onClick={() => retry()}");
    expect(source).not.toMatch(/\{ reset \}|onClick=\{reset\}/);
  });

  // app/error.tsx covers (auth), which has no layout and so no boundary of its own.
  for (const file of ["app/error.tsx", "app/(app)/error.tsx", "app/(portal)/error.tsx"]) {
    it(`${file} renders the shared body`, () => {
      const source = readFileSync(file, "utf8");
      expect(source).toContain('from "@/components/mgr/route-error"');
    });
  }
});
