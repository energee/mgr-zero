// tests/chat-slack-renderer.test.ts — every provider-surface fixture renders
// valid Block Kit within Slack limits; digests stay aggregate-only; gated
// forms expose only an MGR URL; action values carry an opaque intent id;
// resolved messages drop their actions.
import { describe, expect, it } from "vitest";
import { CHAT_PREVIEW_FIXTURES } from "@/lib/chat/preview-fixtures";
import { renderSlackDigest, renderSlackHome, renderSlackMessage } from "@/lib/chat/slack-renderer";

type Block = { type: string; text?: { type: string; text: string }; elements?: Record<string, unknown>[]; [k: string]: unknown };
const MGR = "https://mgr.test";

function assertBlockKit(blocks: Block[]) {
  expect(blocks.length).toBeGreaterThan(0);
  expect(blocks.length).toBeLessThanOrEqual(50);
  for (const b of blocks) {
    expect(["header", "section", "context", "actions", "divider"]).toContain(b.type);
    if (b.type === "header") expect(b.text!.text.length).toBeLessThanOrEqual(150);
    if (b.type === "section" && b.text) expect(b.text.text.length).toBeLessThanOrEqual(3000);
    if (b.type === "actions") {
      expect(b.elements!.length).toBeLessThanOrEqual(25);
      for (const el of b.elements!) {
        expect(el.type).toBe("button");
        expect(String((el.text as { text: string }).text).length).toBeLessThanOrEqual(75);
        if (el.value) expect(String(el.value).length).toBeLessThanOrEqual(2000);
      }
    }
  }
}

describe("Slack renderer", () => {
  it("renders every fixture notification as Block Kit with an MGR link and opaque action values", () => {
    for (const fixture of CHAT_PREVIEW_FIXTURES) {
      for (const item of fixture.items) {
        const { text, blocks } = renderSlackMessage(item, { mgrBaseUrl: MGR, intentId: "intent-1" });
        assertBlockKit(blocks as Block[]);
        expect(text).toContain(item.subject.safeLabel);
        const buttons = (blocks as Block[]).filter((b) => b.type === "actions").flatMap((b) => b.elements!);
        const open = buttons.find((b) => b.action_id === "open_mgr")!;
        expect(open.url).toBe(`${MGR}${item.actions.find((a) => a.id === "open_mgr")?.url ?? `/orders/${item.subject.id}`}`);
        for (const b of buttons.filter((b) => b.action_id !== "open_mgr")) {
          expect(b.value).toBe("intent-1");
          expect(JSON.stringify(b)).not.toMatch(/brewery|user_id|token/i);
        }
        expect(JSON.stringify(blocks)).not.toMatch(/xox[baprs]-|@[a-z0-9.]+\.[a-z]{2,}/i);
      }
    }
  });

  it("drops actions and marks the message resolved when the occurrence resolved", () => {
    const item = CHAT_PREVIEW_FIXTURES.find((f) => f.id === "personal-dm")!.items[0];
    const { text, blocks } = renderSlackMessage(item, { mgrBaseUrl: MGR, intentId: "intent-1", resolved: true });
    expect((blocks as Block[]).some((b) => b.type === "actions")).toBe(false);
    expect(text).toMatch(/resolved/i);
  });

  it("renders the digest with counts and safe labels only, never item detail", () => {
    const fixture = CHAT_PREVIEW_FIXTURES.find((f) => f.id === "team-digest")!;
    const { text, blocks } = renderSlackDigest({ title: fixture.title, fields: fixture.fields, mgrBaseUrl: MGR });
    assertBlockKit(blocks as Block[]);
    expect(text).toContain(fixture.title);
    for (const f of fixture.fields) expect(JSON.stringify(blocks)).toContain(f.value);
    expect(JSON.stringify(blocks)).not.toMatch(/ORD-|assigned to you|FV2/);
  });

  it("renders App Home as the link screen when unlinked and as the personal queue when linked", () => {
    const link = renderSlackHome({ linked: false, linkUrl: `${MGR}/settings/chat/link?proof=abc`, mgrBaseUrl: MGR });
    expect(link.type).toBe("home");
    assertBlockKit(link.blocks as Block[]);
    const linkButton = (link.blocks as Block[]).filter((b) => b.type === "actions").flatMap((b) => b.elements!)[0];
    expect(linkButton.url).toBe(`${MGR}/settings/chat/link?proof=abc`);
    expect(JSON.stringify(link.blocks)).toContain("No customer contacts, prices or notes");

    const items = CHAT_PREVIEW_FIXTURES.find((f) => f.id === "app-home")!.items;
    const home = renderSlackHome({ linked: true, items, mgrBaseUrl: MGR });
    assertBlockKit(home.blocks as Block[]);
    for (const item of items) expect(JSON.stringify(home.blocks)).toContain(item.subject.safeLabel);
    expect(JSON.stringify(home.blocks)).toContain(`${MGR}/`);
    const empty = renderSlackHome({ linked: true, items: [], mgrBaseUrl: MGR });
    expect(JSON.stringify(empty.blocks)).toMatch(/caught up/i);
  });

  it("keeps gated forms as MGR links only", () => {
    for (const id of ["fermentation-gated", "order-confirm-gated"] as const) {
      const fixture = CHAT_PREVIEW_FIXTURES.find((f) => f.id === id)!;
      const { blocks } = renderSlackDigest({ title: fixture.title, fields: [{ label: fixture.gated!.label, value: fixture.gated!.reason }], mgrBaseUrl: MGR, openLabel: fixture.actions[0].label, openPath: "/" });
      const buttons = (blocks as Block[]).filter((b) => b.type === "actions").flatMap((b) => b.elements!);
      expect(buttons.length).toBe(1);
      expect(buttons[0].url).toMatch(new RegExp(`^${MGR}`));
      expect(JSON.stringify(blocks)).not.toMatch(/"type":"input"|plain_text_input|number_input/);
    }
  });
});
