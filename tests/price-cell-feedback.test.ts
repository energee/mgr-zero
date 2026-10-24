import { beforeEach, expect, it, vi } from "vitest";
import { Children, isValidElement, type ComponentProps, type ReactElement } from "react";
import type * as React from "react";
import { PriceCellForm } from "@/app/(app)/pricing/price-cell-form";
import { PriceCellClear, PriceCellInput } from "@/components/mgr/views/price-groups";

// Exercise the actual form callbacks and rerenders without a DOM or database.
const state = vi.hoisted(() => ({ active: false, cursor: 0, values: [] as unknown[] }));
const action = vi.hoisted(() => ({ busy: false, blocked: false, error: null as string | null, setError: vi.fn(), run: vi.fn() }));
vi.mock("react", async original => {
  const react = await original<typeof React>();
  function slot(initial: unknown) {
    const index = state.cursor++;
    if (!(index in state.values)) state.values[index] = initial;
    return [state.values[index], (next: unknown) => { state.values[index] = typeof next === "function" ? next(state.values[index]) : next; }];
  }
  return { ...react,
    useState: (initial: unknown) => state.active ? slot(initial) : react.useState(initial),
    useRef: (initial: unknown) => state.active ? slot({ current: initial })[0] : react.useRef(initial),
  };
});
vi.mock("@/lib/commands/use-command-form", () => ({ useCommandAction: () => action }));

const ids = { saleChannelId: "channel", priceGroupId: "group", formatId: "format" };
function cell(value: string | null = "7.00") {
  state.active = true;
  state.cursor = 0;
  try { return PriceCellForm({ ...ids, value, groupName: "Core", formatName: "Pint", channelName: "Taproom" }); }
  finally { state.active = false; }
}
function clearOf(view: ReactElement<ComponentProps<typeof PriceCellInput>>) {
  return Children.toArray(view.props.children).find(child => isValidElement(child) && child.type === PriceCellClear) as ReactElement<ComponentProps<typeof PriceCellClear>> | undefined;
}
beforeEach(() => {
  state.values = [];
  action.busy = false;
  action.blocked = false;
  action.error = null;
  action.setError.mockReset().mockImplementation((error: string | null) => { action.error = error; });
  action.run.mockReset().mockImplementation(async (_name: string, _input: unknown, onSuccess?: () => void) => { onSuccess?.(); return true; });
});

it("restores a blank edit with an explanation and leaves removal behind explicit confirmation", async () => {
  expect(cell().type).toBe(PriceCellInput);
  cell().props.onChange!("");
  await cell().props.onCommit!();
  const restored = cell();
  expect(restored.props.value).toBe("7.00");
  expect(restored.props.status).toBe("Price unchanged. Use Clear and confirm to remove it.");
  expect(action.run).not.toHaveBeenCalled();
  expect(clearOf(restored)?.props.onDelete).toBeTypeOf("function");
  await clearOf(restored)!.props.onDelete!();
  expect(action.run).toHaveBeenCalledWith("clear_channel_price", ids, expect.any(Function));
  expect(cell().props).toMatchObject({ value: "", status: "Saved" });
  expect(clearOf(cell())).toBeUndefined();
});

it.each(["-5", "abc", "1e3", "1.001"])("retains invalid %s and reports it inline without dispatch", async text => {
  cell().props.onChange!(text);
  await cell().props.onCommit!();
  expect(cell().props.value).toBe(text);
  expect(cell().props.error).toContain("non-negative price with at most two decimal places");
  expect(action.run).not.toHaveBeenCalled();
});

it("shows Saving then Saved for zero, locks duplicate commits, and retains confirmation through refresh", async () => {
  const response = Promise.withResolvers<boolean>();
  let complete!: () => void;
  action.run.mockImplementation((_name: string, _input: unknown, onSuccess: () => void) => {
    complete = () => { onSuccess(); response.resolve(true); };
    return response.promise;
  });
  cell().props.onChange!("0");
  const save = cell().props.onCommit!();
  expect(cell().props.status).toBe("Saving…");
  await cell().props.onCommit!();
  expect(action.run).toHaveBeenCalledTimes(1);
  expect(action.run).toHaveBeenCalledWith("set_channel_price", { ...ids, unitPriceCents: 0 }, expect.any(Function));
  complete();
  await save;
  expect(cell().props).toMatchObject({ value: "0.00", status: "Saved" });
  cell("0.00"); // Accept the refreshed server snapshot, then render its new state.
  expect(cell("0.00").props).toMatchObject({ value: "0.00", status: "Saved" });
  await cell("0.00").props.onCommit!();
  expect(action.run).toHaveBeenCalledTimes(1);
});

it("keeps a rejected draft and its error, never calls it saved, and preserves the persisted price for blank restoration", async () => {
  action.run.mockImplementation(async () => { action.error = "Price could not be saved."; return false; });
  cell().props.onChange!("8.25");
  await cell().props.onCommit!();
  expect(cell().props).toMatchObject({ value: "8.25", status: null, error: "Price could not be saved." });
  cell().props.onChange!("");
  await cell().props.onCommit!();
  expect(cell().props.value).toBe("7.00");
});

it("does not dispatch or replace a pending request when its cell is recovery-blocked", async () => {
  cell().props.onChange!("9.00");
  action.blocked = true;
  expect(cell().props.disabled).toBe(true);
  await cell().props.onCommit!();
  expect(await clearOf(cell())!.props.onDelete!()).toBe(false);
  expect(action.run).not.toHaveBeenCalled();
});

it("accepts an externally refreshed price without dropping a newer draft", () => {
  cell().props.onChange!("9.00");
  cell("8.00");
  expect(cell("8.00").props.value).toBe("9.00");
});
