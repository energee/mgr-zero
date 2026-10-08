// lib/hash.ts — the sha256 hex helper (lib/jobs/auth.ts keeps a raw-digest
// createHash for timingSafeEqual) and the OAuth state derivation shared
// by the QBO, Square, and Slack OAuth starts. Only the hash of a secret value
// (OAuth state, link proof) is stored, so every caller must hash it the same way.
import { createHash } from "node:crypto";

export const sha256 = (value: string) => createHash("sha256").update(value).digest("hex");

/** OAuth `state`: the stable command request id bound to the verified actor.
 *  UUID entropy comes from the request id; hashing ties it to this user while
 *  letting an unchanged retry rebuild the same state. Store only sha256(state). */
export const oauthState = (requestId: string, userId: string) => sha256(`${requestId}:${userId}`);
