import { describe, expect, it } from "vitest";
import { formatClock, formatWindow, fromNoonOffset, parseClock, toNoonOffset, windowMinutes } from "@/lib/time-window";

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
  // Quiet hours wrap midnight, so a 0–1440 track runs backwards. Anchoring the
  // track at noon makes every night window one contiguous span.
  it.each([[720, 0], [1260, 540], [0, 720], [360, 1080], [719, 1439]])(
    "%i sits at offset %i",
    (minutes, offset) => expect(toNoonOffset(minutes)).toBe(offset),
  );

  it("round-trips every half hour", () => {
    for (let m = 0; m < 1440; m += 30) expect(fromNoonOffset(toNoonOffset(m))).toBe(m);
  });

  it("wraps a full turn back to noon", () => expect(fromNoonOffset(1440)).toBe(720));
});

describe("windowMinutes", () => {
  it("measures forward within a day", () => expect(windowMinutes(540, 1020)).toBe(480));
  it("measures across midnight", () => expect(windowMinutes(1260, 360)).toBe(540));
  it("treats an empty span as a whole day, since quiet hours never mean zero", () =>
    expect(windowMinutes(1260, 1260)).toBe(1440));
});

describe("formatWindow", () => {
  it("names both ends and the length", () => expect(formatWindow(1260, 360)).toBe("9:00 PM – 6:00 AM · 9 hours"));
  it("keeps a half hour readable", () => expect(formatWindow(1290, 375)).toBe("9:30 PM – 6:15 AM · 8 hours 45 minutes"));
  it("says one hour without a plural", () => expect(formatWindow(1260, 1320)).toBe("9:00 PM – 10:00 PM · 1 hour"));
});
