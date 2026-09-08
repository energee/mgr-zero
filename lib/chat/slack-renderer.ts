// lib/chat/slack-renderer.ts — portable notification → Slack Block Kit.
// Pure functions: no provider calls, no tenant reads. Every operational
// button is an MGR deep link; integration buttons carry only an opaque intent
// id. Text is clipped to Slack's block limits.
import type { PortableAction, PortableNotification } from "./contracts";

type Block = Record<string, unknown>;
const clip = (s: string, n: number) => (s.length > n ? s.slice(0, n - 1) + "…" : s);
const header = (text: string): Block => ({ type: "header", text: { type: "plain_text", text: clip(text, 150), emoji: false } });
const section = (text: string): Block => ({ type: "section", text: { type: "mrkdwn", text: clip(text, 3000) } });
const context = (text: string): Block => ({ type: "context", elements: [{ type: "mrkdwn", text: clip(text, 2000) }] });
// `primary` marks the one action a surface exists for. Never set it on a
// repeated row accessory: Slack expects at most one primary button in view.
const linkButton = (label: string, url: string, primary = false): Block => ({
  type: "button", action_id: "open_mgr", text: { type: "plain_text", text: clip(label, 75), emoji: false }, url,
  ...(primary ? { style: "primary" } : {}),
});
const intentButton = (action: PortableAction, intentId: string): Block => ({
  type: "button", action_id: ({ snooze: "mgr_snooze", mute_reason: "mgr_mute_reason", edit_preferences: "mgr_preferences", refresh: "mgr_refresh", open_mgr: "open_mgr" })[action.id], text: { type: "plain_text", text: clip(action.label, 75), emoji: false }, value: action.intentId ?? intentId,
});
const actions = (elements: Block[]): Block[] => (elements.length ? [{ type: "actions", elements: elements.slice(0, 25) }] : []);

// A subject's safeLabel sometimes already carries its reason ("FV2 · reading
// overdue"), so appending the title would read "… · Reading overdue" twice.
// Used by every surface that composes label and title on one line: App Home
// rows and the message fallback text Slack shows in the notification list.
// endsWith, not includes: a label whose own words happen to contain the reason
// ("Order #1042 · picked short" against the title "Pick") would swallow it and
// the row would lose why it was sent. An empty title has nothing to append.
const rowLabel = (n: PortableNotification) => {
  const title = n.title.trim();
  const label = n.subject.safeLabel;
  return title === "" || label.toLowerCase().endsWith(title.toLowerCase())
    ? label
    : `${label} · ${title}`;
};

// The open_mgr action carries the deep link; orders are the default subject.
const openPathFor = (n: PortableNotification) =>
  n.actions.find((a) => a.id === "open_mgr")?.url ?? `/orders/${n.subject.id}`;

const REASON_LABEL: Record<PortableNotification["reason"], string> = {
  submitted_order: "Review submitted order", pick_due: "Pick due", restock_due: "Put back staged beer", delivery_next: "Next stop",
  fermentation_reading_overdue: "Reading overdue", invoice_question: "Buyer asked about an invoice", operations_digest: "Operations",
};

type MessageOptions = { mgrBaseUrl: string; intentId: string; resolved?: boolean };

export function renderSlackMessage(n: PortableNotification, o: MessageOptions): { text: string; blocks: Block[] } {
  const openPath = openPathFor(n);
  const status = o.resolved ? "Resolved" : REASON_LABEL[n.reason] + (n.urgency === "attention" ? " · needs attention" : "");
  const text = `${rowLabel(n)}${o.resolved ? " · Resolved" : ""}`;
  const blocks: Block[] = [header(n.subject.safeLabel), section(`*${n.title}*\n${n.detail}`), context(status)];
  if (!o.resolved) {
    const buttons = n.actions.filter((a) => a.enabled).map((a) =>
      a.id === "open_mgr" ? linkButton(a.label, `${o.mgrBaseUrl}${openPath}`, true) : intentButton(a, o.intentId),
    );
    blocks.push(...actions(buttons));
  }
  return { text, blocks };
}

type DigestOptions = { title: string; fields: readonly { label: string; value: string }[]; mgrBaseUrl: string; openLabel?: string; openPath?: string };

/** Aggregate-only shared summary: counts and safe labels, one MGR link. */
export function renderSlackDigest(o: DigestOptions): { text: string; blocks: Block[] } {
  const blocks: Block[] = [
    header(o.title),
    section(o.fields.map((f) => `*${f.label}:* ${f.value}`).join("\n") || "Nothing waiting."),
    context("Details and actions are available in each person's private MGR App Home."),
    ...actions([linkButton(o.openLabel ?? "Open my MGR work", `${o.mgrBaseUrl}${o.openPath ?? "/"}`)]),
  ];
  return { text: o.title, blocks };
}

type HomeOptions =
  | { linked: false; linkUrl: string; mgrBaseUrl: string }
  | { linked: true; items: readonly PortableNotification[]; mgrBaseUrl: string; intents?: Record<string, string> };

export function renderSlackHome(o: HomeOptions): { type: "home"; blocks: Block[] } {
  if (!o.linked) {
    return { type: "home", blocks: [
      header("Your MGR work"),
      section("Link your account to see only work your current brewery role permits."),
      ...actions([linkButton("Link MGR account", o.linkUrl, true)]),
      context("No customer contacts, prices or notes are posted here."),
    ] };
  }
  const blocks: Block[] = [header(o.items.length ? `Today · ${o.items.length} waiting` : "Today")];
  if (!o.items.length) blocks.push(section("You're caught up."));
  for (const n of o.items.slice(0, 20)) {
    const openPath = openPathFor(n);
    blocks.push({
      type: "section",
      text: { type: "mrkdwn", text: clip(`*${rowLabel(n)}*\n${n.detail}`, 3000) },
      accessory: linkButton("Open", `${o.mgrBaseUrl}${openPath}`),
    });
  }
  blocks.push(...actions([linkButton("Open Today in MGR", `${o.mgrBaseUrl}/`, true), linkButton("Notification settings in MGR", `${o.mgrBaseUrl}/settings/chat`),
    ...Object.entries(o.intents ?? {}).filter(([id]) => ["mgr_preferences", "mgr_refresh", "mgr_unlink"].includes(id)).map(([id, value]) => ({
      type: "button", action_id: id, text: { type: "plain_text", text: ({ mgr_preferences: "Preferences", mgr_refresh: "Refresh", mgr_unlink: "Unlink MGR" } as Record<string,string>)[id] }, value,
    })),
  ]));
  return { type: "home", blocks };
}


export function renderSlackPreferences(intentId: string, quiet?: { start: string | null; end: string | null; timezone: string | null }) {
  const option = (text: string, value: string) => ({ text: { type: "plain_text", text }, value });
  const field = (id: string, label: string, element: Block, optional = false) => ({ type: "input", block_id: id, label: { type: "plain_text", text: label }, element: { ...element, action_id: id }, optional });
  return {
    type: "modal", callback_id: "mgr_save_preferences", private_metadata: intentId,
    title: { type: "plain_text", text: "Notification preferences" }, submit: { type: "plain_text", text: "Save" }, close: { type: "plain_text", text: "Cancel" },
    blocks: [
      section("Choose a reason to mute or unmute. Quiet hours apply to all your chat reminders. Today is always current."),
      field("reason", "Notification reason", { type: "static_select", options: Object.entries(REASON_LABEL).map(([value, label]) => option(label, value)) }),
      field("enabled", "Delivery for this reason", { type: "static_select", options: [option("Enabled", "true"), option("Muted", "false")] }),
      field("start", "Quiet hours start (HH:MM)", { type: "plain_text_input", ...(quiet?.start ? { initial_value: quiet.start.slice(0,5) } : {}) }, true),
      field("end", "Quiet hours end (HH:MM)", { type: "plain_text_input", ...(quiet?.end ? { initial_value: quiet.end.slice(0,5) } : {}) }, true),
      field("timezone", "Timezone (blank uses brewery timezone)", { type: "plain_text_input", ...(quiet?.timezone ? { initial_value: quiet.timezone } : {}) }, true),
      context("Clear both times to use brewery quiet hours. If this form expires, reopen Preferences or use Notification settings in MGR."),
    ],
  };
}
