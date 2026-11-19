// tests/suggestion-settings-view.test.ts — the Material suggestions section of Settings: a
// write-only TypeSafe key field and the "Suggest kinds for new materials" switch. A saved key
// shows only its last four characters, with Replace and Remove; an unsaved one shows an empty
// password field, so the key is never drawn back into the page.
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { SuggestionSettingsView } from "@/components/mgr/views/suggestion-settings";
import { SettingsView } from "@/components/mgr/views/settings";
import { settingsDemo } from "@/lib/mgr/fixtures/settings";

const render = (status: { saved: boolean; last4: string | null; enabled: boolean }) =>
  renderToStaticMarkup(createElement(SuggestionSettingsView, { status }));

describe("Material suggestions settings", () => {
  it("asks for a key in an empty password field while none is saved", () => {
    const html = render({ saved: false, last4: null, enabled: false });
    expect(html).toContain("TypeSafe API key");
    expect(html).toMatch(/<input[^>]*type="password"[^>]*>/);
    expect(html).toMatch(/<input[^>]*autoComplete="off"|<input[^>]*autocomplete="off"/);
    expect(html).toContain("Save key");
    expect(html).not.toContain("Saved · ends in");
  });

  it("shows only the last four characters of a saved key, with Replace and Remove", () => {
    const html = render({ saved: true, last4: "7f3a", enabled: true });
    expect(html).toContain("Saved · ends in …7f3a");
    expect(html).not.toMatch(/<input[^>]*type="password"/);
    expect(html).toContain(">Replace<");
    expect(html).toContain(">Remove<");
  });

  it("holds the switch off until a key is saved, and says why", () => {
    const onEnabledChange = async () => true;
    const unsaved = renderToStaticMarkup(createElement(SuggestionSettingsView, { status: { saved: false, last4: null, enabled: false }, onEnabledChange }));
    expect(unsaved).toMatch(/<button[^>]*role="switch"[^>]*disabled=""/);
    expect(unsaved).toContain("Save a TypeSafe key first");
    const saved = renderToStaticMarkup(createElement(SuggestionSettingsView, { status: { saved: true, last4: "7f3a", enabled: false }, onEnabledChange }));
    expect(saved).not.toMatch(/<button[^>]*role="switch"[^>]*disabled=""/);
    expect(saved).not.toContain("Save a TypeSafe key first");
  });

  it("draws the switch with its whole consent line, with or without a key", () => {
    const html = render({ saved: true, last4: "7f3a", enabled: true });
    expect(html).toContain('aria-label="Suggest kinds for new materials"');
    // The row description is clamped to two lines, so it holds only these two sentences; the key note sits below.
    const consent = "Sends new material names to TypeSafe. Turning it on is your brewery&#x27;s consent.</p>";
    expect(html).toContain(`>${consent}`);
    expect(render({ saved: false, last4: null, enabled: false })).toContain(`>${consent}`);
  });

  it("is part of Settings", () => {
    const html = renderToStaticMarkup(createElement(SettingsView, { model: settingsDemo }));
    expect(html).toContain("Material suggestions");
  });
});
