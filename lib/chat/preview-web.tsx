// lib/chat/preview-web.tsx — accessible web renderer for the committed chat
// preview fixtures. Pure presentation: no provider calls, no live tenant data.
// Reused by the Settings › Chat page; the same fixtures feed renderer tests.
import type { ChatPreviewFixture, ChatPreviewId, PortableAction, PortableNotification } from "./contracts";
import { CHAT_PREVIEW_FIXTURES } from "./preview-fixtures";

const SURFACE_LABEL: Record<ChatPreviewFixture["surface"], string> = {
  settings: "MGR settings",
  app_home: "App Home",
  direct_message: "Direct message",
  private_channel: "Private channel",
  modal: "Dialog",
};

const TONE_CLASS = { neutral: "text-muted-foreground", healthy: "text-green-700", attention: "text-amber-700" } as const;

// Every target ≥ 24×24 CSS px (min-h-6 + padding); state never by color alone.
const BTN = "inline-flex min-h-6 min-w-6 items-center rounded border px-3 py-1 text-sm";

function Action({ action }: { action: PortableAction }) {
  const disabled = !action.enabled;
  return (
    <button type="button" className={BTN + (disabled ? " opacity-60" : "")} aria-disabled={disabled || undefined}>
      {action.label}
      {disabled && action.disabledReason ? <small className="ml-2 text-xs">{action.disabledReason}</small> : null}
    </button>
  );
}

function Item({ item }: { item: PortableNotification }) {
  return (
    <li className="flex flex-col gap-1 border-t py-2">
      <div className="flex items-baseline justify-between gap-2">
        <span className="font-medium">{item.subject.safeLabel} · {item.title}</span>
        {item.urgency === "attention" ? <span className="text-xs text-amber-700">Needs attention</span> : null}
      </div>
      <span className="text-sm text-muted-foreground">{item.detail}</span>
      <div className="flex flex-wrap gap-2">{item.actions.map((action) => <Action key={action.id + action.label} action={action} />)}</div>
    </li>
  );
}

/** One fixture drawn as the surface a person would see, labelled as preview data. */
export function ChatPreview({ fixture }: { fixture: ChatPreviewFixture }) {
  const headingId = `chat-preview-${fixture.id}`;
  return (
    <section aria-labelledby={headingId} className="flex flex-col gap-3 rounded border p-4">
      <p className="text-xs text-muted-foreground">{SURFACE_LABEL[fixture.surface]} · {fixture.eyebrow} · Preview data</p>
      <h3 id={headingId} className="text-lg font-semibold">{fixture.title}</h3>
      {fixture.status ? <p className={"text-sm " + TONE_CLASS[fixture.status.tone]}>{fixture.status.label}</p> : null}
      {fixture.fields.length > 0 ? (
        <dl className="grid grid-cols-[max-content_1fr] gap-x-4 gap-y-1 text-sm">
          {fixture.fields.map(({ label, value }) => (
            <div key={label} className="contents"><dt className="text-muted-foreground">{label}</dt><dd>{value}</dd></div>
          ))}
        </dl>
      ) : null}
      {fixture.items.length > 0 ? <ul className="list-none">{fixture.items.map((item) => <Item key={item.resolutionKey} item={item} />)}</ul> : null}
      {fixture.gated ? (
        <div className="flex flex-col gap-1">
          <button type="button" className={BTN + " opacity-60"} aria-disabled="true">{fixture.gated.label}</button>
          <small className="text-xs text-muted-foreground">{fixture.gated.reason}</small>
        </div>
      ) : null}
      <div className="flex flex-wrap gap-2">{fixture.actions.map((action) => <Action key={action.id + action.label} action={action} />)}</div>
    </section>
  );
}

/** Radio-group picker: keyboard-operable by default, selected state shown as text. */
export function ChatPreviewPicker({ selected, onSelect }: { selected: ChatPreviewId; onSelect: (id: ChatPreviewId) => void }) {
  return (
    <fieldset className="flex flex-wrap gap-2">
      <legend className="text-sm font-medium">Preview surface</legend>
      {CHAT_PREVIEW_FIXTURES.map((fixture) => {
        const checked = fixture.id === selected;
        return (
          <label key={fixture.id} className={BTN + " cursor-pointer gap-2 has-[:focus-visible]:ring-2" + (checked ? " border-foreground font-medium" : "")}>
            <input type="radio" name="chat-preview" value={fixture.id} checked={checked} onChange={() => onSelect(fixture.id)} className="sr-only" />
            {fixture.title}
            {checked ? <span className="text-xs">Selected</span> : null}
          </label>
        );
      })}
    </fieldset>
  );
}
