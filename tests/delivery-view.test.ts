// tests/delivery-view.test.ts — Routes, Route, Return route, Driver route,
// and Confirm delivery. Views own no sample data. Live RouteForm / ReturnRoute
// / DeliveredForm stay wrappers.
import { readFileSync } from "node:fs";
import { createElement, isValidElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { SCREENS } from "../components/mgr/screens";
import { ConfirmDeliveryView } from "../components/mgr/views/confirm-delivery";
import { DriverRouteView } from "../components/mgr/views/driver-route";
import { ReturnRouteView } from "../components/mgr/views/return-route";
import { RouteView } from "../components/mgr/views/route";
import { RoutesView } from "../components/mgr/views/routes";
import {
  confirmDeliveryStop1, driverRouteA, returnRouteA, routeAPlan, routesDriver,
} from "../lib/mgr/fixtures/delivery";
import { toggleRouteStop } from "../lib/mgr/route-view";
import { workHrefsFor } from "../components/mgr/work-tabs";
import { toRoutesViewProps } from "../lib/mgr/routes-view";

const htmlOf = (node: ReactNode) => renderToStaticMarkup(createElement("div", null, node));
const screen = (name: string) => SCREENS.find((s) => s.name === name)!;
const src = (file: string) => readFileSync(file, "utf8");

describe("Routes", () => {
  it("keeps Transfers and Packaging Work navigation in their shared views", () => {
    for (const [route, view] of [["transfers", "transfers"], ["packaging", "packaging-runs"], ["purchase-orders", "purchase-orders"]]) {
      expect(src(`app/(app)/${route}/page.tsx`)).toContain("workHrefs={workHrefsFor(brewery.role)}");
      expect(src(`components/mgr/views/${view}.tsx`)).toContain("<TabBar");
      expect(src(`components/mgr/views/${view}.tsx`)).not.toMatch(/tabs\?: ReactNode/);
    }
  });
  it("uses the shared list and route-builder controls instead of JSX replacements", () => {
    expect(src("app/(app)/routes/page.tsx")).not.toMatch(/\blist=|tabs=\{null\}/);
    expect(src("app/(app)/routes/route-form.tsx")).toContain("<RouteView");
    expect(src("app/(app)/routes/route-form.tsx")).not.toMatch(/<Input\b|<Label\b|<Select\b/);
  });
  it("the Routes inventory record is RoutesView", () => {
    const body = screen("Routes").body as { type: unknown; props: { model: unknown } };
    expect(isValidElement(screen("Routes").body)).toBe(true);
    expect(body.type).toBe(RoutesView);
    expect(body.props.model).toEqual(toRoutesViewProps(routesDriver));
  });

  it("renders New route without leaking live hrefs", () => {
    const html = htmlOf(createElement(RoutesView, { model: toRoutesViewProps(routesDriver) }));
    expect(html).toMatch(/>New route</);
    expect(html).toMatch(/Route A/);
    expect(html).not.toMatch(/href="\/routes/);
  });

  it("the live deliveries page mounts RoutesView", () => {
    const page = src("app/(app)/routes/page.tsx");
    expect(page).toMatch(/<RoutesView\b/);
    expect(page).not.toMatch(/SCREENS/);
  });
});

describe("Route", () => {
  it("lets native stop fields handle clicks before explorer row navigation", () => {
    const explorer = src("components/mgr/screen-explorer.tsx");
    const guard = explorer.indexOf('.closest("input, select, textarea, label")');
    expect(guard).toBeGreaterThan(-1);
    expect(guard).toBeLessThan(explorer.indexOf('closest<HTMLElement>("a, button, [data-slot=item]")'));
  });
  it("keeps stop selection immutable and numbers new stops after the highest selected one", () => {
    const selected = { a: 2, b: 5 };
    expect(toggleRouteStop(selected, "c", true)).toEqual({ a: 2, b: 5, c: 6 });
    expect(toggleRouteStop(selected, "a", false)).toEqual({ b: 5 });
    expect(selected).toEqual({ a: 2, b: 5 });
  });
  it("locks delivered stops and departs only with the saved driver, not an unsaved selection", () => {
    const html = htmlOf(createElement(RouteView, { model: { ...routeAPlan, savedDriverId: null, stops: [{ key: "s1", title: "Delivered stop", detail: "delivered", locked: true }] }, error: "Plan changed" }));
    expect(html).toContain("Plan changed");
    expect(html).toMatch(/<input[^>]*type="checkbox"[^>]*disabled/);
    expect(html).toMatch(/<input[^>]*type="number"[^>]*disabled/);
    expect(html).toMatch(/<button[^>]*disabled[^>]*>Depart route/);
    expect(html).toContain("Assign a driver and save before departing");
    const empty = htmlOf(createElement(RouteView, { model: { ...routeAPlan, saved: false, selection: {} } }));
    expect(empty).not.toContain("Depart route");
    expect(empty).toMatch(/<button[^>]*disabled[^>]*>Save route plan/);
  });
  it("keeps Work route links within the staff navigation permissions", () => {
    expect(workHrefsFor("brewer")).toEqual({ all: "/work", batches: "/batches", runs: "/packaging" });
    expect(workHrefsFor("warehouse").routes).toBe("/routes");
    expect(workHrefsFor("sales").routes).toBeUndefined();
  });
  it("the Route inventory record is RouteView", () => {
    const body = screen("Route").body as { type: unknown; props: { model: unknown } };
    expect(body.type).toBe(RouteView);
    expect(body.props.model).toEqual(routeAPlan);
  });

  it("the live route pages delegate to RouteForm and the shared RouteView", () => {
    const planned = src("app/(app)/routes/[id]/page.tsx");
    const created = src("app/(app)/routes/new/page.tsx");
    expect(planned).toMatch(/<RouteForm\b/);
    expect(created).toMatch(/<RouteForm\b/);
    expect(src("app/(app)/routes/route-form.tsx")).toMatch(/<RouteView\b/);
    expect(planned + created).not.toMatch(/\bform=/);
  });
});

describe("Return route", () => {
  it("the Return route inventory record is ReturnRouteView", () => {
    const body = screen("Return route").body as { type: unknown; props: { model: unknown } };
    expect(body.type).toBe(ReturnRouteView);
    expect(body.props.model).toEqual(returnRouteA);
  });

  it("the live route page mounts ReturnRouteView when every stop is delivered", () => {
    const page = src("app/(app)/routes/[id]/page.tsx");
    expect(page).toMatch(/<ReturnRouteView\b/);
    expect(page).toMatch(/<ReturnRoute\b/);
  });
});

describe("Driver route", () => {
  it("the Driver route inventory record is DriverRouteView", () => {
    const body = screen("Driver route").body as { type: unknown; props: { model: unknown } };
    expect(body.type).toBe(DriverRouteView);
    expect(body.props.model).toEqual(driverRouteA);
  });

  it("renders Resume without leaking live hrefs", () => {
    const html = htmlOf(createElement(DriverRouteView, { model: driverRouteA }));
    expect(html).toMatch(/>Resume</);
    expect(html).not.toMatch(/href="\/work\/deliveries/);
  });

  it("the live route page mounts DriverRouteView for an open departed run", () => {
    const page = src("app/(app)/routes/[id]/page.tsx");
    expect(page).toMatch(/<DriverRouteView\b/);
  });
});

describe("Confirm delivery", () => {
  it("the Confirm delivery inventory record is ConfirmDeliveryView", () => {
    const body = screen("Confirm delivery").body as { type: unknown; props: { model: unknown } };
    expect(body.type).toBe(ConfirmDeliveryView);
    expect(body.props.model).toEqual(confirmDeliveryStop1);
  });

  it("draws invoice timing once from the model", () => {
    const html = htmlOf(createElement(ConfirmDeliveryView, { model: confirmDeliveryStop1 }));
    expect(html.match(/Invoice timing/g)?.length).toBe(1);
    expect(html).toMatch(/On delivery · saved/);
  });

  it("shows the shipment destination before delivery is confirmed", () => {
    const html = htmlOf(createElement(ConfirmDeliveryView, { model: confirmDeliveryStop1 }));
    expect(html).toMatch(/Ship to/);
    expect(html).toMatch(/Tap Room · Phoenixville, PA/);
  });

  it("the live stop page mounts ConfirmDeliveryView and slots DeliveredForm", () => {
    const page = src("app/(app)/work/deliveries/[id]/page.tsx");
    expect(page).toMatch(/<ConfirmDeliveryView\b/);
    expect(page).toMatch(/<DeliveredForm\b/);
    expect(page).not.toMatch(/E\.fld\("Invoice timing"/);
  });
});
