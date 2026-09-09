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
import { toConfirmDeliveryViewProps } from "../lib/mgr/confirm-delivery-view";
import { toDriverRouteViewProps } from "../lib/mgr/driver-route-view";
import { toReturnRouteViewProps } from "../lib/mgr/return-route-view";
import { toRouteViewProps } from "../lib/mgr/route-view";
import { toRoutesViewProps } from "../lib/mgr/routes-view";

const htmlOf = (node: ReactNode) => renderToStaticMarkup(createElement("div", null, node));
const screen = (name: string) => SCREENS.find((s) => s.name === name)!;
const src = (file: string) => readFileSync(file, "utf8");

describe("Routes", () => {
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
  it("the Route inventory record is RouteView", () => {
    const body = screen("Route").body as { type: unknown; props: { model: unknown } };
    expect(body.type).toBe(RouteView);
    expect(body.props.model).toEqual(toRouteViewProps(routeAPlan));
  });

  it("the live route pages mount RouteView and slot RouteForm", () => {
    const planned = src("app/(app)/routes/[id]/page.tsx");
    const created = src("app/(app)/routes/new/page.tsx");
    expect(planned).toMatch(/<RouteView\b/);
    expect(planned).toMatch(/<RouteForm\b/);
    expect(created).toMatch(/<RouteView\b/);
    expect(created).toMatch(/<RouteForm\b/);
  });
});

describe("Return route", () => {
  it("the Return route inventory record is ReturnRouteView", () => {
    const body = screen("Return route").body as { type: unknown; props: { model: unknown } };
    expect(body.type).toBe(ReturnRouteView);
    expect(body.props.model).toEqual(toReturnRouteViewProps(returnRouteA));
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
    expect(body.props.model).toEqual(toDriverRouteViewProps(driverRouteA));
  });

  it("renders Resume without leaking live hrefs", () => {
    const html = htmlOf(createElement(DriverRouteView, { model: toDriverRouteViewProps(driverRouteA) }));
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
    expect(body.props.model).toEqual(toConfirmDeliveryViewProps(confirmDeliveryStop1));
  });

  it("draws invoice timing once from the model", () => {
    const html = htmlOf(createElement(ConfirmDeliveryView, { model: toConfirmDeliveryViewProps(confirmDeliveryStop1) }));
    expect(html.match(/Invoice timing/g)?.length).toBe(1);
    expect(html).toMatch(/On delivery · saved/);
  });

  it("shows the shipment destination before delivery is confirmed", () => {
    const model = { ...confirmDeliveryStop1, shipTo: "Tap Room · Phoenixville, PA" };
    const html = htmlOf(createElement(ConfirmDeliveryView, { model }));
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
