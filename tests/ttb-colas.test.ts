// tests/ttb-colas.test.ts — the TTB COLA registry client: parsing a saved
// results page, name matching, and paging with a stubbed request (no network).
import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import {
  getColaDetails,
  getColaImage,
  isColaImageUrl,
  parseColaDetails,
  parseColaImages,
  matchColas,
  parseColaPage,
  searchColasByPermit,
  type ColaRecord,
} from "@/lib/ttb/colas";

const fixture = readFileSync("tests/fixtures/ttb-cola-results.html", "utf8");

function row(ttbId: string, serial: string, completed: string, fanciful: string): string {
  return `<tr class="lt"><td><a href="x">${ttbId}</a></td><td>BR-PA-12345</td>
    <td>${serial}</td><td>${completed}</td><td>${fanciful}</td><td>EXAMPLE BREWING</td>
    <td>39</td><td>PENNSYLVANIA</td><td>901</td><td>BEER</td></tr>`;
}

function page(total: number, rows: string[], next: boolean): string {
  const link = next ? ` | <a href='publicPageAdvancedCola.do?action=page&pgfcn=nextset'>Next &gt;</a>` : "";
  return `<html><body>(Total Matching Records: ${total})${link}<table>${rows.join("")}</table></body></html>`;
}

describe("parseColaPage", () => {
  it("reads the saved results page", () => {
    const { total, rows, hasNext } = parseColaPage(fixture);
    expect(total).toBe(64);
    expect(rows).toHaveLength(20);
    expect(hasNext).toBe(true);
    expect(rows[0]).toEqual({
      ttbId: "99001001000001",
      permit: "BR-PA-12345",
      serial: "000001",
      completedOn: "2026-01-15",
      fancifulName: "SAMPLE 1",
      brandName: "EXAMPLE BREWING",
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
    expect(matchColas(rows, "sample 3").map((r) => r.fancifulName)).toContain("SAMPLE 3");
    expect(matchColas(rows, "example")).toHaveLength(rows.length);
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
    const result = await searchColasByPermit("BR-PA-12345", async (url, init) => {
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
    expect(calls[0].body).toContain("searchCriteria.permitId=BR-PA-12345");
    expect(calls[1].method).toBe("GET");
    expect(calls[1].url).toContain("pgfcn=nextset");
    expect(calls[1].cookie).toBe("JSESSIONID=abc123");
  });

  it("throws when paging stops before the total", async () => {
    await expect(
      searchColasByPermit("BR-PA-12345", async (_url, init) =>
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
      await searchColasByPermit("BR-PA-12345", async (_url, init) => {
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
      searchColasByPermit("BR-PA-12345", async () => ({ status: 200, setCookie: [], body: errorPage })),
    ).rejects.toThrow(/greater than 15 year/);
  });

  it("throws on a non-200 response", async () => {
    await expect(
      searchColasByPermit("BR-PA-12345", async () => ({ status: 500, setCookie: [], body: "" })),
    ).rejects.toThrow(/500/);
  });
});

const ttbId = "99001001000001";
const imageUrl = "https://ttbonline.gov/colasonline/publicViewAttachment.do?filename=SampleLabel.jpg&filetype=l";
function detail(status = "APPROVED", permit = "BR-PA-12345"): string {
  return `<table><tr><td><strong>TTB ID: </strong><a href="#"><img alt="help"></a>${ttbId}</td></tr>
    <tr><td><strong>Status: </strong>&nbsp;${status}</td></tr>
    <tr><td><strong>Approval Date:</strong>&nbsp;01/24/2023</td></tr></table>
    <table><tr><td><strong>Plant Registry/Basic Permit/Brewers No (Principal Place of Business): </strong></td></tr>
    <tr><td> </td></tr><tr><td>${permit}</td></tr><tr><td>Applicant</td></tr></table>`;
}
const printable = `<div class="label">TTB ID</div><div class="data">${ttbId}</div>
  <img src="/colasonline/publicViewAttachment.do?filename=SampleLabel.jpg&filetype=l" alt="Label Image: Brand (front) or keg collar">`;

describe("COLA detail parsing", () => {
  it("reads the actual detail fields, including the principal permit, not other permits", () => {
    expect(parseColaDetails(detail(), ttbId)).toEqual({
      ttbId, permit: "BR-PA-12345", status: "APPROVED", approvedOn: "2023-01-24", images: [],
    });
  });

  it("preserves revoked and unapproved status without offering images", () => {
    for (const status of ["REVOKED", "SURRENDERED", "PENDING", "DISAPPROVED"]) {
      expect(parseColaDetails(detail(status), ttbId)).toMatchObject({ status, images: [] });
    }
  });

  it("rejects missing fields, a different record, and upstream errors", () => {
    expect(() => parseColaDetails("<html>Error</html>", ttbId)).toThrow(/TTB ID/);
    expect(() => parseColaDetails(detail(), "99999999999999")).toThrow(/TTB ID/);
    expect(() => parseColaDetails(detail().replace("BR-PA-12345", ""), ttbId)).toThrow(/permit/i);
  });

  it("does not substitute applicant text or another permit when the principal permit cell is blank", () => {
    const otherPermit = `<tr><td><strong>Plant Registry/Basic Permit/Brewers No (Other): </strong></td></tr>
      <tr><td>BR-PA-99999</td></tr>`;
    const missingPrincipal = detail("APPROVED", " &nbsp; ").replace(
      "<tr><td>Applicant</td></tr>", `<tr><td>Applicant</td></tr>${otherPermit}`,
    );
    expect(() => parseColaDetails(missingPrincipal, ttbId)).toThrow(/principal permit/i);
  });

  it("normalizes official filenames, decodes labels, and excludes unsafe links and site furniture", () => {
    const extra = `<img src="https://evil.test/label.jpg" alt="Label Image: evil">
      <img src="/colasonline/publicViewAttachment.do?filename=..%2Fsecret.jpg&filetype=l" alt="Label Image: traversal">
      <img src="/colasonline/publicViewAttachment.do?filename=evil.jpg&filetype=x" alt="Label Image: wrong type">
      <img src="images/logo.gif" alt="TTB logo">
      <img src="/colasonline/publicViewAttachment.do?filename=Back Label.jpg&amp;filetype=l" alt="Label Image: Back &amp; side">`;
    expect(parseColaImages(printable + extra, ttbId)).toEqual([
      { url: imageUrl, label: "Brand (front) or keg collar" },
      { url: "https://ttbonline.gov/colasonline/publicViewAttachment.do?filename=Back%20Label.jpg&filetype=l", label: "Back & side" },
    ]);
    expect(() => parseColaImages(printable, "99999999999999")).toThrow(/TTB ID/);
  });

  it("only accepts constrained official attachment identifiers", () => {
    expect(isColaImageUrl(imageUrl)).toBe(true);
    for (const unsafe of [
      imageUrl.replace("ttbonline.gov", "ttbonline.gov.evil.test"),
      imageUrl.replace("https:", "http:"),
      imageUrl.replace("SampleLabel.jpg", "..%2fSampleLabel.jpg"),
      imageUrl.replace("SampleLabel.jpg", "%5cSampleLabel.jpg"),
      imageUrl + "&url=https://evil.test",
      imageUrl.replace("SampleLabel.jpg", "bad%zz.jpg"),
    ]) expect(isColaImageUrl(unsafe), unsafe).toBe(false);
  });
});

describe("COLA detail retrieval", () => {
  it("opens the verified official print page with the detail session and discovers images", async () => {
    const request = vi.fn(async (_url: string, init: { cookie?: string }) => ({
      status: 200, setCookie: ["JSESSIONID=detail; Path=/colasonline"],
      body: init.cookie ? printable : detail(),
    }));
    expect(await getColaDetails(ttbId, request)).toMatchObject({ permit: "BR-PA-12345", status: "APPROVED", images: [{ url: imageUrl, label: "Brand (front) or keg collar" }] });
    expect(request.mock.calls[1][0]).toBe(`https://ttbonline.gov/colasonline/viewColaDetails.do?action=publicFormDisplay&ttbid=${ttbId}`);
    expect(request.mock.calls[1][1].cookie).toBe("JSESSIONID=detail");
  });

  it("never fetches printable images for revoked or unapproved records", async () => {
    for (const status of ["REVOKED", "DISAPPROVED", "PENDING"]) {
      const request = vi.fn(async () => ({ status: 200, setCookie: [], body: detail(status) }));
      expect(await getColaDetails(ttbId, request)).toMatchObject({ status, images: [] });
      expect(request).toHaveBeenCalledTimes(1);
    }
  });

  it("rejects invalid IDs and upstream failures explicitly", async () => {
    const request = vi.fn(async () => ({ status: 503, setCookie: [], body: "" }));
    await expect(getColaDetails("../elsewhere", request)).rejects.toThrow(/TTB ID/);
    expect(request).not.toHaveBeenCalled();
    await expect(getColaDetails(ttbId, request)).rejects.toThrow(/503/);
  });

  it("fetches image bytes only after fresh approval, permit, and page-membership checks", async () => {
    const request = vi.fn(async (url: string) => {
      if (url === imageUrl) return {
        status: 200, setCookie: [], body: "", image: { bytes: Buffer.from([0xff, 0xd8, 0xff, 0xd9]), contentType: "image/jpeg" },
      };
      return { status: 200, setCookie: ["JSESSIONID=fresh"], body: url.includes("publicFormDisplay") ? printable : detail() };
    });
    expect(await getColaImage(ttbId, imageUrl, "BR-PA-12345", request)).toEqual({ dataUrl: "data:image/jpeg;base64,/9j/2Q==" });
    await expect(getColaImage(ttbId, imageUrl, "BR-PA-OTHER", request)).rejects.toThrow(/permit/i);
    const nonmember = imageUrl.replace("SampleLabel.jpg", "Other.jpg");
    await expect(getColaImage(ttbId, nonmember, "BR-PA-12345", request)).rejects.toThrow(/not.*label/i);
    expect(request.mock.calls.some(([url]) => url === nonmember)).toBe(false);
  });

  it("runs at most four image sessions at once, because TTB drops a burst of them", async () => {
    let open = 0, most = 0;
    const request = async (url: string) => {
      if (!url.includes("publicFormDisplay") && url !== imageUrl) { open++; most = Math.max(most, open); }
      await new Promise(resolve => setTimeout(resolve, 5));
      if (url !== imageUrl) return { status: 200, setCookie: [], body: url.includes("publicFormDisplay") ? printable : detail() };
      open--;
      return { status: 200, setCookie: [], body: "", image: { bytes: Buffer.from([0xff, 0xd8, 0xff, 0xd9]), contentType: "image/jpeg" } };
    };
    await Promise.all(Array.from({ length: 12 }, () => getColaImage(ttbId, imageUrl, "BR-PA-12345", request)));
    expect(most).toBe(4);
  });

  it("rejects HTML masquerading as an image", async () => {
    await expect(getColaImage(ttbId, imageUrl, "BR-PA-12345", async (url) => ({
      status: 200, setCookie: [], body: url === imageUrl ? "<html>TTB error</html>" : url.includes("publicFormDisplay") ? printable : detail(),
    }))).rejects.toThrow(/image/i);
  });

  it("rejects oversized bytes, unsupported MIME types, and mismatched image signatures", async () => {
    const images = [
      { bytes: Buffer.alloc(8 * 1024 * 1024 + 1), contentType: "image/jpeg" },
      { bytes: Buffer.from("<svg></svg>"), contentType: "image/svg+xml" },
      { bytes: Buffer.from("<html>error</html>"), contentType: "image/jpeg" },
      { bytes: Buffer.from([0xff, 0xd8, 0xff]), contentType: "text/html" },
    ];
    for (const image of images) {
      await expect(getColaImage(ttbId, imageUrl, "BR-PA-12345", async (url) => ({
        status: 200, setCookie: [], body: url.includes("publicFormDisplay") ? printable : detail(),
        ...(url === imageUrl ? { image } : {}),
      }))).rejects.toThrow(/image/i);
    }
  });
});
