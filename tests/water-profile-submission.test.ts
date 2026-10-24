// Invalid water measurements must also block the live form's command boundary.
import { beforeEach, expect, it, vi } from "vitest";
import type * as ReactModule from "react";
import type { FormEvent } from "react";

const harness = vi.hoisted(() => ({ calcium: "0", alkalinity: "", waterPh: "", stateIndex: 0, submit: vi.fn() }));
vi.mock("react", async importOriginal => ({
  ...await importOriginal<typeof ReactModule>(),
  useId: () => "water-form",
  useState: (initial: unknown) => {
    if (harness.stateIndex++ === 0) return [{ name: "Source water", calcium_ppm: harness.calcium, magnesium_ppm: "0", sodium_ppm: "0", sulfate_ppm: "0", chloride_ppm: "0", bicarbonate_ppm: "0", alkalinity_ppm: harness.alkalinity, water_ph: harness.waterPh, note: "" }, vi.fn()];
    return [typeof initial === "function" ? initial() : initial, vi.fn()];
  },
}));
vi.mock("@/lib/commands/use-command-form", () => ({ useCommandForm: () => ({ open: true, setOpen: vi.fn(), submitting: false, busy: false, error: null, submit: harness.submit }) }));
import { WaterProfileForm } from "@/app/(app)/catalog/water-profiles/water-profile-form";

beforeEach(() => { harness.calcium = "0"; harness.alkalinity = ""; harness.waterPh = ""; harness.stateIndex = 0; harness.submit.mockClear(); });

it.each(["20", "-1", "1e1", "1E1"])("blocks pH %s even when all other required fields are complete", waterPh => {
  harness.waterPh = waterPh;
  const surface = WaterProfileForm({});
  surface.props.children.props.onSubmit({ preventDefault: vi.fn(), stopPropagation: vi.fn() } as unknown as FormEvent);
  expect(harness.submit).not.toHaveBeenCalled();
});

it.each(["calcium", "alkalinity"] as const)("blocks invalid %s at the live submit boundary", field => {
  for (const value of ["1e3", "1000000", "-1", "Infinity"]) {
    harness.stateIndex = 0;
    harness[field] = value;
    const surface = WaterProfileForm({});
    surface.props.children.props.onSubmit({ preventDefault: vi.fn(), stopPropagation: vi.fn() } as unknown as FormEvent);
  }
  expect(harness.submit).not.toHaveBeenCalled();
});

it("allows an ordinary fractional pH through the existing submit boundary", () => {
  harness.waterPh = "7.85";
  const surface = WaterProfileForm({});
  surface.props.children.props.onSubmit({ preventDefault: vi.fn(), stopPropagation: vi.fn() } as unknown as FormEvent);
  expect(harness.submit).toHaveBeenCalledOnce();
});
