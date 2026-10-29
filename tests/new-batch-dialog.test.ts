// tests/new-batch-dialog.test.ts — #1127: the live New batch dialog
// (app/(app)/batches/new-batch-form.tsx) is titled "New batch" once and
// commits with "Schedule batch". CommandForm is stubbed to draw its title and
// body inline, because the real one portals and paints closed on the server.
import { createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ useRouter: () => ({ replace() {} }) }));
vi.mock("@/lib/commands/use-command-form", () => ({ useCommandForm: () => ({ open: true, setOpen() {}, error: null, submitting: false, submit() {} }) }));
vi.mock("@/components/mgr/command-form", async (original) => {
  const real = await original<typeof import("@/components/mgr/command-form")>();
  return { ...real, CommandForm: ({ title, children }: { title: ReactNode; children: ReactNode }) =>
    createElement("div", { role: "dialog" }, createElement("h2", null, title), children) };
});
import { NewBatchForm } from "@/app/(app)/batches/new-batch-form";

it("names the dialog New batch once and labels its submit Schedule batch", () => {
  const html = renderToStaticMarkup(createElement(NewBatchForm, { brands: [], recipeVersions: [], brandsHref: null }));
  expect(html).toContain("<h2>New batch</h2>");
  expect(html.split("New batch")).toHaveLength(2);
  expect(html).toMatch(/<button[^>]*type="submit"[^>]*>Schedule batch<\/button>/);
});

it("starts on the linked recipe version and its brand (the Recipe page's Schedule batch, #1581)", () => {
  const brands = [{ id: "b-terra", name: "Terra" }, { id: "b-rein", name: "Rein" }];
  const recipeVersions = [{ id: "v-terra", label: "Terra v1", brandId: "b-terra" }, { id: "v-rein", label: "Rein v2", brandId: "b-rein" }];
  const linked = renderToStaticMarkup(createElement(NewBatchForm, { brands, recipeVersions, brandsHref: null, recipeVersionId: "v-terra" }));
  expect(linked).toContain("Terra v1");
  expect(linked).toMatch(/>Terra</);
  expect(linked).not.toContain("Not decided");
  const plain = renderToStaticMarkup(createElement(NewBatchForm, { brands, recipeVersions, brandsHref: null }));
  expect(plain).not.toContain("Terra v1");
});
