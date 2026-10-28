// Both delivery verbs save their request under the stop's id, so an unresolved
// request on one stop never locks another stop's actions. Either verb returns
// the driver to the route (#1505), and Received by starts from the stop's
// earlier signers.
import { expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";
const { action, view, router } = vi.hoisted(() => ({
  action: { busy: false, error: null, failure: null, run: vi.fn() },
  view: { props: {} as { onSubmit?: (input: object) => void; onLeave?: () => void; initialSignedBy?: string; receivedSuggestions?: string[] } },
  router: { push: vi.fn(), refresh: vi.fn() },
}));
vi.mock("next/navigation", () => ({ useRouter: () => router }));
vi.mock("@/lib/commands/use-command-form", () => ({ useCommandAction: () => action }));
vi.mock("@/lib/brewery-provider", () => ({ useCommandContext: () => ({ actorId: "driver", breweryId: "brewery" }) }));
vi.mock("@/components/mgr/views/confirm-delivery", () => ({ DeliveryOutcomeForm: (props: typeof view.props) => { view.props = props; return null; } }));
import { DeliveredForm } from "@/app/(app)/work/deliveries/[id]/delivered-form";

it("runs confirm_delivery and leave_delivery_for_later targeted at the stop, each returning to the route", () => {
  renderToStaticMarkup(createElement(DeliveredForm, { routeId: "route", deliveryId: "stop", transfer: false, lines: [], signers: [] }));
  view.props.onSubmit?.({ signedBy: "Ann", refused: [], note: "", transferRefused: false });
  view.props.onLeave?.();
  expect(action.run).toHaveBeenNthCalledWith(1, "confirm_delivery", expect.objectContaining({ deliveryId: "stop" }), expect.any(Function), { target: "stop", refresh: false });
  expect(action.run).toHaveBeenNthCalledWith(2, "leave_delivery_for_later", { routeId: "route", deliveryId: "stop" }, expect.any(Function), { target: "stop", refresh: false });
  action.run.mock.calls[0][2]();
  expect(router.push).toHaveBeenCalledWith("/routes/route");
});

it("prefills Received by with the newest earlier signer and suggests the rest", () => {
  renderToStaticMarkup(createElement(DeliveredForm, { routeId: "route", deliveryId: "stop", transfer: false, lines: [], signers: ["Dana", "Chris"] }));
  expect(view.props).toMatchObject({ initialSignedBy: "Dana", receivedSuggestions: ["Dana", "Chris"] });
});
