// tests/compliance-view.test.ts — Compliance months, Licenses, the brand's
// approval and registration sheets, and lot trace. Views own no sample data.
// Live sheet wrappers mount the shared bodies.
import { formatDate } from "@/lib/date-format";
import { readFileSync } from "node:fs";
import { createElement, isValidElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { SCREENS } from "../components/mgr/screens";
import { BrandApprovalView } from "../components/mgr/views/brand-approval";
import { ComplianceMonthsView } from "../components/mgr/views/compliance-months";
import { LicensesView } from "../components/mgr/views/licenses";
import { LicenseView } from "../components/mgr/views/license";
import { MaterialLotTraceView } from "../components/mgr/views/material-lot-trace";
import { toMaterialLotTraceViewProps } from "../lib/mgr/material-lot-trace-view";
import { LotTraceView } from "../components/mgr/views/lot-trace";
import { StateRegistrationView } from "../components/mgr/views/state-registration";
import {
  brandApprovalStout, complianceMonthsDemo, licensesDemo, licensePaBrewery, lotTraceHazy, materialLotTraceCitra, stateRegistrationHazy,
} from "../lib/mgr/fixtures/compliance";
import { toLicensesViewProps } from "../lib/mgr/licenses-view";
import { toBrandViewProps } from "../lib/mgr/brand-view";
import { colaChoice, colaUrl } from "../lib/mgr/brand-approval-view";
import { brandHazy } from "../lib/mgr/fixtures/catalog";
import { toLotTraceViewProps, type LotTraceSnapshot } from "../lib/mgr/lot-trace-view";
const htmlOf = (node: ReactNode) => renderToStaticMarkup(createElement("div", null, node));
const screen = (name: string) => SCREENS.find((s) => s.name === name)!;
const src = (file: string) => readFileSync(file, "utf8");

describe("Compliance months", () => {
  it("the Compliance months inventory record is ComplianceMonthsView", () => {
    const body = screen("Compliance months").body as { type: unknown; props: { model: unknown } };
    expect(isValidElement(screen("Compliance months").body)).toBe(true);
    expect(body.type).toBe(ComplianceMonthsView);
    expect(body.props.model).toEqual(complianceMonthsDemo);
  });

  it("renders licenses and lot navs without leaking live hrefs", () => {
    const html = htmlOf(createElement(ComplianceMonthsView, { model: complianceMonthsDemo }));
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
    expect(toLicensesViewProps(licensesDemo).licenses[0]).toEqual({ key: "pa", title: "PA brewery", detail: "G-21884 · expires 2027-06-30", verb: "Edit" });
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
    expect(body.props.model).toEqual(brandApprovalStout);
  });

  it("the State registration inventory record is StateRegistrationView", () => {
    const body = screen("State registration").body as { type: unknown; props: { model: unknown } };
    expect(body.type).toBe(StateRegistrationView);
    expect(body.props.model).toEqual(stateRegistrationHazy);
  });

  it("the license and registration fields render without a React key warning (E.cols owns the keys)", () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    htmlOf(createElement(LicenseView, { model: licensePaBrewery }));
    htmlOf(createElement(StateRegistrationView, { model: stateRegistrationHazy }));
    const errors = error.mock.calls.flat().join(" ");
    error.mockRestore();

    expect(errors).not.toContain('unique "key" prop');
  });

  it("the License inventory record is LicenseView", () => {
    const body = screen("License").body as { type: unknown; props: { model: unknown } };
    expect(body.type).toBe(LicenseView);
    expect(body.props.model).toEqual(licensePaBrewery);
    expect(src("components/mgr/views/license.tsx")).toMatch(/value: "brewery", label: "Brewery"/);
  });

  it("lists a COLA on its brand by serial and approval date, never an expiry", () => {
    const cola = toBrandViewProps(brandHazy).compliance.find((row) => row.title.startsWith("COLA"))!;
    expect(cola.title).toBe("COLA TTB ID 25318001000034");
    expect(cola.detail).toMatch(/^approved |^approval date unknown/);
    expect(cola.detail).not.toMatch(/expires/);
  });

  it("states a known brand on a registration instead of picking one", () => {
    const html = htmlOf(createElement(StateRegistrationView, { model: stateRegistrationHazy }));
    expect(html).toContain("Hazy IPA");
    expect(html).not.toMatch(/<button[^>]*aria-label="Brand"/);
  });

  it("asks a COLA for its TTB ID and serial separately and never offers an expiry: COLAs do not expire", () => {
    const html = htmlOf(createElement(BrandApprovalView, { model: brandApprovalStout }));
    expect(html).toMatch(/TTB ID/);
    expect(html).toMatch(/Serial number · optional/);
    expect(html).not.toMatch(/COLA number/);
    expect(html).not.toMatch(/Expires/);
    expect(html).toMatch(/Date approved/);
    expect(html).not.toMatch(/Date submitted/);
  });

  it("keeps the formula label on a formula approval, with no serial or COLA link", () => {
    const html = htmlOf(createElement(BrandApprovalView, { model: { ...brandApprovalStout, kind: "formula" } }));
    expect(html).toMatch(/Formula number/);
    expect(html).not.toMatch(/Serial number|Open COLA|TTB ID/);
  });

  it("links Open COLA from the TTB ID alone, encoded, on the official origin", () => {
    expect(colaUrl("25318001000034")).toBe("https://ttbonline.gov/colasonline/viewColaDetails.do?action=publicFormDisplay&ttbid=25318001000034");
    expect(colaUrl(" 0012&x=1 ")).toBe("https://ttbonline.gov/colasonline/viewColaDetails.do?action=publicFormDisplay&ttbid=0012%26x%3D1");
    expect(colaUrl("  ")).toBeNull();
    const html = htmlOf(createElement(BrandApprovalView, { model: brandApprovalStout }));
    expect(html).toContain('href="https://ttbonline.gov/colasonline/viewColaDetails.do?action=publicFormDisplay&amp;ttbid=25318001000034"');
    expect(html).not.toContain(`ttbid=${brandApprovalStout.serialNumber}`);
  });

  it("Use takes a COLA's TTB ID, serial (a missing one as blank) and TTB's approval date", () => {
    const record = { ttbId: "25318001000034", permit: "BR-PA-20553", serial: "260135", completedOn: "2026-02-02", fancifulName: "STOUT", brandName: "LOLEV", classCode: "901", className: "BEER" };
    expect(colaChoice(record)).toEqual({ ttbId: "25318001000034", serialNumber: "260135", approvedOn: "2026-02-02" });
    expect(colaChoice({ ...record, serial: null })).toEqual({ ttbId: "25318001000034", serialNumber: "", approvedOn: "2026-02-02" });
  });

  it("lists TTB COLA matches with Use, says when none match, and shows the search running", () => {
    const html = htmlOf(createElement(BrandApprovalView, { model: brandApprovalStout }));
    expect(html).toMatch(/Find COLA on TTB/);
    const first = brandApprovalStout.colas!.rows[0];
    expect(html).toContain(first.fancifulName);
    expect(html).toContain(`${first.ttbId} · serial ${first.serial} · ${first.className}`);
    expect(html).toContain(formatDate(first.completedOn));
    expect(html.match(/>Use<\/button>/g) ?? []).toHaveLength(brandApprovalStout.colas!.rows.length);
    const none = htmlOf(createElement(BrandApprovalView, { model: { ...brandApprovalStout, colas: { permit: "BR-PA-20553", rows: [] } } }));
    expect(none).toContain("No COLAs on TTB under BR-PA-20553 match Stout.");
    const searching = htmlOf(createElement(BrandApprovalView, { model: { ...brandApprovalStout, colas: undefined, searching: true } }));
    expect(searching).toMatch(/<button[^>]*disabled[^>]*>Searching TTB…<\/button>/);
    const formula = htmlOf(createElement(BrandApprovalView, { model: { ...brandApprovalStout, kind: "formula" } }));
    expect(formula).not.toMatch(/Find COLA/);
  });

  it("explains the missing link when a COLA has no TTB ID", () => {
    const html = htmlOf(createElement(BrandApprovalView, { model: { ...brandApprovalStout, number: "" } }));
    expect(html).not.toMatch(/ttbonline\.gov/);
    expect(html).toMatch(/Enter the TTB ID to open the COLA/);
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
  it("renders blend members and stored transfer facts without proportional attribution", () => {
    const model = toLotTraceViewProps(lotTraceHazy);
    expect(model.memberBatches.map(row => row.title)).toEqual(["Batch 40", "Batch 41"]);
    expect(model.sourceTransfers).toEqual([{ key: "blend", title: "FV-2 to FV-3", detail: "8/30", trailing: "10.00 bbl transferred" }]);
    const html = htmlOf(createElement(LotTraceView, { model }));
    expect(html).toMatch(/Member batches/);
    expect(html).toMatch(/Recorded source transfers/);
    expect(html).toMatch(/Recorded membership, not percentages or estimated shares/);
    expect(html).not.toMatch(/\d+%/);
  });

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
    expect(html).not.toMatch(/production in/i);
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
    expect(html).not.toMatch(/Order 7|production in/i);
  });

  it("names a recipient ship-to's country and never prints a missing part as null", () => {
    const recipient = (ship_tos: LotTraceSnapshot["recipients"][number]["ship_tos"]) => ({ id: "order", order_no: 7, customers: null, ship_tos, shipments: [] });
    const shipTo = (s: LotTraceSnapshot["recipients"][number]["ship_tos"]) => toLotTraceViewProps({ ...lotTraceHazy, recipients: [recipient(s)] }).recipients?.[0]?.shipTo;
    expect(shipTo({ label: "main", country: "JP", address1: null, city: null, state: null, zip: null })).toBe("main · Japan");
    expect(shipTo({ label: "main", country: "US", address1: "1 Sample St", city: "Sample", state: "PA", zip: "19100" })).toBe("main · 1 Sample St · Sample, PA 19100");
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
      { key: "in", label: "+120 · Production in · Hazy IPA · 16 oz case · Warehouse", when: "8/31" },
      { key: "sample", label: "−2 · Sample · Hazy IPA · 16 oz case · Warehouse", when: "9/2" },
    ]);
    expect(model.movements?.map(({ title, detail }) => ({ title, detail }))).toEqual([
      { title: "+120 · Production in · Hazy IPA · 16 oz case", detail: "Warehouse · Cooler · 8/31" },
      { title: "-2 · Sample · Hazy IPA · 16 oz case", detail: "Warehouse · Cooler · 9/2" },
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


describe("Material lot trace (#817)", () => {
  it("shows current vessel/status for unpackaged batch use", () => {
    const snapshot = { ...materialLotTraceCitra, batches: materialLotTraceCitra.batches.map(batch => ({ ...batch, in_vessel: "FV-RECALL" })) };
    expect(htmlOf(createElement(MaterialLotTraceView, { model: toMaterialLotTraceViewProps(snapshot) }))).toContain("FV-RECALL");
  });
  it("does not offer an Open action for untracked ingredient facts", () => {
    const snapshot = { ...lotTraceHazy, ingredients: [{ ...lotTraceHazy.ingredients[0], lot_id: null, code: null }] };
    const html = htmlOf(createElement(LotTraceView, { model: toLotTraceViewProps(snapshot) }));
    const section = html.split("Ingredients")[1].split("Member batches")[0];
    expect(section).toContain("Untracked");
    expect(section).not.toContain("data-tap");
  });

  it("inventory and live mount the same view and preserve recorded use and recipient data", () => {
    const model = toMaterialLotTraceViewProps(materialLotTraceCitra);
    const record = screen("Material lot trace").body as { type: unknown; props: { model: unknown } };
    expect(record.type).toBe(MaterialLotTraceView);
    expect(record.props.model).toEqual(model);
    const html = htmlOf(createElement(MaterialLotTraceView, { model }));
    expect(html).toContain("H-77");
    expect(html).toContain("B-0040");
    expect(html).toContain("B-0041");
    expect(html).toContain("Fictional Corner Bar");
    expect(model.lots[0].href).toBeUndefined();
    expect(toMaterialLotTraceViewProps(materialLotTraceCitra, "/compliance").lots[0].href).toBe("/compliance/lots/finished");
    expect(src("app/(app)/compliance/material-lots/[id]/page.tsx")).toMatch(/<MaterialLotTraceView\b/);
  });
  it("finished-lot ingredient links are explicit live destinations and inert fixture links", () => {
    const fixture = toLotTraceViewProps(lotTraceHazy);
    expect(fixture.ingredients[0].href).toBeUndefined();
    expect(toLotTraceViewProps(lotTraceHazy, "/compliance").ingredients[0].href).toBe("/compliance/material-lots/h77");
    expect(screen("Lot trace").to).toMatchObject({ "Citra hops": "Material lot trace" });
  });
});
