// tests/api-backlog-empty.test.ts — the backlog file when every operation a
// screen declares is built (#1823). The HTTP API agent's `git diff --check`
// rejects a blank line at the end of a file, so an empty backlog must not
// leave one.
import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/mgr/api-operations", async (original) => ({
  ...(await original<typeof import("@/lib/mgr/api-operations")>()),
  apiOperations: () => [],
  operationsInArea: () => [],
}));

import { renderBacklog } from "@/lib/mgr/api-reference";

describe("an empty API backlog", () => {
  it("ends with one newline, not a blank line", () => {
    const backlog = renderBacklog();
    expect(backlog).toContain("0 operations the screens declare");
    expect(backlog.endsWith("\n")).toBe(true);
    expect(backlog.endsWith("\n\n")).toBe(false);
  });
});
