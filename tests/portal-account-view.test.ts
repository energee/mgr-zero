// tests/portal-account-view.test.ts — Account and Portal Me adapters plus
// HTML. Views own no sample data; this file does not import SCREENS or app/.
import { readFileSync } from "node:fs";
import { createElement, isValidElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { SCREENS } from "../components/mgr/screens";
import { PortalAccountView } from "../components/mgr/views/portal-account";
import { PortalMeView } from "../components/mgr/views/portal-me";
import { portalAccountRidgeline, portalMeRidgeline } from "../lib/mgr/fixtures/portal-account";
import { RIDGELINE } from "../lib/mgr/fixtures/demo";
import { money } from "../lib/mgr/money";
import { toPortalAccountViewProps } from "../lib/mgr/portal-account-view";
import { toPortalMeViewProps } from "../lib/mgr/portal-me-view";

const htmlOf = (node: ReactNode) => renderToStaticMarkup(createElement("div", null, node));

describe("Account view", () => {
  it("maps get_portal_account through the adapter", () => {
    const model = toPortalAccountViewProps(portalAccountRidgeline);
    expect(model.customer).toBe(RIDGELINE.name);
    expect(model.shipTos.map((s) => [s.title, s.detail])).toEqual([
      ["Main ship-to", "Phoenixville, PA"],
      ["Dock ship-to", "Royersford, PA"],
    ]);
    expect(model.membership).toEqual({ title: "You · buyer", detail: "this login", trailing: "active" });
    expect(model.deposits).toEqual([{
      key: "½ bbl",
      title: "Keg deposits held",
      detail: "38 × ½ bbl",
      amount: money(114000),
    }]);
    expect(model.info).toBe("Contact the brewery to change account details.");
  });

  it("omits keg-deposit rows when the snapshot has none", () => {
    const model = toPortalAccountViewProps({ ...portalAccountRidgeline, deposits: [] });
    expect(model.deposits).toEqual([]);
    const html = htmlOf(createElement(PortalAccountView, { model }));
    expect(html).toMatch(/Main ship-to/);
    expect(html).not.toMatch(/Keg deposits/);
  });

  it("renders Main ship-to and keg deposits from the adapter", () => {
    const html = htmlOf(createElement(PortalAccountView, { model: toPortalAccountViewProps(portalAccountRidgeline) }));
    expect(html).toMatch(/Main ship-to/);
    expect(html).toMatch(/Phoenixville, PA/);
    expect(html).toMatch(/Dock ship-to/);
    expect(html).toMatch(/Keg deposits/);
    expect(html).toMatch(/38 × ½ bbl/);
    expect(html).toContain(money(114000));
    expect(html).toContain(RIDGELINE.name);
    expect(html).not.toMatch(/→/);
  });
});

describe("Portal Me view", () => {
  it("maps email and account from the snapshot", () => {
    const model = toPortalMeViewProps(portalMeRidgeline);
    expect(model.email).toBe("jordan@ridgelinetap.com");
    expect(model.account).toBe(RIDGELINE.name);
  });

  it("renders Change password and Sign out", () => {
    const html = htmlOf(createElement(PortalMeView, { model: toPortalMeViewProps(portalMeRidgeline) }));
    expect(html).toMatch(/Signed in as/);
    expect(html).toMatch(/jordan@ridgelinetap.com/);
    expect(html).toMatch(/Change password/);
    expect(html).toMatch(/Sign out/);
    expect(html).toContain(RIDGELINE.name);
    expect(html).not.toMatch(/→/);
  });

  it("a footer slot replaces the inventory buttons", () => {
    const html = htmlOf(createElement(PortalMeView, {
      model: toPortalMeViewProps(portalMeRidgeline),
      footer: "live footer",
    }));
    expect(html).toMatch(/live footer/);
    expect(html).not.toMatch(/Change password/);
    expect(html).not.toMatch(/Sign out/);
  });
});

describe("inventory and live Account", () => {
  it("the Account inventory record is PortalAccountView", () => {
    const body = SCREENS.find((s) => s.name === "Account")!.body as { type: unknown; props: { model: unknown } };
    expect(isValidElement(SCREENS.find((s) => s.name === "Account")!.body)).toBe(true);
    expect(body.type).toBe(PortalAccountView);
    expect(body.props.model).toEqual(toPortalAccountViewProps(portalAccountRidgeline));
  });

  it("the Portal Me inventory record is PortalMeView", () => {
    const body = SCREENS.find((s) => s.name === "Portal Me")!.body as { type: unknown; props: { model: unknown } };
    expect(body.type).toBe(PortalMeView);
    expect(body.props.model).toEqual(toPortalMeViewProps(portalMeRidgeline));
  });

  it("the live Account page mounts PortalAccountView with no second E.* tree", () => {
    const src = readFileSync("app/(portal)/portal/account/page.tsx", "utf8");
    expect(src).toMatch(/<PortalAccountView\b/);
    expect(src).not.toMatch(/from "@\/components\/mgr\/e"/);
  });

  it("the live portal Me sheet mounts PortalMeView with the real actions", () => {
    const layout = readFileSync("app/(portal)/layout.tsx", "utf8");
    expect(layout).toMatch(/from "@\/components\/mgr\/views\/portal-me"/);
    expect(layout).toMatch(/toPortalMeViewProps/);
    expect(layout).toMatch(/<MeSheet[\s\S]*<PortalMeView\b/);
    expect(layout).toMatch(/<MeSheetActions signOut="outline"/);
  });
});
