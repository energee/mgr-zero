// Server-generated OAuth state and the digest used for secret storage.
import { describe, expect, it } from "vitest";
import { oauthState, sha256 } from "@/lib/hash";

describe("sha256", () => {
  it("is the lowercase hex digest of the UTF-8 input", () => {
    expect(sha256("abc")).toBe("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
  });
});

describe("oauthState", () => {
  it("generates an independent 256-bit secret on every start, without a client request id", () => {
    const first = oauthState();
    const second = oauthState();
    expect(Buffer.from(first, "base64url")).toHaveLength(32);
    expect(Buffer.from(second, "base64url")).toHaveLength(32);
    expect(second).not.toBe(first);
    expect(sha256(first)).not.toContain(first);
  });
});
