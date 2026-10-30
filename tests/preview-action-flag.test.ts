// tests/preview-action-flag.test.ts — #1005 added a previewAction flag to
// CommandForm, SearchPick and E.searchPick so Keg history's inventory pickers
// act in place inside the explorer. Every other caller leaves it unset; this
// proves they render exactly as before: no data-preview-action anywhere (#1025).
import { renderToStaticMarkup } from "react-dom/server";
import { createElement, isValidElement, type ReactElement, type ReactNode } from "react";
import type * as ReactModule from "react";
import { describe, expect, it, vi } from "vitest";
const view = vi.hoisted(() => ({ mobile: false }));
vi.mock("react", async importOriginal => ({ ...await importOriginal<typeof ReactModule>(), useState: () => [false, () => {}], useId: () => "preview-pick-test", useRef: (current: unknown) => ({ current }) }));
vi.mock("@/hooks/use-mobile", () => ({ useIsMobile: () => view.mobile }));
import { CommandForm } from "@/components/mgr/command-form";
import { SearchPick } from "@/components/mgr/search-pick";
import { E } from "@/components/mgr/e";

type Props = Record<string, unknown> & { children?: ReactNode };
function elements(node: ReactNode): ReactElement<Props>[] {
  if (Array.isArray(node)) return node.flatMap(elements);
  if (!isValidElement<Props>(node)) return [];
  return [node, ...elements(node.props.children)];
}
/** Elements that carry the flag, as the DOM attribute or as the prop passed down. */
const flagged = (node: ReactNode) => elements(node).filter(e => e.props["data-preview-action"] !== undefined || e.props.previewAction !== undefined);

const options = [{ value: "pale", label: "Pale malt" }];
const pick = { label: "Material", title: "Select material", placeholder: "Choose", searchPlaceholder: "Search", noMatchMessage: "None", value: "", options };
const form = (previewAction?: boolean, container?: HTMLElement) =>
  CommandForm({ open: true, title: "Record", trigger: createElement("button", null, "Open"), children: "Body", previewAction, container });

describe.each([["dialog", false], ["sheet", true]])("CommandForm as a %s", (_, mobile) => {
  it("carries no preview flag when the caller leaves it unset", () => {
    view.mobile = mobile;
    expect(flagged(form())).toEqual([]);
    expect(flagged(form(undefined, {} as HTMLElement))).toEqual([]);
  });
  it("carries it on the content and Close when set", () => {
    view.mobile = mobile;
    expect(flagged(form(true)).length).toBeGreaterThanOrEqual(2);
  });
});

it("SearchPick passes no flag to its trigger or form when unset", () => {
  const unset = SearchPick(pick);
  expect(flagged(unset)).toEqual([]);
  expect(flagged(unset.props.trigger)).toEqual([]);
  const set = SearchPick({ ...pick, previewAction: true });
  expect(set.props.previewAction).toBe(true);
  expect(flagged(set.props.trigger)).toHaveLength(1);
});

it("E.searchPick renders no data-preview-action unless asked", () => {
  expect(renderToStaticMarkup(E.searchPick("Material", "", options))).not.toContain("data-preview-action");
  expect(renderToStaticMarkup(E.searchPick("Material", "", options, { previewAction: true }))).toContain("data-preview-action");
});
