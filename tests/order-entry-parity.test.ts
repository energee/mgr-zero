import { assert } from "vitest";
import { Children, createElement, isValidElement, type ReactElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { NewOrderView } from "@/components/mgr/views/new-order";
import { Select, SelectItem } from "@/components/ui/select";
import { ShipToView } from "@/components/mgr/views/ship-to";
import { toShipToViewProps } from "@/lib/mgr/ship-to-view";
import { UsStateField } from "@/components/mgr/us-state-field";
import { SCREENS } from "@/components/mgr/screens";
import { PickView } from "@/components/mgr/views/pick";
import { ShortPickView } from "@/components/mgr/views/short-pick";
import { toPickViewProps } from "@/lib/mgr/pick-view";
import { toShortPickViewProps } from "@/lib/mgr/short-pick-view";
import { orderPick, orderShortPick } from "@/lib/mgr/fixtures/order-sheets";
import { toNewOrderViewProps } from "@/lib/mgr/new-order-view";
import { newOrderDraft } from "@/lib/mgr/fixtures/orders";

function elements(node: ReactNode): ReactElement<Record<string, unknown> & { children?: ReactNode }>[] {
  if (!isValidElement<Record<string, unknown> & { children?: ReactNode }>(node)) return [];
  // E.tbl cells live in its rows prop, not its children.
  const cells = Array.isArray(node.props.rows) ? (node.props.rows as ReactNode[][]).flat() : [];
  return [node, ...[...Children.toArray(node.props.children), ...cells].flatMap(elements)];
}

describe("shared order-entry controls", () => {
  it("keeps short-pick and print verbs attached to the counted line", () => {
    const qty = vi.fn(), short = vi.fn(), print = vi.fn();
    const model = toPickViewProps({ ...orderPick, lines: [{ ...orderPick.lines[0], qty_picked: 1.5 }] });
    const nodes = elements(PickView({ model, quantities: { [model.lines[0].key]: "1.5" }, onQuantity: qty, onShort: short, onPrint: print, footer: null }));
    invoke(nodes.find(node => node.props.label), "onChange", "0");
    invoke(nodes.find(node => node.props.children === "Short")!, "onClick");
    invoke(nodes.find(node => node.props.children === "Print pick sheet")!, "onClick");
    expect(qty).toHaveBeenCalledWith(model.lines[0].key, "0");
    expect(short).toHaveBeenCalledWith(model.lines[0].key); expect(print).toHaveBeenCalledOnce();
  });

  it("binds the short-pick count and reason and preserves errors, busy state and a suppressed footer", () => {
    const counted = vi.fn(), reason = vi.fn();
    const model = toShortPickViewProps(orderShortPick);
    const node = ShortPickView({ model, onCounted: counted, onReason: reason, messages: "command failed", submitting: true });
    const nodes = elements(node);
    invoke(nodes.find(node => node.props.label === "Counted")!, "onChange", "0.5");
    invoke(nodes.find(node => node.props["aria-label"] === "Reason")!, "onChange", { target: { value: "damage" } });
    expect(counted).toHaveBeenCalledWith("0.5"); expect(reason).toHaveBeenCalledWith("damage");
    expect(nodes.find(node => node.props.type === "submit")!.props.disabled).toBe(true);
    expect(renderToStaticMarkup(node)).toContain("command failed");
    expect(elements(ShortPickView({ model, footer: null })).some(node => node.props.type === "submit")).toBe(false);
  });
  it("preserves nullable availability, option IDs, decimal quantities, and explicit footer suppression", () => {
    const change = vi.fn();
    let node: ReactNode;
    // Capture JSX inside React's SSR dispatcher so the real useId hook remains exercised.
    function Harness() { return node = NewOrderView({
      model: {
        customer: "c2", customers: [{ id: "c1", label: "Same name" }, { id: "c2", label: "Same name" }],
        shipTo: "s2", shipTos: [{ id: "s2", label: "Dock" }], source: "l1", sources: [{ id: "l1", label: "Cooler" }],
        requestedShip: "", po: "", skus: [{ id: "sku2", label: "Case" }],
        lines: [{ name: "Case", skuId: "sku2", qty: "1.5", warning: false, skuError: "This SKU is unavailable" }],
      }, controls: { shipTo: change, lineQty: (_index, value) => change(value) }, footer: null,
    }); }
    const markup = renderToStaticMarkup(createElement(Harness));
    const nodes = elements(node);
    const shipTo = nodes.find(element => element.type === Select)!;
    expect(shipTo.props.value).toBe("s2");
    expect(nodes.find(element => element.type === SelectItem && element.props.value === "s2")?.props.children).toBe("Dock");
    invoke(shipTo, "onValueChange", "s3");
    expect(change).toHaveBeenCalledWith("s3");
    const quantity = nodes.find(element => element.props.label === "Line 1 quantity")!;
    expect(quantity.props.value).toBe("1.5");
    invoke(quantity, "onChange", "2.5");
    expect(change).toHaveBeenCalledWith("2.5");
    const errorId = markup.match(/<p id="([^"]+)" role="alert"/)?.[1];
    expect(errorId).toBeTruthy();
    expect(markup).toContain(`aria-describedby="${errorId}"`);
    expect(markup).toContain("This SKU is unavailable");
    expect(markup).not.toContain("ATP ");
    expect(markup).not.toContain("Save draft");
    expect(SCREENS.find(screen => screen.name === "New order")?.surface).toBeUndefined();
  });

  it("shares all address controls, picks the US state from the list, and keeps the second line optional", () => {
    const state = vi.fn(), address2 = vi.fn(), isDefault = vi.fn();
    let node: ReactNode;
    function Capture() {
      return node = ShipToView({ model: toShipToViewProps({ label: "Dock", country: "US", address1: "1 Main", address2: "Suite 2", city: "Town", state: "PA", zip: "12345", isDefault: true }),
        controls: { state, address2, isDefault }, footer: null });
    }
    const markup = renderToStaticMarkup(createElement(Capture));
    const nodes = elements(node);
    const field = (label: string) => nodes.find(element => element.props["aria-label"] === label)!;
    const stateField = nodes.find(element => element.type === UsStateField)!;
    expect(stateField.props.controls).toMatchObject({ onChange: state, required: true });
    expect(field("Address 2 (optional)").props.required).toBe(false);
    invoke(field("Address 2 (optional)"), "onChange", { target: { value: "" } });
    expect(address2).toHaveBeenCalledWith("");
    invoke(field("Default ship-to"), "onCheckedChange", false);
    expect(isDefault).toHaveBeenCalledWith(false);
    expect(markup).not.toContain("Save ship-to");
  });
});

function invoke(node: ReactElement<Record<string, unknown>> | undefined, prop: string, ...args: unknown[]) {
  const callback = node?.props[prop];
  assert(typeof callback === "function", `Expected ${prop} callback`);
  Reflect.apply(callback, undefined, args);
}

describe("past Requested ship date (#1489)", () => {
  const draft = toNewOrderViewProps(newOrderDraft);
  const html = (requestedShip: string) => renderToStaticMarkup(createElement(NewOrderView, { model: { ...draft, requestedShip, today: "2026-10-23" } }));
  it("warns before the brewery's today without blocking Save draft", () => {
    expect(html("2026-10-05")).toContain("This requested ship date is in the past for your brewery. You can still save the order.");
    expect(html("2026-10-23")).not.toContain("in the past");
    expect(html("")).not.toContain("in the past");
  });
});
