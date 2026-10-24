import { Children, createElement, isValidElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { SCREENS } from "../components/mgr/screens";
import { ConfirmDeleteControl } from "../components/mgr/views/confirm-delete";
import { VendorView } from "../components/mgr/views/vendor";
import { VendorsView } from "../components/mgr/views/vendors";
import { vendorYch } from "../lib/mgr/fixtures/purchasing";
import { canRun, getCommandDefinition, STAFF_ROLES, type Ctx } from "../lib/commands/registry";
import "../lib/commands/all";

function screenHtml(name: string) {
  const screen = SCREENS.find(screen => screen.name === name);
  if (!screen) throw new Error(`Missing screen: ${name}`);
  return renderToStaticMarkup(createElement("div", null, screen.body));
}

function confirmation(node: ReactNode): Parameters<typeof ConfirmDeleteControl>[0] | undefined {
  for (const child of Children.toArray(node)) {
    if (!isValidElement<{ children?: ReactNode }>(child)) continue;
    if (child.type === ConfirmDeleteControl) return child.props as Parameters<typeof ConfirmDeleteControl>[0];
    const nested = confirmation(child.props.children);
    if (nested) return nested;
  }
}

describe("record lifecycle availability (#1311)", () => {
  it.each([...STAFF_ROLES, "customer"] as const)("keeps vendor status changes behind the existing %s role boundary", role => {
    const ctx: Ctx = { db: null as unknown as Ctx["db"], userId: "staff", breweryId: "brewery", roles: [role] };
    expect(canRun(ctx, "upsert_vendor")).toBe(["admin", "warehouse", "brewer"].includes(role));
  });

  it("retains tap history as a query without inventing a deletion command", () => {
    expect(getCommandDefinition("list_tap_history")?.kind).toBe("query");
    expect(getCommandDefinition("delete_tap_interval")).toBeUndefined();
  });

  it.each(["Brand", "Water profiles", "Locations"])("%s explains unsupported lifecycle actions without a fake removal control", name => {
    const html = screenHtml(name);
    const notes = html.match(/role="note"[\s\S]*?<\/div><\/div>/g)?.join(" ") ?? "";
    expect(notes).toMatch(/cannot currently be deleted or archived/);
    expect(html).not.toMatch(/<button[^>]*>\s*(Delete|Archive)\s*<\/button>/);
  });

  it("explains the history boundary beside closed tap entries", () => {
    const html = screenHtml("Tap board");
    expect(html).toMatch(/Recent history[\s\S]*role="note"[\s\S]*cannot be edited or deleted/);
    expect(html).not.toMatch(/<button[^>]*>\s*(Delete|Archive)\s*<\/button>/);
  });

  it.each([true, false])("an %s-active vendor uses the shared confirmation before requesting the opposite status", async active => {
    const onSetActive = vi.fn().mockResolvedValue(true);
    const tree = VendorView({ model: { ...vendorYch, active }, onSetActive });
    const control = confirmation(tree);
    expect(control).toBeDefined();
    expect(control?.title).toBe(active ? "Deactivate vendor" : "Reactivate vendor");
    expect(onSetActive).not.toHaveBeenCalled();
    await control?.onDelete?.();
    expect(onSetActive).toHaveBeenCalledExactlyOnceWith(!active);
  });

  it("keeps inactive vendors visible and editable with a textual status", () => {
    const html = renderToStaticMarkup(createElement(VendorsView, { model: {
      rows: [
        { key: "active", title: "Active supplier", detail: "7 day lead", verb: "Edit" },
        { key: "inactive", title: "Inactive supplier", detail: "14 day lead", verb: "Edit", disabled: true },
      ],
      materials: "", contracts: "",
    } }));
    expect(html).toContain("Active · 7 day lead");
    expect(html).toContain("Inactive · 14 day lead");
    expect(html.match(/>Edit</g)).toHaveLength(2);
  });

  it("holds status confirmation closed when a required name is missing", () => {
    const control = confirmation(VendorView({ model: { ...vendorYch, name: " ", active: true } }));
    expect(control?.reason).toBeTruthy();
  });

  it("does not offer a lifecycle action before a vendor has been saved", () => {
    expect(confirmation(VendorView({ model: { ...vendorYch, active: null } }))).toBeUndefined();
  });
});
