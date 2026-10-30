// SearchPick (components/mgr/search-pick.tsx) and E.searchPick: the searchable
// picker moved out of New Order's SKU field. Its open state is mocked closed so
// the element tree can be read without a renderer.
import { expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { createElement, isValidElement, type ReactElement, type ReactNode } from "react";
import type * as ReactModule from "react";
vi.mock("react", async importOriginal => ({ ...await importOriginal<typeof ReactModule>(), useState: () => [false, () => {}], useId: () => "search-pick-test" }));
import { SearchPick } from "@/components/mgr/search-pick";
import { E } from "@/components/mgr/e";

const options = [{ value: "pale", label: "Pale malt" }, { value: "cascade", label: "Cascade" }];
const copy = { label: "Material", title: "Select material", placeholder: "Choose a material", searchPlaceholder: "Search materials", noMatchMessage: "No matching materials" };

function elements(node: ReactNode): ReactElement<Record<string, unknown>>[] {
  if (Array.isArray(node)) return node.flatMap(elements);
  if (!isValidElement<{ children?: ReactNode }>(node)) return [];
  return [node as ReactElement<Record<string, unknown>>, ...elements(node.props.children)];
}

it("shows the picked label, the placeholder when empty, and a retained value's label", () => {
  expect(renderToStaticMarkup(SearchPick({ ...copy, value: "pale", options }).props.trigger)).toContain("Pale malt");
  expect(renderToStaticMarkup(SearchPick({ ...copy, value: "", options }).props.trigger)).toContain("Choose a material");
  expect(renderToStaticMarkup(SearchPick({ ...copy, value: "gone", options, selectedLabel: "Old malt" }).props.trigger)).toContain("Old malt");
});

it("gives every option its label as a search keyword", () => {
  const items = elements(SearchPick({ ...copy, value: "", options }).props.children).filter(element => element.props.keywords);
  expect(items.map(item => [item.props.value, item.props.keywords])).toEqual([["pale", ["Pale malt"]], ["cascade", ["Cascade"]]]);
});

it("does not say no matching while options are still pending", () => {
  const pending = SearchPick({ ...copy, value: "", options: [], optionsReady: false, feedback: createElement("p", null, "Loading materials") });
  expect(renderToStaticMarkup(pending.props.children)).not.toContain("No matching");
  const empty = SearchPick({ ...copy, value: "", options: [], emptyMessage: "No materials yet" });
  expect(renderToStaticMarkup(empty.props.children)).toContain("No materials yet");
});

it("E.searchPick labels the field and shows its placeholder", () => {
  const html = renderToStaticMarkup(E.searchPick("Material", "", options, { placeholder: "Choose a material" }));
  expect(html).toContain(">Material</label>");
  expect(html).toContain("Choose a material");
  expect(renderToStaticMarkup(E.searchPick("Material", "cascade", options))).toContain("Cascade");
});

it("makes the searchable filter visibly selectable like the adjacent select (#1255)", () => {
  const trigger = SearchPick({ ...copy, value: "pale", options, outlined: true }).props.trigger;
  expect(trigger.props.variant).toBe("outline");
  expect(renderToStaticMarkup(trigger)).toContain("<svg");
});
