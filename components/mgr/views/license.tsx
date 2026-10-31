// components/mgr/views/license.tsx — shared License sheet body.
import type { ReactNode } from "react";
import { E } from "@/components/mgr/e";
import { ConfirmDeleteControl } from "./confirm-delete";
import { Button } from "@/components/ui/button";
import { UsStateField } from "@/components/mgr/us-state-field";
import { licenseSubmitReason, type LicenseViewModel } from "@/lib/mgr/license-view";
import { RegistryDate, RegistryInput, RegistrySelect } from "@/components/mgr/views/registry-fields";

type Controls = Partial<Record<"state" | "kind" | "licenseNo" | "expiresOn", (value: string) => void>>;

export function LicenseView({ model, controls = {}, locked = false, messages, footer, submitting = false, onCancel, remove }: {
  model: LicenseViewModel; controls?: Controls; locked?: boolean; messages?: ReactNode; footer?: ReactNode;
  submitting?: boolean; onCancel?: () => void;
  /** Live: the command-bound delete control, null while creating. Inventory
   * leaves it out so ConfirmDeleteControl's local success path simulates delete. */
  remove?: ReactNode;
}) {
  const removal = remove !== undefined ? remove : model.state && model.kind
    ? <ConfirmDeleteControl title="Delete license" busyLabel="Deleting…" name="Delete this license?"
      warning="This permanently removes the brewery's state license." />
    : null;
  return (
    <>
      {E.cols(
        <UsStateField value={model.state} controls={{ onChange: controls.state, disabled: locked }} />,
        <RegistrySelect label="Kind" value={model.kind} onChange={controls.kind} disabled={locked} options={[
          { value: "brewery", label: "Brewery" },
          { value: "supplier", label: "Supplier" },
          { value: "direct to consumer", label: "Direct to consumer" },
        ]} />,
      )}
      {E.cols(
        <RegistryInput label="License number · optional" value={model.licenseNo ?? ""} onChange={controls.licenseNo} />,
        <RegistryDate label="Expires · optional" value={model.expiresOn ?? ""} onChange={controls.expiresOn} />,
      )}
      {E.info("Kind is the license class the state uses. One record per state and kind.")}
      {messages}
      {footer !== undefined ? footer : E.pin(<>
        <Button type="button" variant="outline" disabled={submitting} onClick={onCancel}>Cancel</Button>
        {E.submit("Save license", { submitting, reason: licenseSubmitReason(model) })}
      </>)}
      {removal ? <section aria-label="Delete license" className="mt-2 flex flex-col gap-4 border-t pt-5 @min-[48rem]:flex-row @min-[48rem]:items-center @min-[48rem]:justify-between">
        <div>
          <h2 className="text-sm font-medium">Delete license</h2>
          <p className="mt-1 text-sm text-muted-foreground">Delete a license added by mistake.</p>
        </div>
        <div className="shrink-0 self-start">{removal}</div>
      </section> : null}
    </>
  );
}
