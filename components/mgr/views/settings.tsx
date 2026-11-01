// components/mgr/views/settings.tsx — Settings. Connections (Accounting, Point
// of sale, Chat) lead the page, so a phone reaches them without scrolling past
// the forms (#1509). Brewery details, Ask MGR and Wholesale fulfillment are
// three independently saved forms, unboxed and split by rules; the brewery's
// gravity unit saves on tap under Brewery details.
// Live slots SettingsForm / GravityUnitForm / AiModelSettingsForm /
// PortalFulfillmentForm; inventory paints the same form views with fixture values.
import type { ReactNode } from "react";
import { E } from "@/components/mgr/e";
import { QuickBooksMark, SlackMark, SquareMark } from "@/components/mgr/brand-icons";
import { navAbout } from "@/lib/mgr/nav";
import type { SettingsViewModel } from "@/lib/mgr/settings-view";
import { WATER_PROFILES_CAPTION } from "@/lib/mgr/water-profiles-view";
import { AiModelSettingsView } from "@/components/mgr/views/ai-model-settings";
import { BrewerySettingsFormView } from "@/components/mgr/views/brewery-settings-form";
import { PortalFulfillmentView } from "@/components/mgr/views/portal-fulfillment";
import { ThemeToggle } from "@/components/mgr/theme-toggle";
import { FieldSeparator } from "@/components/ui/field";
import { ReportingBasisView } from "@/components/mgr/views/reporting-basis";
import { GravityUnitControls } from "@/components/mgr/views/units";

export function SettingsView({
  model,
  breweryForm,
  unitsForm,
  fulfillmentForm,
  aiModelForm,
  reportingBasisForm,
  hrefs = {},
}: {
  model: SettingsViewModel;
  breweryForm?: ReactNode;
  /** Live: GravityUnitForm part="brewery". Inventory draws the chips from model.units. */
  unitsForm?: ReactNode;
  fulfillmentForm?: ReactNode;
  aiModelForm?: ReactNode;
  reportingBasisForm?: ReactNode;
  hrefs?: Partial<Record<"locations" | "team" | "accounting" | "pos" | "chat" | "import" | "water" | "channels", string>>;
}) {
  return (
    <div className="@container flex flex-col gap-3">
      {E.back("More", "Settings", undefined, model.backHref)}
      <section aria-labelledby="settings-connections" className="flex min-w-0 flex-col gap-2 border-b pb-6">
        <h2 id="settings-connections" className="mb-2 font-heading text-xl font-semibold">Connections</h2>
        {E.nav("Accounting", "QuickBooks connection, mappings and payment defaults", "", QuickBooksMark, hrefs.accounting)}
        {E.nav("Point of sale", "Square connection, location mappings, sync and menu", "", SquareMark, hrefs.pos)}
        {E.nav("Chat", navAbout("Chat"), "", SlackMark, hrefs.chat)}
      </section>
      <div className="grid gap-6 @min-[48rem]:grid-cols-[minmax(0,3fr)_minmax(0,2fr)] @min-[48rem]:items-start @min-[48rem]:gap-10">
        <div className="@container flex min-w-0 flex-col gap-2">
          {breweryForm ?? <BrewerySettingsFormView basisLocked={model.hasFiledReports} initial={{ name: model.name, timezone: model.timezone, ttb: model.ttb, phone: model.phone, hours: model.overdueHours, daysToPackage: model.daysToPackage, booksOpenedOn: model.booksOpenedOn, oneWayKegFee: model.oneWayKegFee }} />}
          {unitsForm ?? (model.units && <GravityUnitControls model={model.units} part="brewery" />)}
        </div>
        {/* Side by side on desk, the column gap parts Brewery details from the other two. */}
        <FieldSeparator className="@min-[48rem]:hidden" />
        <div className="flex min-w-0 flex-col gap-6">
          {aiModelForm ?? <AiModelSettingsView value={model.aiModel} models={model.aiModels} />}
          <FieldSeparator />
          {fulfillmentForm ?? <PortalFulfillmentView locations={model.warehouseOptions} currentId={model.warehouseId} />}
        </div>
      </div>
      {model.hasFiledReports ? reportingBasisForm ?? <ReportingBasisView basis={model.booksOpenedOn || null} history={model.basisCorrections ?? []} timeZone={model.timezone} /> : null}
      <section aria-labelledby="settings-people" className="mt-2 flex min-w-0 flex-col gap-2 border-t pt-6">
        <h2 id="settings-people" className="mb-2 font-heading text-xl font-semibold">People and places</h2>
        {E.nav("Team", model.team, "", undefined, hrefs.team)}
        {E.nav("Locations", model.locations, "", undefined, hrefs.locations)}
        {E.nav("Water profiles", WATER_PROFILES_CAPTION, "", undefined, hrefs.water)}
        {E.nav("Sale channels", navAbout("Sale channels"), "", undefined, hrefs.channels)}
        {E.nav("Import", navAbout("Import"), "", undefined, hrefs.import)}
      </section>
      <div className="mt-2 grid gap-6 border-t pt-6 @min-[48rem]:grid-cols-2">
        <section aria-labelledby="settings-appearance">
          <h2 id="settings-appearance" className="mb-4 font-heading text-xl font-semibold">Appearance</h2>
          <ThemeToggle />
        </section>
        <div className="text-sm text-muted-foreground">{E.fld("Deployment", model.deployment)}</div>
      </div>
    </div>
  );
}
