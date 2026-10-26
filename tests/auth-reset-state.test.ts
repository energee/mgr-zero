import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import ResetPage from "@/app/(auth)/reset/page";
import { EntryView } from "@/components/mgr/views/entry";
import { portalForgotPassword } from "@/lib/mgr/fixtures/entry";

const confirmation = "If that email is on an account, a reset link is on its way.";

describe("reset confirmation belongs to the submit outcome (#1398)", () => {
  it.each([{}, { portal: "1" }, { portal: "1", sent: "1" }, { sent: "1" }])("does not claim a request was sent on a fresh page %j", async (query) => {
    const html = renderToStaticMarkup(await ResetPage({ searchParams: Promise.resolve(query) }));
    expect(html).not.toContain(confirmation);
    expect(html).toContain('name="email"');
    expect(html).toContain("Send reset link");
  });

  it("keeps the inventory's initial portal reset state honest too", () => {
    expect(renderToStaticMarkup(createElement(EntryView, { model: portalForgotPassword }))).not.toContain(confirmation);
  });
});
