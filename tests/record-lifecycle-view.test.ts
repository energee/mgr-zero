import { Children, createElement, isValidElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { SCREENS } from "../components/mgr/screens";
import { ConfirmDeleteControl } from "../components/mgr/views/confirm-delete";
import { VendorView } from "../components/mgr/views/vendor";
import { VendorsView } from "../components/mgr/views/vendors";
import { vendorEdit } from "../lib/mgr/fixtures/purchasing";
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

function vendorConfirmation(props: Parameters<typeof VendorView>[0]) {
  let tree: ReactNode;
  function Harness() { return tree = VendorView(props); }
  renderToStaticMarkup(createElement(Harness));
  return confirmation(tree!);
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

  // The owner kept these notes (#1311) and cut each to one sentence (#1512, #1518).
  const lifecycleNote = (html: string, pattern: RegExp) =>
    (html.match(/<[^>]*role="note"[^>]*>[\s\S]*?<\/div><\/div>/g) ?? []).map(note => note.replace(/<[^>]+>/g, "").trim()).find(note => pattern.test(note));

  it.each(["Brand", "Water profiles", "Locations"])("%s explains unsupported lifecycle actions in one sentence, without a fake removal control", name => {
    const html = screenHtml(name);
    expect(lifecycleNote(html, /cannot be deleted or archived/)).toMatch(/^[^.]+\.$/);
    expect(html).not.toMatch(/<button[^>]*>\s*(Delete|Archive)\s*<\/button>/);
  });

  it("says in one sentence that a vendor is deactivated, not deleted", () => {
    expect(lifecycleNote(screenHtml("Vendor"), /cannot be deleted/)).toMatch(/^[^.]+\.$/);
  });

  it("explains the history boundary beside closed tap entries in one sentence", () => {
    const html = screenHtml("Tap board");
    expect(html).toMatch(/Recent history[\s\S]*role="note"[\s\S]*cannot be edited or deleted/);
    expect(lifecycleNote(html, /cannot be edited or deleted/)).toMatch(/^[^.]+\.$/);
    expect(html).not.toMatch(/<button[^>]*>\s*(Delete|Archive)\s*<\/button>/);
  });

  it.each([true, false])("an %s-active vendor uses the shared confirmation before requesting the opposite status", async active => {
    const onSetActive = vi.fn().mockResolvedValue(true);
    const control = vendorConfirmation({ model: { ...vendorEdit, active }, onSetActive });
    expect(control).toBeDefined();
    expect(control?.title).toBe(active ? "Deactivate vendor" : "Reactivate vendor");
    expect(onSetActive).not.toHaveBeenCalled();
    await control?.onDelete?.();
    expect(onSetActive).toHaveBeenCalledExactlyOnceWith(!active);
  });

  it("keeps inactive vendors visible and editable with a textual status", () => {
    const html = renderToStaticMarkup(createElement(VendorsView, { model: {
      rows: [
        { key: "active", name: "Active supplier", status: "Active", leadTime: "7 days", observed: null, contracts: 0, href: "/vendors/active" },
        { key: "inactive", name: "Inactive supplier", status: "Inactive", leadTime: "14 days", observed: null, contracts: 0, href: "/vendors/inactive" },
      ],
      materials: "", contracts: "",
    } }));
    expect(html).toMatch(/Active supplier[\s\S]*?>Active<[\s\S]*?>7 days</);
    expect(html).toMatch(/Inactive supplier[\s\S]*?>Inactive<[\s\S]*?>14 days</);
    // Desk table and phone list each draw the row's Edit.
    expect(html.match(/>Edit</g)).toHaveLength(4);
  });

  it.each([
    { name: " " },
    { email: "not-an-email" },
    { leadDays: "-1" },
    { leadDays: "2.5" },
    { leadDays: "1e3" },
  ])("holds status confirmation closed for invalid form fields %j", fields => {
    const control = vendorConfirmation({ model: { ...vendorEdit, ...fields, active: true } });
    expect(control?.reason).toBeTruthy();
  });

  it("does not offer a lifecycle action before a vendor has been saved", () => {
    expect(vendorConfirmation({ model: { ...vendorEdit, active: null } })).toBeUndefined();
  });
});
