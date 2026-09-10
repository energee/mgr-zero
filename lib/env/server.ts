// lib/env/server.ts — server-only runtime environment singleton.
import "server-only";
import { readServerEnv } from "./server-parser";

export { readServerEnv, type ServerEnv } from "./server-parser";

let serverEnv: ReturnType<typeof readServerEnv> | undefined;

export function getServerEnv() {
  return (serverEnv ??= readServerEnv());
}
