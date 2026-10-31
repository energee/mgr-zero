// Gates the clock values and range summary exposed to assistive technology.
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import { TimeWindowField } from "@/components/mgr/time-window-field";

it.each([
  { start: "21:00", end: "06:00", times: ["9:00 PM", "6:00 AM"], summary: "9:00 PM – 6:00 AM · 9 hours" },
  { start: "08:00", end: "17:00", times: ["8:00 AM", "5:00 PM"], summary: "8:00 AM – 5:00 PM · 9 hours" },
  { start: "05:15", end: "03:45", times: ["5:15 AM", "3:45 AM"], summary: "5:15 AM – 3:45 AM · 22 hours 30 minutes" },
  { start: "00:00", end: "00:00", times: ["12:00 AM", "12:00 AM"], summary: "12:00 AM – 12:00 AM · 24 hours" },
])("exposes clock times and the visible summary for $start–$end", ({ start, end, times, summary }) => {
  const html = renderToStaticMarkup(createElement(TimeWindowField, { label: "Quiet hours", start, end }));
  const thumbs = html.match(/<[^>]+role="slider"[^>]*>/g) ?? [];
  expect(thumbs).toHaveLength(2);
  for (const [index, thumb] of thumbs.entries()) {
    expect(thumb).toContain(`aria-label="Quiet hours ${index === 0 ? "start" : "end"}"`);
    expect(thumb).toContain(`aria-valuetext="${times[index]}"`);
    const description = /aria-describedby="([^"]+)"/.exec(thumb)?.[1];
    expect(description).toBeDefined();
    expect(html).toMatch(new RegExp(`id="${description}"[^>]*>${summary}<`));
  }
});

it("gives separate time windows their own visible descriptions", () => {
  const html = renderToStaticMarkup(createElement("div", null,
    createElement(TimeWindowField, { label: "Quiet hours", start: "21:00", end: "06:00" }),
    createElement(TimeWindowField, { label: "Delivery window", start: "08:00", end: "17:00" }),
  ));
  const descriptions = [...html.matchAll(/role="slider"[^>]*aria-describedby="([^"]+)"/g)].map(match => match[1]);
  expect(descriptions).toHaveLength(4);
  expect(descriptions[0]).toBe(descriptions[1]);
  expect(descriptions[2]).toBe(descriptions[3]);
  expect(descriptions[0]).not.toBe(descriptions[2]);
});
