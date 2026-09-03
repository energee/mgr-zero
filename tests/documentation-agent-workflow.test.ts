import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

describe("documentation agent workflow", () => {
  it("runs only for main merges and publishes from fresh main", () => {
    const workflow = readFileSync(".github/workflows/documentation-agent.yml", "utf8");

    expect(workflow).toContain("github.event.pull_request.base.ref == 'main'");
    expect(workflow).toContain("ref: main\n          token:");
    expect(workflow).toContain("git checkout -B documentation/user-guide");
  });
});
