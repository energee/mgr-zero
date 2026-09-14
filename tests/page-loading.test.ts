import { expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { createElement, type ReactElement } from "react";
import Loading from "@/app/(app)/loading";
import { PageLoadingView } from "@/components/mgr/views/page-loading";
import { SCREENS } from "@/components/mgr/screens";

it("uses the inventory loading view for live staff navigation with accessible feedback", () => {
  expect(Loading).toBe(PageLoadingView);
  const body = SCREENS.find(screen => screen.name === "Page loading")!.body as ReactElement;
  expect(body.type).toBe(Loading);
  const html = renderToStaticMarkup(createElement(Loading));
  expect(html).toBe(renderToStaticMarkup(body));
  expect(html).toContain('role="status"');
  expect(html).toContain('aria-label="Loading page"');
  expect(html).toContain('aria-hidden="true"');
  expect(html).toContain("motion-safe:animate-pulse");
});
