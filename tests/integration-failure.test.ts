import { afterEach, describe, expect, it, vi } from "vitest";
import { integrationFailureCause } from "@/lib/integration-failure";
import { QboHttpError, QboOAuthClient, sanitizeQboError } from "@/lib/qbo";
import { SquareClient } from "@/lib/pos";

const qboConfig = {
  clientId: "client", clientSecret: "client-secret", redirectUri: "https://mgr.test/oauth",
  apiBaseUrl: "https://sandbox-quickbooks.api.intuit.com",
};
const squareConfig = {
  applicationId: "app", applicationSecret: "application-secret", redirectUri: "https://mgr.test/oauth",
  environment: "sandbox" as const,
};

afterEach(() => vi.restoreAllMocks());

describe("credential-safe integration diagnostics", () => {
  it("projects only name, numeric status, and the local stage from arbitrary failures", () => {
    expect(integrationFailureCause({
      name: "ProviderError", status: 403, message: "access-secret", body: { token: "refresh-secret" },
      stage: "provider-secret", stack: "bearer-secret",
    }, "oauth_exchange")).toEqual({ name: "ProviderError", status: 403, stage: "oauth_exchange" });
    expect(integrationFailureCause("access-secret", "oauth_exchange"))
      .toEqual({ name: "string", status: null, stage: "oauth_exchange" });
    expect(integrationFailureCause({ name: { token: "secret" }, status: "secret" }, "oauth_exchange"))
      .toEqual({ name: "object", status: null, stage: "oauth_exchange" });
  });

  it.each([403, 503])("logs QuickBooks HTTP %i without exposing its message", (status) => {
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
    expect(sanitizeQboError(new QboHttpError("access-secret provider body", status), "mapping_read"))
      .toBe("QuickBooks is unavailable");
    expect(log).toHaveBeenCalledExactlyOnceWith("qbo_unavailable", { name: "Error", status, stage: "mapping_read" });
    expect(JSON.stringify(log.mock.calls)).not.toContain("secret");
  });

  it("distinguishes a QuickBooks network failure from an HTTP response", () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
    expect(sanitizeQboError(new TypeError("DNS failure for secret URL"), "mapping_read"))
      .toBe("QuickBooks is unavailable");
    expect(log).toHaveBeenCalledExactlyOnceWith("qbo_unavailable", { name: "TypeError", status: null, stage: "mapping_read" });
  });

  it.each([400, 403, 503])("preserves QuickBooks token HTTP %i for callback diagnostics", async (status) => {
    const fetch = vi.fn<typeof globalThis.fetch>().mockResolvedValue(Response.json({ error: "provider-secret" }, { status }));
    await expect(new QboOAuthClient(qboConfig, fetch).exchange("code-secret"))
      .rejects.toMatchObject({ message: "QuickBooks token request failed", status });
  });

  it.each([403, 503])("logs Square HTTP %i without logging the response body", async (status) => {
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const fetch = vi.fn<typeof globalThis.fetch>().mockResolvedValue(Response.json({ errors: [{ detail: "provider-secret" }] }, { status }));
    await expect(new SquareClient(squareConfig, fetch).exchange("code-secret"))
      .rejects.toMatchObject({ message: "Square is unavailable", status });
    expect(log).toHaveBeenCalledWith("square_provider_failed", { name: "Error", status, stage: "token_response" });
    expect(JSON.stringify(log.mock.calls)).not.toContain("secret");
  });

  it("logs a Square network failure and keeps the public error generic", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const fetch = vi.fn<typeof globalThis.fetch>().mockRejectedValue(new TypeError("DNS provider-secret"));
    await expect(new SquareClient(squareConfig, fetch).listLocations("access-secret", "merchant-secret"))
      .rejects.toThrow("Square is unavailable");
    expect(log).toHaveBeenCalledWith("square_unavailable", { name: "TypeError", status: null, stage: "api_request" });
    expect(JSON.stringify(log.mock.calls)).not.toContain("secret");
  });

  it("logs malformed Square responses without logging issued credentials", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const fetch = vi.fn<typeof globalThis.fetch>().mockResolvedValue(Response.json({ access_token: "access-secret" }));
    await expect(new SquareClient(squareConfig, fetch).exchange("code-secret")).rejects.toThrow("Square is unavailable");
    expect(log).toHaveBeenCalledWith("square_unavailable", { name: "Error", status: null, stage: "response_validation" });
    expect(JSON.stringify(log.mock.calls)).not.toContain("secret");
  });
});
