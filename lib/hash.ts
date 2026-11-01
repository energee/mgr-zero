// OAuth state is generated on the server; only its SHA-256 digest reaches storage.
import { createHash, randomBytes } from "node:crypto";

export const sha256 = (value: string) => createHash("sha256").update(value).digest("hex");

export const oauthState = () => randomBytes(32).toString("base64url");
