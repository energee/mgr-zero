// lib/ttb/colas.ts — scrapes TTB's public COLA registry search
// (ttbonline.gov/colasonline) for every label approval under one permit.
//
// Why the bundled certificate: ttbonline.gov does not send its intermediate
// (Entrust OV TLS Issuing RSA CA 2), so Node's fetch fails with
// UNABLE_TO_VERIFY_LEAF_SIGNATURE. ttbHttpsRequest adds that intermediate to
// the system roots and keeps verification on. Never set
// rejectUnauthorized: false here.
import { Agent, request as httpsRequest } from "node:https";
import { rootCertificates } from "node:tls";

export type ColaRecord = {
  ttbId: string;
  permit: string;
  serial: string | null;
  completedOn: string; // YYYY-MM-DD
  fancifulName: string;
  brandName: string;
  classCode: string;
  className: string;
};

type ColaRequest = (
  url: string,
  init: { method: "GET" | "POST"; body?: string; cookie?: string },
) => Promise<{ status: number; body: string; setCookie: string[] }>;

const BASE = "https://ttbonline.gov/colasonline";
const SEARCH_URL = `${BASE}/publicSearchColasAdvancedProcess.do?action=search`;
const NEXT_URL = `${BASE}/publicPageAdvancedCola.do?action=page&pgfcn=nextset`;
// Caps an absurd reported total; the empty-page check stops a stuck pager.
const MAX_PAGES = 100;
const TIMEOUT_MS = 20_000;

// Entrust OV TLS Issuing RSA CA 2, the intermediate ttbonline.gov omits; public
// (crt.sectigo.com/EntrustOVTLSIssuingRSACA2.crt), expires 2027-12-10. Inline so
// the deployed function needs no file and no working directory.
const TTB_INTERMEDIATE = `-----BEGIN CERTIFICATE-----
MIIGNjCCBB6gAwIBAgIRAIIHau9WPYiNkOddhKBQHE0wDQYJKoZIhvcNAQEMBQAw
XzELMAkGA1UEBhMCR0IxGDAWBgNVBAoTD1NlY3RpZ28gTGltaXRlZDE2MDQGA1UE
AxMtU2VjdGlnbyBQdWJsaWMgU2VydmVyIEF1dGhlbnRpY2F0aW9uIFJvb3QgUjQ2
MB4XDTI0MTIxMTAwMDAwMFoXDTI3MTIxMDIzNTk1OVowUTELMAkGA1UEBhMCQ0Ex
GDAWBgNVBAoTD0VudHJ1c3QgTGltaXRlZDEoMCYGA1UEAxMfRW50cnVzdCBPViBU
TFMgSXNzdWluZyBSU0EgQ0EgMjCCAaIwDQYJKoZIhvcNAQEBBQADggGPADCCAYoC
ggGBAKo4ANoGIiqBGhTl3Wb2KYyxA/2xdrUR6VP+yFWqlm6BKHKib/XHiiE8UmZO
iUQzSWNXKWNRwuVrzq1gzFKLfU8FiV9rCRd+uW5JpzxLVO7Ojzpxj6/9P3oYpiO6
3T51mxqiEv9c2wKrO8aY3d4v/FnzTcbytQI2W4a2vKq+ZV/61Ph3+a26Y16KJMWg
LKKeRNEsOxoa/qr7ro8T0/6CzQhxKnVeuJMsOiVV45WqhFmUUx0FOFbH9wbPG7Fj
ddpkHGUxtdy433BVKvnwbemXDCHy+L1PhidcX3k+vYYD4xbuC3xApQcNBahpn6pG
9AGbbs5vjvs7LAFkewYG+NYH3JcF4f5sPhOFwlEoivxro57coEWzvIheq3dp8U3r
/8GyeK6cWK0fp+0w0JhckdKzMUo0Fxi2dlXsmcRch/Borkh9PXv3NGzs5/gmOYcO
Pa+46gyrlSHr4t7miFahk0Fpii8kBIZ1fBS/J0O4s85e9zgfMhZv0W5A2reGQQjB
9JFO/QIDAQABo4IBeTCCAXUwHwYDVR0jBBgwFoAUVnNYZJX5khqwEioEYnmhQBWI
IUkwHQYDVR0OBBYEFBfRrwB0+VX7UjfYhHYLWxKKUFrFMA4GA1UdDwEB/wQEAwIB
hjASBgNVHRMBAf8ECDAGAQH/AgEAMB0GA1UdJQQWMBQGCCsGAQUFBwMBBggrBgEF
BQcDAjATBgNVHSAEDDAKMAgGBmeBDAECAjBUBgNVHR8ETTBLMEmgR6BFhkNodHRw
Oi8vY3JsLnNlY3RpZ28uY29tL1NlY3RpZ29QdWJsaWNTZXJ2ZXJBdXRoZW50aWNh
dGlvblJvb3RSNDYuY3JsMIGEBggrBgEFBQcBAQR4MHYwTwYIKwYBBQUHMAKGQ2h0
dHA6Ly9jcnQuc2VjdGlnby5jb20vU2VjdGlnb1B1YmxpY1NlcnZlckF1dGhlbnRp
Y2F0aW9uUm9vdFI0Ni5wN2MwIwYIKwYBBQUHMAGGF2h0dHA6Ly9vY3NwLnNlY3Rp
Z28uY29tMA0GCSqGSIb3DQEBDAUAA4ICAQBP/UQxKHBFQTfLCE6B7MkHDnFHqMlk
3boabJl0VxzIyLvMcgY6MVUwG0tOw/0aOPxKMwGTUQ+Mbj06XFQ9zwHP1rWpiGW3
SiJRhsGRY8BXTrU4l34Ysb30q77mTdjLXJfClBXRnVB0Gj/3eQmIIUSG16yjRKm4
g4MMXBK66Egq1VFHDvlSRRwZtiYzgXyv6umJMmtDtWqeyYXK5N1XGQ7UdlPUEpf5
/TI7zsFIR2PpgFmfedXReAtkwfiuwu2lVP5FcUMl9ZJyqSacV0Jd4PXkWKkcIWCb
a5KhD7TCCSyiLQWAbZLBG7TX+HBAaIAuCWPG5CaSK2H5qtIUlkrsw7keWBxW1Q6L
/j8N7vqb5KRAEDeBWIx9u5OqGORvRSo6FqZ7rq4opmXCMgLhJx4Cojccoj0i+p8o
Rfz32Yag1NPGBII2YNvgSbGKcDlpdxtvoKDPXnYn/2KBrJfCssWVadI83XbNc+n+
fdSupnjRzPY0KHx+V0glh3Qx14hYaGFJ0v4Of+kbrUyoHA1Ex5Lb0pZUU6vawIST
2X2bIDtDwJwObKgRRYPwUg+bo1Tp3/JL8uoYfb4ibbQHkMjYgGaartCpFeEZZbHa
ZIT+D2OnrLUsZuM4N5slfyi42i3NVnhmmduazaexMoWDATwL/8v2FH2t5Zrz7l++
qBfllYs4GyW26A==
-----END CERTIFICATE-----
`;

/** Removes tags, decodes HTML entities, and trims one table cell. */
function cellText(html: string): string {
  return html
    .replace(/<[^>]*>/g, "")
    .replace(/&#x([0-9a-f]+);/gi, (_, hex: string) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec: string) => String.fromCodePoint(Number(dec)))
    .replace(/&nbsp;/g, " ")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&")
    .trim();
}

/** MM/DD/YYYY → YYYY-MM-DD; throws on anything else. */
function isoFromUs(mdy: string): string {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(mdy);
  if (!m) throw new Error(`TTB COLA page: unexpected date "${mdy}"`);
  return `${m[3]}-${m[1]}-${m[2]}`;
}

/**
 * Reads one TTB results page: the total match count, its rows, and whether a
 * Next link exists. Throws when the total is missing, which means TTB sent an
 * error page or changed its layout.
 */
export function parseColaPage(html: string): { total: number; rows: ColaRecord[]; hasNext: boolean } {
  const totalMatch = /Total Matching Records:\s*([\d,]+)/.exec(html);
  if (!totalMatch) {
    const ttbError = /<ul class="errorList">([\s\S]*?)<\/ul>/.exec(html);
    if (ttbError) throw new Error(`TTB COLA search error: ${cellText(ttbError[1])}`);
    throw new Error("TTB COLA page has no 'Total Matching Records' — page changed or errored");
  }
  const total = Number(totalMatch[1].replace(/,/g, ""));

  const rows: ColaRecord[] = [];
  for (const tr of html.matchAll(/<tr class="(?:lt|dk)"[^>]*>([\s\S]*?)<\/tr>/g)) {
    const cells = [...tr[1].matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)].map((td) => cellText(td[1]));
    if (cells.length < 10) throw new Error(`TTB COLA row has ${cells.length} cells, expected 10`);
    const [ttbId, permit, serial, completed, fancifulName, brandName, , , classCode, className] = cells;
    rows.push({
      ttbId,
      permit,
      serial: serial || null,
      completedOn: isoFromUs(completed),
      fancifulName,
      brandName,
      classCode,
      className,
    });
  }
  return { total, rows, hasNext: html.includes("pgfcn=nextset") };
}

/** Rows whose fanciful or brand name contains `name`, ignoring case; a blank name keeps all. */
export function matchColas(rows: ColaRecord[], name?: string): ColaRecord[] {
  const needle = name?.trim().toLowerCase();
  if (!needle) return rows;
  return rows.filter(
    (r) => r.fancifulName.toLowerCase().includes(needle) || r.brandName.toLowerCase().includes(needle),
  );
}

/** A date as MM/DD/YYYY. */
function usFromDate(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(d.getMonth() + 1)}/${pad(d.getDate())}/${d.getFullYear()}`;
}

/**
 * Every COLA TTB lists under `permit` completed in the last 15 years less a
 * day (TTB rejects a range of 15 years or more), newest completed first.
 * Posts the search, then follows Next with the session cookie until the total
 * is collected; any shortfall throws.
 */
export async function searchColasByPermit(
  permit: string,
  request: ColaRequest = ttbHttpsRequest,
): Promise<ColaRecord[]> {
  const today = new Date();
  const from = new Date(today.getFullYear() - 15, today.getMonth(), today.getDate() + 1);
  const form = new URLSearchParams({
    "searchCriteria.permitId": permit,
    "searchCriteria.dateCompletedFrom": usFromDate(from),
    "searchCriteria.dateCompletedTo": usFromDate(today),
    "searchCriteria.productNameSearchType": "E",
  });
  const cookies = new Map<string, string>();

  // Fetches one page and keeps any session cookie TTB sets; Next needs it.
  async function fetchPageKeepingCookies(url: string, init: Parameters<ColaRequest>[1]) {
    const res = await request(url, init);
    if (res.status !== 200) throw new Error(`TTB COLA search returned HTTP ${res.status}`);
    for (const header of res.setCookie) {
      const pair = header.split(";")[0];
      const eq = pair.indexOf("=");
      if (eq > 0) cookies.set(pair.slice(0, eq).trim(), pair.slice(eq + 1).trim());
    }
    return parseColaPage(res.body);
  }

  let page = await fetchPageKeepingCookies(SEARCH_URL, { method: "POST", body: form.toString() });
  const all = [...page.rows];
  for (let pages = 1; all.length < page.total; pages++) {
    if (pages >= MAX_PAGES) throw new Error(`TTB COLA search exceeded ${MAX_PAGES} pages`);
    if (!page.hasNext) throw new Error(`TTB COLA search stopped at ${all.length} of ${page.total} records`);
    const cookie = [...cookies].map(([k, v]) => `${k}=${v}`).join("; ");
    page = await fetchPageKeepingCookies(NEXT_URL, { method: "GET", cookie });
    if (page.rows.length === 0) throw new Error(`TTB COLA page returned no rows at ${all.length} of ${page.total}`);
    all.push(...page.rows);
  }
  return all.sort((a, b) => b.completedOn.localeCompare(a.completedOn));
}

// One agent per process, built on the first search rather than at import (the
// command registry imports this module); keep-alive lets a search's
// sequential pages share one TLS connection.
let agent: Agent | undefined;
function ttbAgent(): Agent {
  agent ??= new Agent({ keepAlive: true, ca: [...rootCertificates, TTB_INTERMEDIATE] });
  return agent;
}

/** node:https request trusting the system roots plus TTB's missing intermediate. */
const ttbHttpsRequest: ColaRequest = (url, init) => {
  const headers: Record<string, string> = {};
  if (init.cookie) headers.Cookie = init.cookie;
  if (init.body !== undefined) {
    headers["Content-Type"] = "application/x-www-form-urlencoded";
    headers["Content-Length"] = String(Buffer.byteLength(init.body));
  }
  return new Promise((resolve, reject) => {
    const req = httpsRequest(url, { method: init.method, headers, agent: ttbAgent() }, (res) => {
      const chunks: Buffer[] = [];
      res.on("data", (c: Buffer) => chunks.push(c));
      res.on("end", () =>
        resolve({
          status: res.statusCode ?? 0,
          body: Buffer.concat(chunks).toString("utf8"),
          setCookie: res.headers["set-cookie"] ?? [],
        }),
      );
      res.on("error", reject);
    });
    req.setTimeout(TIMEOUT_MS, () => req.destroy(new Error(`TTB COLA request timed out after ${TIMEOUT_MS} ms`)));
    req.on("error", reject);
    if (init.body !== undefined) req.write(init.body);
    req.end();
  });
};
