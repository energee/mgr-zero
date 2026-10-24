import { describe, expect, it } from "vitest";
import { z } from "zod";
import "@/lib/commands/chat";
import { getCommandDefinition, runCommand, type Ctx } from "@/lib/commands/registry";
import { sampleInput } from "@/lib/mgr/api-schema";

const installationId = "c1fd34ef-bb45-4f64-bff6-6a78d16129cc";
// Invalid inputs must fail before a database client is needed.
const ctx: Ctx = { db: null as unknown as Ctx["db"], userId: "staff", breweryId: "brewery", roles: ["admin"] };
const cases = [
  { start: "22:00", end: "22:00", message: "End must differ from start", field: "end" },
  { start: "22:00", end: null, message: "Choose an end time", field: "end" },
  { start: null, end: "06:00", message: "Choose a start time", field: "start" },
];

describe("quiet hours command validation", () => {
  for (const name of ["set_personal_quiet_hours", "set_brewery_quiet_hours"]) {
    it.each(cases)(`${name} rejects $start to $end before RPC`, async ({ start, end, message, field }) => {
      const input = { start, end, installationId };
      const parsed = getCommandDefinition(name)!.input.safeParse(input);
      expect(parsed.success).toBe(false);
      if (!parsed.success) expect(parsed.error.issues).toContainEqual(expect.objectContaining({ path: [field], message }));
      await expect(runCommand(name, input, ctx)).rejects.toMatchObject({ status: 400, code: "invalid_input" });
    });

    it(`${name} accepts overnight windows and clearing both times`, () => {
      const schema = getCommandDefinition(name)!.input;
      expect(schema.safeParse({ installationId, start: "22:00", end: "06:00" }).success).toBe(true);
      expect(schema.safeParse({ installationId, start: null, end: null }).success).toBe(true);
      expect(schema.safeParse({ installationId, start: "24:00", end: "06:00" }).success).toBe(false);
    });
  }

  it.each(["Mars/Phobos", "", "+05:00"])("rejects invalid timezone %j before RPC", async timezone => {
    const input = { start: "22:00", end: "06:00", timezone };
    const parsed = getCommandDefinition("set_personal_quiet_hours")!.input.safeParse(input);
    expect(parsed.success).toBe(false);
    if (!parsed.success) expect(parsed.error.issues).toContainEqual(expect.objectContaining({ path: ["timezone"], message: "Choose a valid timezone" }));
    await expect(runCommand("set_personal_quiet_hours", input, ctx)).rejects.toMatchObject({ status: 400, code: "invalid_input" });
  });

  it.each(["America/New_York", "US/Eastern", "UTC", "Etc/UTC", "Asia/Calcutta", "Etc/GMT+5"])("preserves the exact IANA zone or alias %s", timezone => {
    const parsed = getCommandDefinition("set_personal_quiet_hours")!.input.safeParse({ start: "22:00", end: "06:00", timezone });
    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data).toMatchObject({ timezone });
  });

  it("validates per-reason quiet overrides using the same rules", () => {
    const schema = getCommandDefinition("set_notification_preference")!.input;
    for (const quietHours of [
      { start: "22:00", end: "22:00" },
      { start: "22:00", end: "06:00", timezone: "Mars/Phobos" },
    ]) expect(schema.safeParse({ reason: "pick_due", enabled: true, quietHours }).success).toBe(false);
    expect(schema.safeParse({ reason: "pick_due", enabled: true, quietHours: null }).success).toBe(true);
    expect(schema.safeParse({ reason: "pick_due", enabled: true, quietHours: { start: "22:00", end: "06:00", timezone: "US/Eastern" } }).success).toBe(true);
  });
});

it.each(["set_personal_quiet_hours", "set_brewery_quiet_hours"])("generates a valid %s API example for paired nullable times", name => {
  const schema = getCommandDefinition(name)!.input;
  const example = sampleInput(schema);
  expect(example).toMatchObject({ start: null, end: null });
  expect(schema.safeParse(example).success).toBe(true);
});

it("preserves an already-valid non-null API example", () => {
  const schema = z.object({ note: z.string().nullable() });
  expect(sampleInput(schema)).toEqual({ note: "string" });
});
