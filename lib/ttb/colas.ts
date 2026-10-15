// lib/ttb/colas.ts — scrapes TTB's public COLA registry search
// (ttbonline.gov/colasonline) for every label approval under one permit.
//
// Why the bundled certificate: ttbonline.gov does not send its intermediate
// (Entrust OV TLS Issuing RSA CA 2), so Node's fetch fails with
// UNABLE_TO_VERIFY_LEAF_SIGNATURE. defaultRequest adds that intermediate to
// the system roots and keeps verification on. Never set
// rejectUnauthorized: false here.
import { readFileSync } from "node:fs";
import { request as httpsRequest } from "node:https";
import path from "node:path";
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

export type ColaRequest = (
  url: string,
  init: { method: "GET" | "POST"; body?: string; cookie?: string },
) => Promise<{ status: number; body: string; setCookie: string[] }>;

const BASE = "https://ttbonline.gov/colasonline";
const SEARCH_URL = `${BASE}/publicSearchColasAdvancedProcess.do?action=search`;
const NEXT_URL = `${BASE}/publicPageAdvancedCola.do?action=page&pgfcn=nextset`;
const MAX_PAGES = 100;
const TIMEOUT_MS = 20_000;

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
function isoDate(usDate: string): string {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(usDate);
  if (!m) throw new Error(`TTB COLA page: unexpected date "${usDate}"`);
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
      completedOn: isoDate(completed),
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
function usDate(d: Date): string {
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
  request: ColaRequest = defaultRequest,
): Promise<ColaRecord[]> {
  const today = new Date();
  const from = new Date(today.getFullYear() - 15, today.getMonth(), today.getDate() + 1);
  const form = new URLSearchParams({
    "searchCriteria.permitId": permit,
    "searchCriteria.dateCompletedFrom": usDate(from),
    "searchCriteria.dateCompletedTo": usDate(today),
    "searchCriteria.productNameSearchType": "E",
  });
  const cookies = new Map<string, string>();

  async function fetchPage(url: string, init: Parameters<ColaRequest>[1]) {
    const res = await request(url, init);
    if (res.status !== 200) throw new Error(`TTB COLA search returned HTTP ${res.status}`);
    for (const header of res.setCookie) {
      const pair = header.split(";")[0];
      const eq = pair.indexOf("=");
      if (eq > 0) cookies.set(pair.slice(0, eq).trim(), pair.slice(eq + 1).trim());
    }
    return parseColaPage(res.body);
  }

  let page = await fetchPage(SEARCH_URL, { method: "POST", body: form.toString() });
  const all = [...page.rows];
  for (let pages = 1; all.length < page.total; pages++) {
    if (pages >= MAX_PAGES) throw new Error(`TTB COLA search exceeded ${MAX_PAGES} pages`);
    if (!page.hasNext) throw new Error(`TTB COLA search stopped at ${all.length} of ${page.total} records`);
    const cookie = [...cookies].map(([k, v]) => `${k}=${v}`).join("; ");
    page = await fetchPage(NEXT_URL, { method: "GET", cookie });
    if (page.rows.length === 0) throw new Error(`TTB COLA page returned no rows at ${all.length} of ${page.total}`);
    all.push(...page.rows);
  }
  return all.sort((a, b) => b.completedOn.localeCompare(a.completedOn));
}

/** node:https request trusting the system roots plus TTB's missing intermediate. */
const defaultRequest: ColaRequest = (url, init) => {
  const ca = [...rootCertificates, readFileSync(path.join(process.cwd(), "lib/ttb/entrust-ov-tls-rsa-ca2.pem"), "utf8")];
  const headers: Record<string, string> = {};
  if (init.cookie) headers.Cookie = init.cookie;
  if (init.body !== undefined) {
    headers["Content-Type"] = "application/x-www-form-urlencoded";
    headers["Content-Length"] = String(Buffer.byteLength(init.body));
  }
  return new Promise((resolve, reject) => {
    const req = httpsRequest(url, { method: init.method, headers, ca }, (res) => {
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
