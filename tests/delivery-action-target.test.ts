// Both delivery verbs save their request under the stop's id, so an unresolved
// request on one stop never locks another stop's actions.
import { expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";
const { action, view } = vi.hoisted(() => ({ action: { busy: false, error: null, failure: null, run: vi.fn() }, view: { props: {} as { onSubmit?: (input: object) => void; onLeave?: () => void } } }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }));
vi.mock("@/lib/commands/use-command-form", () => ({ useCommandAction: () => action }));
vi.mock("@/lib/brewery-provider", () => ({ useCommandContext: () => ({ actorId: "driver", breweryId: "brewery" }) }));
vi.mock("@/components/mgr/views/confirm-delivery", () => ({ DeliveryOutcomeForm: (props: typeof view.props) => { view.props = props; return null; } }));
import { DeliveredForm } from "@/app/(app)/work/deliveries/[id]/delivered-form";

it("runs confirm_delivery and leave_delivery_for_later targeted at the stop", () => {
  renderToStaticMarkup(createElement(DeliveredForm, { routeId: "route", deliveryId: "stop", transfer: false, lines: [] }));
  view.props.onSubmit?.({ signedBy: "Ann", refused: [], note: "", transferRefused: false });
  view.props.onLeave?.();
  expect(action.run).toHaveBeenNthCalledWith(1, "confirm_delivery", expect.objectContaining({ deliveryId: "stop" }), undefined, { target: "stop" });
  expect(action.run).toHaveBeenNthCalledWith(2, "leave_delivery_for_later", { routeId: "route", deliveryId: "stop" }, expect.any(Function), { target: "stop", refresh: false });
});
