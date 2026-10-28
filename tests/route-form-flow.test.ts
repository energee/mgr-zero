// tests/route-form-flow.test.ts — the Route builder's shortcuts (#1505):
// /routes/new?add={id} ticks that document as stop 1 when it is a candidate,
// and a new route's first save opens the saved route, where Depart route is.
import { beforeEach, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";
const { action, view, router } = vi.hoisted(() => ({
  action: { busy: false, error: null, run: vi.fn() },
  view: { props: {} as { model: { selection: Record<string, number> }; onSave: () => void } },
  router: { push: vi.fn(), refresh: vi.fn() },
}));
vi.mock("next/navigation", () => ({ useRouter: () => router }));
vi.mock("@/lib/commands/use-command-form", () => ({ useCommandAction: () => action }));
vi.mock("@/components/mgr/views/route", () => ({ RouteView: (props: typeof view.props) => { view.props = props; return null; } }));
import { RouteForm } from "@/app/(app)/routes/route-form";

const candidates = [{ id: "sh-1", label: "ORD-0001 · Ridgeline", kind: "shipment" as const }];
const render = (add?: string) => renderToStaticMarkup(createElement(RouteForm, { route: null, candidates, drivers: [], today: "2026-10-27", add }));

beforeEach(() => { action.run.mockReset(); router.push.mockReset(); });

it("preselects ?add only when it is among the candidates", () => {
  render("sh-1");
  expect(view.props.model.selection).toEqual({ "sh-1": 1 });
  render("not-a-candidate");
  expect(view.props.model.selection).toEqual({});
});

it("opens the new route after its first save", () => {
  render("sh-1");
  view.props.onSave();
  expect(action.run).toHaveBeenCalledWith("save_route", expect.objectContaining({ stops: [{ shipmentId: "sh-1", stopNo: 1 }] }), expect.any(Function));
  action.run.mock.calls[0][2]({ routeId: "route-9" });
  expect(router.push).toHaveBeenCalledWith("/routes/route-9");
});
