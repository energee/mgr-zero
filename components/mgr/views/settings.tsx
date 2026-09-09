// components/mgr/views/settings.tsx — Settings. Live slots SettingsForm /
// PortalFulfillmentForm; inventory paints edits + Save.
import type { ReactNode } from "react";
import { E } from "@/components/mgr/e";
import { QuickBooksMark, SlackMark, SquareMark } from "@/components/mgr/brand-icons";
import type { SettingsViewModel } from "@/lib/mgr/settings-view";

export type { SettingsViewModel };

export function SettingsView({
  model,
  breweryForm,
  fulfillmentForm,
  deployment,
  links,
}: {
  model: SettingsViewModel;
  breweryForm?: ReactNode;
  fulfillmentForm?: ReactNode;
  deployment?: ReactNode;
  links?: ReactNode;
}) {
  return (
    <>
      {E.back("More", "Settings", undefined, model.backHref)}
      {breweryForm ?? (
        <>
          {E.edit("Brewery name", model.name)}
          {E.pick("Timezone", model.timezone, model.timezoneOptions)}
          {E.edit("TTB registry number", model.ttb)}
          {E.edit("PA license", model.paLicense)}
          {E.edit("Customer-facing phone", model.phone, "tel")}
          {E.edit("Reading overdue after (hours)", model.overdueHours, "number")}
          {E.fld("Deployment", model.deployment)}
          {E.btn("Save brewery")}
        </>
      )}
      {fulfillmentForm ?? (
        <>
          {E.pick("Portal fulfillment warehouse", model.warehouse, model.warehouseOptions)}
          {E.btn("Save warehouse", "g")}
        </>
      )}
      {deployment}
      {links ?? (
        <>
          {E.nav("Source water · Municipal · Denver", model.sourceWater)}
          {E.nav("Locations", model.locations)}
          {E.nav("Team", model.team)}
          {E.nav("Accounting", "QuickBooks · connection and push defaults", "", QuickBooksMark)}
          {E.nav("Point of sale", "Square · catalog and sales", "", SquareMark)}
          {E.nav("Chat", "Slack and notifications", "", SlackMark)}
          {E.nav("Import", "CSV wizard")}
        </>
      )}
    </>
  );
}
