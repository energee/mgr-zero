// tests/hash.test.ts — the one sha256 hex helper and the OAuth state derivation
// shared by the QBO, Square, and Slack OAuth starts (#764).
import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { oauthState, sha256 } from "@/lib/hash";

describe("sha256", () => {
  it("is the lowercase hex digest of the UTF-8 input", () => {
    expect(sha256("abc")).toBe("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
  });
});

describe("oauthState", () => {
  it("binds the command request id to the verified actor", () => {
    expect(oauthState("req-1", "user-1")).toBe(createHash("sha256").update("req-1:user-1").digest("hex"));
  });
  it("differs per actor for the same request id", () => {
    expect(oauthState("req-1", "user-1")).not.toBe(oauthState("req-1", "user-2"));
  });
});
