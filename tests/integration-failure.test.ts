import { once } from "node:events";
import { createServer } from "node:http";
import { WebClient } from "@slack/web-api";
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

  it.each([403, 503])("retains actual Slack SDK HTTP %i without exposing provider details", async (status) => {
    const server = createServer((_request, response) => {
      response.writeHead(status, { "Content-Type": "application/json", "X-Provider-Secret": "header-secret" });
      response.end(JSON.stringify({ error: "body-secret", access_token: "access-secret" }));
    });
    await once(server.listen(0, "127.0.0.1"), "listening");
    try {
      const address = server.address();
      if (!address || typeof address === "string") throw new Error("Expected a loopback server");
      const client = new WebClient(undefined, {
        slackApiUrl: `http://127.0.0.1:${address.port}/`,
        retryConfig: { retries: 0 },
      });
      const error = await client.oauth.v2.access({
        client_id: "client", client_secret: "client-secret", code: "code-secret",
      }).catch((cause: unknown) => cause);
      expect(error).toMatchObject({ statusCode: status });
      expect(integrationFailureCause(error, "oauth_complete"))
        .toEqual({ name: "Error", status, stage: "oauth_complete" });
    } finally {
      await server[Symbol.asyncDispose]();
    }
  });

  it.each([null, undefined, "503", 503.5, NaN, Infinity])("rejects noninteger SDK status %s", (statusCode) => {
    expect(integrationFailureCause({ statusCode, cause: { status: 503 }, message: "secret" }, "oauth_complete"))
      .toEqual({ name: "object", status: null, stage: "oauth_complete" });
  });

  it("retains an existing status when an error also has an SDK status", () => {
    expect(integrationFailureCause({ status: 409, statusCode: 503 }, "oauth_complete"))
      .toEqual({ name: "object", status: 409, stage: "oauth_complete" });
  });

  it.each([403, 503])("logs QuickBooks HTTP %i without exposing its message", (status) => {
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const publicError = sanitizeQboError(new QboHttpError("access-secret provider body", status), "mapping_read");
    expect(publicError).not.toContain("secret");
    expect(log).toHaveBeenCalledExactlyOnceWith("qbo_unavailable", { name: "QboHttpError", status, stage: "mapping_read" });
    expect(JSON.stringify(log.mock.calls)).not.toContain("secret");
  });

  it("distinguishes a QuickBooks network failure from an HTTP response", () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const publicError = sanitizeQboError(new TypeError("DNS failure for secret URL"), "mapping_read");
    expect(publicError).not.toContain("secret");
    expect(log).toHaveBeenCalledExactlyOnceWith("qbo_unavailable", { name: "TypeError", status: null, stage: "mapping_read" });
  });

  it.each([400, 403, 503])("preserves QuickBooks token HTTP %i for callback diagnostics", async (status) => {
    const fetch = vi.fn<typeof globalThis.fetch>().mockResolvedValue(Response.json({ error: "provider-secret" }, { status }));
    await expect(new QboOAuthClient(qboConfig, fetch).exchange("code-secret"))
      .rejects.toMatchObject({ status });
  });

  it.each([403, 503])("logs Square HTTP %i without logging the response body", async (status) => {
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const fetch = vi.fn<typeof globalThis.fetch>().mockResolvedValue(Response.json({ errors: [{ detail: "provider-secret" }] }, { status }));
    await expect(new SquareClient(squareConfig, fetch).exchange("code-secret"))
      .rejects.toMatchObject({ status });
    expect(log).toHaveBeenCalledWith("square_provider_failed", { name: "Error", status, stage: "token_response" });
    expect(JSON.stringify(log.mock.calls)).not.toContain("secret");
  });

  it("logs a Square network failure and keeps the public error generic", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const fetch = vi.fn<typeof globalThis.fetch>().mockRejectedValue(new TypeError("DNS provider-secret"));
    await expect(new SquareClient(squareConfig, fetch).listLocations("access-secret", "merchant-secret"))
      .rejects.toBeInstanceOf(Error);
    expect(log).toHaveBeenCalledWith("square_unavailable", { name: "TypeError", status: null, stage: "api_request" });
    expect(JSON.stringify(log.mock.calls)).not.toContain("secret");
  });

  it("logs malformed Square responses without logging issued credentials", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const fetch = vi.fn<typeof globalThis.fetch>().mockResolvedValue(Response.json({ access_token: "access-secret" }));
    await expect(new SquareClient(squareConfig, fetch).exchange("code-secret")).rejects.toBeInstanceOf(Error);
    expect(log).toHaveBeenCalledWith("square_unavailable", { name: "Error", status: null, stage: "response_validation" });
    expect(JSON.stringify(log.mock.calls)).not.toContain("secret");
  });

  it("retains a retryable Square catalog HTTP status without changing the result contract", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const server = createServer((_request, response) => {
      response.writeHead(503, { "Content-Type": "application/json" });
      response.end(JSON.stringify({ errors: [{ detail: "body-secret" }] }));
    });
    await once(server.listen(0, "127.0.0.1"), "listening");
    try {
      const address = server.address();
      if (!address || typeof address === "string") throw new Error("Expected a loopback server");
      const client = new SquareClient(squareConfig, (_input, init) =>
        fetch(`http://127.0.0.1:${address.port}/v2/catalog/object`, init));
      await expect(client.upsertCatalogObject("access-secret", "{}"))
        .resolves.toEqual({ ok: false, versionConflict: false, definitive: false });
      expect(log).toHaveBeenCalledWith("square_provider_failed", {
        name: "Error", status: 503, stage: "catalog_write_response",
      });
      expect(JSON.stringify(log.mock.calls)).not.toContain("secret");
    } finally {
      await server[Symbol.asyncDispose]();
    }
  });
});
