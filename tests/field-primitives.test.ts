import { readFileSync, readdirSync } from "node:fs";
import { expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { E } from "@/components/mgr/e";

// Exact control exceptions, never a whole-file exemption.
const allowlist: { file: string; match: string; reason: string }[] = [
{"file":"format-rows.tsx","match":"<input type=\"checkbox\" checked={confirmClear} onChange={event => onConfirmClear(event.target.checked)} />","reason":"Explicit confirmation of clearing all contents or materials, not a persistent on/off setting."},
{"file":"me.tsx","match":"<input type=\"hidden\" name=\"breweryId\" value={brewery.id} />","reason":"Hidden brewery identity submitted by the switch form."},
{"file":"create-brewery.tsx","match":"<input type=\"hidden\" name=\"requestId\" value={requestId} />","reason":"Hidden actor/request identity submitted by the creation form."},
{"file":"create-brewery.tsx","match":"<input type=\"hidden\" name=\"actorId\" value={actorId} />","reason":"Hidden actor/request identity submitted by the creation form."},
{"file":"import.tsx","match":"<input type=\"file\" accept=\".csv,text/csv\" className=\"sr-only\" onChange={event => onFile?.(event.target.files?.[0])} />","reason":"File upload supplies a File, not a string value."},
{"file":"route.tsx","match":"<input type=\"checkbox\" className=\"size-4 shrink-0 accent-primary\" aria-label={row.title} checked={selected} disabled={busy || row.locked} onChange={event => change({ selection: toggleRouteStop(value.selection, row.key, event.target.checked) })} />","reason":"Checkbox selects a route stop; E.edit and E.pick edit string values."},
{"file":"pos.tsx","match":"<input type=\"checkbox\" className=\"size-5\" checked={website} onChange={event => { if (onWebsite) void reconcileBooleanChange(website, event.target.checked, onWebsite, setWebsite); }} disabled={!onWebsite || busy || !item.available} />","reason":"Checkbox publishes a website item through an asynchronous boolean action."},
{"file":"composer.tsx","match":"<Textarea\n            ref={promptRef}\n            aria-label=\"Ask MGR\"\n            placeholder=\"Ask MGR about inventory, orders, production…\"\n            disabled={disabled}\n            value={value}\n            onChange={onChange ? (event) => onChange(event.target.value) : undefined}\n            rows={2}\n            maxLength={4000}\n            className=\"min-h-14 resize-none border-0 bg-transparent px-3 py-2 shadow-none focus-visible:ring-0\"\n            onKeyDown={onSubmit ? (event) => {\n              if (isSendKey(event)) {\n                event.preventDefault();\n                const message = value?.trim();\n                if (message) onSubmit(message);\n              }\n            } : undefined}\n          />","reason":"Multiline chat composer preserves Enter/Shift+Enter submission behavior."},
{"file":"question-invoice.tsx","match":"<Textarea aria-label=\"What’s wrong with this invoice?\" maxLength={2000} required value={onBody ? body : undefined} defaultValue={onBody ? undefined : body} onChange={event => onBody?.(event.target.value)} />","reason":"Multiline free-text invoice question."},
{"file":"weekly-count.tsx","match":"<Textarea id={`correction-reason-${state.countId}`} value={state.reason} disabled={locked} onChange={event => { const value = event.target.value; if (onReason) onReason(value); else setInternalState(current => updateCorrectionReason(current, value)); }} required />","reason":"Multiline free-text correction reason."},
{"file":"new-order.tsx","match":"<CommandInput placeholder=\"Search SKUs\" />","reason":"Searchable SKU picker opens the existing entity-selection surface."},
{"file":"ai-model-settings.tsx","match":"<ComboboxInput id=\"brewery-ai-model\" placeholder=\"Search models…\" aria-invalid={Boolean(error) || undefined}>","reason":"Searchable model picker includes provider and price descriptions."},
{"file":"brewery-settings-form.tsx","match":"<ComboboxInput id={`${id}-timezone`} placeholder=\"Search timezones…\" required />","reason":"Searchable timezone combobox preserves its full timezone list."},
];

const appDebt = [
  "app/(auth)/accept/page.tsx",
  "app/(auth)/reset/page.tsx",
  "app/(app)/customers/customer-form.tsx",
  "app/(app)/settings/accounting/qbo-controls.tsx",
  "app/(app)/packaging/[id]/run-actions.tsx",
  "app/(app)/work/deliveries/[id]/delivered-form.tsx",
  "app/(app)/pricing/group-form.tsx",
  "app/(app)/kegs/event-form.tsx",
  "app/(app)/replenishment/replenish-form.tsx",
  "app/(app)/kegs/pool-form.tsx",
  "app/(app)/replenishment/quantity-form.tsx",
  "app/(app)/locations/location-form.tsx",
  "app/(app)/locations/move-stock-form.tsx",
  "app/(app)/orders/[id]/lifecycle-buttons.tsx",
  "app/(app)/orders/[id]/confirm/confirm-buttons.tsx",
  "app/(app)/catalog/pour-form.tsx",
  "app/(app)/compliance/[month]/file-button.tsx",
  "app/(app)/compliance/[month]/loss-review-form.tsx",
  "app/(app)/catalog/formats/[id]/rows-form.tsx",
];

it("shared views draw fields with E primitives", () => {
  const violations: string[] = [];
  for (const file of readdirSync("components/mgr/views").filter(file => file.endsWith(".tsx"))) {
    let source = readFileSync(`components/mgr/views/${file}`, "utf8");
    for (const entry of allowlist.filter(entry => entry.file === file)) {
      expect(source, `stale exception: ${file}: ${entry.reason}`).toContain(entry.match);
      source = source.replace(entry.match, "");
    }
    for (const match of source.matchAll(/<select\b|<Input\b|<input\b|type="number"/g)) {
      violations.push(`${file}:${source.slice(0, match.index).split("\n").length}: ${match[0]}`);
    }
  }
  expect(violations).toEqual([]);
});

it.skip.each(appDebt)("out-of-scope app field debt: %s", () => {});

it("reports the out-of-scope app debt", () => {
  console.info(`App field debt (informational; not converted):\n${appDebt.join("\n")}`);
});

it("keeps blank numbers, constraints, and accessible names in the shared stepper", () => {
  const html = renderToStaticMarkup(E.edit("Amount", "", "number", undefined, {
    onChange: () => {}, min: 0.01, max: 7, step: 0.01, required: true,
    "aria-label": "Water amount", "aria-invalid": true, disabled: true,
  }));
  for (const attribute of ['value=""', 'min="0.01"', 'max="7"', 'step="0.01"', 'required=""', 'disabled=""', 'aria-label="Water amount"', 'aria-invalid="true"']) expect(html).toContain(attribute);
  expect(html).toContain("Decrease");
  expect(html).toContain("Increase");
  expect(html).toContain("appearance:textfield");
  expect(html).toContain("webkit-inner-spin-button");
  expect(renderToStaticMarkup(E.edit("Optional amount", "", "number"))).toContain('value=""');
  const bounded = renderToStaticMarkup(E.stq(0, "Count", { value: "0", onChange: () => {}, min: 0, max: 10 }));
  expect(bounded).toContain('required=""');
  expect(bounded).toMatch(/aria-label="Decrease"[^>]*disabled=""/);
});

it("keeps named uncontrolled form fields and suggestions", () => {
  const html = renderToStaticMarkup(E.edit("Timezone", "America/Denver", "text", ["America/Denver"], { name: "timezone", required: true }));
  expect(html).toContain('name="timezone"');
  expect(html).toContain('value="America/Denver"');
  expect(html).toContain("datalist");
});

it("renders the empty option label and keeps the required select value empty", () => {
  const html = renderToStaticMarkup(E.pick("Material", "", [{ value: "", label: "Choose material" }, { value: "m1", label: "Citra" }], { required: true, onChange: () => {} }));
  expect(html).toContain("Choose material");
  expect(html).toContain('value=""');
  expect(html).toContain('required=""');
});
