import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
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
  expect(html).toContain("pick due");
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
  const html = renderToStaticMarkup(createElement(ChatLinkedPeopleView, { people: [{ id: "real-link", name: "Actual user", role: "brewer", slackIdentity: "U123", linkedAt: "2026-09-12" }], busy: true, error: "Permission changed" }));
  expect(html).toContain("Slack U123");
  expect(html).toContain("Permission changed");
  expect(html).toContain("disabled");
  expect(html).not.toContain('href="/');
});
