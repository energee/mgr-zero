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
import { noLotMatch, noPeriodsYet, periodRow } from "../lib/mgr/compliance-months-view";
import { LicenseView } from "../components/mgr/views/license";
import { MaterialLotTraceView } from "../components/mgr/views/material-lot-trace";
import { toMaterialLotTraceViewProps } from "../lib/mgr/material-lot-trace-view";
import { LotTraceView } from "../components/mgr/views/lot-trace";
import { StateRegistrationView } from "../components/mgr/views/state-registration";
import {
  brandApprovalStout, complianceMonthsDemo, licensesDemo, licensePaBrewery, lotTraceHazy, materialLotTraceCitra, stateRegistrationHazy,
} from "../lib/mgr/fixtures/compliance";
import { toLicensesViewProps } from "../lib/mgr/licenses-view";
import { licenseSubmitReason } from "../lib/mgr/license-view";
import { toBrandViewProps } from "../lib/mgr/brand-view";
import { colaChoice, colaUrl } from "../lib/mgr/brand-approval-view";
import { brandHazy } from "../lib/mgr/fixtures/catalog";
import { toLotTraceViewProps, type LotTraceSnapshot } from "../lib/mgr/lot-trace-view";
import { DEMO_TIME_ZONE } from "../lib/mgr/fixtures/settings";
const htmlOf = (node: ReactNode) => renderToStaticMarkup(createElement("div", null, node));
const screen = (name: string) => SCREENS.find((s) => s.name === name)!;
const src = (file: string) => readFileSync(file, "utf8");

describe("Compliance months", () => {
  it("says why no period is listed when the first one starts after the books opened (#987)", () => {
    expect(noPeriodsYet("month", "2026-10-15", "2026-10-20")).toEqual({
      title: "No monthly period yet",
      description: "The books opened on Oct 15, 2026. Activity before that date is not reported in MGR. November 2026 is the first monthly period MGR can report, and it is listed here once it starts.",
    });
    const html = renderToStaticMarkup(createElement(ComplianceMonthsView, { model: { ...complianceMonthsDemo, months: [], empty: noPeriodsYet("quarter", "2026-10-15", "2026-10-20") } }));
    expect(html).toMatch(/No quarterly period yet/);
    expect(html).toMatch(/Q1 2027 is the first quarterly period/);
  });

  it("says the books open, not opened, while that day is still ahead (#1496)", () => {
    expect(noPeriodsYet("month", "2026-11-01", "2026-10-26").description).toBe(
      "The books open on Nov 1, 2026. Activity before that date is not reported in MGR. November 2026 is the first monthly period MGR can report, and it is listed here once it starts.",
    );
    expect(noPeriodsYet("month", "2026-11-01", "2026-11-01").description).toMatch(/^The books opened on Nov 1, 2026\./);
  });


  it("states each period's filing in sentence case, the same words as the inventory rows (#1144)", () => {
    const filing = { id: "f", jurisdiction: "TTB", period_start: "2026-07-01", period_end: "2026-07-31", filed_at: "2026-08-04T15:00:00Z", filed_by: null, note: null, created_at: "2026-08-04T15:00:00Z",
      figures: { jurisdiction: "TTB", periodStart: "2026-07-01", periodEnd: "2026-07-31", lines: [], removals: { taxable: 38.75 }, cellarRemovals: {}, byState: {}, packaged: 0, inProcess: 0, balances: true } };
    const today = "2026-09-15";
    expect(periodRow("2026-09", undefined, today, DEMO_TIME_ZONE, true)).toEqual(complianceMonthsDemo.months[0]);
    expect(periodRow("2026-08", { ...filing, period_start: "2026-08-01", period_end: "2026-08-31", filed_at: "2026-09-02T15:00:00Z", needs_amendment: true }, today, DEMO_TIME_ZONE, true)).toEqual(complianceMonthsDemo.months[1]);
    expect(periodRow("2026-07", filing, today, DEMO_TIME_ZONE, true)).toEqual(complianceMonthsDemo.months[2]);
    expect(periodRow("2026-07", undefined, today, DEMO_TIME_ZONE, true).detail).toBe("Not filed · Ready to review");
    expect(periodRow("2026-Q3", undefined, today, DEMO_TIME_ZONE, true).detail).toBe("In progress · File after the quarter ends");
    expect(periodRow("2026-07", { ...filing, filed_at: null }, today, DEMO_TIME_ZONE, true).detail).toBe("Filed · 38.75 bbl taxpaid");
    const page = src("app/(app)/compliance/page.tsx");
    expect(page).toMatch(/periodRow\(/);
    expect(page).not.toMatch(/ready to review|no activity|file once/i);
  });

  it("an ended, unfiled period with no report activity reads No activity; activity changes no other row (#1209)", () => {
    const today = "2026-09-15";
    expect(periodRow("2026-07", undefined, today, DEMO_TIME_ZONE, false)).toEqual({ key: "2026-07", title: "July 2026", detail: "Not filed · No activity", tone: "w" });
    expect(periodRow("2026-09", undefined, today, DEMO_TIME_ZONE, false)).toEqual(complianceMonthsDemo.months[0]);
  });

  it("the Compliance months inventory record is ComplianceMonthsView", () => {
    const body = screen("Compliance months").body as { type: unknown; props: { model: unknown } };
    expect(isValidElement(screen("Compliance months").body)).toBe(true);
    expect(body.type).toBe(ComplianceMonthsView);
    expect(body.props.model).toEqual(complianceMonthsDemo);
    expect(isValidElement((body.props as { controls?: unknown }).controls)).toBe(true);
  });

  it("puts a lot-code search under Lot trace and says when it matches no lot (#1510)", () => {
    const search = createElement("form", { role: "search" });
    const html = htmlOf(createElement(ComplianceMonthsView, { model: { ...complianceMonthsDemo, lots: [] }, controls: search }));
    expect(html).toMatch(/Lot trace[\s\S]*role="search"/);
    expect(html).not.toMatch(/L-240831-HZ/);
    const none = htmlOf(createElement(ComplianceMonthsView, { model: { ...complianceMonthsDemo, lots: [], lotsEmpty: noLotMatch }, controls: search }));
    expect(none).toMatch(/No lots match/);
    const page = src("app/(app)/compliance/page.tsx");
    expect(page).toMatch(/runCommand\("list_lots", \{ q \}/);
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
  it("flags only licenses expired before the brewery's calendar day (#1394)", () => {
    const license = licensesDemo.licenses[0];
    for (const expiresOn of ["2026-10-10", "2026-10-26", "2026-10-27", null]) {
      const model = toLicensesViewProps({
        today: "2026-10-26",
        licenses: [{ ...license, expires_on: expiresOn }],
      });
      const expired = expiresOn === "2026-10-10";
      expect(Boolean(model.licenses[0].warning)).toBe(expired);
      expect(model.licenses[0].detail.includes(" · expired")).toBe(expired);
      const html = htmlOf(createElement(LicensesView, { model }));
      expect(html.includes('aria-label="Needs attention"')).toBe(expired);
    }
  });

  it("offers a confirmed delete for an existing license but not a new one", () => {
    const existing = htmlOf(createElement(LicenseView, { model: licensePaBrewery }));
    expect(existing).toContain("Delete license");
    expect(existing).toContain('aria-haspopup="dialog"');
    const creating = htmlOf(createElement(LicenseView, { model: licensePaBrewery, remove: null }));
    expect(creating).not.toContain("Delete license");
  });

  it("keeps an existing license's state and kind fixed in the edit inventory", () => {
    const html = htmlOf(screen("License").body);
    const pickers = html.match(/<button\b[^>]*role="combobox"[^>]*>/g) ?? [];
    expect(pickers).toHaveLength(2);
    for (const picker of pickers) expect(picker).toContain("disabled");
  });

  it("names missing or invalid license identity without requiring optional details (#1262)", () => {
    expect(licenseSubmitReason({ state: "", kind: "brewery" })).toBe("Still needed: a state.");
    for (const state of ["123", "P", "PAA", "ZZ"]) {
      expect(licenseSubmitReason({ state, kind: "brewery" })).toBe("Still needed: a state.");
    }
    expect(licenseSubmitReason({ state: "PA", kind: "" })).toBe("Still needed: a kind.");
    expect(licenseSubmitReason({ state: "PA", kind: "brewery" })).toBeNull();
  });

  it("Add refuses a state and kind that already has a license and points to its Edit (#1493)", () => {
    const existing = [{ state: "PA", kind: "brewery" }];
    expect(licenseSubmitReason({ state: "PA", kind: " Brewery ", existing })).toBe("Still needed: a state and kind without a license (edit the PA brewery license instead).");
    expect(licenseSubmitReason({ state: "PA", kind: "distributor", existing })).toBeNull();
    expect(licenseSubmitReason({ state: "OH", kind: "brewery", existing })).toBeNull();
    // Edit passes no existing pairs: the license being edited is that pair.
    expect(licenseSubmitReason({ state: "PA", kind: "brewery" })).toBeNull();
  });

  it("guides empty licenses and shares neutral help, state picker, and Cancel (#1262)", () => {
    const empty = htmlOf(createElement(LicensesView, { model: { licenses: [] } }));
    expect(empty).toContain("No licenses yet. Record your state licenses here so their numbers and expiry dates are in one place.");
    const form = htmlOf(createElement(LicenseView, { model: { state: "", kind: "brewery" } }));
    expect(form).toContain('role="combobox"');
    expect(form).not.toContain("State (two letters)");
    expect(form).toContain("bg-info");
    expect(form).not.toContain("bg-warning");
    expect(form).toContain("Cancel");
    expect(form).toContain("Still needed: a state.");
  });

  it("puts Add license in the empty state, and at the foot once a license exists (#1517, #1226)", () => {
    const empty = htmlOf(createElement(LicensesView, { model: { licenses: [] } }));
    expect(empty).toMatch(/data-slot="empty-content"[^>]*>(?:(?!<\/div>)[\s\S])*Add license/);
    expect(empty.match(/Add license/g)).toHaveLength(1);
    const listed = htmlOf(createElement(LicensesView, { model: toLicensesViewProps(licensesDemo) }));
    expect(listed).not.toContain('data-slot="empty-content"');
    expect(listed).toMatch(/PA brewery[\s\S]*Add license/);
  });

  it("the Licenses inventory record is LicensesView: the brewery's licenses, no brand tab", () => {
    const body = screen("Licenses").body as { type: unknown; props: { model: unknown } };
    expect(body.type).toBe(LicensesView);
    expect(body.props.model).toEqual(toLicensesViewProps(licensesDemo));
    expect(toLicensesViewProps(licensesDemo).licenses[0]).toEqual({ key: "pa", title: "PA brewery", detail: "G-21884 · expires Jun 30, 2027", verb: "Edit" });
    const html = htmlOf(screen("Licenses").body);
    expect(html).not.toMatch(/tablist/);
    expect(html).not.toMatch(/Hazy IPA|COLA|registration/);
    expect(html).toMatch(/PA brewery/);
    expect(html).not.toMatch(/Order confirmation does not read licenses/);
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

  it("dates brand approvals and registrations in the one date format (#991)", () => {
    const rows = toBrandViewProps(brandHazy).compliance;
    expect(rows.find((row) => row.key === "cola")?.detail).toBe("approved Jan 15, 2026 · serial 260135");
    expect(rows.find((row) => row.key === "oh")?.detail).toBe("OH-88214 · expires Dec 31, 2026");
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

  it("offers Cancel beside Save approval, which closes the live sheet (#1498)", () => {
    expect(htmlOf(createElement(BrandApprovalView, { model: brandApprovalStout }))).toMatch(/>Cancel<\/button>/);
    const forms = src("app/(app)/catalog/brands/[id]/compliance-forms.tsx");
    expect(forms).toMatch(/onClick=\{\(\) => form\.setOpen\(false\)\}>Cancel<\/Button>\{E\.submit\("Save approval"/);
  });

  it("keeps the formula label on a formula approval, with no serial or COLA link", () => {
    const html = htmlOf(createElement(BrandApprovalView, { model: { ...brandApprovalStout, kind: "formula" } }));
    expect(html).toMatch(/Formula number/);
    expect(html).not.toMatch(/Serial number|Open COLA|TTB ID/);
  });

  it("links Open COLA only for a 14-digit TTB ID on the official origin", () => {
    expect(colaUrl("25318001000034")).toBe("https://ttbonline.gov/colasonline/viewColaDetails.do?action=publicFormDisplay&ttbid=25318001000034");
    expect(colaUrl(" 00123456789012 ")).toBe("https://ttbonline.gov/colasonline/viewColaDetails.do?action=publicFormDisplay&ttbid=00123456789012");
    expect(colaUrl("0012&x=1")).toBeNull();
    expect(colaUrl("  ")).toBeNull();
    const html = htmlOf(createElement(BrandApprovalView, { model: brandApprovalStout }));
    expect(html).toContain('href="https://ttbonline.gov/colasonline/viewColaDetails.do?action=publicFormDisplay&amp;ttbid=25318001000034"');
    expect(html).not.toContain(`ttbid=${brandApprovalStout.serialNumber}`);
  });

  it("Use takes a COLA's TTB ID, serial (a missing one as blank) and TTB's approval date", () => {
    const record = { ttbId: "25318001000034", permit: "BR-PA-12345", serial: "260135", completedOn: "2026-02-02", fancifulName: "STOUT", brandName: "EXAMPLE BREWING", classCode: "901", className: "BEER" };
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
    const none = htmlOf(createElement(BrandApprovalView, { model: { ...brandApprovalStout, colas: { permit: "BR-PA-12345", rows: [] } } }));
    const noMatchNotice = none.match(/<div[^>]*role="note"[^>]*>[\s\S]*?<\/div>/)?.[0];
    expect(noMatchNotice).toContain("BR-PA-12345");
    expect(noMatchNotice).toContain(brandApprovalStout.brand);
    expect(none.match(/>Use<\/button>/g) ?? []).toEqual([]);
    const searching = htmlOf(createElement(BrandApprovalView, { model: { ...brandApprovalStout, colas: undefined, searching: true } }));
    expect(searching).toMatch(/<button[^>]*disabled[^>]*>Searching TTB…<\/button>/);
    const formula = htmlOf(createElement(BrandApprovalView, { model: { ...brandApprovalStout, kind: "formula" } }));
    expect(formula).not.toMatch(/Find COLA/);
  });

  it("explains the missing link when a COLA has no TTB ID", () => {
    const html = htmlOf(createElement(BrandApprovalView, { model: { ...brandApprovalStout, number: "" } }));
    expect(html).not.toMatch(/ttbonline\.gov/);
    expect(html).toContain('pattern="[0-9]{14}"');
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
    const model = toLotTraceViewProps(lotTraceHazy, DEMO_TIME_ZONE);
    expect(model.memberBatches.map(row => row.title)).toEqual(["B-0040", "B-0041"]);
    expect(model.tankBatch).toContain("B-0041");
    expect(model.sourceTransfers).toEqual([{ key: "blend", title: "FV-2 to FV-3", detail: "Aug 30, 2026", trailing: "10.00 bbl transferred" }]);
    const html = htmlOf(createElement(LotTraceView, { model }));
    expect(html).toMatch(/Member batches/);
    expect(html).toMatch(/Recorded source transfers/);
    expect(html).not.toMatch(/Recorded membership/);
    expect(html).toMatch(/Stock recorded without this lot code is not traced here\./);
    expect(html).not.toMatch(/\d+%/);
  });

  it("links member batches on the live page and keeps them inert in the inventory (#1517)", () => {
    const live = htmlOf(createElement(LotTraceView, { model: toLotTraceViewProps(lotTraceHazy, DEMO_TIME_ZONE, "/compliance"), tape: null }));
    expect(live).toContain('href="/batches/batch-40"');
    expect(live).toContain('href="/batches/batch-41"');
    expect(htmlOf(createElement(LotTraceView, { model: toLotTraceViewProps(lotTraceHazy, DEMO_TIME_ZONE) }))).not.toMatch(/href="\/batches\//);
  });

  it("says no balance is recorded instead of a bare heading (#1517)", () => {
    const html = htmlOf(createElement(LotTraceView, { model: toLotTraceViewProps({ ...lotTraceHazy, balances: [] }, DEMO_TIME_ZONE) }));
    expect(html.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ")).toMatch(/Recorded balances by SKU and bin No recorded balance of this lot/);
  });

  it("titles the live lot tab with the lot code (#1517)", () => {
    const page = src("app/(app)/compliance/lots/[id]/page.tsx");
    expect(page).toMatch(/title: trace\.lot\.code/);
    expect(page).not.toMatch(/navTitle\("\/compliance\/lots"\)/);
  });

  it("the Lot trace inventory record is LotTraceView", () => {
    const body = screen("Lot trace").body as { type: unknown; props: { model: unknown } };
    expect(body.type).toBe(LotTraceView);
    expect(body.props.model).toEqual(toLotTraceViewProps(lotTraceHazy, DEMO_TIME_ZONE));
  });

  it("the live lot page mounts LotTraceView", () => {
    const page = src("app/(app)/compliance/lots/[id]/page.tsx");
    expect(page).toMatch(/<LotTraceView\b/);
    expect(page).not.toMatch(/import \{ E \}/);
    expect(page).not.toMatch(/\bE\./);
  });

  it("keeps each movement date on one line on a phone (#1013 review)", () => {
    const model = toLotTraceViewProps(lotTraceHazy, DEMO_TIME_ZONE);
    const html = htmlOf(createElement(LotTraceView, { model }));
    for (const row of model.tape) expect(html).toContain(`<span class="whitespace-nowrap">${row.when}</span>`);
  });

  it("lets the live page suppress the inventory tape", () => {
    const html = htmlOf(createElement(LotTraceView, {
      model: toLotTraceViewProps(lotTraceHazy, DEMO_TIME_ZONE),
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
    }, DEMO_TIME_ZONE);
    const html = htmlOf(createElement(LotTraceView, { model, tape: null, balances: null, recipients: null, movements: null }));
    expect(html).not.toMatch(/href="\/(orders|customers|invoices)/);
    expect(html).not.toMatch(/Recorded balances by SKU and bin[\s\S]*118 units/);
    expect(html).not.toMatch(/ORD-0007|production in/i);
  });

  it("prints run, order and invoice document numbers and labels each recipient field (#1496)", () => {
    const snapshot: LotTraceSnapshot = {
      ...lotTraceHazy,
      run: { ...lotTraceHazy.run!, run_no: 3 },
      recipients: [{
        id: "order", order_no: 3, customers: { id: "customer", name: "Buyer" },
        ship_tos: { label: "main", country: "US", address1: "1 Sample St", city: "Sample", state: "PA", zip: "19100" },
        shipments: [
          { id: "carried", carrier: "UPS", tracking: "1Z999", invoices: [{ id: "invoice", invoice_no: 2 }] },
          { id: "bare", carrier: null, tracking: null, invoices: [] },
        ],
      }],
    };
    const model = toLotTraceViewProps(snapshot, DEMO_TIME_ZONE, "/compliance");
    expect(model.skuDetail).toMatch(/^RUN-0003 · packaged/);
    expect(model.recipients?.[0]).toMatchObject({
      orderNo: "ORD-0003",
      shipments: [{ label: "UPS · 1Z999", invoices: [{ number: "INV-0002" }] }, { label: "No carrier or tracking" }],
    });
    const text = htmlOf(createElement(LotTraceView, { model, tape: null })).replace(/<[^>]*>/g, " ").replace(/\s+/g, " ");
    expect(text).toContain("Order ORD-0003 Customer Buyer Ship to main · 1 Sample St · Sample, PA 19100 Shipment UPS · 1Z999 Invoice INV-0002 Shipment No carrier or tracking");
    expect(text).not.toMatch(/\brun 3\b|Order 3\b|Invoice 2\b/);
  });

  it("names a recipient ship-to's country and never prints a missing part as null", () => {
    const recipient = (ship_tos: LotTraceSnapshot["recipients"][number]["ship_tos"]) => ({ id: "order", order_no: 7, customers: null, ship_tos, shipments: [] });
    const shipTo = (s: LotTraceSnapshot["recipients"][number]["ship_tos"]) => toLotTraceViewProps({ ...lotTraceHazy, recipients: [recipient(s)] }, DEMO_TIME_ZONE).recipients?.[0]?.shipTo;
    expect(shipTo({ label: "main", country: "JP", address1: null, city: null, state: null, zip: null })).toBe("main · Japan");
    expect(shipTo({ label: "main", country: "US", address1: "1 Sample St", city: "Sample", state: "PA", zip: "19100" })).toBe("main · 1 Sample St · Sample, PA 19100");
  });

  it("preserves live movement provenance and links", () => {
    const model = toLotTraceViewProps({
      ...lotTraceHazy,
      movements: [{ ...lotTraceHazy.movements[1], id: "return", type: "return_in", bin: "Returns", bbl: 0.13, ref: "credit", ref_label: "CM-0009", ref_kind: "invoice", source_movement_id: "shipped" }],
    }, DEMO_TIME_ZONE, "/compliance");
    const html = htmlOf(createElement(LotTraceView, { model, tape: null }));
    expect(html).toMatch(/Returns · Sep 2, 2026/);
    expect(html).toMatch(/0\.13 bbl recorded/);
    expect(html).toMatch(/href="#movement-shipped"/);
    expect(html).toMatch(/href="\/invoices\/credit"/);
  });

  it("shows resolved references without exposing UUIDs and never links a refused delivery as an invoice (#1382)", () => {
    const id = "53e1d7c9-e862-4de1-908c-5f1134c729ab";
    const movement = { ...lotTraceHazy.movements[1], id, type: "return_in", ref: id, source_movement_id: id };
    for (const [ref_kind, ref_label] of [["delivery", "Refused delivery · ORD-0001"], ["invoice", "CM-0001"], [null, null]] as const) {
      const model = toLotTraceViewProps({ ...lotTraceHazy, movements: [{ ...movement, ref_kind, ref_label }] }, DEMO_TIME_ZONE, "/compliance");
      const html = htmlOf(createElement(LotTraceView, { model, tape: null }));
      const text = html.replace(/<[^>]*>/g, "");
      expect(text).not.toMatch(/[0-9a-f]{8}-[0-9a-f-]{27,}/i);
      expect(html).toContain(`href="#movement-${id}"`);
      if (ref_label) expect(text).toContain(ref_label);
      if (ref_kind === "invoice") expect(html).toContain(`href="/invoices/${id}"`);
      else expect(html).not.toContain('href="/invoices/');
    }
  });

  it("formats every date as a short calendar day and owns every movement SKU", () => {
    const model = toLotTraceViewProps(lotTraceHazy, DEMO_TIME_ZONE);
    expect(model.skuDetail).toBe("RUN-0028 · packaged Aug 31, 2026 · best by Feb 27, 2027");
    expect(model.tankBatch).toBe("FV-3 · B-0041 · brewed Aug 10, 2026");
    expect(model.tape).toEqual([
      { key: "in", label: "+120 · Production in · Hazy IPA · 16 oz case · Warehouse", when: "Aug 31, 2026" },
      { key: "sample", label: "−2 · Sample · Hazy IPA · 16 oz case · Warehouse", when: "Sep 2, 2026" },
    ]);
    expect(model.movements?.map(({ title, detail }) => ({ title, detail }))).toEqual([
      { title: "+120 · Production in · Hazy IPA · 16 oz case", detail: "Warehouse · Cooler · Aug 31, 2026" },
      { title: "-2 · Sample · Hazy IPA · 16 oz case", detail: "Warehouse · Cooler · Sep 2, 2026" },
    ]);
    expect(model.balances.map(({ title }) => title)).toEqual(["Hazy IPA · 16 oz case"]);
    expect(toLotTraceViewProps({
      ...lotTraceHazy,
      balances: [{ ...lotTraceHazy.balances[0], sku: "16 oz case" }],
    }, DEMO_TIME_ZONE).balances.map(({ title }) => title)).toEqual(["Hazy IPA · 16 oz case"]);
  });

  it("dates a timestamp by the brewery's day, not its UTC prefix (#991)", () => {
    const model = toLotTraceViewProps({
      ...lotTraceHazy,
      transfers: [{ ...lotTraceHazy.transfers[0], at: "2026-08-31T02:00:00Z" }],
      movements: [{ ...lotTraceHazy.movements[0], created_at: "2026-09-01T03:00:00Z" }],
    }, DEMO_TIME_ZONE);
    expect(model.sourceTransfers[0].detail).toBe("Aug 30, 2026");
    expect(model.tape[0].when).toBe("Aug 31, 2026");
    expect(JSON.stringify(model)).not.toMatch(/\b\d{1,2}\/\d{1,2}\b/);
  });

  it("does not repeat a brand-owned SKU name and keeps the empty-recipient state", () => {
    const model = toLotTraceViewProps({
      ...lotTraceHazy,
      movements: [{ ...lotTraceHazy.movements[0], sku: "Hazy IPA · 16 oz case" }],
    }, DEMO_TIME_ZONE, "/compliance");
    const html = htmlOf(createElement(LotTraceView, { model, tape: null }));
    expect(html).toMatch(/Hazy IPA · 16 oz case/);
    expect(html).not.toMatch(/Hazy IPA · Hazy IPA/);
    expect(html).toMatch(/No recorded shipments of this lot/);
  });
});


describe("Material lot trace (#817)", () => {
  it("shows current vessel/status for unpackaged batch use", () => {
    const snapshot = { ...materialLotTraceCitra, batches: materialLotTraceCitra.batches.map(batch => ({ ...batch, in_vessel: "FV-RECALL" })) };
    expect(htmlOf(createElement(MaterialLotTraceView, { model: toMaterialLotTraceViewProps(snapshot, DEMO_TIME_ZONE) }))).toContain("FV-RECALL");
  });
  it("prints received, used and packaged days in the one date format (#991)", () => {
    const model = toMaterialLotTraceViewProps({ ...materialLotTraceCitra, used: [{ ...materialLotTraceCitra.used[0], at: "2026-08-10T02:00:00Z" }] }, DEMO_TIME_ZONE);
    expect(model.detail).toBe("Citra hops · Fictional Hop Supply · received Aug 1, 2026");
    expect(model.uses[0].detail).toBe("4 lb · Boil · Aug 9, 2026 · No current vessel");
    expect(model.lots[0].detail).toBe("packaged Aug 31, 2026");
  });
  it("does not offer an Open action for untracked ingredient facts", () => {
    const snapshot = { ...lotTraceHazy, ingredients: [{ ...lotTraceHazy.ingredients[0], lot_id: null, code: null }] };
    const html = htmlOf(createElement(LotTraceView, { model: toLotTraceViewProps(snapshot, DEMO_TIME_ZONE) }));
    const section = html.split("Ingredients")[1].split("Member batches")[0];
    expect(section).toContain("Untracked");
    expect(section).not.toContain("data-tap");
  });

  it("inventory and live mount the same view and preserve recorded use and recipient data", () => {
    const model = toMaterialLotTraceViewProps(materialLotTraceCitra, DEMO_TIME_ZONE);
    const record = screen("Material lot trace").body as { type: unknown; props: { model: unknown } };
    expect(record.type).toBe(MaterialLotTraceView);
    expect(record.props.model).toEqual(model);
    const html = htmlOf(createElement(MaterialLotTraceView, { model }));
    expect(html).toContain("H-77");
    expect(html).toContain("B-0040");
    expect(html).toContain("B-0041");
    expect(html).toContain("Fictional Corner Bar");
    expect(model.lots[0].href).toBeUndefined();
    expect(toMaterialLotTraceViewProps(materialLotTraceCitra, DEMO_TIME_ZONE, "/compliance").lots[0].href).toBe("/compliance/lots/finished");
    expect(src("app/(app)/compliance/material-lots/[id]/page.tsx")).toMatch(/<MaterialLotTraceView\b/);
  });
  it("finished-lot ingredient links are explicit live destinations and inert fixture links", () => {
    const fixture = toLotTraceViewProps(lotTraceHazy, DEMO_TIME_ZONE);
    expect(fixture.ingredients[0].href).toBeUndefined();
    expect(toLotTraceViewProps(lotTraceHazy, DEMO_TIME_ZONE, "/compliance").ingredients[0].href).toBe("/compliance/material-lots/h77");
    expect(screen("Lot trace").to).toMatchObject({ "Citra hops": "Material lot trace" });
  });
});
