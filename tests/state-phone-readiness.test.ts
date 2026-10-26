import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import { StateRegistrationView } from "@/components/mgr/views/state-registration";
import { VendorView } from "@/components/mgr/views/vendor";
import { vendorFieldErrors } from "@/lib/mgr/vendor-view";
import { CustomerView } from "@/components/mgr/views/customer";
import { customerStateReason, toCustomerViewProps } from "@/lib/mgr/customer-view";
import { customerRidgeline } from "@/lib/mgr/fixtures/customers";
import { UsStateField } from "@/components/mgr/us-state-field";

it.each(["123", "12", "ZZ", ""])("withholds registration save for state %j and explains readiness", state => {
  const html = renderToStaticMarkup(createElement(StateRegistrationView, { model: { brand: "Fictional IPA", state } }));
  expect(html).toMatch(/<button[^>]*disabled[^>]*>Save registration/);
  expect(html).toContain("Still needed:");
});

it.each(["PA", "OR", "DC"])("permits registration state %s and offers cancellation", state => {
  const html = renderToStaticMarkup(createElement(StateRegistrationView, { model: { brand: "Fictional IPA", state } }));
  expect(html).not.toContain("Still needed:");
  expect(html).toMatch(/type="button"[^>]*>Cancel/);
  expect(html).toContain('role="combobox"');
});

it("rejects vendor letters locally, with an associated field error before a write", () => {
  expect(vendorFieldErrors({ email: "", leadDays: "", phone: "abc" }).phone).toBeTruthy();
  const html = renderToStaticMarkup(createElement(VendorView, { model: { name: "Fictional Supplier", email: "", phone: "abc", terms: "Net 30", termsOptions: ["Net 30"], leadDays: "", active: null } }));
  expect(html).toContain('aria-invalid="true"');
  expect(html).toMatch(/<button[^>]*disabled[^>]*>Save vendor/);
});

it.each(["", "(503) 555-0142", "+44 20 7946 0958", "+1 503.555.0142"])("preserves optional and formatted vendor phone %j", phone => {
  expect(vendorFieldErrors({ email: "", leadDays: "", phone }).phone).toBeUndefined();
});

it.each(["123", "12", "ZZ", ""])("withholds US customer save for state %j before a write", state => {
  const model = toCustomerViewProps(customerRidgeline);
  model.editValues = { ...model.editValues, state };
  expect(customerStateReason(model.editValues)).toBeTruthy();
  const html = renderToStaticMarkup(createElement(CustomerView, { model }));
  expect(html).toMatch(/<button[^>]*disabled[^>]*>Save customer/);
  if (state) expect(html).toContain('aria-invalid="true"');
});

it.each(["PA", "OR", "DC", "PR"])("allows US customer state %s", state => {
  expect(customerStateReason({ country: "US", state })).toBeNull();
});

it("allows a non-US customer without a state and keeps that field unavailable", () => {
  const model = toCustomerViewProps(customerRidgeline);
  model.editValues = { ...model.editValues, country: "JP", state: "" };
  expect(customerStateReason(model.editValues)).toBeNull();
  const html = renderToStaticMarkup(createElement(CustomerView, { model }));
  expect(html).toContain('value="Not applicable"');
  expect(html).not.toContain("Still needed:");
});

it("reports invalid prefilled state once with an associated inline correction", () => {
  const html = renderToStaticMarkup(createElement(UsStateField, { value: "123", controls: { id: "test-state" } }));
  expect(html).toContain('aria-describedby="test-state-error"');
  expect(html.match(/Choose a US state from the list\./g)).toHaveLength(1);
  expect(html).not.toContain('value="12"');
});

it("keeps registration identity disabled on edit", () => {
  const html = renderToStaticMarkup(createElement(StateRegistrationView, { model: { brand: "Fictional IPA", state: "PA" }, locked: true }));
  expect(html).toMatch(/<button[^>]*role="combobox"[^>]*disabled/);
});
