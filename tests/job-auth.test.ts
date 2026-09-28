// tests/job-auth.test.ts — each internal job route admits only its own bearer
// secret: the chat routes take CHAT_JOB_SECRET, the order email route takes
// ORDER_EMAIL_JOB_SECRET, and an unset secret admits nobody.
import { afterEach, describe, expect, it, vi } from "vitest";
vi.mock("@/lib/chat/jobs", () => ({
  runChatScan: async () => ({}),
  runChatCallbackBatch: async () => ({}),
  runChatDeliveryBatch: async () => ({}),
  cleanupChatState: async () => ({}),
}));
vi.mock("@/lib/email/jobs", () => ({ runOrderEmailBatch: async () => ({}) }));
import { authorizeJob } from "@/lib/jobs/auth";
import { POST as scan } from "@/app/api/chat/jobs/scan/route";
import { POST as chatDeliver } from "@/app/api/chat/jobs/deliver/route";
import { POST as cleanup } from "@/app/api/chat/jobs/cleanup/route";
import { POST as emailDeliver } from "@/app/api/email/jobs/deliver/route";

afterEach(() => { vi.unstubAllEnvs(); });

const req = (token?: string) => new Request("https://mgr.test/job", { method: "POST", headers: token ? { authorization: `Bearer ${token}` } : {} });
const status = async (post: (r: Request) => Promise<Response>, token: string) => (await post(req(token))).status;

describe("authorizeJob", () => {
  it("fails closed on an empty secret", () => {
    expect(authorizeJob(req(""), "")).toBe(false);
    expect(authorizeJob(req("x"), "")).toBe(false);
    expect(authorizeJob(req("x"), "x")).toBe(true);
  });
});

describe("job routes", () => {
  it("each route accepts only its own secret", async () => {
    vi.stubEnv("CHAT_JOB_SECRET", "chat");
    vi.stubEnv("ORDER_EMAIL_JOB_SECRET", "email");
    for (const post of [scan, chatDeliver, cleanup]) {
      expect(await status(post, "email")).toBe(401);
      expect(await status(post, "chat")).toBe(200);
    }
    expect(await status(emailDeliver, "chat")).toBe(401);
    expect(await status(emailDeliver, "email")).toBe(200);
  });
});
