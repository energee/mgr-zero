// #760: destructive and irreversible actions open the shared confirm sheet
// (ConfirmDeleteControl) instead of running their command on one click. A
// static render shows only the sheet trigger (aria-haspopup="dialog"); the
// command lives in onDelete, which runs from the sheet's confirm button.
import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { ConfirmDeleteControl } from "../components/mgr/views/confirm-delete";
import { FileSnapshotControl } from "../components/mgr/views/file-snapshot";
import { TeamMemberView } from "../components/mgr/views/team-controls";
import { PriceGroupView } from "../components/mgr/views/price-group";
import { BinView } from "../components/mgr/views/bin";
import { DeleteChannelControl } from "../components/mgr/views/sale-channels";
import { priceGroupTwo } from "../lib/mgr/fixtures/pricing";
import { toPriceGroupViewProps } from "../lib/mgr/price-group-view";
import { binCold } from "../lib/mgr/fixtures/locations";
import { toBinViewProps } from "../lib/mgr/bin-view";
import { MonthlyComplianceView } from "../components/mgr/views/monthly-compliance";
import { monthlyComplianceAugust } from "../lib/mgr/fixtures/monthly-compliance";
import { toMonthlyComplianceViewProps } from "../lib/mgr/monthly-compliance-view";

const buttons = (html: string) => html.match(/<button[^>]*>.*?<\/button>/g) ?? [];
const DISABLED = /\sdisabled=""/;

describe("ConfirmDeleteControl", () => {
  it("renders only a dialog trigger, so the command waits for the confirm step", () => {
    const onDelete = vi.fn(async () => true);
    const html = renderToStaticMarkup(createElement(ConfirmDeleteControl, { title: "Delete Wholesale", triggerLabel: "Delete", name: "Delete it?", warning: "Refused when in use.", onDelete }));
    const [trigger, ...rest] = buttons(html);
    expect(rest).toEqual([]);
    expect(trigger).toContain('aria-haspopup="dialog"');
    // The visible verb stays short; the accessible name names the row.
    expect(trigger).toContain('aria-label="Delete Wholesale"');
    expect(trigger).toMatch(/>Delete<\/button>$/);
    expect(onDelete).not.toHaveBeenCalled();
  });

  it("draws an irreversible tone and can hold the trigger disabled", () => {
    const html = renderToStaticMarkup(createElement(ConfirmDeleteControl, { title: "Save filed snapshot", tone: "irreversible", disabled: true, name: "File it?", warning: "Once." }));
    const [trigger] = buttons(html);
    expect(trigger).toContain('data-variant="irreversible"');
    expect(trigger).toMatch(DISABLED);
  });
});

describe("Save filed snapshot", () => {
  it("is one shared confirm control in the inventory frame and on the live page", () => {
    const html = renderToStaticMarkup(createElement(MonthlyComplianceView, { model: toMonthlyComplianceViewProps(monthlyComplianceAugust) }));
    const save = buttons(html).find(button => button.includes("Save filed snapshot"));
    expect(save).toContain('aria-haspopup="dialog"');
    expect(save).toContain('data-variant="irreversible"');
    const live = readFileSync("app/(app)/compliance/[period]/file-button.tsx", "utf8");
    expect(live).toMatch(/<FileSnapshotControl\b/);
    expect(live).toMatch(/onDelete=\{\(\) => run\("file_compliance_report"/);
  });

  it("says the filing is once and is not transmitted", () => {
    const html = renderToStaticMarkup(createElement(FileSnapshotControl, {}));
    expect(html).toContain('aria-haspopup="dialog"');
    expect(html).not.toMatch(DISABLED);
  });
});

it("Remove member confirms before revoke_staff", () => {
  const onRemove = vi.fn(async () => true);
  const html = renderToStaticMarkup(createElement(TeamMemberView, { name: "@dave", email: "dave@example.com", savedRole: "brewer", onRemove }));
  const remove = buttons(html).find(button => button.includes("Remove dave"));
  expect(remove).toContain('aria-haspopup="dialog"');
  expect(onRemove).not.toHaveBeenCalled();
  expect(readFileSync("app/(app)/settings/team/member-form.tsx", "utf8")).toMatch(/onRemove=\{\(\) => form\.run\("revoke_staff"/);
});

describe("row deletes go through the confirm sheet", () => {
  it("the Price group and Bin inventory frames draw confirm triggers, not one-click verbs", () => {
    const group = renderToStaticMarkup(createElement(PriceGroupView, { model: { ...toPriceGroupViewProps(priceGroupTwo), pours: [{ id: "p1", name: "14 oz pour", ounces: "14" }] } }));
    for (const label of ["Remove 14 oz pour", `Delete ${priceGroupTwo.groups.find(g => g.id === priceGroupTwo.groupId)!.name}`]) {
      expect(buttons(group).find(button => button.includes(`aria-label="${label}"`))).toContain('aria-haspopup="dialog"');
    }
    const bin = renderToStaticMarkup(createElement(BinView, { model: toBinViewProps(binCold) }));
    expect(buttons(bin).find(button => button.includes(`aria-label="Remove ${binCold.name}"`))).toContain('aria-haspopup="dialog"');
    const channel = renderToStaticMarkup(createElement(DeleteChannelControl, { name: "Export" }));
    expect(buttons(channel)[0]).toContain('aria-label="Delete Export"');
  });

  it.each([
    ["app/(app)/settings/channels/page.tsx", "delete_sale_channel", /control=\{DeleteChannelControl\} command="delete_sale_channel"/],
    ["app/(app)/pricing/group-form.tsx", "delete_format", /<RemovePourControl[^]*?onDelete=\{\(\) => form\.run\("delete_format"/],
    ["app/(app)/pricing/group-form.tsx", "delete_price_group", /<DeletePriceGroupControl[^]*?onDelete=\{\(\) => form\.run\("delete_price_group"/],
    ["app/(app)/locations/bin-form.tsx", "delete_bin", /<RemoveBinControl[^]*?onDelete=\{\(\) => form\.run\("delete_bin"/],
    ["app/(app)/pricing/price-cell-form.tsx", "clear_channel_price", /<ConfirmDeleteControl[^]*?onDelete=\{\(\) => form\.run\("clear_channel_price"/],
  ])("%s runs %s only after confirming", (path, command, binding) => {
    const src = readFileSync(path, "utf8");
    expect(src).toMatch(binding);
    expect(src).not.toMatch(new RegExp(`onClick=\\{[^}]*run\\("${command}"`));
  });

  it("names the row on Edit and on a price cell", () => {
    const source = (path: string) => readFileSync(path, "utf8");
    expect(source("app/(app)/locations/bin-form.tsx")).toMatch(/aria-label=\{bin \? `Edit \$\{bin\.name\}`/);
    expect(source("app/(app)/settings/channels/channel-form.tsx")).toMatch(/aria-label=\{isEdit \? `Edit \$\{channel\.name\}`/);
    expect(source("app/(app)/pricing/price-cell-form.tsx")).toMatch(/className="sr-only"/);
    expect(source("components/mgr/command-form.tsx")).toMatch(/aria-label=\{name \? `Edit \$\{name\}`/);
  });
});
