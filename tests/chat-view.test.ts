import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync } from "node:fs";
import { expect, it } from "vitest";
import { NOTIFICATION_REASON_LABEL } from "../lib/chat/contracts";
import { personalChatPreferences } from "../lib/mgr/fixtures/chat";
import { CHAT_PREVIEW_FIXTURES } from "../lib/chat/preview-fixtures";
import { ChatDisconnectView, ChatLinkedPeopleView, ChatLinkConsentView, ChatHealthView, ChatSettingsView, ChatPersonalPreferencesView } from "../components/mgr/views/chat";
import { SCREENS } from "../components/mgr/screens";

it("keeps reading cadence restricted to whole hours", () => {
  const markup = renderToStaticMarkup(SCREENS.find(screen => screen.name === "Chat settings")!.body);
  const hours = markup.match(/<input\b[^>]*aria-label="Reading overdue after \(hours\)"[^>]*>/)?.[0];
  expect(hours).toBeDefined();
  expect(hours).toContain('step="1"');
});

it("preserves personal notification reasons before linking and gates taproom quiet hours", () => {
  const html = renderToStaticMarkup(createElement(ChatPersonalPreferencesView, { preferences: { preferences: [{ reason: "pick_due", enabled: true }], quietStart: null, quietEnd: null, timezone: "America/New_York", link: null }, canSetQuietHours: false }));
  expect(html).toContain("Pick due");
  expect(html).toContain("Link MGR account");
  expect(html).not.toContain("Save my quiet hours");
  expect(html).not.toContain("Unlink my Slack");
});

it("shares disconnected settings without inventing connection data or allowing unconfigured OAuth", () => {
  const html = renderToStaticMarkup(createElement(ChatSettingsView, { health: { installation: null, queue: {}, lastCallback: null, lastDelivery: null, destinations: [], linkedCount: 0 }, configured: false, timezone: "America/New_York", readingDueHours: 24 }));
  expect(html).toContain("Not connected");
  expect(html).toContain("Connect Slack");
  expect(html).toContain("disabled");
  expect(html).not.toContain("Save operations channel");
  expect(html).not.toContain('href="/');
});

it("distinguishes stopped delivery from incomplete credential cleanup", () => {
  const html = renderToStaticMarkup(createElement(ChatDisconnectView, { cleanupPending: true, busy: true, error: "Cleanup unavailable" }));
  expect(html).toContain("Slack delivery has stopped");
  expect(html).toContain("Retry credential cleanup");
  expect(html).toContain("Cleanup unavailable");
  expect(html).toContain("disabled");
  expect(html).toContain("Stays: MGR work");
});

it("keeps Slack recovery fail-closed and reports actual queue counters", () => {
  const html = renderToStaticMarkup(createElement(ChatHealthView, { health: { installation: null, queue: { queued: 0, retrying: 2 }, lastCallback: null, lastDelivery: null, destinations: [], linkedCount: 0 }, configured: false }));
  expect(html).toContain("Slack delivery is stopped");
  expect(html).toContain("2 deliveries");
  expect(html).toContain("None yet");
  expect(html).not.toContain(">Disable integration<");
  expect(html).not.toContain(">Reauthorize Slack<");
});

it("requires an actual link intent before showing identity consent", () => {
  expect(renderToStaticMarkup(createElement(ChatLinkConsentView, {}))).not.toContain(">Link accounts<");
  const html = renderToStaticMarkup(createElement(ChatLinkConsentView, { intent: { brewery: "Actual brewery", mgrIdentity: "Actual MGR user", slackIdentity: "Actual Slack user", workspace: "Actual workspace", expiresAt: "2026-09-12T12:00:00Z" } }));
  for (const value of ["Actual brewery", "Actual MGR user", "Actual Slack user", "Actual workspace"]) expect(html).toContain(value);
  expect(html).toContain('data-variant="irreversible"');
  expect(html).not.toContain('href="/');
});

it("keeps real linked identities and unlink errors without fixture paths", () => {
  const html = renderToStaticMarkup(createElement(ChatLinkedPeopleView, { people: [{ id: "real-link", name: "Actual user", roles: ["brewer"], slackIdentity: "U123", linkedAt: "2026-09-12T02:00:00Z" }], timeZone: "America/New_York", busy: true, error: "Permission changed" }));
  expect(html).toContain("Slack U123");
  expect(html).toContain("linked Sep 11, 2026");
  expect(html).toContain("Permission changed");
  expect(html).toContain("disabled");
  expect(html).not.toContain('href="/');
});

it("shows every linked staff role rather than selecting a primary role", () => {
  const html = renderToStaticMarkup(createElement(ChatLinkedPeopleView, { people: [{ id: "multi", name: "Multi-role staff", roles: ["sales", "brewer"], slackIdentity: "U456", linkedAt: "2026-10-16" }], timeZone: "America/New_York" }));
  expect(html).toContain("sales, brewer");
  expect(html).toContain("Slack U456");
});

// A server element placed among a client view's siblings reaches the client as
// a lazy Flight chunk, so the view's static-children check cannot mark it and
// React warns "Check the top-level render call using <ChatSettingsView>" (#493).
it("keys every element the chat settings page hands ChatSettingsView", () => {
  const page = readFileSync("app/(app)/settings/chat/page.tsx", "utf8");
  for (const slot of ["connection", "fields", "delivery"]) {
    const element = page.match(new RegExp(`${slot}=\\{[^<]*<(\\w+)([^>]*)>`));
    expect(element, slot).not.toBeNull();
    expect(element![2], `${slot} <${element![1]}>`).toMatch(/\bkey=/);
  }
});

// #1146: staff read sentence-case reasons, the same words Slack's own
// preferences dialog uses, and plain instructions without developer terms.
it("labels each personal reason in plain words with no repeated sublabel", () => {
  const html = renderToStaticMarkup(createElement(ChatPersonalPreferencesView, { preferences: personalChatPreferences }));
  for (const { reason } of personalChatPreferences.preferences) {
    expect(html).toContain(`aria-label="${NOTIFICATION_REASON_LABEL[reason]}"`);
    // The raw reason id with spaces ("pick due") must never be drawn as a label.
    const rawReasonText = reason.replaceAll("_", " ");
    expect(html).not.toMatch(new RegExp(`[>"]${rawReasonText}[<"]`));
  }
  expect(html).not.toContain("Personal reminders<");
  expect(html).not.toContain("App Home");
});

it("does not send staff to link Slack while Slack is unavailable", () => {
  const unlinked = { ...personalChatPreferences, link: null };
  const available = renderToStaticMarkup(createElement(ChatPersonalPreferencesView, { preferences: unlinked }));
  expect(available).toContain("Link MGR account");
  const unavailable = renderToStaticMarkup(createElement(ChatPersonalPreferencesView, { preferences: unlinked, configured: false }));
  expect(unavailable).not.toContain("Link MGR account");
  expect(unavailable).toContain("Slack isn’t available for your brewery yet.");
  expect(unavailable).toContain("aria-label=\"Pick due\"");
});

// The "All preview states" picker renders only when NODE_ENV is "development";
// vitest runs with NODE_ENV "test", so this checks what staff see.
it("omits fixture wording and the dev-only state picker from Chat settings", () => {
  const html = renderToStaticMarkup(createElement(ChatSettingsView, { health: { installation: null, queue: {}, lastCallback: null, lastDelivery: null, destinations: [], linkedCount: 0 }, configured: false, timezone: "America/New_York", readingDueHours: 24, previewFixtures: CHAT_PREVIEW_FIXTURES }));
  expect(html).toContain("Sample data");
  expect(html).not.toMatch(/fixture|server setup|All preview states/i);
  expect(html).not.toContain(">Chat notifications<");
});
