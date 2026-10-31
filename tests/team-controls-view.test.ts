import { Children, createElement, isValidElement, type ComponentProps, type ReactElement, type ReactNode } from "react";
import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it, vi } from "vitest";
import { InviteView, TeamMemberView } from "../components/mgr/views/team-controls";
import { E } from "../components/mgr/e";
import { ToggleGroup, ToggleGroupItem } from "../components/ui/toggle-group";

type Element = ReactElement<Record<string, unknown> & { children?: ReactNode }>;
function elements(node: ReactNode): Element[] {
  if (!isValidElement<Record<string, unknown> & { children?: ReactNode }>(node)) return [];
  return [node, ...Children.toArray(node.props.children).flatMap(elements)];
}

function member(props: Partial<ComponentProps<typeof TeamMemberView>> = {}) {
  let tree: ReactNode;
  function Harness() {
    return tree = TeamMemberView({ name: "Actual Brewer <actual@example.com>", savedRoles: ["brewer"], ...props });
  }
  const html = renderToStaticMarkup(createElement(Harness));
  return { html, nodes: elements(tree) };
}

it("extends the shared multiple picker with controlled values, labels and disabled state", () => {
  const onChange = vi.fn();
  const nodes = elements(E.picks("Roles", ["sales", "brewer"], [{ value: "sales", label: "Sales" }, { value: "brewer", label: "Brewer" }], { onChange, disabled: true }));
  const group = nodes.find(node => node.type === ToggleGroup)!;
  expect(group.props.value).toEqual(["sales", "brewer"]);
  expect(group.props.defaultValue).toBeUndefined();
  expect(group.props.disabled).toBe(true);
  expect(nodes.filter(node => node.type === ToggleGroupItem).map(node => node.props.children)).toEqual(["Sales", "Brewer"]);
  (group.props.onValueChange as (values: string[]) => void)(["brewer"]);
  expect(onChange).toHaveBeenCalledWith(["brewer"]);
  expect(elements(E.picks("Uses", ["Storage"], ["Storage", "Taproom"])).find(node => node.type === ToggleGroup)?.props.defaultValue).toEqual(["Storage"]);
});

it("offers every staff role in enum order and returns several canonical role values", () => {
  const onRolesChange = vi.fn();
  const { html, nodes } = member({ roles: ["sales", "brewer"], onRolesChange });
  const group = nodes.find(node => node.type === ToggleGroup)!;
  expect(group.props.type).toBe("multiple");
  expect(group.props.value).toEqual(["sales", "brewer"]);
  expect(nodes.filter(node => node.type === ToggleGroupItem).map(node => node.props.children)).toEqual(["Admin", "Sales", "Warehouse", "Brewer", "Taproom"]);
  (group.props.onValueChange as (values: string[]) => void)(["brewer", "sales", "sales"]);
  expect(onRolesChange).toHaveBeenCalledWith(["sales", "brewer"]);
  expect(html).toContain("Admin includes every staff permission");
  expect(nodes.find(node => node.props.type === "submit")?.props.disabled).toBe(false);
});

it("requires a nonempty changed role set and blocks empty, unchanged and pending submissions", () => {
  for (const props of [
    { roles: [] },
    { savedRoles: ["sales", "brewer"], roles: ["brewer", "sales"] },
    { roles: ["sales"], saving: true },
    { roles: ["sales"], removing: true },
  ] satisfies Partial<ComponentProps<typeof TeamMemberView>>[]) {
    const onSubmit = vi.fn(), preventDefault = vi.fn();
    const { html, nodes } = member({ ...props, onSubmit });
    expect(nodes.find(node => node.props.type === "submit")?.props.disabled).toBe(true);
    (nodes.find(node => node.type === "form")!.props.onSubmit as (event: unknown) => void)({ preventDefault });
    expect(preventDefault).toHaveBeenCalledOnce();
    expect(onSubmit).not.toHaveBeenCalled();
    if (!props.roles.length) expect(html).toContain("Choose at least one role.");
  }
  const onSubmit = vi.fn();
  const { nodes } = member({ roles: ["sales", "brewer"], onSubmit });
  (nodes.find(node => node.type === "form")!.props.onSubmit as (event: unknown) => void)({ preventDefault: vi.fn() });
  expect(onSubmit).toHaveBeenCalledOnce();
});

it.each(["", "abc", "a@b", "   ", `${"a".repeat(300)}@example.org`, `${"a".repeat(70)}@example.org`])("withholds Send invite with its reason for %j (#1488)", email => {
  const html = renderToStaticMarkup(createElement(InviteView, { buyer: true, email }));
  expect(html.match(/<button[^>]*>Send invite<\/button>/)?.[0]).toContain('disabled=""');
  expect(html).toContain("Still needed: a valid email address.");
});

it("keeps buyer invitations fixed and staff invitations inclusive of taproom", () => {
  const staff = renderToStaticMarkup(createElement(InviteView, { buyer: false, role: "taproom", busy: true, error: "Retry unchanged details" }));
  expect(staff).toContain('type="email"');
  expect(staff).toContain("required");
  expect(staff).toContain("Taproom");
  expect(staff).toContain("disabled");
  expect(staff).toContain("Retry unchanged details");
  const buyer = renderToStaticMarkup(createElement(InviteView, { buyer: true }));
  expect(buyer).toContain("Buyer");
  expect(buyer).not.toContain("Warehouse");
});

it("describes each staff role in a full sentence under the role picker (#1153)", () => {
  const help = (role: string) => renderToStaticMarkup(createElement(InviteView, { buyer: false, role }));
  expect(help("admin")).toContain("Can use every staff screen and action, including Team and Settings.");
  expect(help("sales")).toContain("Can manage the catalog, customers, pricing, orders, invoices and compliance reports.");
  expect(help("warehouse")).toContain("Can pick, ship and deliver orders, run packaging, place purchase orders, and receive, count and transfer stock and kegs.");
  expect(help("brewer")).toContain("Can manage recipes, batches, cellar work and packaging runs.");
  expect(help("taproom")).toContain("Can change taproom taps, record taproom counts, view variance and set personal preferences.");
});

it("explains both invitation paths in a neutral note that names Invitations (#1153)", () => {
  const html = renderToStaticMarkup(createElement(InviteView, { buyer: false }));
  const note = html.match(/<div\b[^>]*role="note"[^>]*>[\s\S]*?<\/div>/)?.[0] ?? "";
  expect(note).toContain("bg-info");
  expect(note).not.toContain("warning");
  const text = note.replace(/<[^>]+>/g, "");
  expect(text).toBe("New accounts get an email to set up their login. Existing accounts get no email. They see the invitation in Invitations the next time they sign in, or at /invitations. Access starts once they accept, within seven days.");
  expect(html).not.toContain("Keep this page open");
});

it("reports a sent invitation in a neutral status line that matches the dialog note (#1153)", () => {
  const src = readFileSync("app/(app)/settings/team/invite-form.tsx", "utf8");
  expect(src).not.toContain('tone="warning"');
  expect(src).toContain('<div role="status">{E.polite(sent)}</div>');
  expect(src).toContain("Invitation pending. They see it in Invitations the next time they sign in.");
});

it("locks both membership actions during either pending write and retains errors", () => {
  const html = renderToStaticMarkup(createElement(TeamMemberView, { name: "Actual Brewer <actual@example.com>", savedRoles: ["brewer"], removing: true, error: "Cannot remove the last admin" }));
  expect(html).toContain("Cannot remove the last admin");
  expect(html).toContain("ends this brewery membership");
  // Remove opens the confirm sheet; its trigger is held while either write runs.
  expect(html).toContain("Remove Actual Brewer");
  expect(html).not.toContain("/mock/");
  expect(html).not.toMatch(/<button(?![^>]*disabled)[^>]*>/);
});
