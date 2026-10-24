import { expect, it } from "vitest";
import { makeBrewery, makeStaffCtx } from "./helpers";
import { runCommand } from "@/lib/commands/registry";
import "@/lib/commands/chat";

it.each(["US/Eastern", "Etc/UTC"])("replays a personal quiet-hours request committed with timezone alias %s", async timezone => {
  const ctx = await makeStaffCtx((await makeBrewery()).id);
  const execution = { requestId: crypto.randomUUID(), correlationId: crypto.randomUUID() };
  // Seed the payload exactly as the command submitted it before client validation was added.
  const committed = await ctx.db.rpc("set_personal_quiet_hours", {
    p_brewery: ctx.breweryId, p_request_id: execution.requestId,
    p_start: "22:00", p_end: "06:00", p_timezone: timezone,
  });
  expect(committed.error).toBeNull();
  await runCommand("set_personal_quiet_hours", { start: "23:00", end: "07:00", timezone: "America/New_York" }, ctx);
  await expect(runCommand("set_personal_quiet_hours", { start: "22:00", end: "06:00", timezone }, ctx, execution)).resolves.toEqual(committed.data);
  expect(await runCommand("get_notification_preferences", {}, ctx)).toMatchObject({ quietStart: "23:00:00", quietEnd: "07:00:00", timezone: "America/New_York" });
});

it.each(["US/Eastern", "Etc/UTC"])("replays a preference override committed with timezone alias %s", async timezone => {
  const ctx = await makeStaffCtx((await makeBrewery()).id);
  const execution = { requestId: crypto.randomUUID(), correlationId: crypto.randomUUID() };
  const committed = await ctx.db.rpc("set_notification_preference", {
    p_brewery: ctx.breweryId, p_request_id: execution.requestId,
    p_reason: "pick_due", p_enabled: true, p_set_quiet: true,
    p_quiet_start: "22:00", p_quiet_end: "06:00", p_quiet_tz: timezone,
  });
  expect(committed.error).toBeNull();
  await runCommand("set_notification_preference", { reason: "pick_due", enabled: false, quietHours: { start: "23:00", end: "07:00", timezone: "America/New_York" } }, ctx);
  await expect(runCommand("set_notification_preference", {
    reason: "pick_due", enabled: true, quietHours: { start: "22:00", end: "06:00", timezone },
  }, ctx, execution)).resolves.toEqual(committed.data);
  expect(await runCommand("get_notification_preferences", {}, ctx)).toMatchObject({
    quietStart: "23:00:00", quietEnd: "07:00:00", timezone: "America/New_York",
    preferences: expect.arrayContaining([expect.objectContaining({ reason: "pick_due", enabled: false })]),
  });
});
