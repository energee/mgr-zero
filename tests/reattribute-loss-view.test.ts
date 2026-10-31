import { Children, createElement, isValidElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { ReattributeLossView } from "@/components/mgr/views/reattribute-loss";
import { SCREENS } from "@/components/mgr/screens";
import { monthlyComplianceAugust } from "@/lib/mgr/fixtures/monthly-compliance";

const loss = monthlyComplianceAugust.losses[0];
const htmlOf = (props: Partial<Parameters<typeof ReattributeLossView>[0]> = {}) => renderToStaticMarkup(createElement(ReattributeLossView, { loss, ...props }));

function control(node: ReactNode, prop: string): Record<string, unknown> | undefined {
  if (!isValidElement<Record<string, unknown>>(node)) return;
  if (typeof node.props[prop] === "function") return node.props;
  for (const child of Children.toArray(node.props.children as ReactNode)) {
    const found = control(child, prop);
    if (found) return found;
  }
}

describe("Reattribute loss shared form", () => {
  it("opens the sheet at the exact remainder with no target and an explained disabled Save", () => {
    const screen = SCREENS.find(screen => screen.name === "Reattribute loss")!;
    expect(screen.surface).toBe("sheet");
    const html = renderToStaticMarkup(screen.body);
    expect(html).toContain('value="0.03741935"');
    expect(html).toContain("Choose a target");
    expect(html).toContain("Still needed: a target.");
    expect(html).toMatch(/<button[^>]*disabled=""[^>]*>Save reattribution/);
    expect(html).not.toContain("Destination state");
  });

  it("requires a sample destination and rejects amounts above the exact remainder", () => {
    const sample = htmlOf({ target: "sample" });
    expect(sample).toContain("Destination state");
    expect(sample).toContain('pattern="[A-Z]{2}"');
    expect(sample).toContain("Still needed: a two-letter destination state.");
    const valid = htmlOf({ target: "sample", state: "PA" });
    expect(valid).not.toContain("Still needed:");
    expect(valid).toMatch(/<button(?![^>]*\sdisabled="")[^>]*>Save reattribution/);
    expect(htmlOf({ target: "taproom", amount: "0.03741936" })).toMatch(/<button[^>]*disabled=""[^>]*>Save reattribution/);
  });

  it("clears the sample destination when the target changes and uppercases typed states", () => {
    const onTarget = vi.fn();
    const onState = vi.fn();
    const tree = ReattributeLossView({ loss, target: "sample", state: "PA", onTarget, onState });
    const picker = control(tree, "onValueChange")!;
    (picker.onValueChange as (value: string) => void)("taproom");
    expect(onTarget).toHaveBeenCalledWith("taproom");
    expect(onState).toHaveBeenCalledWith("");
    const stateTree = ReattributeLossView({ loss, target: "sample", onState });
    const stateInput = control(stateTree, "onChange")!;
    (stateInput.onChange as (event: { target: { value: string } }) => void)({ target: { value: "pa" } });
    expect(onState).toHaveBeenCalledWith("PA");
  });

  it("freezes fields for recovery, keeps errors visible, and allows the unchanged retry", () => {
    const html = htmlOf({ phase: "unknown", target: "sample", state: "PA", error: "Network unavailable" });
    expect(html).toMatch(/<input[^>]*disabled=""[^>]*value="0.03741935"/);
    expect(html).toMatch(/<input[^>]*disabled=""[^>]*value="PA"/);
    expect(html).toContain("request ID are frozen");
    expect(html).toContain('role="alert"');
    expect(html).toContain("Network unavailable");
    expect(html).toMatch(/<button(?![^>]*\sdisabled="")[^>]*>Retry unchanged reattribution/);
    expect(htmlOf({ phase: "saved", target: "taproom" })).toContain("Loss reattribution saved.");
  });
});
