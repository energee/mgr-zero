// Exercises the shared entry form's submit-button validation without invoking Auth.
import { createElement, isValidElement, type ReactElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { EntryView } from "../components/mgr/views/entry";
import { signIn, portalSignIn } from "../lib/mgr/fixtures/entry";

type NodeProps = { children?: ReactNode; type?: string; action?: (form: FormData) => void; formNoValidate?: boolean; onClick?: (event: unknown) => void; onSubmit?: (event: unknown) => void };
function descendants(node: ReactNode): ReactElement<NodeProps>[] {
  if (Array.isArray(node)) return node.flatMap(descendants);
  if (!isValidElement<NodeProps>(node)) return [];
  return [node, ...descendants(node.props.children)];
}

describe("email-link form boundary (#708)", () => {
  it("renders a non-network fixture action before hydration", () => {
    const html = renderToStaticMarkup(createElement(EntryView, { model: signIn }));
    expect(html.match(/<form[^>]*>/)?.[0]).toMatch(/action="javascript:/);
  });

  it("keeps email-only validation when display wording changes", () => {
    const view = EntryView({ model: { ...signIn, secondary: "Send sign-in link" }, action: vi.fn(), secondaryAction: vi.fn() });
    const button = descendants(view).find(node => node.props.children === "Send sign-in link")!;
    expect(button.props.formNoValidate).toBe(true);
    expect(button.props.onClick).toBeTypeOf("function");
  });

  it.each([false, true])("checks only email before the secondary action (live=%s)", (live) => {
    const view = EntryView({ model: signIn, ...(live ? { action: vi.fn(), secondaryAction: vi.fn() } : {}) });
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
