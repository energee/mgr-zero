// tests/cellar-action-forms.test.ts — #1115: the live Cellar Transfer and
// Addition triggers are off when the map model says no tank holds beer
// (CellarMapViewModel.actionsOff), and on otherwise. The page passes that one
// flag to both forms, so the rule lives only in toCellarMapViewProps.
import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/commands/use-command-form", () => ({ useCommandForm: () => ({ open: false, setOpen() {}, submitting: false, error: null, submit() {} }) }));
vi.mock("@/components/mgr/command-form", async (original) => {
  const real = await original<typeof import("@/components/mgr/command-form")>();
  return { ...real, CommandForm: (props: { trigger: unknown }) => createElement("div", null, props.trigger as never) };
});
import { CellarTransferForm } from "@/app/(app)/cellar/cellar-transfer-form";
import { CellarAdditionForm } from "@/app/(app)/cellar/cellar-addition-form";
import { cellarAdditionCitra, cellarTransferPils } from "@/lib/mgr/fixtures/production";

const off = (verb: string) => new RegExp(`<button[^>]*disabled=""[^>]*>${verb}</button>`);
const { occupancies, vessels } = cellarTransferPils;
const { materials, lotsByMaterial } = cellarAdditionCitra;

describe("cellar action triggers (#1115)", () => {
  it("turns Transfer off when the map says no tank holds beer", () => {
    expect(renderToStaticMarkup(createElement(CellarTransferForm, { occupancies: [], vessels, disabled: true }))).toMatch(off("Transfer"));
    expect(renderToStaticMarkup(createElement(CellarTransferForm, { occupancies, vessels, disabled: false }))).not.toMatch(off("Transfer"));
  });

  it("turns Addition off when the map says no tank holds beer", () => {
    expect(renderToStaticMarkup(createElement(CellarAdditionForm, { occupancies: [], materials, lotsByMaterial, disabled: true }))).toMatch(off("Addition"));
    expect(renderToStaticMarkup(createElement(CellarAdditionForm, { occupancies, materials, lotsByMaterial, disabled: false }))).not.toMatch(off("Addition"));
  });

  it("the page hands both forms the map's one flag", () => {
    const page = readFileSync("app/(app)/cellar/page.tsx", "utf8");
    expect(page).toMatch(/<CellarTransferForm[^>]*disabled=\{model\.actionsOff\}/);
    expect(page).toMatch(/<CellarAdditionForm[^>]*disabled=\{model\.actionsOff\}/);
  });
});
