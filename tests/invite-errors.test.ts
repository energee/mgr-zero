import { AuthApiError, AuthRetryableFetchError } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";
import { inviteAuthFailure } from "@/lib/supabase/invites";
import { CommandRecoveryView } from "@/components/mgr/views/command-recovery";
import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";

describe("safe invitation diagnostics", () => {
  it.each([
    ["email_address_invalid", 400, "invite_email_invalid", 422, "real, deliverable email address"],
    ["email_address_not_authorized", 403, "invite_email_not_authorized", 422, "configure a custom SMTP provider"],
    ["email_provider_disabled", 422, "invite_email_disabled", 422, "enable email invitations"],
    ["over_email_send_rate_limit", 429, "invite_rate_limited", 429, "Wait before retrying"],
    ["over_request_rate_limit", 429, "invite_rate_limited", 429, "Wait before retrying"],
  ] as const)("explains the documented %s rejection without exposing its raw message", (providerCode, providerStatus, code, status, remedy) => {
    const failure = inviteAuthFailure(new AuthApiError("sensitive provider response", providerStatus, providerCode));
    expect(failure).toMatchObject({ code, status });
    expect(failure.message).toContain(remedy);
    expect(failure.message).not.toContain("sensitive provider response");
  });

  it.each([
    null,
    new AuthApiError("SMTP password=secret", 500, "unexpected_failure"),
    new AuthApiError("opaque provider failure", 422, "future_code"),
    new AuthApiError("contradictory upstream status", 500, "email_address_invalid"),
    new AuthRetryableFetchError("response lost after delivery", 502),
  ])("keeps an unknown provider outcome retryable with the original request", (error) => {
    const failure = inviteAuthFailure(error);
    expect(failure).toMatchObject({ code: "invite_failed", status: 502 });
    expect(failure.message).toContain("Retry this saved request");
    expect(failure.message).not.toContain("secret");
  });

  it("labels a saved invitation role without rewriting the saved payload", () => {
    const input = { email: "person@example.com", role: "warehouse" };
    const html = renderToStaticMarkup(createElement(CommandRecoveryView, {
      rows: [{ requestId: "saved-invite", name: "invite_staff", path: "/settings/team", input }],
    }));
    expect(html).toContain(">Warehouse</dd>");
    expect(html).not.toContain(">warehouse</dd>");
    expect(input.role).toBe("warehouse");
  });
});
