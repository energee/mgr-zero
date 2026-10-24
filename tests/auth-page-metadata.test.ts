// Public entry routes name their tabs through Next metadata, without running auth actions.
import { describe, expect, it } from "vitest";
import * as login from "@/app/(auth)/login/page";
import * as portalLogin from "@/app/(auth)/portal/login/page";
import * as reset from "@/app/(auth)/reset/page";
import * as invitations from "@/app/(auth)/invitations/page";

describe("auth route metadata (#1322)", () => {
  it.each([
    ["/login", login, "Sign in"],
    ["/portal/login", portalLogin, "Portal sign in"],
    ["/reset", reset, "Reset password"],
    ["/invitations", invitations, "Invitations"],
  ])("names %s without duplicating the root title suffix", (_route, page, title) => {
    expect(page).toHaveProperty("metadata.title", title);
  });
});
