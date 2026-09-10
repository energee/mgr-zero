// tests/chat-pacing.test.ts — the per-conversation send limiter, tested
// directly; delivery orchestration mocks this delay because timing correctness
// belongs here and needs no database.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { paced } from "@/lib/chat/pacing";

describe("per-conversation pacing", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(10_000);
  });
  afterEach(() => vi.useRealTimers());

  it("keeps a second between the sends themselves, not between the waits", async () => {
    // The limiter used to stamp before issuing the call, so work done between
    // the stamp and the send landed inside the second. A first send slower than
    // the second — normal, it warms the connection — then left the observable
    // gap under 1000ms, which is the gap a provider rate limit counts.
    const at: number[] = [];
    const send = (ms: number) => paced("conversation-1", async () => {
      await new Promise((r) => setTimeout(r, ms));
      at.push(Date.now());
    });
    const first = send(6);
    await vi.advanceTimersByTimeAsync(6);
    await first;
    const second = send(1);
    await vi.advanceTimersByTimeAsync(1001);
    await second;
    expect(at[1] - at[0]).toBeGreaterThanOrEqual(1000);
  });

  it("does not make an unrelated conversation wait", async () => {
    const start = Date.now();
    await paced("conversation-a", async () => {});
    await paced("conversation-b", async () => {});
    expect(Date.now() - start).toBe(0);
  });

  it("charges a failed attempt, which the provider counted too", async () => {
    const start = Date.now();
    await expect(
      paced("conversation-2", async () => {
        throw new Error("provider said no");
      }),
    ).rejects.toThrow("provider said no");
    const retry = paced("conversation-2", async () => {});
    await vi.advanceTimersByTimeAsync(1000);
    await retry;
    expect(Date.now() - start).toBeGreaterThanOrEqual(1000);
  });
});
