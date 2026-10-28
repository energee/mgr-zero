// tests/group-form-error.test.ts — a refused Save price group (for example a
// duplicate name) clears once the name is edited, instead of staying until the
// dialog closes (#1492). Calls GroupForm's real callbacks without a DOM.
import { expect, it, vi } from "vitest";
import { isValidElement, type ComponentProps, type ReactElement, type ReactNode } from "react";
import type * as React from "react";
import { GroupForm } from "@/app/(app)/pricing/group-form";
import { PriceGroupView } from "@/components/mgr/views/price-group";

const state = vi.hoisted(() => ({ active: false, cursor: 0, values: [] as unknown[] }));
const form = vi.hoisted(() => ({ open: true, error: "a price group with this name already exists" as string | null, setError: vi.fn(), setOpen: vi.fn(), submit: vi.fn(), run: vi.fn(), busy: false, submitting: false }));
vi.mock("react", async original => {
  const react = await original<typeof React>();
  function slot(initial: unknown) {
    const index = state.cursor++;
    if (!(index in state.values)) state.values[index] = initial;
    return [state.values[index], (next: unknown) => { state.values[index] = typeof next === "function" ? next(state.values[index]) : next; }];
  }
  return { ...react, useState: (initial: unknown) => state.active ? slot(initial) : react.useState(initial) };
});
vi.mock("@/lib/commands/use-command-form", () => ({ useCommandForm: () => form }));

function find(node: ReactNode): ReactElement<ComponentProps<typeof PriceGroupView>> | undefined {
  if (Array.isArray(node)) return node.map(find).find(Boolean);
  if (!isValidElement(node)) return undefined;
  if (node.type === PriceGroupView) return node as ReactElement<ComponentProps<typeof PriceGroupView>>;
  return find((node.props as { children?: ReactNode }).children);
}

it("clears the error when the group name changes", () => {
  form.setError.mockImplementation((error: string | null) => { form.error = error; });
  const model = { name: "Core", position: "1", costCeilingInput: "" };
  state.active = true;
  try {
    find(GroupForm({ groupId: "g", model }))!.props.controls!.name!("Core 2");
  } finally { state.active = false; }
  expect(form.setError).toHaveBeenCalledWith(null);
  expect(form.error).toBeNull();
});
