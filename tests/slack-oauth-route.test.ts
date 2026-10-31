import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const callbacks = vi.hoisted(() => ({ origin: vi.fn(), complete: vi.fn(), server: vi.fn(), port: vi.fn() }));
vi.mock("@/lib/chat/oauth", () => ({
  slackAppOrigin: callbacks.origin,
  slackRedirectUri: () => "https://mgr.test/api/chat/slack/oauth",
  completeSlackInstall: callbacks.complete,
}));
vi.mock("@/lib/supabase/server", () => ({ createServerClient: callbacks.server }));
vi.mock("@/lib/chat/slack-adapter", () => ({ slackOAuthPort: callbacks.port }));

import { GET } from "@/app/api/chat/slack/oauth/route";

const request = () => new Request("https://mgr.test/api/chat/slack/oauth?code=code-secret&state=state-secret");

describe("Slack OAuth callback diagnostics", () => {
  beforeEach(() => {
    callbacks.origin.mockReturnValue("https://mgr.test");
    callbacks.server.mockResolvedValue({});
    callbacks.complete.mockResolvedValue({});
    callbacks.port.mockReturnValue({});
    vi.spyOn(console, "error").mockImplementation(() => undefined);
  });
  afterEach(() => { vi.restoreAllMocks(); vi.resetAllMocks(); });

  it("logs setup failures without logging the request or error message", async () => {
    callbacks.origin.mockImplementation(() => { throw new Error("APP_URL provider-secret"); });
    const response = await GET(request());
    expect(response.status).toBe(500);
    expect(await response.text()).not.toContain("secret");
    expect(console.error).toHaveBeenCalledExactlyOnceWith("slack_oauth_callback_failed", {
      name: "Error", status: null, stage: "oauth_config",
    });
    expect(callbacks.complete).not.toHaveBeenCalled();
    expect(JSON.stringify(vi.mocked(console.error).mock.calls)).not.toContain("secret");
  });

  it("classifies adapter setup failures before the OAuth exchange", async () => {
    callbacks.port.mockImplementation(() => { throw new Error("SLACK_CLIENT_SECRET missing-secret"); });
    const response = await GET(request());
    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe("https://mgr.test/settings/chat?error=oauth_failed");
    expect(console.error).toHaveBeenCalledWith("slack_oauth_callback_failed", {
      name: "Error", status: null, stage: "oauth_config",
    });
    expect(callbacks.complete).not.toHaveBeenCalled();
    expect(JSON.stringify(vi.mocked(console.error).mock.calls)).not.toContain("secret");
  });

  it("logs session failures before callback completion", async () => {
    callbacks.server.mockRejectedValue(new TypeError("database-secret"));
    const response = await GET(request());
    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe("https://mgr.test/settings/chat?error=oauth_failed");
    expect(console.error).toHaveBeenCalledExactlyOnceWith("slack_oauth_callback_failed", {
      name: "TypeError", status: null, stage: "oauth_session",
    });
    expect(callbacks.complete).not.toHaveBeenCalled();
    expect(JSON.stringify(vi.mocked(console.error).mock.calls)).not.toContain("secret");
  });

  it("logs provider status while preserving the generic failure redirect", async () => {
    callbacks.complete.mockRejectedValue(Object.assign(new Error("token-secret"), { statusCode: 400, body: "body-secret" }));
    const response = await GET(request());
    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe("https://mgr.test/settings/chat?error=oauth_failed");
    expect(console.error).toHaveBeenCalledExactlyOnceWith("slack_oauth_callback_failed", {
      name: "Error", status: 400, stage: "oauth_complete",
    });
    expect(JSON.stringify(vi.mocked(console.error).mock.calls)).not.toContain("secret");
  });

  it("does not log a successful callback as a failure", async () => {
    const response = await GET(request());
    expect(response.headers.get("location")).toBe("https://mgr.test/settings/chat?installed=1");
    expect(console.error).not.toHaveBeenCalled();
  });
});
