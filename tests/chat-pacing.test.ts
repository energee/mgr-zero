// tests/chat-pacing.test.ts — the per-conversation send limiter, tested
// directly. tests/chat-jobs.test.ts covers the same guarantee through the real
// delivery batch, but only catches a violation when the machine is loaded
// enough to expose it; this is deterministic and needs no database.
import { describe, expect, it } from "vitest";
import { paced } from "@/lib/chat/pacing";

describe("per-conversation pacing", () => {
  it("keeps a second between the sends themselves, not between the waits", async () => {
    // The limiter used to stamp before issuing the call, so work done between
    // the stamp and the send landed inside the second. A first send slower than
    // the second — normal, it warms the connection — then left the observable
    // gap under 1000ms, which is the gap a provider rate limit counts.
    const at: number[] = [];
    for (const ms of [6, 1]) {
      await paced("conversation-1", async () => {
        await new Promise((r) => setTimeout(r, ms));
        at.push(Date.now());
      });
    }
    expect(at[1] - at[0]).toBeGreaterThanOrEqual(1000);
  });

  it("does not make an unrelated conversation wait", async () => {
    const start = Date.now();
    await paced("conversation-a", async () => {});
    await paced("conversation-b", async () => {});
    expect(Date.now() - start).toBeLessThan(500);
  });

  it("charges a failed attempt, which the provider counted too", async () => {
    const start = Date.now();
    await expect(
      paced("conversation-2", async () => {
        throw new Error("provider said no");
      }),
    ).rejects.toThrow("provider said no");
    await paced("conversation-2", async () => {});
    expect(Date.now() - start).toBeGreaterThanOrEqual(1000);
  });
});
