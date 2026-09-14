import { Children, isValidElement, type ReactElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { NewOrderView } from "@/components/mgr/views/new-order";
import { Select, SelectItem } from "@/components/ui/select";
import { ShipToView } from "@/components/mgr/views/ship-to";
import { toShipToViewProps } from "@/lib/mgr/ship-to-view";
import { SCREENS } from "@/components/mgr/screens";
import { AdjustLinesView } from "@/components/mgr/views/adjust-lines";
import { PickView } from "@/components/mgr/views/pick";
import { ShortPickView } from "@/components/mgr/views/short-pick";
import { toAdjustLinesViewProps } from "@/lib/mgr/adjust-lines-view";
import { toPickViewProps } from "@/lib/mgr/pick-view";
import { toShortPickViewProps } from "@/lib/mgr/short-pick-view";
import { orderAdjustLines, orderPick, orderShortPick } from "@/lib/mgr/fixtures/order-sheets";

function elements(node: ReactNode): ReactElement<Record<string, any>>[] {
  if (!isValidElement<Record<string, any>>(node)) return [];
  return [node, ...Children.toArray(node.props.children).flatMap(elements)];
}

describe("shared order-entry controls", () => {
  it("binds adjustment row IDs, add/remove, decimal counts and the required reason", () => {
    const qty = vi.fn(), sku = vi.fn(), add = vi.fn(), remove = vi.fn(), reason = vi.fn();
    const nodes = elements(AdjustLinesView({ model: toAdjustLinesViewProps(orderAdjustLines), onQuantity: qty, onSku: sku, onAdd: add, onRemove: remove, onReason: reason }));
    nodes.find(node => node.props.label === "Line 2 quantity")!.props.onChange("1.5");
    nodes.find(node => node.props.label === "Line 2 SKU")!.props.onChange("actual-id");
    nodes.find(node => node.props.children === "Add line")!.props.onClick();
    nodes.find(node => node.props.children === "Remove")!.props.onClick();
    nodes.find(node => node.props["aria-label"] === "Reason")!.props.onChange({ target: { value: "cut" } });
    expect(qty).toHaveBeenCalledWith(1, "1.5"); expect(sku).toHaveBeenCalledWith(1, "actual-id");
    expect(add).toHaveBeenCalledOnce(); expect(remove).toHaveBeenCalledWith(0); expect(reason).toHaveBeenCalledWith("cut");
  });

  it("keeps short-pick and print verbs attached to the counted line", () => {
    const qty = vi.fn(), short = vi.fn(), print = vi.fn();
    const model = toPickViewProps({ ...orderPick, lines: [{ ...orderPick.lines[0], qty_picked: 1.5 }] });
    const nodes = elements(PickView({ model, quantities: { [model.lines[0].key]: "1.5" }, onQuantity: qty, onShort: short, onPrint: print, footer: null }));
    nodes.find(node => node.props.label)?.props.onChange("0");
    nodes.find(node => node.props.children === "Short")!.props.onClick();
    nodes.find(node => node.props.children === "Print pick sheet")!.props.onClick();
    expect(qty).toHaveBeenCalledWith(model.lines[0].key, "0");
    expect(short).toHaveBeenCalledWith(model.lines[0].key); expect(print).toHaveBeenCalledOnce();
  });

  it("binds one short-pick resolution and preserves errors, busy state and a suppressed footer", () => {
    const resolution = vi.fn(), counted = vi.fn(), reason = vi.fn();
    const model = toShortPickViewProps(orderShortPick);
    const node = ShortPickView({ model, onResolution: resolution, onCounted: counted, onReason: reason, resolution: 1, messages: "command failed", submitting: true });
    const nodes = elements(node);
    const chips = nodes.find(node => node.props.onValueChange)!;
    chips.props.onValueChange(""); expect(resolution).not.toHaveBeenCalled();
    chips.props.onValueChange("0"); expect(resolution).toHaveBeenCalledWith(0);
    nodes.find(node => node.props.label === "Counted")!.props.onChange("0.5");
    nodes.find(node => node.props["aria-label"] === "Reason")!.props.onChange({ target: { value: "damage" } });
    expect(counted).toHaveBeenCalledWith("0.5"); expect(reason).toHaveBeenCalledWith("damage");
    expect(nodes.find(node => node.props.type === "submit")!.props.disabled).toBe(true);
    expect(renderToStaticMarkup(node)).toContain("remain owed");
    expect(renderToStaticMarkup(node)).toContain("command failed");
    expect(elements(ShortPickView({ model, footer: null })).some(node => node.props.type === "submit")).toBe(false);
  });
  it("preserves nullable availability, option IDs, decimal quantities, and explicit footer suppression", () => {
    const change = vi.fn();
    const node = NewOrderView({
      model: {
        customer: "c2", customers: [{ id: "c1", label: "Same name" }, { id: "c2", label: "Same name" }],
        shipTo: "s2", shipTos: [{ id: "s2", label: "Dock" }], source: "l1", sources: [{ id: "l1", label: "Cooler" }],
        requestedShip: "", po: "", skus: [{ id: "sku2", label: "Case" }],
        lines: [{ name: "Case", skuId: "sku2", qty: "1.5", warning: false }],
      }, controls: { shipTo: change, lineQty: (_index, value) => change(value) }, footer: null,
    });
    const nodes = elements(node);
    const shipTo = nodes.find(element => element.type === Select)!;
    expect(shipTo.props.value).toBe("s2");
    expect(nodes.find(element => element.type === SelectItem && element.props.value === "s2")?.props.children).toBe("Dock");
    shipTo.props.onValueChange("s3");
    expect(change).toHaveBeenCalledWith("s3");
    const quantity = nodes.find(element => element.props.label === "Line 1 quantity")!;
    expect(quantity.props.value).toBe("1.5");
    quantity.props.onChange("2.5");
    expect(change).toHaveBeenCalledWith("2.5");
    const markup = renderToStaticMarkup(node);
    expect(markup).not.toContain("ATP ");
    expect(markup).not.toContain("Save draft");
    expect(SCREENS.find(screen => screen.name === "New order")?.surface).toBeUndefined();
  });

  it("shares all address controls, normalizes state, and keeps the second line optional", () => {
    const state = vi.fn(), address2 = vi.fn(), isDefault = vi.fn();
    const node = ShipToView({ model: toShipToViewProps({ label: "Dock", address1: "1 Main", address2: "Suite 2", city: "Town", state: "PA", zip: "12345", isDefault: true }),
      controls: { state, address2, isDefault }, footer: null });
    const nodes = elements(node);
    const field = (label: string) => nodes.find(element => element.props["aria-label"] === label)!;
    field("State").props.onChange({ target: { value: "ny" } });
    expect(state).toHaveBeenCalledWith("NY");
    expect(field("State").props.maxLength).toBe(2);
    expect(field("Address 2 (optional)").props.required).toBe(false);
    field("Address 2 (optional)").props.onChange({ target: { value: "" } });
    expect(address2).toHaveBeenCalledWith("");
    field("Default ship-to").props.onCheckedChange(false);
    expect(isDefault).toHaveBeenCalledWith(false);
    expect(renderToStaticMarkup(node)).not.toContain("Save ship-to");
  });
});
