import { CommandError } from "@/lib/commands/registry";
import { readAppUrl } from "@/lib/env/server-parser";

/** Cookie and bearer requests may omit Origin, but a supplied Origin must be ours. */
export function assertTrustedOrigin(req: Request) {
  const origin = req.headers.get("origin");
  if (origin !== null && origin !== new URL(readAppUrl()).origin) {
    throw new CommandError("request origin is not allowed", 403, "invalid_origin");
  }
}

export async function readBoundedJson(req: Request, maxBytes: number): Promise<unknown> {
  assertTrustedOrigin(req);
  if (req.headers.get("content-type")?.split(";")[0].trim().toLowerCase() !== "application/json") {
    throw new CommandError("Content-Type must be application/json", 415, "unsupported_media_type");
  }
  const declared = req.headers.get("content-length");
  if (declared !== null && /^\d+$/.test(declared) && Number(declared) > maxBytes) {
    throw new CommandError("request body is too large", 413, "request_too_large");
  }
  if (!req.body) throw new CommandError("request body must be JSON", 400, "invalid_request");

  const reader = req.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > maxBytes) {
      try { await reader.cancel(); } catch { /* Keep the known 413 stable. */ }
      throw new CommandError("request body is too large", 413, "request_too_large");
    }
    chunks.push(value);
  }

  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  try { return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)); }
  catch { throw new CommandError("request body must be JSON", 400, "invalid_request"); }
}
