// Shared invoice accounting controls: allowed actions, confirmation consent, and write-off feedback.
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { InvoiceAccountingActionsView, PushInvoiceView, WriteOffInvoiceView } from "@/components/mgr/views/invoice-accounting";
import { qboInvoicePresentation, type QboInvoiceAction, type QboRemoteCreateAction } from "@/lib/mgr/qbo-ui";

const htmlOf = (node: Parameters<typeof renderToStaticMarkup>[0]) => renderToStaticMarkup(node);

describe("Invoice accounting actions", () => {
  it.each([
    [["fix_mapping", "corrected_push"], ["Fix mapping", "Push corrected invoice"]],
    [["push"], ["Push to QuickBooks"]],
    [["retry"], ["Retry exact push"]],
    [["repush", "write_off"], ["Re-push deleted invoice", "Write off"]],
  ] satisfies [QboInvoiceAction[], string[]][])("offers only authorized actions %j", (actions: QboInvoiceAction[], labels: string[]) => {
    const html = htmlOf(createElement(InvoiceAccountingActionsView, { invoiceLabel: "INV-42", actions, mappingHref: "/invoices/42/mapping" }));
    for (const label of labels) expect(html).toContain(`>${label}<`);
    expect(html.match(/<button\b/g)?.length ?? 0).toBe(labels.length - (actions.includes("fix_mapping") ? 1 : 0));
    if (actions.includes("fix_mapping")) expect(html).toContain('href="/invoices/42/mapping"');
    expect(html).not.toContain("Confirm push");
    expect(html).not.toContain("Confirm write-off");
  });

  it("offers no accounting writes for read-only roles", () => {
    const { actions } = qboInvoicePresentation({ kind: "invoice", roles: ["warehouse"], connected: true, syncStatus: "pending", localPaidCents: 0 });
    expect(htmlOf(createElement(InvoiceAccountingActionsView, { invoiceLabel: "INV-42", actions }))).not.toMatch(/<button|<a\b/);
  });

  it.each([
    ["push", "frozen invoice details", "Confirm push"],
    ["retry", "exact saved request", "Confirm exact retry"],
    ["corrected_push", "rejected mapping was fixed", "Confirm corrected push"],
    ["repush", "prior QuickBooks document was deleted", "Confirm re-push"],
  ] satisfies [QboRemoteCreateAction, string, string][])("explains and confirms %s without sending when opened", (action, detail, label) => {
    const confirm = vi.fn();
    const view = PushInvoiceView({ action, invoiceLabel: "INV-42", onConfirm: confirm });
    const html = htmlOf(view);
    expect(html).toContain("INV-42");
    expect(html).toContain(detail);
    expect(html).toContain(`>${label}<`);
    expect(confirm).not.toHaveBeenCalled();
    view.props.children[2].props.children.props.onClick();
    expect(confirm).toHaveBeenCalledOnce();
  });

  it("keeps failed push feedback visible and disables confirmation while sending", () => {
    const html = htmlOf(createElement(PushInvoiceView, { action: "retry", invoiceLabel: "INV-42", busy: true, error: "QuickBooks refused this request" }));
    expect(html).toContain('role="alert"');
    expect(html).toContain("QuickBooks refused this request");
    expect(html).toContain("disabled");
    expect(html).toContain("Sending…");
  });
});

describe("Write off invoice", () => {
  it.each(["", "   "])("requires a nonblank reason %j", reason => {
    const html = htmlOf(createElement(WriteOffInvoiceView, { reason }));
    expect(html).toContain('maxLength="500"');
    expect(html).toContain("required");
    expect(html).toContain("disabled");
    expect(html).toContain("Still needed: a reason");
    expect(html).toContain("does not change QuickBooks, record cash, or create a credit");
  });

  it("retains the entered reason beside the server error", () => {
    const html = htmlOf(createElement(WriteOffInvoiceView, { reason: "Customer closed", error: "Invoice changed; review it again" }));
    expect(html).toContain('value="Customer closed"');
    expect(html).toContain('role="alert"');
    expect(html).toContain("Invoice changed; review it again");
    expect(html).not.toContain('disabled=""');
  });

  it("freezes the reason and confirm action while saving", () => {
    const html = htmlOf(createElement(WriteOffInvoiceView, { reason: "Customer closed", busy: true }));
    expect(html.match(/disabled=""/g)).toHaveLength(2);
    expect(html).toContain("Writing off…");
  });
});
