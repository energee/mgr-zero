"use client";

// Sale channels → a row's Delete: confirm, then delete_sale_channel. Client
// module so the server channels page can hand it to DeleteCommandButton. The
// warning is the same in-use rule the list states above its rows.
import { CHANNEL_IN_USE_RULE } from "@/lib/mgr/sale-channels-view";
import { ConfirmDeleteControl } from "./confirm-delete";

export function DeleteChannelControl({ name, ...rest }: { name: string; busy?: boolean; error?: string | null; onDelete?: () => Promise<boolean> }) {
  return <ConfirmDeleteControl title={`Delete ${name}`} triggerLabel="Delete" size="sm" {...rest}
    name={<>Delete the <strong>{name}</strong> sale channel? This cannot be undone.</>}
    warning={CHANNEL_IN_USE_RULE} />;
}
