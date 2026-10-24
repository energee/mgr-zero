export function SettingsSaveStatus({ busy = false, saved = false, error }: { busy?: boolean; saved?: boolean; error?: string | null }) {
  let message = "";
  if (busy) message = "Saving…";
  else if (saved && !error) message = "Saved";
  return <p role="status" aria-live="polite" aria-atomic="true" className="text-sm text-muted-foreground">{message}</p>;
}
