// tests/pars-view.test.ts — adapter mapping and ParsView HTML. Inventory
// wiring stays in the parent; this file does not import SCREENS or app/.
import { readFileSync } from "node:fs";
import { createElement, isValidElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { SCREENS } from "../components/mgr/screens";
import { ParsView } from "../components/mgr/views/pars";
import { parsPils } from "../lib/mgr/fixtures/pars";
import { toParsViewProps } from "../lib/mgr/pars-view";

describe("Pars view", () => {
  it("maps ATP −6 and Adjust/Release verbs from the shortfall snapshot", () => {
    const model = toParsViewProps(parsPils);
    expect(model.title).toBe("Pils · 16 oz case");
    expect(model.atp).toBe("−6 cases · −0.58 bbl");
    expect(model.atpDetail).toBe("ATP · 22 cases on hand · 28 allocated");
    expect(model.rows.map((r) => r.verb)).toEqual(["Adjust", "Release", "Edit", "Edit par"]);
    expect(model.rows[0]?.title).toMatch(/^ORD-0231 · Ridgeline/);
    expect(model.rows[0]?.tone).toBe("attention");
    expect(model.rows[1]?.title).toMatch(/^ORD-0234 · Teresa/);
    expect(model.rows[1]?.tone).toBe("destructive");
    expect(model.rows[2]?.title).toBe("Taproom standing");
    expect(model.rows[3]?.title).toBe("Taproom par");
  });

  it("renders those verbs from the view", () => {
    const html = renderToStaticMarkup(createElement(ParsView, { model: toParsViewProps(parsPils) }));
    expect(html).toMatch(/>Adjust</);
    expect(html).toMatch(/>Release</);
    expect(html).toMatch(/>Edit</);
    expect(html).toMatch(/>Edit par</);
    expect(html).toMatch(/>Adjust selected</);
    expect(html).not.toMatch(/→/);
  });

  it("the Pars inventory record is ParsView painted from that fixture", () => {
    const body = SCREENS.find((s) => s.name === "Pars and allocation")!.body as { type: unknown; props: { model: unknown } };
    expect(isValidElement(SCREENS.find((s) => s.name === "Pars and allocation")!.body)).toBe(true);
    expect(body.type).toBe(ParsView);
    expect(body.props.model).toEqual(toParsViewProps(parsPils));
  });

  it("the live replenishment page mounts ParsView with no second E.* tree", () => {
    const src = readFileSync("app/(app)/replenishment/page.tsx", "utf8");
    expect(src).toMatch(/from "@\/components\/mgr\/views\/pars"/);
    expect(src).toMatch(/<ParsView\b/);
    expect(src).not.toMatch(/from "@\/components\/mgr\/e"/);
    expect(src).toMatch(/<ReplenishForm\b/);
  });
});
