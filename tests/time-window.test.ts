import { describe, expect, it } from "vitest";
import { anchorFor, formatClock, formatWindow, fromNoonOffset, fromOffset, parseClock, toNoonOffset, toOffset } from "@/lib/time-window";

describe("parseClock", () => {
  it.each([["00:00", 0], ["06:00", 360], ["21:00", 1260], ["21:30", 1290]])(
    "%s is %i minutes",
    (value, minutes) => expect(parseClock(value)).toBe(minutes),
  );
  it("falls back to midnight rather than NaN", () => expect(parseClock("nonsense")).toBe(0));
});

describe("formatClock", () => {
  it.each([
    [0, "12:00 AM"],
    [360, "6:00 AM"],
    [720, "12:00 PM"],
    [1260, "9:00 PM"],
    [1425, "11:45 PM"],
  ])("%i reads %s", (minutes, expected) => expect(formatClock(minutes)).toBe(expected));
});

describe("the noon-anchored axis", () => {
  it.each([[720, 0], [1260, 540], [0, 720], [360, 1080], [719, 1439]])(
    "%i sits at offset %i",
    (minutes, offset) => expect(toNoonOffset(minutes)).toBe(offset),
  );

  it("round-trips every half hour", () => {
    for (let m = 0; m < 1440; m += 30) expect(fromNoonOffset(toNoonOffset(m))).toBe(m);
  });

  it("wraps a full turn back to noon", () => expect(fromNoonOffset(1440)).toBe(720));
});

describe("the anchor a window can be drawn against", () => {
  // A slider track is monotonic: descending offsets draw a negative-width range
  // and swap the two ends on the first drag, so both offsets must ascend.
  const offsets = (start: string, end: string) => {
    const [s, e] = [parseClock(start), parseClock(end)];
    const anchor = anchorFor(s, e);
    return [toOffset(s, anchor), toOffset(e, anchor), anchor] as const;
  };

  it.each([
    ["21:00", "06:00"], // quiet hours, through midnight
    ["11:00", "22:00"], // taproom hours, through noon
    ["08:00", "17:00"], // a delivery window, through noon
    ["00:00", "23:30"],
  ])("keeps %s – %s ascending on its track", (start, end) => {
    const [from, to] = offsets(start, end);
    expect(from).toBeLessThan(to);
  });

  it("round-trips both ends through its own anchor", () => {
    const [from, to, anchor] = offsets("11:00", "22:00");
    expect(fromOffset(from, anchor)).toBe(parseClock("11:00"));
    expect(fromOffset(to, anchor)).toBe(parseClock("22:00"));
  });

  it("keeps quiet hours on the noon track", () => expect(offsets("21:00", "06:00")[2]).toBe(720));
});

describe("formatWindow", () => {
  it("names both ends and the length", () => expect(formatWindow(1260, 360)).toBe("9:00 PM – 6:00 AM · 9 hours"));
  it("measures forward within a day", () => expect(formatWindow(540, 1020)).toBe("9:00 AM – 5:00 PM · 8 hours"));
  it("keeps a half hour readable", () => expect(formatWindow(1290, 375)).toBe("9:30 PM – 6:15 AM · 8 hours 45 minutes"));
  it("says one hour without a plural", () => expect(formatWindow(1260, 1320)).toBe("9:00 PM – 10:00 PM · 1 hour"));
  it("reads an empty span as the whole day, never zero", () =>
    expect(formatWindow(1260, 1260)).toBe("9:00 PM – 9:00 PM · 24 hours"));
});
