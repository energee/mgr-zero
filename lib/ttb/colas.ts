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

export type ColaDetails = {
  ttbId: string;
  permit: string;
  status: string;
  approvedOn: string | null;
  images: { url: string; label: string }[];
};

type ColaRequest = (
  url: string,
  init: { method: "GET" | "POST"; body?: string; cookie?: string; responseType?: "image" },
) => Promise<{ status: number; body: string; setCookie: string[]; image?: { bytes: Buffer; contentType: string } }>;

const BASE = "https://ttbonline.gov/colasonline";
const SEARCH_URL = `${BASE}/publicSearchColasAdvancedProcess.do?action=search`;
const NEXT_URL = `${BASE}/publicPageAdvancedCola.do?action=page&pgfcn=nextset`;
// Caps an absurd reported total; the empty-page check stops a stuck pager.
const MAX_PAGES = 100;
const TIMEOUT_MS = 20_000;
const MAX_HTML_BYTES = 4 * 1024 * 1024;
const MAX_IMAGE_BYTES = 8 * 1024 * 1024;

/** Official attachment identifiers; these require a fresh TTB print-page session to render. */
export function isColaImageUrl(value: string): boolean {
  return /^https:\/\/ttbonline\.gov\/colasonline\/publicViewAttachment\.do\?filename=([A-Za-z0-9_().~-]|%[0-9A-Fa-f]{2})+&filetype=l$/.test(value)
    && !/%(?:2f|5c)/i.test(value);
}

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

/** Reads the public detail page, not the print page's different form layout. */
export function parseColaDetails(html: string, expectedId: string): ColaDetails {
  function field(label: string): string {
    const match = new RegExp(`<strong>\\s*${label}:\\s*</strong>([\\s\\S]*?)</td>`, "i").exec(html);
    if (!match) throw new Error(`TTB COLA detail page is missing ${label}`);
    return cellText(match[1]);
  }
  const ttbId = field("TTB ID");
  if (ttbId !== expectedId) throw new Error(`TTB COLA detail page returned TTB ID "${ttbId}", expected "${expectedId}"`);
  const status = field("Status");
  if (!status) throw new Error("TTB COLA detail page is missing status");
  const permitSection = /<strong>\s*Plant Registry\/Basic Permit\/Brewers No \(Principal Place of Business\):\s*<\/strong>[\s\S]*?<\/tr>([\s\S]*?)<\/table>/i.exec(html);
  const permitCells = permitSection ? [...permitSection[1].matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)] : [];
  // TTB puts one empty spacer row before the principal permit's own cell.
  // Do not scan later cells: those contain the applicant and other permits.
  const spacer = permitCells[0] && cellText(permitCells[0][1]);
  const permit = permitCells[1] && cellText(permitCells[1][1]);
  if (spacer !== "" || !permit) throw new Error("TTB COLA detail page is missing the principal permit");
  const approved = field("Approval Date");
  return { ttbId, permit, status, approvedOn: approved ? isoFromUs(approved) : null, images: [] };
}

/** Only label attachments in this record's print page; never site images or arbitrary URLs. */
export function parseColaImages(html: string, expectedId: string): ColaDetails["images"] {
  const id = /<div class="label">\s*TTB ID\s*<\/div>\s*<div class="data">\s*(\d+)\s*<\/div>/i.exec(html);
  if (id?.[1] !== expectedId) throw new Error("TTB COLA printable page returned a different or missing TTB ID");
  const images: ColaDetails["images"] = [];
  for (const match of html.matchAll(/<img\b[^>]*>/gi)) {
    const src = /\bsrc=["']([^"']+)["']/i.exec(match[0]);
    const alt = /\balt=["']([^"']+)["']/i.exec(match[0]);
    if (!src || !alt) continue;
    const label = cellText(alt[1]);
    if (!label.startsWith("Label Image:")) continue;
    const sourceText = cellText(src[1]);
    if (!URL.canParse(sourceText, `${BASE}/`)) continue;
    const source = new URL(sourceText, `${BASE}/`);
    if (source.origin !== "https://ttbonline.gov" || source.pathname !== "/colasonline/publicViewAttachment.do") continue;
    if (source.searchParams.get("filetype") !== "l" || source.searchParams.size !== 2) continue;
    const filename = source.searchParams.get("filename");
    if (!filename) continue;
    const encoded = encodeURIComponent(filename).replace(/[!'*]/g, (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`);
    const url = `${BASE}/publicViewAttachment.do?filename=${encoded}&filetype=l`;
    if (isColaImageUrl(url) && !images.some((image) => image.url === url)) {
      images.push({ url, label: label.slice("Label Image:".length).trim() || "Label image" });
    }
  }
  return images;
}

function keepCookies(cookies: Map<string, string>, headers: string[]): string {
  for (const header of headers) {
    const pair = header.split(";")[0];
    const equals = pair.indexOf("=");
    if (equals > 0) cookies.set(pair.slice(0, equals).trim(), pair.slice(equals + 1).trim());
  }
  return [...cookies].map(([key, value]) => `${key}=${value}`).join("; ");
}

async function colaDetailSession(ttbId: string, request: ColaRequest, expectedPermit?: string) {
  if (!/^\d{14}$/.test(ttbId)) throw new Error("TTB ID must contain exactly 14 digits");
  const result = await request(`${BASE}/viewColaDetails.do?action=publicDisplaySearchAdvanced&ttbid=${ttbId}`, { method: "GET" });
  if (result.status !== 200) throw new Error(`TTB COLA details returned HTTP ${result.status}`);
  const details = parseColaDetails(result.body, ttbId);
  if (expectedPermit !== undefined && details.permit !== expectedPermit) throw new Error("TTB COLA does not belong to the brewery's permit");
  const cookies = new Map<string, string>();
  let cookie = keepCookies(cookies, result.setCookie);
  if (details.status === "APPROVED") {
    const printable = await request(`${BASE}/viewColaDetails.do?action=publicFormDisplay&ttbid=${ttbId}`, { method: "GET", cookie });
    if (printable.status !== 200) throw new Error(`TTB COLA printable page returned HTTP ${printable.status}`);
    cookie = keepCookies(cookies, printable.setCookie);
    details.images = parseColaImages(printable.body, ttbId);
  }
  return { details, cookie };
}

export async function getColaDetails(ttbId: string, request: ColaRequest = ttbHttpsRequest): Promise<ColaDetails> {
  return (await colaDetailSession(ttbId, request)).details;
}

/** Resolves a saved official identifier using a fresh, permit-checked TTB session. */
export async function getColaImage(
  ttbId: string,
  url: string,
  permit: string,
  request: ColaRequest = ttbHttpsRequest,
): Promise<{ dataUrl: string }> {
  if (!isColaImageUrl(url)) throw new Error("Not an official TTB label image URL");
  const { details, cookie } = await colaDetailSession(ttbId, request, permit);
  if (details.status !== "APPROVED") throw new Error(`TTB COLA is ${details.status}, not APPROVED`);
  if (!details.images.some((image) => image.url === url)) throw new Error("Requested image is not a label on this COLA");
  const result = await request(url, { method: "GET", cookie, responseType: "image" });
  if (result.status !== 200) throw new Error(`TTB COLA image returned HTTP ${result.status}`);
  const image = result.image;
  if (!image || !validImage(image.bytes, image.contentType)) throw new Error("TTB COLA attachment is not a supported label image");
  return { dataUrl: `data:${image.contentType};base64,${image.bytes.toString("base64")}` };
}

function validImage(bytes: Buffer, contentType: string): boolean {
  if (bytes.length === 0 || bytes.length > MAX_IMAGE_BYTES) return false;
  if (contentType === "image/jpeg") return bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  if (contentType === "image/png") return bytes.length >= 8 && bytes.readUInt32BE(0) === 0x89504e47 && bytes.readUInt32BE(4) === 0x0d0a1a0a;
  if (contentType === "image/gif") return /^GIF8[79]a$/.test(bytes.subarray(0, 6).toString("ascii"));
  if (contentType === "image/webp") return bytes.subarray(0, 4).toString("ascii") === "RIFF" && bytes.subarray(8, 12).toString("ascii") === "WEBP";
  return false;
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
  let cookie = "";

  // Fetches one page and keeps any session cookie TTB sets; Next needs it.
  async function fetchPageKeepingCookies(url: string, init: Parameters<ColaRequest>[1]) {
    const res = await request(url, init);
    if (res.status !== 200) throw new Error(`TTB COLA search returned HTTP ${res.status}`);
    cookie = keepCookies(cookies, res.setCookie);
    return parseColaPage(res.body);
  }

  let page = await fetchPageKeepingCookies(SEARCH_URL, { method: "POST", body: form.toString() });
  const all = [...page.rows];
  for (let pages = 1; all.length < page.total; pages++) {
    if (pages >= MAX_PAGES) throw new Error(`TTB COLA search exceeded ${MAX_PAGES} pages`);
    if (!page.hasNext) throw new Error(`TTB COLA search stopped at ${all.length} of ${page.total} records`);
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
      let size = 0;
      res.on("data", (chunk: Buffer) => {
        size += chunk.length;
        const limit = init.responseType === "image" ? MAX_IMAGE_BYTES : MAX_HTML_BYTES;
        if (size > limit) {
          res.destroy(new Error(`TTB COLA response exceeds ${limit} bytes`));
          return;
        }
        chunks.push(chunk);
      });
      res.on("end", () => {
        const bytes = Buffer.concat(chunks);
        const contentType = res.headers["content-type"]?.split(";")[0].trim().toLowerCase() ?? "";
        resolve({
          status: res.statusCode ?? 0,
          body: init.responseType === "image" ? "" : bytes.toString("utf8"),
          setCookie: res.headers["set-cookie"] ?? [],
          ...(init.responseType === "image" ? { image: { bytes, contentType } } : {}),
        });
      });
      res.on("error", reject);
    });
    req.setTimeout(TIMEOUT_MS, () => req.destroy(new Error(`TTB COLA request timed out after ${TIMEOUT_MS} ms`)));
    req.on("error", reject);
    if (init.body !== undefined) req.write(init.body);
    req.end();
  });
};
