// tests/typesafe-key-check.test.ts — checkTypeSafeKey, the check Settings runs before saving a
// brewery's TypeSafe key: it asks one fixed made-up name, and tells a key TypeSafe refuses (401,
// 403) from TypeSafe being unreachable. The model call is mocked; nothing leaves the process.
import { APICallError, experimental_decide } from "ai";
import { afterEach, describe, expect, it, vi } from "vitest";
import { checkTypeSafeKey } from "@/lib/suggest-material-category";

vi.mock("ai", async importOriginal => ({ ...await importOriginal<typeof import("ai")>(), experimental_decide: vi.fn() }));

const refusal = (statusCode: number) =>
  new APICallError({ message: "refused", url: "https://typesafe.test", requestBodyValues: {}, statusCode });

afterEach(() => vi.mocked(experimental_decide).mockReset());

describe("checkTypeSafeKey", () => {
  it("is ok when TypeSafe answers, and sends only the made-up name with the pasted key", async () => {
    vi.mocked(experimental_decide).mockResolvedValueOnce({ answers: { category: { choice: "hop", probabilities: { hop: 0.99 } } } } as never);
    await expect(checkTypeSafeKey("pasted-key")).resolves.toBe("ok");
    const call = vi.mocked(experimental_decide).mock.calls[0][0];
    expect(call.state).toEqual({ materialName: "Citra T-90" });
    expect(call.model).toMatchObject({ modelId: "jev-1.14.0" });
  });

  it.each([401, 403])("is refused on %i", async statusCode => {
    vi.mocked(experimental_decide).mockRejectedValueOnce(refusal(statusCode));
    await expect(checkTypeSafeKey("bad-key")).resolves.toBe("refused");
  });

  it("is unreachable on an outage or a timeout", async () => {
    vi.mocked(experimental_decide).mockRejectedValueOnce(refusal(503));
    await expect(checkTypeSafeKey("any-key")).resolves.toBe("unreachable");
    vi.mocked(experimental_decide).mockRejectedValueOnce(new DOMException("timed out", "TimeoutError"));
    await expect(checkTypeSafeKey("any-key")).resolves.toBe("unreachable");
  });
});
