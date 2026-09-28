import { expect, it } from "vitest";
import { canRetireMaterialCountFailure } from "@/lib/mgr/cycle-count-view";

it("releases an uncertain count after a replay-first stale-plan refusal", () => {
  expect(canRetireMaterialCountFailure(409, true, "conflict", "Material stock changed. Preview the count again.")).toBe(true);
});

it("keeps uncertain counts frozen for refusals that do not prove rollback", () => {
  for (const [status, code, message] of [
    [409, "conflict", "requestId was already used for different input"],
    [409, "context_changed", "Material stock changed. Preview the count again."],
    [503, "unavailable", "Material stock changed. Preview the count again."],
    [403, "forbidden", "Permission denied"],
  ] as const) expect(canRetireMaterialCountFailure(status, true, code, message)).toBe(false);
  expect(canRetireMaterialCountFailure(400, false, "invalid_input", "Invalid quantity")).toBe(true);
});
