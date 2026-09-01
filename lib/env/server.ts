// lib/env/server.ts — server-only runtime environment singleton.
import "server-only";
import { readServerEnv } from "./server-parser";

export { readServerEnv, type ServerEnv } from "./server-parser";

export const serverEnv = readServerEnv();
