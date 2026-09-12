// tests/compliance-view.test.ts — Compliance months, registry, sheets, and
// lot trace. Views own no sample data. Live registry forms stay wrappers.
import { readFileSync } from "node:fs";
import { createElement, isValidElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { SCREENS } from "../components/mgr/screens";
import { BrandApprovalView } from "../components/mgr/views/brand-approval";
import { ComplianceMonthsView } from "../components/mgr/views/compliance-months";
import { LicensesView } from "../components/mgr/views/licenses";
import { LicenseView } from "../components/mgr/views/license";
import { LotTraceView } from "../components/mgr/views/lot-trace";
import { StateRegistrationView } from "../components/mgr/views/state-registration";
import {
  brandApprovalStout, complianceMonthsDemo, licensesDemo, licensePaBrewery, lotTraceHazy, stateRegistrationHazy,
} from "../lib/mgr/fixtures/compliance";
import { toBrandApprovalViewProps } from "../lib/mgr/brand-approval-view";
import { toComplianceMonthsViewProps } from "../lib/mgr/compliance-months-view";
import { toLicensesViewProps } from "../lib/mgr/licenses-view";
import { toBrandViewProps } from "../lib/mgr/brand-view";
import { brandHazy } from "../lib/mgr/fixtures/catalog";
import { toLicenseViewProps } from "../lib/mgr/license-view";
import { toLotTraceViewProps } from "../lib/mgr/lot-trace-view";
import { toStateRegistrationViewProps } from "../lib/mgr/state-registration-view";

const htmlOf = (node: ReactNode) => renderToStaticMarkup(createElement("div", null, node));
const screen = (name: string) => SCREENS.find((s) => s.name === name)!;
const src = (file: string) => readFileSync(file, "utf8");

describe("Compliance months", () => {
  it("the Compliance months inventory record is ComplianceMonthsView", () => {
    const body = screen("Compliance months").body as { type: unknown; props: { model: unknown } };
    expect(isValidElement(screen("Compliance months").body)).toBe(true);
    expect(body.type).toBe(ComplianceMonthsView);
    expect(body.props.model).toEqual(toComplianceMonthsViewProps(complianceMonthsDemo));
  });

  it("renders licenses and lot navs without leaking live hrefs", () => {
    const html = htmlOf(createElement(ComplianceMonthsView, { model: toComplianceMonthsViewProps(complianceMonthsDemo) }));
    expect(html).toMatch(/Licenses/);
    expect(html).not.toMatch(/Compliance registry/);
    expect(html).toMatch(/L-240831-HZ/);
    expect(html).not.toMatch(/href="\/compliance/);
  });

  it("the live compliance page mounts ComplianceMonthsView", () => {
    const page = src("app/(app)/compliance/page.tsx");
    expect(page).toMatch(/<ComplianceMonthsView\b/);
    expect(page).not.toMatch(/SCREENS/);
  });
});

describe("Licenses", () => {
  it("the Licenses inventory record is LicensesView: the brewery's licenses, no brand tab", () => {
    const body = screen("Licenses").body as { type: unknown; props: { model: unknown } };
    expect(body.type).toBe(LicensesView);
    expect(body.props.model).toEqual(toLicensesViewProps(licensesDemo));
    const html = htmlOf(screen("Licenses").body);
    expect(html).not.toMatch(/tablist/);
    expect(html).not.toMatch(/Hazy IPA|COLA|registration/);
    expect(html).toMatch(/PA brewery/);
  });

  it("the live licenses page mounts LicensesView and slots the license form only", () => {
    const page = src("app/(app)/compliance/licenses/page.tsx");
    expect(page).toMatch(/<LicensesView\b/);
    expect(page).toMatch(/<LicenseForm\b/);
    expect(page).not.toMatch(/ApprovalForm|RegistrationForm/);
    expect(page).not.toMatch(/import \{ E \}/);
    expect(page).not.toMatch(/\bE\./);
  });

  it("the live Brand page slots approval and registration sheets per row", () => {
    const page = src("app/(app)/catalog/brands/[id]/brand-page.tsx");
    expect(page).toMatch(/<ApprovalForm\b/);
    expect(page).toMatch(/<RegistrationForm\b/);
    expect(page).not.toMatch(/LicenseForm/);
  });
});

describe("registry sheets", () => {
  it("the Brand approval inventory record is BrandApprovalView", () => {
    const body = screen("Brand approval").body as { type: unknown; props: { model: unknown } };
    expect(body.type).toBe(BrandApprovalView);
    expect(body.props.model).toEqual(toBrandApprovalViewProps(brandApprovalStout));
  });

  it("the State registration inventory record is StateRegistrationView", () => {
    const body = screen("State registration").body as { type: unknown; props: { model: unknown } };
    expect(body.type).toBe(StateRegistrationView);
    expect(body.props.model).toEqual(toStateRegistrationViewProps(stateRegistrationHazy));
  });

  it("the License inventory record is LicenseView", () => {
    const body = screen("License").body as { type: unknown; props: { model: unknown } };
    expect(body.type).toBe(LicenseView);
    expect(body.props.model).toEqual(toLicenseViewProps(licensePaBrewery));
    expect(src("components/mgr/views/license.tsx")).toMatch(/value: "brewery", label: "Brewery"/);
  });

  it("lists a COLA on its brand by serial and submitted date, never an expiry", () => {
    const cola = toBrandViewProps(brandHazy).compliance.find((row) => row.title.startsWith("COLA"))!;
    expect(cola.title).toMatch(/^COLA serial /);
    expect(cola.detail).toMatch(/^submitted |^not submitted$/);
    expect(cola.detail).not.toMatch(/expires/);
  });

  it("states a known brand on a registration instead of picking one", () => {
    const html = htmlOf(createElement(StateRegistrationView, { model: stateRegistrationHazy }));
    expect(html).toContain("Hazy IPA");
    expect(html).not.toMatch(/<button[^>]*aria-label="Brand"/);
  });

  it("names the COLA number a serial and never offers an expiry: COLAs do not expire", () => {
    const html = htmlOf(createElement(BrandApprovalView, { model: brandApprovalStout }));
    expect(html).toMatch(/Serial number/);
    expect(html).not.toMatch(/COLA number/);
    expect(html).not.toMatch(/Expires/);
    expect(html).toMatch(/Date submitted/);
    expect(html).not.toMatch(/Approved on/);
  });

  it("keeps the formula label on a formula approval", () => {
    const html = htmlOf(createElement(BrandApprovalView, { model: { ...brandApprovalStout, kind: "formula" } }));
    expect(html).toMatch(/Formula number/);
  });

  it("states a known brand instead of picking one", () => {
    const html = htmlOf(createElement(BrandApprovalView, { model: brandApprovalStout }));
    expect(html).toContain("Stout");
    expect(html).not.toMatch(/<button[^>]*aria-label="Brand"/);
  });

  it("lets live callers suppress fixture form and row-action defaults with null", () => {
    expect(htmlOf(createElement(BrandApprovalView, { model: brandApprovalStout, footer: null }))).not.toMatch(/Save approval/);
    expect(htmlOf(createElement(StateRegistrationView, { model: stateRegistrationHazy, footer: null }))).not.toMatch(/Save registration/);
    expect(htmlOf(createElement(LicenseView, { model: licensePaBrewery, footer: null }))).not.toMatch(/Save license/);
    const model = toLicensesViewProps(licensesDemo);
    const defaultLicenses = htmlOf(createElement(LicensesView, { model }));
    const licenses = htmlOf(createElement(LicensesView, { model, actions: { pa: null } }));
    expect(licenses.match(/>Edit<\/button>/g) ?? []).toHaveLength((defaultLicenses.match(/>Edit<\/button>/g)?.length ?? 0) - 1);
  });

  it("the live sheet wrappers mount the three shared controlled bodies", () => {
    const brandForms = src("app/(app)/catalog/brands/[id]/compliance-forms.tsx");
    const licenseForm = src("app/(app)/compliance/licenses/license-form.tsx");
    for (const [forms, view] of [[brandForms, "BrandApprovalView"], [brandForms, "StateRegistrationView"], [licenseForm, "LicenseView"]] as const) {
      expect(forms).toMatch(new RegExp(`<${view}\\b`));
      expect(forms).toMatch(/controls=\{controls\}/);
      expect(forms).not.toMatch(/<Label\b|<Input\b|<Select\b/);
    }
  });
});

describe("Lot trace", () => {
  it("the Lot trace inventory record is LotTraceView", () => {
    const body = screen("Lot trace").body as { type: unknown; props: { model: unknown } };
    expect(body.type).toBe(LotTraceView);
    expect(body.props.model).toEqual(toLotTraceViewProps(lotTraceHazy));
  });

  it("the live lot page mounts LotTraceView", () => {
    const page = src("app/(app)/compliance/lots/[id]/page.tsx");
    expect(page).toMatch(/<LotTraceView\b/);
    expect(page).not.toMatch(/import \{ E \}/);
    expect(page).not.toMatch(/\bE\./);
  });

  it("lets the live page suppress the inventory tape", () => {
    const html = htmlOf(createElement(LotTraceView, {
      model: toLotTraceViewProps(lotTraceHazy),
      tape: null,
      movements: createElement("p", null, "Live movements"),
    }));
    expect(html).not.toMatch(/production in/);
    expect(html).toMatch(/Live movements/);
  });

  it("keeps fixture links inert and preserves null slot suppression", () => {
    const model = toLotTraceViewProps({
      ...lotTraceHazy,
      recipients: [{ id: "order", order_no: 7, customers: { id: "customer", name: "Buyer" }, ship_tos: null, shipments: [{ id: "shipment", carrier: null, tracking: null, invoices: [{ id: "invoice", invoice_no: 9 }] }] }],
    });
    const html = htmlOf(createElement(LotTraceView, { model, tape: null, balances: null, recipients: null, movements: null }));
    expect(html).not.toMatch(/href="\/(orders|customers|invoices)/);
    expect(html).not.toMatch(/Recorded balances by SKU and bin[\s\S]*118 units/);
    expect(html).not.toMatch(/Order 7|production in/);
  });

  it("preserves live movement provenance and links", () => {
    const model = toLotTraceViewProps({
      ...lotTraceHazy,
      movements: [{ ...lotTraceHazy.movements[1], id: "return", type: "return_in", bin: "Returns", bbl: 0.13, ref: "credit", source_movement_id: "shipped" }],
    }, "/compliance");
    const html = htmlOf(createElement(LotTraceView, { model, tape: null }));
    expect(html).toMatch(/Returns · 9\/2/);
    expect(html).toMatch(/0\.13 bbl recorded/);
    expect(html).toMatch(/href="#movement-shipped"/);
    expect(html).toMatch(/href="\/invoices\/credit"/);
  });

  it("formats every date as a short calendar day and owns every movement SKU", () => {
    const model = toLotTraceViewProps(lotTraceHazy);
    expect(model.skuDetail).toBe("run 28 · packaged 8/31 · best by 2/27");
    expect(model.tankBatch).toBe("FV-3 · batch 41 · brewed 8/10");
    expect(model.tape).toEqual([
      { key: "in", label: "+120 · production in · Hazy IPA · 16 oz case · Warehouse", when: "8/31" },
      { key: "sample", label: "−2 · sample · Hazy IPA · 16 oz case · Warehouse", when: "9/2" },
    ]);
    expect(model.movements?.map(({ title, detail }) => ({ title, detail }))).toEqual([
      { title: "+120 · production in · Hazy IPA · 16 oz case", detail: "Warehouse · Cooler · 8/31" },
      { title: "-2 · sample · Hazy IPA · 16 oz case", detail: "Warehouse · Cooler · 9/2" },
    ]);
    expect(model.balances.map(({ title }) => title)).toEqual(["Hazy IPA · 16 oz case"]);
    expect(toLotTraceViewProps({
      ...lotTraceHazy,
      balances: [{ ...lotTraceHazy.balances[0], sku: "16 oz case" }],
    }).balances.map(({ title }) => title)).toEqual(["Hazy IPA · 16 oz case"]);
  });

  it("does not repeat a brand-owned SKU name and keeps the empty-recipient state", () => {
    const model = toLotTraceViewProps({
      ...lotTraceHazy,
      movements: [{ ...lotTraceHazy.movements[0], sku: "Hazy IPA · 16 oz case" }],
    }, "/compliance");
    const html = htmlOf(createElement(LotTraceView, { model, tape: null }));
    expect(html).toMatch(/Hazy IPA · 16 oz case/);
    expect(html).not.toMatch(/Hazy IPA · Hazy IPA/);
    expect(html).toMatch(/No recorded shipments of this lot/);
  });
});
