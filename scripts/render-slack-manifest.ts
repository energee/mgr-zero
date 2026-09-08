// scripts/render-slack-manifest.ts — renders the reviewed Slack manifest for one public preview/production URL.
import { isIP } from "node:net";
import { mkdir, readFile, writeFile } from "node:fs/promises";

async function main() {
  const rawAppUrl = process.env.APP_URL;
  if (!rawAppUrl) throw new Error("APP_URL is required");
  let appUrl: URL;
  try { appUrl = new URL(rawAppUrl); } catch { throw new Error("APP_URL must be a public https origin"); }
  const hostname = appUrl.hostname.toLowerCase();
  const reservedName = hostname === "localhost" || !hostname.includes(".") || [".local", ".test", ".example", ".invalid"].some((suffix) => hostname.endsWith(suffix)) || hostname === "example.com";
  const ipLiteral = isIP(hostname.replace(/^\[|\]$/g, "")) !== 0;
  const isOrigin = appUrl.pathname === "/" && !appUrl.search && !appUrl.hash && !appUrl.username && !appUrl.password;
  if (appUrl.protocol !== "https:" || reservedName || ipLiteral || !isOrigin) throw new Error("APP_URL must be a public https origin");

  const template = await readFile("slack-app-manifest.template.yml", "utf8");
  const rendered = template.replaceAll("${APP_URL}", appUrl.origin);
  await mkdir(".local", { recursive: true });
  await writeFile(".local/slack-app-manifest.yml", rendered);
  console.log(".local/slack-app-manifest.yml");
}

void main();
