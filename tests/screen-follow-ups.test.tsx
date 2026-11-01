import { describe, expect, it } from "vitest";
import { SCREENS } from "@/components/mgr/screens";
import { brewPrepMineral, brewTimelineMineral } from "@/lib/mgr/fixtures/production";
import { resolveTap } from "@/lib/mgr/screen-links";

const screen = (name: string) => SCREENS.find(candidate => candidate.name === name)!;

describe("screen parity follow-ups", () => {
  it("opens each fixture ingredient from prep and the brew timeline", () => {
    for (const [name, ingredients] of [["Brew prep", brewPrepMineral.ingredients], ["Brew day timeline", brewTimelineMineral.ingredients]] as const) {
      for (const ingredient of ingredients) {
        expect(resolveTap(screen(name), ingredient.name), `${name}: ${ingredient.name}`).toBe("Edit material");
      }
    }
  });

  it("keeps reset submissions local while preserving staff and portal Back destinations", () => {
    for (const name of ["Reset password", "Portal forgot password"]) {
      expect(resolveTap(screen(name), "Send reset link")).toBeUndefined();
    }
    expect(resolveTap(screen("Reset password"), "Back to sign in", "/login")).toBe("Sign in");
    expect(resolveTap(screen("Portal forgot password"), "Back to sign in", "/portal/login")).toBe("Portal sign in");
    for (const [href, target] of [["/taproom", "Weekly count"], ["/taproom/board", "Tap board"], ["/taproom/variance", "Variance by brand"], ["/menu", "Menu"]]) {
      expect(resolveTap(screen("Today"), "Open", href)).toBe(target);
    }
    for (const href of ["/inventory#taproom", "/inventory#taps", "/catalog#menu"]) {
      expect(resolveTap(screen("Today"), "Open", href)).toBeUndefined();
    }
  });

});
