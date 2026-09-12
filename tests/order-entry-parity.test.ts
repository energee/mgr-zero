import { Children, isValidElement, type ReactElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { NewOrderView } from "@/components/mgr/views/new-order";
import { ShipToView } from "@/components/mgr/views/ship-to";
import { toShipToViewProps } from "@/lib/mgr/ship-to-view";
import { SCREENS } from "@/components/mgr/screens";

function elements(node: ReactNode): ReactElement<Record<string, any>>[] {
  if (!isValidElement<Record<string, any>>(node)) return [];
  return [node, ...Children.toArray(node.props.children).flatMap(elements)];
}

describe("shared order-entry controls", () => {
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
    const shipTo = nodes.find(element => element.type === "select")!;
    expect(shipTo.props.value).toBe("s2");
    shipTo.props.onChange({ target: { value: "s3" } });
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
