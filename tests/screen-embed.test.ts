// tests/screen-embed.test.ts — a guide's <Screen> frame is not in the
// server HTML (#1491): the staff guide embeds 108 of them, and their
// Mobile/Desktop switches were about half of its markup. The server draws a
// placeholder the frame's starting height, so anchors land where they will.
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { Screen } from "../components/mgr/screen-embed";

describe("guide screen embed", () => {
  it("server-renders a placeholder, not the switch or the frame", () => {
    const html = renderToStaticMarkup(createElement(Screen, { name: "Orders" }));
    expect(html).not.toContain("<iframe");
    expect(html).not.toContain("radiogroup");
    expect(html).toContain("height:816px");
  });

  it("still fails on a name the inventory does not have", () => {
    expect(() => renderToStaticMarkup(createElement(Screen, { name: "No such screen" }))).toThrow(/no such screen/);
  });
});
