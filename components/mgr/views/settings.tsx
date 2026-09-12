// components/mgr/views/settings.tsx — Settings. Live slots SettingsForm /
// PortalFulfillmentForm; inventory paints edits + Save.
import type { ReactNode } from "react";
import { E } from "@/components/mgr/e";
import { QuickBooksMark, SlackMark, SquareMark } from "@/components/mgr/brand-icons";
import type { SettingsViewModel } from "@/lib/mgr/settings-view";
import { AiModelSettingsView } from "@/components/mgr/views/ai-model-settings";
import { BrewerySettingsFormView } from "@/components/mgr/views/brewery-settings-form";
import { ThemeToggle } from "@/components/mgr/theme-toggle";

export type { SettingsViewModel };

export function SettingsView({
  model,
  breweryForm,
  fulfillmentForm,
  aiModelForm,
  deployment,
  hrefs = {},
}: {
  model: SettingsViewModel;
  breweryForm?: ReactNode;
  fulfillmentForm?: ReactNode;
  aiModelForm?: ReactNode;
  deployment?: ReactNode;
  hrefs?: Partial<Record<"locations" | "team" | "accounting" | "pos" | "chat" | "import", string>>;
}) {
  return (
    <div className="@container flex flex-col gap-3">
      {E.back("More", "Settings", undefined, model.backHref)}
      <p className="text-sm text-muted-foreground">Your brewery, your team, and the services that keep work moving.</p>
      <div className="grid gap-6 @min-[48rem]:grid-cols-[minmax(0,3fr)_minmax(0,2fr)] @min-[48rem]:items-start">
        <section aria-labelledby="settings-brewery" className="@container min-w-0 rounded-xl border bg-card p-5 sm:p-6">
          <h2 id="settings-brewery" className="font-heading text-xl font-semibold">Brewery details</h2>
          <p className="mb-6 mt-1 text-sm text-muted-foreground">Identity, compliance details, and daily operating defaults.</p>
          {breweryForm ?? <BrewerySettingsFormView initial={{ name: model.name, timezone: model.timezone, ttb: model.ttb, pa: model.paLicense, phone: model.phone, hours: model.overdueHours }} />}</section>
        <section aria-labelledby="settings-defaults" className="flex min-w-0 flex-col gap-6 rounded-xl border bg-card p-5 sm:p-6">
          <div><h2 id="settings-defaults" className="font-heading text-xl font-semibold">Team defaults</h2><p className="mt-1 text-sm text-muted-foreground">Ask MGR and wholesale portal preferences.</p></div>
          <div>{aiModelForm ?? <AiModelSettingsView value={model.aiModel} models={model.aiModels} />}</div>
          <div className="border-t pt-6">{fulfillmentForm ?? (
            <div className="flex flex-col gap-4">
              {E.pick("Portal fulfillment warehouse", model.warehouse, model.warehouseOptions)}
              {E.btn("Save warehouse", "g")}
            </div>
          )}</div>
        </section>
      </div>
      <div className="mt-2 grid gap-8 border-t pt-6 @min-[48rem]:grid-cols-2">
        <section aria-labelledby="settings-people" className="flex min-w-0 flex-col gap-2">
          <h2 id="settings-people" className="mb-2 font-heading text-xl font-semibold">People and places</h2>
          {E.nav("Team", model.team, "", undefined, hrefs.team)}
          {E.nav("Locations", model.locations, "", undefined, hrefs.locations)}
          {E.gated("Source water", "Water profiles aren’t available yet")}
        </section>
        <section aria-labelledby="settings-connections" className="flex min-w-0 flex-col gap-2">
          <h2 id="settings-connections" className="mb-2 font-heading text-xl font-semibold">Connections and data</h2>
          {E.nav("Accounting", "QuickBooks connection, mappings and payment defaults", "", QuickBooksMark, hrefs.accounting)}
          {E.nav("Point of sale", "Square connection, location mappings, sync and menu", "", SquareMark, hrefs.pos)}
          {E.nav("Chat", "Slack notifications and preferences", "", SlackMark, hrefs.chat)}
          {E.nav("Import", "Upload, map and commit CSV rows", "", undefined, hrefs.import)}
        </section>
      </div>
      <div className="mt-2 grid gap-6 border-t pt-6 @min-[48rem]:grid-cols-2">
        <section aria-labelledby="settings-appearance">
          <h2 id="settings-appearance" className="font-heading text-xl font-semibold">Appearance</h2>
          <p className="mb-4 mt-1 text-sm text-muted-foreground">Choose how MGR looks on this device.</p>
          <ThemeToggle />
        </section>
        <div className="text-sm text-muted-foreground">{deployment ?? E.fld("Deployment", model.deployment)}</div>
      </div>
    </div>
  );
}
