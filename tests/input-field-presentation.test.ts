import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it, vi } from "vitest";
import { VendorView } from "@/components/mgr/views/vendor";
import { ShipToView } from "@/components/mgr/views/ship-to";
import { InviteView } from "@/components/mgr/views/team-controls";
import { BrewerySettingsFormView } from "@/components/mgr/views/brewery-settings-form";
import { toBrewerySettingsValues } from "@/lib/mgr/settings-view";
import { toShipToViewProps } from "@/lib/mgr/ship-to-view";

function expectFieldError(html: string, message: string) {
  expect(html).toContain('aria-invalid="true"');
  const errorId = /aria-describedby="([^"]*-error)"/.exec(html)?.[1];
  expect(errorId).toBeDefined();
  expect(html).toContain(`id="${errorId}"`);
  expect(html).toContain(message);
  expect(html).not.toContain("validation failed");
}

it("renders vendor server phone corrections at an accessible highlighted field", () => {
  const html = renderToStaticMarkup(createElement(VendorView, {
    model: { name: "Supplier", email: "", phone: "abc", terms: "Net 30", termsOptions: ["Net 30"], leadDays: "" },
    errors: { phone: "Use a phone number, such as (503) 555-0142." },
  }));
  expectFieldError(html, "Use a phone number, such as (503) 555-0142.");
});

it("shows controlled vendor server errors without losing local attempted-state diagnostics", () => {
  const model = { name: "Supplier", email: "not-an-email", phone: "", terms: "Net 30", termsOptions: ["Net 30"], leadDays: "-1" };
  const controls = { email: vi.fn(), leadDays: vi.fn() };
  const serverError = "Check this supplier email.";
  const html = renderToStaticMarkup(createElement(VendorView, { model, controls, errors: { email: serverError } }));
  expectFieldError(html, serverError);
  expect(html.match(/aria-invalid="true"/g)).toHaveLength(1);
  const attempted = renderToStaticMarkup(createElement(VendorView, { model, controls, errors: { email: serverError }, validationAttempted: true }));
  expect(attempted.match(/aria-invalid="true"/g)).toHaveLength(2);
  expect(attempted).toContain('value="-1"');
});

it("renders both state and ZIP corrections without losing ship-to values", () => {
  const html = renderToStaticMarkup(createElement(ShipToView, {
    model: toShipToViewProps({ label: "Dock", country: "US", address1: "", address2: "", city: "", state: "ZZ", zip: "abc", isDefault: false }),
    errors: { state: "Use a two-letter state code, such as PA.", zip: "Use a 5-digit ZIP code or ZIP+4." },
  }));
  expectFieldError(html, "Use a two-letter state code, such as PA.");
  expect(html.match(/aria-invalid="true"/g)).toHaveLength(2);
  expect(html).toContain("Use a 5-digit ZIP code or ZIP+4.");
  expect(html).toContain('value="abc"');
});

it("renders invite email corrections instead of native validation tooltips", () => {
  const html = renderToStaticMarkup(createElement(InviteView, { buyer: false, email: "a@b", emailError: "Use a complete email address." }));
  expectFieldError(html, "Use a complete email address.");
  expect(html).toContain('noValidate=""');
});

it("maps brewery customerPhone failures to the visible phone field", () => {
  const initial = toBrewerySettingsValues({ name: "Brewery", timezone: "America/New_York", ttb_registry_no: null, pa_license_no: null, customer_phone: "abc", fermentation_reading_due_hours: 24, books_opened_on: null, one_way_keg_fee_cents: 0, days_to_package: 14 });
  const html = renderToStaticMarkup(createElement(BrewerySettingsFormView, { initial, fieldErrors: { phone: "Use a phone number." } }));
  expectFieldError(html, "Use a phone number.");
  expect(html).toContain("Customer-facing phone");
  expect(html).not.toContain("customerPhone");
});
