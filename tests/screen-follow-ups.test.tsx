import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { SCREENS } from "@/components/mgr/screens";
import { E } from "@/components/mgr/e";
import { ConfirmDeliveryView } from "@/components/mgr/views/confirm-delivery";
import { RefusedReturnStatusView } from "@/components/mgr/views/refused-return";
import { ReleaseAllocationView } from "@/components/mgr/views/replenishment-quantity";
import { RouteError } from "@/components/mgr/route-error";
import { confirmDeliveryStop1 } from "@/lib/mgr/fixtures/delivery";
import { brewPrepMineral, brewTimelineMineral } from "@/lib/mgr/fixtures/production";
import { isInertOn, resolveTap } from "@/lib/mgr/screen-links";

const screen = (name: string) => SCREENS.find(candidate => candidate.name === name)!;

describe("screen parity follow-ups", () => {
  it("opens each fixture ingredient from prep and the brew timeline", () => {
    for (const [name, ingredients] of [["Brew prep", brewPrepMineral.ingredients], ["Brew day timeline", brewTimelineMineral.ingredients]] as const) {
      for (const ingredient of ingredients) {
        expect(resolveTap(screen(name), ingredient.name), `${name}: ${ingredient.name}`).toBe("Edit material");
      }
    }
  });

  it("keeps reset submissions on the reset form and maps current shell destinations", () => {
    for (const name of ["Reset password", "Portal forgot password"]) {
      expect(resolveTap(screen(name), "Send reset link")).toBeUndefined();
      expect(isInertOn(screen(name), "Send reset link")).toBe(true);
    }
    for (const [href, target] of [["/taproom", "Weekly count"], ["/taproom/board", "Tap board"], ["/taproom/variance", "Variance by brand"], ["/menu", "Menu"]]) {
      expect(resolveTap(screen("Today"), "Open", href)).toBe(target);
    }
    expect(resolveTap(screen("Pars and allocation"), "Release")).toBe("Release standing allocation");
    expect(resolveTap(screen("Release standing allocation"), "Release allocation")).toBe("Pars and allocation");
  });

  it.each([
    ["Delivery not departed", "The route has not departed"],
    ["Delivery other driver", "assigned driver or an admin"],
    ["Delivery recorded", "INV-0241"],
    ["Delivery transfer in transit", "Transfer remains in transit until received or cancelled"],
  ])("draws %s with no editable delivery outcome", (name, message) => {
    const html = renderToStaticMarkup(screen(name).body);
    expect(html).toContain(message);
    expect(html).not.toContain("confirm-delivery");
    expect(html).not.toContain("Not delivered · leave for a later route");
  });

  it("keeps physical refusal check-in on customer outcomes, not internal transfers", () => {
    const readout = { kind: "delivered" as const, receivedBy: "Dana", outcome: "Partial", invoice: "INV-0241", refused: true, checkInHref: "/work/deliveries/stop/return" };
    const customer = renderToStaticMarkup(<ConfirmDeliveryView model={confirmDeliveryStop1} readout={{ ...readout, transfer: false }} />);
    expect(customer).toContain('href="/work/deliveries/stop/return"');
    const transfer = renderToStaticMarkup(<ConfirmDeliveryView model={confirmDeliveryStop1} readout={{ ...readout, transfer: true }} />);
    expect(transfer).not.toContain("Check in refused beer");
    expect(transfer).toContain("Transfer remains in transit");
  });

  it("distinguishes an empty check-in from the already-invoiced correction path", () => {
    expect(renderToStaticMarkup(<RefusedReturnStatusView />)).toContain("No refused beer awaiting check-in");
    const billed = renderToStaticMarkup(<RefusedReturnStatusView invoiceNow returnHref="/invoices/invoice/return" />);
    expect(billed).toContain("This shipment was invoiced at ship");
    expect(billed).toContain('href="/invoices/invoice/return"');
    expect(renderToStaticMarkup(<RefusedReturnStatusView invoiceNow returnHref={null} />)).not.toContain("<a");
  });

  it("names the reservation and preserves its busy confirmation", () => {
    const html = renderToStaticMarkup(<ReleaseAllocationView sku="Fictional IPA" qty={2.5} submitting />);
    expect(html).toContain("Release 2.5 units of Fictional IPA");
    expect(html).toContain("Releasing…");
    expect(html).toContain("disabled");
  });

  it("shows a safe reference and retry without exposing the thrown message", () => {
    const error = Object.assign(new Error("private database detail"), { digest: "reference-123" });
    const html = renderToStaticMarkup(<RouteError error={error} retry={() => {}} />);
    expect(html).toContain("Reference: reference-123");
    expect(html).toContain("Try again");
    expect(html).not.toContain("private database detail");
    expect(renderToStaticMarkup(<RouteError error="private database detail" retry={() => {}} />)).not.toContain("Reference:");
  });

  it("keeps shared switch state, callbacks, locking, and the disabled reason", () => {
    const onChange = () => {};
    const toggle = E.sw(true, "Payment option", onChange, true, { "aria-describedby": "disabled-reason" });
    expect(toggle.props).toMatchObject({ checked: true, onCheckedChange: onChange, disabled: true, "aria-label": "Payment option", "aria-describedby": "disabled-reason" });
    expect(E.sw(false, "Fixture option").props.defaultChecked).toBe(false);
  });

  it("keeps developer policy out of the Taproom persona's rendered footer", () => {
    const html = renderToStaticMarkup(createElement("div", null, screen("Taproom").body));
    expect(html).not.toContain("Observed facts only");
    expect(screen("Taproom").spec).toContain("Observed facts only");
  });
});
