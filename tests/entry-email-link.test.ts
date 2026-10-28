// Exercises the shared entry form's submit-button validation without invoking Auth.
import { createElement, isValidElement, type ComponentProps, type ReactElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { EntryView } from "../components/mgr/views/entry";
import { signIn, portalSignIn } from "../lib/mgr/fixtures/entry";
import { expiredInviteModel, expiredResetModel, noMembershipModel, pageNotFoundModel, portalStaffOnlyModel, toPasswordSavedViewProps, toSetPasswordViewProps } from "../lib/mgr/entry-view";

type NodeProps = { children?: ReactNode; type?: string; action?: (form: FormData) => void; formNoValidate?: boolean; onClick?: (event: unknown) => void; onSubmit?: (event: unknown) => void };
function descendants(node: ReactNode): ReactElement<NodeProps>[] {
  if (Array.isArray(node)) return node.flatMap(descendants);
  if (!isValidElement<NodeProps>(node)) return [];
  return [node, ...descendants(node.props.children)];
}

/** Capture the real form during React rendering so its hooks run in a component. */
function renderEntry(props: ComponentProps<typeof EntryView>): ReactNode {
  let view: ReactNode;
  function Capture() {
    view = EntryView(props);
    return view;
  }
  renderToStaticMarkup(createElement(Capture));
  return view;
}

describe("email-link form boundary (#708)", () => {
  it("renders a non-network fixture action before hydration", () => {
    const html = renderToStaticMarkup(createElement(EntryView, { model: signIn }));
    expect(html.match(/<form[^>]*>/)?.[0]).toMatch(/action="javascript:/);
  });

  it("keeps email-only validation when display wording changes", () => {
    const view = renderEntry({ model: { ...signIn, secondary: "Send sign-in link" }, action: vi.fn(), secondaryAction: vi.fn() });
    const button = descendants(view).find(node => node.props.children === "Send sign-in link")!;
    expect(button.props.formNoValidate).toBe(true);
    expect(button.props.onClick).toBeTypeOf("function");
  });

  it.each([false, true])("checks only email before the secondary action (live=%s)", (live) => {
    const view = renderEntry({ model: signIn, ...(live ? { action: vi.fn(), secondaryAction: vi.fn() } : {}) });
    const nodes = descendants(view);
    const form = nodes.find(node => node.type === "form");
    expect(form).toBeDefined();
    if (!live) {
      expect(form!.props.action).toBeTypeOf("function");
      const preventDefault = vi.fn();
      form!.props.onSubmit!({ preventDefault });
      expect(preventDefault).toHaveBeenCalledOnce();
    }
    const button = nodes.find(node => node.props.children === "Email me a link")!;
    expect(button.props.formNoValidate).toBe(true);
    expect(button.props.onClick).toBeTypeOf("function");
    for (const valid of [false, true]) {
      const reportValidity = vi.fn(() => valid);
      const namedItem = vi.fn(() => ({ reportValidity }));
      const preventDefault = vi.fn();
      button.props.onClick!({ currentTarget: { form: { elements: { namedItem } } }, preventDefault });
      expect(namedItem).toHaveBeenCalledWith("email");
      expect(reportValidity).toHaveBeenCalledOnce();
      expect(preventDefault).toHaveBeenCalledTimes(valid ? 0 : 1);
    }
  });

  it.each([signIn, portalSignIn])("keeps native email and password requirements for password sign-in", (model) => {
    const html = renderToStaticMarkup(createElement(EntryView, { model, action: vi.fn(), secondaryAction: model === signIn ? vi.fn() : undefined }));
    expect(html.match(/<input[^>]*type="email"[^>]*>/)?.[0]).toContain('required=""');
    expect(html.match(/<input[^>]*type="password"[^>]*>/)?.[0]).toContain('required=""');
    expect(html).not.toMatch(/<form[^>]*novalidate/);
    expect(html).toMatch(/<button[^>]*type="submit"[^>]*>Sign in<\/button>/);
  });
});

describe("entry message tones (#1401)", () => {
  it.each([signIn, portalSignIn])("renders sign-in errors as destructive alerts with a glyph", (model) => {
    const html = renderToStaticMarkup(createElement(EntryView, { model: { ...model, error: "Incorrect email or password." } }));
    const alert = html.match(/<div[^>]*role="alert"[^>]*>.*?Incorrect email or password\.<\/div><\/div>/)?.[0];
    expect(alert).toContain("text-destructive");
    expect(alert).toContain('data-slot="alert-description"');
    expect(alert).toContain("<svg");
    expect(alert).not.toContain("bg-warning");
  });

  it.each([
    toSetPasswordViewProps("person@example.com", undefined, true),
    toPasswordSavedViewProps("signout_failed", false),
    toPasswordSavedViewProps("revoke_failed", true),
  ])("keeps recovery and password-saved confirmations informational", (model) => {
    const html = renderToStaticMarkup(createElement(EntryView, { model }));
    expect(model.note).toBeUndefined();
    expect(model.info).toMatch(/Your (reset link verified|password was saved)/);
    expect(html).toMatch(/role="note"[^>]*class="[^"]*bg-info/);
    expect(html).not.toContain("bg-warning");
    if (model.error) expect(html).toMatch(/role="alert"[^>]*class="[^"]*text-destructive/);
  });

  it.each([expiredInviteModel, expiredResetModel, noMembershipModel, portalStaffOnlyModel, pageNotFoundModel])("preserves real entry warnings", (model) => {
    const html = renderToStaticMarkup(createElement(EntryView, { model }));
    expect(model.note).toBeTruthy();
    expect(html).toMatch(/role="note"[^>]*class="[^"]*bg-warning/);
  });
});

describe("#1517 staff and portal sign-in link each other", () => {
  it("each sign-in names the other one's screen", () => {
    expect(signIn.switchLink).toEqual({ label: "Customer? Sign in to the portal", to: "Portal sign in" });
    expect(portalSignIn.switchLink).toEqual({ label: "Brewery staff? Sign in to MGR", to: "Sign in" });
  });
  it("draws an inert link in the inventory and the live route when given one", () => {
    expect(renderToStaticMarkup(createElement(EntryView, { model: signIn }))).toMatch(/<a href="#" data-to="Portal sign in"[^>]*>Customer\? Sign in to the portal<\/a>/);
    expect(renderToStaticMarkup(createElement(EntryView, { model: signIn, switchHref: "/portal/login" }))).toMatch(/<a[^>]*href="\/portal\/login"[^>]*>Customer\? Sign in to the portal<\/a>/);
  });
  it("the live sign-in form links /login and /portal/login", async () => {
    const { readFileSync } = await import("node:fs");
    expect(readFileSync("components/login-form.tsx", "utf8")).toMatch(/switchHref=\{portal \? "\/login" : "\/portal\/login"\}/);
  });
});
