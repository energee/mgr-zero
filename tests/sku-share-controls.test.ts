// The real sheet, shared numeric control, and command adapter; no database or DOM required.
import { beforeEach, expect, it, vi } from "vitest";
import { Children, isValidElement, type ComponentProps, type FormEvent, type ReactElement, type ReactNode } from "react";
import type * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { SkuEditForm, SkuForm } from "@/app/(app)/catalog/sku-form";
import { CommandForm } from "@/components/mgr/command-form";
import { SkuView } from "@/components/mgr/views/sku";
import { skuHazyHalf } from "@/lib/mgr/fixtures/catalog";
import { toSkuViewProps } from "@/lib/mgr/sku-view";

const state = vi.hoisted(() => ({ active: false, cursor: 0, values: [] as unknown[], sent: [] as { name: string; input: unknown }[] }));
vi.mock("react", async original => {
  const react = await original<typeof React>();
  return { ...react, useState: (initial: unknown) => {
    if (!state.active) return react.useState(initial);
    const index = state.cursor++;
    if (!(index in state.values)) state.values[index] = typeof initial === "function" ? initial() : initial;
    return [state.values[index], (next: unknown) => { state.values[index] = typeof next === "function" ? next(state.values[index]) : next; }];
  } };
});
vi.mock("@/lib/commands/use-command-form", () => ({ useCommandForm: (name: string, options: { build: () => unknown }) => ({
  open: true, setOpen: vi.fn(), error: null, submitting: false,
  submit: () => { state.sent.push({ name, input: options.build() }); },
}) }));

type Sheet = ReactElement<ComponentProps<typeof CommandForm>>;
type Node = ReactElement<Record<string, unknown> & { children?: ReactNode }>;
function elements(node: ReactNode): Node[] {
  if (!isValidElement<Record<string, unknown> & { children?: ReactNode }>(node)) return [];
  return [node, ...Children.toArray(node.props.children).flatMap(elements)];
}
function assemble<T>(render: () => T): T {
  state.active = true;
  state.cursor = 0;
  try { return render(); } finally { state.active = false; }
}
const sku = { ...skuHazyHalf.sku!, batch_share: 0.375 };
const edit = () => assemble(() => SkuEditForm({ sku, formatName: "½ bbl keg", packageType: "keg" }));
function viewOf(sheet: Sheet) {
  return elements(sheet).find(node => node.type === SkuView)! as ReactElement<ComponentProps<typeof SkuView>>;
}
function shareControl(sheet: Sheet) {
  return elements(SkuView(viewOf(sheet).props)).find(node => node.props.label === "Batch package share (%)")!;
}
function submit(sheet: Sheet) {
  const form = elements(sheet).find(node => node.type === "form")!;
  const event = { preventDefault: vi.fn() };
  (form.props.onSubmit as (event: FormEvent) => void)(event as unknown as FormEvent);
  return event;
}
beforeEach(() => { state.values = []; state.sent = []; });

it("keeps the product surface and shared field, then sends a fractional share from its actual callback", () => {
  let sheet = edit();
  expect(sheet.type).toBe(CommandForm);
  expect(viewOf(sheet).props.model.batchSharePercent).toBe("37.5");
  const control = shareControl(sheet);
  expect(control.props).toMatchObject({ value: "37.5", min: 0, max: 100, step: "any" });
  (control.props.onChange as (value: string) => void)("62.5");
  sheet = edit();
  expect(viewOf(sheet).props.model.batchSharePercent).toBe("62.5");
  submit(sheet);
  expect(state.sent).toEqual([{ name: "update_sku", input: { skuId: sku.id, active: true, upc: sku.upc, batchShare: 0.625 } }]);
});

it("clears the persisted share with null and resets unsaved state when reopening", () => {
  (shareControl(edit()).props.onChange as (value: string) => void)("");
  let sheet = edit();
  submit(sheet);
  expect(state.sent[0]).toMatchObject({ input: { batchShare: null } });
  sheet.props.onOpenChange(true);
  sheet = edit();
  expect(viewOf(sheet).props.model.batchSharePercent).toBe("37.5");
});

it.each(["0", "-1", "101", "invalid"])("does not dispatch invalid share %s", value => {
  (shareControl(edit()).props.onChange as (value: string) => void)(value);
  const sheet = edit();
  const footer = viewOf(sheet).props.footer;
  expect(elements(footer).some(node => node.props.disabled === true)).toBe(true);
  expect(submit(sheet).preventDefault).toHaveBeenCalledOnce();
  expect(state.sent).toEqual([]);
});

it("renders equivalent saved fixture/live shares through SkuView and leaves creation as one command", () => {
  const fixtureModel = toSkuViewProps({ ...skuHazyHalf, sku });
  const live = viewOf(edit());
  expect(live.type).toBe(SkuView);
  expect(shareControl(edit()).props.value).toBe(fixtureModel.batchSharePercent);
  state.values = [];
  const sheet = assemble(() => SkuForm({ brandId: "brand", formats: [{ id: "format", name: "Case" }] }));
  expect(sheet.type).toBe(CommandForm);
  const view = viewOf(sheet);
  expect(view.props.model.batchSharePercent).toBeUndefined();
  expect(renderToStaticMarkup(view)).toContain("Edit the SKU after creation");
  submit(sheet);
  expect(state.sent).toEqual([{ name: "create_sku", input: { brandId: "brand", formatId: "format", name: undefined, upc: undefined, kegPoolId: null } }]);
});
