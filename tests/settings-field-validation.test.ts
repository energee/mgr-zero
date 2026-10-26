import { Children, createElement, isValidElement, type ReactElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { BrandView } from "@/components/mgr/views/brand";
import { PriceGroupView } from "@/components/mgr/views/price-group";
import { VendorView } from "@/components/mgr/views/vendor";
import { InviteView } from "@/components/mgr/views/team-controls";
import { WaterProfileView } from "@/components/mgr/views/water-profile";
import { brandAbvError } from "@/lib/mgr/brand-abv";
import { priceGroupFieldErrors, priceGroupReason } from "@/lib/mgr/price-group-view";
import { vendorFieldErrors } from "@/lib/mgr/vendor-view";
import { emailError } from "@/lib/mgr/email";
import { toBrandViewProps } from "@/lib/mgr/brand-view";
import { brandHazy } from "@/lib/mgr/fixtures/catalog";
import { toWaterProfileFields, waterPhError } from "@/lib/mgr/water-profiles-view";

type Element = ReactElement<Record<string, unknown> & { children?: ReactNode }>;
function elements(node: ReactNode): Element[] {
  if (!isValidElement<Record<string, unknown> & { children?: ReactNode }>(node)) return [];
  return [node, ...Children.toArray(node.props.children).flatMap(elements)];
}

function expectAssociatedError(html: string, label: string, message: string): void {
  const input = [...html.matchAll(/<input\b[^>]*>/g)].map(match => match[0]).find(tag => tag.includes(`aria-label="${label}"`));
  expect(input).toBeDefined();
  expect(input).toContain('aria-invalid="true"');
  const id = input!.match(/\bid="([^"]+)"/)![1];
  expect(input).toMatch(new RegExp(`aria-describedby="[^"]*${id}-error`));
  expect(html).toContain(`id="${id}-error"`);
  expect(html).toContain(message);
}

describe("Oct 23 settings field validation (#1121)", () => {
  it("uses the ABV command bounds without forbidding valid fractional percentages", () => {
    for (const value of ["-3", "100", "150", "NaN", "Infinity"]) expect(brandAbvError(value)).toBeTruthy();
    for (const value of ["", "0", "5.55", "5.555", "99.99"]) expect(brandAbvError(value)).toBeUndefined();
    const html = renderToStaticMarkup(createElement(BrandView, { model: { ...toBrandViewProps(brandHazy), abv: "150" } }));
    expectAssociatedError(html, "ABV %", "ABV must be a percent from 0 to 99.99");
  });

  it("requires Position to start at 1 and keeps cost rounding consistent with integer cents", () => {
    for (const position of ["", "0", "-2", "1.5", "Infinity"]) {
      expect(priceGroupFieldErrors({ position, costCeilingInput: "" }).position).toBeTruthy();
      expect(priceGroupReason({ name: "Standard", position, costCeilingInput: "" })).not.toBeNull();
    }
    for (const costCeilingInput of ["-5", "NaN", "Infinity", "21474836.48"]) expect(priceGroupFieldErrors({ position: "1", costCeilingInput }).costCeiling).toBeTruthy();
    for (const costCeilingInput of ["", "0", "5.55", "5.555", "21474836.47"]) expect(priceGroupFieldErrors({ position: "1", costCeilingInput })).toEqual({});
    const html = renderToStaticMarkup(createElement(PriceGroupView, { model: { name: "Standard", position: "1.5", costCeilingInput: "-5" } }));
    expectAssociatedError(html, "Position", "Enter a whole-number position of 1 or more.");
    expectAssociatedError(html, "Cost ceiling ($/bbl) · optional", "Enter a cost of zero or more.");
  });

  it("accepts optional vendor email and whole nonnegative lead days, but rejects the reported values", () => {
    expect(vendorFieldErrors({ email: "", phone: "", leadDays: "" })).toEqual({});
    expect(vendorFieldErrors({ email: "buyer@example.com", phone: "", leadDays: "0" })).toEqual({});
    for (const leadDays of ["-3", "2.5", "Infinity", "NaN"]) expect(vendorFieldErrors({ email: "", phone: "", leadDays }).leadDays).toBeTruthy();
    const html = renderToStaticMarkup(createElement(VendorView, { model: { name: "Supplier", email: "notanemail", phone: "", terms: "Net 30", termsOptions: ["Net 30"], leadDays: "2.5", active: null } }));
    expectAssociatedError(html, "Email", "Enter a valid email address, such as name@example.com.");
    expectAssociatedError(html, "Lead time (days)", "Enter a whole number of days, zero or more.");
  });

  // Send invite stays enabled so a click marks the email field (#1122); the submit still refuses the invalid email.
  it("keeps Send invite enabled for an invalid staff invitation but prevents its submit callback", () => {
    expect(emailError("")).toBeTruthy();
    expect(emailError("not-an-email")).toBeTruthy();
    expect(emailError("person@example.com")).toBeUndefined();
    expect(emailError(`${"a".repeat(300)}@example.org`)).toBe("Use at most 64 characters before the @ and 254 in total.");
    let tree: ReactNode;
    const onSubmit = vi.fn();
    function Harness() { return tree = InviteView({ buyer: false, defaultEmail: "not-an-email", onSubmit }); }
    renderToStaticMarkup(createElement(Harness));
    const nodes = elements(tree!);
    expect(nodes.find(node => node.props.type === "submit")?.props.disabled).toBe(false);
    (nodes.find(node => node.type === "form")!.props.onSubmit as (event: unknown) => void)({ preventDefault: vi.fn() });
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("associates pH correction with the actual water field, retaining optional decimal values", () => {
    for (const value of ["20", "-1", "NaN", "Infinity"]) expect(waterPhError(value)).toBe("Enter a water pH from 0 to 14.");
    for (const value of ["", "0", "7.85", "7.855", "14"]) expect(waterPhError(value)).toBeUndefined();
    const html = renderToStaticMarkup(createElement(WaterProfileView, { fields: { ...toWaterProfileFields(), water_ph: "20" } }));
    expectAssociatedError(html, "Water pH", "Enter a water pH from 0 to 14.");
  });

  it("keeps controlled fields quiet until blur or attempted submit, with blur handlers on the actual controls", () => {
    const model = { name: "Supplier", email: "notanemail", phone: "", terms: "Net 30", termsOptions: ["Net 30"], leadDays: "-3", active: null };
    const controls = { email: vi.fn(), leadDays: vi.fn() };
    let tree: ReactNode;
    function Harness() { return tree = VendorView({ model, controls }); }
    const untouched = renderToStaticMarkup(createElement(Harness));
    expect(untouched).not.toContain('aria-invalid="true"');
    const fields = elements(tree!).filter(node => ["Email", "Lead time (days)"].includes(String(node.props["aria-label"] ?? node.props.label)));
    expect(fields).toHaveLength(2);
    for (const field of fields) expect(field.props.onBlur).toBeTypeOf("function");
    const attempted = renderToStaticMarkup(createElement(VendorView, { model, controls, validationAttempted: true }));
    expectAssociatedError(attempted, "Email", "Enter a valid email address, such as name@example.com.");
    expectAssociatedError(attempted, "Lead time (days)", "Enter a whole number of days, zero or more.");
    const invite = renderToStaticMarkup(createElement(InviteView, { buyer: false, email: "not-an-email", validationAttempted: true }));
    expectAssociatedError(invite, "Email", "Enter a valid email address, such as name@example.com.");
  });

  it("keeps valid decimal controls and a valid staff invitation submittable", () => {
    const brand = renderToStaticMarkup(createElement(BrandView, { model: { ...toBrandViewProps(brandHazy), abv: "5.55" }, controls: { abv: vi.fn() }, validationAttempted: true }));
    expect(brand).not.toContain('aria-invalid="true"');
    expect(brand.match(/<input[^>]*aria-label="ABV %"[^>]*>/)?.[0]).toContain('step="any"');
    let tree: ReactNode;
    const onSubmit = vi.fn();
    function Harness() { return tree = InviteView({ buyer: false, email: "person@example.com", onSubmit }); }
    renderToStaticMarkup(createElement(Harness));
    const nodes = elements(tree!);
    expect(nodes.find(node => node.props.type === "submit")?.props.disabled).toBe(false);
    (nodes.find(node => node.type === "form")!.props.onSubmit as (event: unknown) => void)({ preventDefault: vi.fn() });
    expect(onSubmit).toHaveBeenCalledOnce();
  });
});
