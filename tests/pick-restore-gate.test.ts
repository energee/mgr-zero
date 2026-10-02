// A restore gate disables picking without claiming that an idle command is saving.
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { PickView } from "@/components/mgr/views/pick";
it("keeps the re-entry explanation while any line still needs an observation", () => {
  const source = readFileSync(new URL("../app/(app)/orders/[id]/pick-form.tsx", import.meta.url), "utf8");
  expect(source).toContain('error ?? (needsCounts.length ? "Re-enter every line before saving." : draftError)');
});
it("keeps Done picking text while restoration prevents submission", () => {
  const html = renderToStaticMarkup(createElement(PickView, { model: { backTo: "Order", title: "Pick", info: "Warehouse", lines: [] }, disabled: true }));
  expect(html).toContain("Done picking");
  expect(html).not.toContain("Saving");
  expect(html).toMatch(/type="submit"[^>]*disabled/);
});
