// tests/ttb-colas.test.ts — the TTB COLA registry client: parsing a saved
// results page, name matching, and paging with a stubbed request (no network).
import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import {
  matchColas,
  parseColaPage,
  searchColasByPermit,
  type ColaRecord,
} from "@/lib/ttb/colas";

const fixture = readFileSync("tests/fixtures/ttb-cola-results.html", "utf8");

function row(ttbId: string, serial: string, completed: string, fanciful: string): string {
  return `<tr class="lt"><td><a href="x">${ttbId}</a></td><td>BR-PA-20553</td>
    <td>${serial}</td><td>${completed}</td><td>${fanciful}</td><td>LOLEV BEER</td>
    <td>39</td><td>PENNSYLVANIA</td><td>901</td><td>BEER</td></tr>`;
}

function page(total: number, rows: string[], next: boolean): string {
  const link = next ? ` | <a href='publicPageAdvancedCola.do?action=page&pgfcn=nextset'>Next &gt;</a>` : "";
  return `<html><body>(Total Matching Records: ${total})${link}<table>${rows.join("")}</table></body></html>`;
}

describe("parseColaPage", () => {
  it("reads the saved results page", () => {
    const { total, rows, hasNext } = parseColaPage(fixture);
    expect(total).toBe(144);
    expect(rows).toHaveLength(20);
    expect(hasNext).toBe(true);
    expect(rows[0]).toEqual({
      ttbId: "23023001000185",
      permit: "BR-PA-20553",
      serial: "230001",
      completedOn: "2023-01-24",
      fancifulName: "ARRAY",
      brandName: "LOLEV BEER",
      classCode: "901",
      className: "BEER",
    });
  });

  it("throws when the page has no total", () => {
    expect(() => parseColaPage("<html><body>Error</body></html>")).toThrow();
  });

  it("accepts an empty result", () => {
    expect(parseColaPage(page(0, [], false))).toEqual({ total: 0, rows: [], hasNext: false });
  });
});

describe("matchColas", () => {
  const rows = parseColaPage(fixture).rows;

  it("matches fanciful or brand name, ignoring case", () => {
    expect(matchColas(rows, "waves").map((r) => r.fancifulName)).toContain("WAVES");
    expect(matchColas(rows, "lolev")).toHaveLength(rows.length);
    expect(matchColas(rows, "no such beer")).toEqual([]);
  });

  it("returns every row for a blank name", () => {
    expect(matchColas(rows, "  ")).toHaveLength(rows.length);
    expect(matchColas(rows)).toHaveLength(rows.length);
  });
});

describe("searchColasByPermit", () => {
  it("pages with the session cookie until the total, newest first", async () => {
    const calls: { url: string; method: string; body?: string; cookie?: string }[] = [];
    const result = await searchColasByPermit("BR-PA-20553", async (url, init) => {
      calls.push({ url, ...init });
      if (init.method === "POST") {
        return {
          status: 200,
          setCookie: ["JSESSIONID=abc123; Path=/colasonline; Secure"],
          body: page(3, [row("1", "230001", "01/24/2023", "ARRAY"), row("2", "", "03/05/2024", "WAVES")], true),
        };
      }
      return { status: 200, setCookie: [], body: page(3, [row("3", "230009", "07/01/2023", "TIDE")], false) };
    });

    expect(result.map((r: ColaRecord) => r.ttbId)).toEqual(["2", "3", "1"]);
    expect(result[0].serial).toBeNull();
    expect(calls[0].method).toBe("POST");
    expect(calls[0].body).toContain("searchCriteria.permitId=BR-PA-20553");
    expect(calls[1].method).toBe("GET");
    expect(calls[1].url).toContain("pgfcn=nextset");
    expect(calls[1].cookie).toBe("JSESSIONID=abc123");
  });

  it("throws when paging stops before the total", async () => {
    await expect(
      searchColasByPermit("BR-PA-20553", async (_url, init) =>
        init.method === "POST"
          ? { status: 200, setCookie: [], body: page(3, [row("1", "1", "01/01/2023", "A")], true) }
          : { status: 200, setCookie: [], body: page(3, [], false) },
      ),
    ).rejects.toThrow();
  });

  it("asks for 15 years less a day, TTB's widest accepted range", async () => {
    vi.useFakeTimers({ now: new Date(2026, 9, 14, 12) });
    try {
      let body = "";
      await searchColasByPermit("BR-PA-20553", async (_url, init) => {
        body = init.body ?? "";
        return { status: 200, setCookie: [], body: page(0, [], false) };
      });
      const form = new URLSearchParams(body);
      expect(form.get("searchCriteria.dateCompletedFrom")).toBe("10/15/2011");
      expect(form.get("searchCriteria.dateCompletedTo")).toBe("10/14/2026");
    } finally {
      vi.useRealTimers();
    }
  });

  it("surfaces TTB's error message", async () => {
    const errorPage = `<ul class="errorList"><li>The current Date Completed range is greater than 15 year(s).</li></ul>`;
    await expect(
      searchColasByPermit("BR-PA-20553", async () => ({ status: 200, setCookie: [], body: errorPage })),
    ).rejects.toThrow(/greater than 15 year/);
  });

  it("throws on a non-200 response", async () => {
    await expect(
      searchColasByPermit("BR-PA-20553", async () => ({ status: 500, setCookie: [], body: "" })),
    ).rejects.toThrow(/500/);
  });
});
