export type ChatSettingSave =
  | { name: "set_notification_destination"; channel: string }
  | { name: "set_brewery_quiet_hours"; start: string; end: string }
  | { name: "set_personal_quiet_hours"; start: string; end: string; timezone: string };

/** A completed save confirms only its own values, not another form's draft. */
export function chatSettingIsSaved(saved: ChatSettingSave | null | undefined, current: ChatSettingSave): boolean {
  switch (saved?.name) {
    case "set_notification_destination":
      return current.name === saved.name && current.channel === saved.channel;
    case "set_brewery_quiet_hours":
      return current.name === saved.name && current.start === saved.start && current.end === saved.end;
    case "set_personal_quiet_hours":
      return current.name === saved.name && current.start === saved.start && current.end === saved.end && current.timezone === saved.timezone;
    default:
      return false;
  }
}
