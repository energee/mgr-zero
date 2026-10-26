// Required text must hold direct form submissions as well as disabled buttons.
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { FormEvent, ReactElement } from "react";
import type * as ReactModule from "react";

const harness = vi.hoisted(() => ({ values: [] as unknown[] }));
vi.mock("react", async importOriginal => ({
  ...await importOriginal<typeof ReactModule>(),
  useId: () => "required-text",
  useState: (initial: unknown) => [harness.values.length ? harness.values.shift() : typeof initial === "function" ? initial() : initial, vi.fn()],
}));

import { CustomerView } from "@/components/mgr/views/customer";
import { CancelOrderControl } from "@/components/mgr/views/cancel-order";
import { customerRidgeline } from "@/lib/mgr/fixtures/customers";
import { toCustomerViewProps } from "@/lib/mgr/customer-view";

beforeEach(() => { harness.values = []; });
const event = () => ({ preventDefault: vi.fn(), stopPropagation: vi.fn() }) as unknown as FormEvent;

describe("required text submit boundaries", () => {
  it("keeps cancellation form interactions local in the screen explorer", () => {
    const surface = CancelOrderControl({ trigger: null });
    expect(surface.props.previewAction).toBe(true);
    expect(surface.props.children.props["data-preview-action"]).toBe(true);
  });

  it.each(["", "   ", "\t\r\n", "\u00a0\u2003"])("does not save a customer with name %j", name => {
    const model = toCustomerViewProps(customerRidgeline);
    model.editValues.name = name;
    const onSave = vi.fn();
    const view = CustomerView({ model, onSave });
    const form = view.props.children.find((child: ReactElement) => child?.type === "form");
    form.props.onSubmit(event());
    expect(onSave).not.toHaveBeenCalled();
  });

  it.each([" \tValid account\n ", "N".repeat(250)])("preserves valid customer input %j for RPC normalization", name => {
    const model = toCustomerViewProps(customerRidgeline);
    model.editValues.name = name;
    const onSave = vi.fn();
    const view = CustomerView({ model, onSave });
    view.props.children.find((child: ReactElement) => child?.type === "form").props.onSubmit(event());
    expect(onSave).toHaveBeenCalledWith(model.editValues);
  });

  it.each(["", "   ", "\t\r\n", "\u00a0\u2003"])("does not cancel for reason %j", async reason => {
    harness.values = [true, reason, true];
    const onCancel = vi.fn();
    const surface = CancelOrderControl({ trigger: null, onCancel });
    await surface.props.children.props.onSubmit(event());
    expect(onCancel).not.toHaveBeenCalled();
  });

  it("sends the trimmed valid cancellation reason once", async () => {
    harness.values = [true, " \tCustomer changed plans\n ", true];
    const onCancel = vi.fn().mockResolvedValue(true);
    const surface = CancelOrderControl({ trigger: null, onCancel });
    await surface.props.children.props.onSubmit(event());
    expect(onCancel).toHaveBeenCalledExactlyOnceWith("Customer changed plans");
  });

  it("does not resend a cancellation while busy", async () => {
    harness.values = [true, "Customer changed plans", true];
    const onCancel = vi.fn();
    const surface = CancelOrderControl({ trigger: null, onCancel, busy: true });
    await surface.props.children.props.onSubmit(event());
    expect(onCancel).not.toHaveBeenCalled();
  });
});
