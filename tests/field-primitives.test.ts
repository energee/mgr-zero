import { readFileSync, readdirSync } from "node:fs";
import { expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";
import ts from "typescript";
import { E } from "@/components/mgr/e";
import { Qty } from "@/components/mgr/qty";

// Exact control exceptions, never a whole-file exemption.
const allowlist: { file: string; match: string; reason: string }[] = [
{"file":"format-rows.tsx","match":"<input type=\"checkbox\" checked={confirmClear} onChange={event => onConfirmClear(event.target.checked)} />","reason":"Explicit confirmation of clearing all contents or materials, not a persistent on/off setting."},
{"file":"account-invitations.tsx","match":"<input type=\"hidden\" name=\"inviteId\" value={invite.id} />","reason":"Hidden invitation identity submitted by the explicit consent form."},
{"file":"agent-consent.tsx","match":"<input type=\"hidden\" name=\"authorizationId\" value={authorizationId} />","reason":"Hidden OAuth request id submitted with Connect or Deny."},
{"file":"connected-agents.tsx","match":"<input type=\"hidden\" name=\"clientId\" value={agent.clientId} />","reason":"Hidden agent id submitted with Remove."},
{"file":"me.tsx","match":"<input type=\"hidden\" name=\"breweryId\" value={brewery.id} />","reason":"Hidden brewery identity submitted by the switch form."},
{"file":"create-brewery.tsx","match":"<input type=\"hidden\" name=\"requestId\" value={requestId} />","reason":"Hidden actor/request identity submitted by the creation form."},
{"file":"create-brewery.tsx","match":"<input type=\"hidden\" name=\"actorId\" value={actorId} />","reason":"Hidden actor/request identity submitted by the creation form."},
{"file":"route.tsx","match":"<input type=\"checkbox\" className=\"size-4 shrink-0 accent-primary\" aria-label={row.title} checked={selected} disabled={busy || row.locked} onChange={event => change({ selection: toggleRouteStop(value.selection, row.key, event.target.checked) })} />","reason":"Checkbox selects a route stop; E.edit and E.pick edit string values."},
{"file":"pos.tsx","match":"<input type=\"checkbox\" className=\"size-5\" checked={website} onChange={event => { if (onWebsite) void reconcileBooleanChange(website, event.target.checked, onWebsite, setWebsite); }} disabled={!onWebsite || busy || !item.available} />","reason":"Checkbox publishes a website item through an asynchronous boolean action."},
{"file":"question-invoice.tsx","match":"<Textarea aria-label=\"What’s wrong with this invoice?\" maxLength={MAX_BODY} required value={onBody ? body : undefined} defaultValue={onBody ? undefined : body} onChange={event => onBody?.(event.target.value)} />","reason":"Multiline free-text invoice question."},
{"file":"weekly-count.tsx","match":"<Textarea id={`correction-reason-${state.countId}`} value={state.reason} disabled={locked} onChange={event => { const value = event.target.value; if (onReason) onReason(value); else setInternalState(current => updateCorrectionReason(current, value)); }} required />","reason":"Multiline free-text correction reason."},
{"file":"ai-model-settings.tsx","match":"<ComboboxInput id=\"brewery-ai-model\" placeholder=\"Search models…\" aria-invalid={Boolean(error) || undefined}>","reason":"Searchable model picker includes provider and price descriptions."},
];

const appDebt = [
  "app/(auth)/accept/page.tsx",
  "app/(auth)/reset/page.tsx",
  "app/(app)/customers/customer-form.tsx",
  "app/(app)/settings/accounting/qbo-controls.tsx",
  "app/(app)/packaging/[id]/run-actions.tsx",
  "app/(app)/work/deliveries/[id]/delivered-form.tsx",
  "app/(app)/pricing/group-form.tsx",
  "app/(app)/replenishment/replenish-form.tsx",
  "app/(app)/orders/[id]/lifecycle-buttons.tsx",
  "app/(app)/orders/[id]/confirm/confirm-buttons.tsx",
  "app/(app)/catalog/pour-form.tsx",
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
    // Native selects and numeric inputs are also banned by eslint.config.mjs.
    const parsed = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
    let fileUploads = 0;
    function visit(node: ts.Node) {
      if (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) {
        const tag = node.tagName.getText(parsed);
        if (tag === "input" || tag === "Input") {
          const isFileUpload = file === "import.tsx" && tag === "input" && node.attributes.properties.some(attribute =>
            ts.isJsxAttribute(attribute) && attribute.name.getText(parsed) === "type" &&
            attribute.initializer && ts.isStringLiteral(attribute.initializer) && attribute.initializer.text === "file");
          // File uploads supply a File, not the string value E.edit accepts.
          if (isFileUpload) fileUploads++;
          else violations.push(`${file}:${parsed.getLineAndCharacterOfPosition(node.getStart(parsed)).line + 1}: ${tag}`);
        }
      }
      ts.forEachChild(node, visit);
    }
    visit(parsed);
    if (file === "import.tsx") expect(fileUploads).toBe(1);
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

// A dense sheet of short numbers (Recipe's process numbers) drops the −/+ buttons, never the input's rules.
// The − and + buttons are part of the number control, so they carry its border (--input) in the light theme too:
// an outline button's own light border is the fainter page border, which left the box darker than its buttons.
it("draws the stepper's buttons with the control border, enabled or disabled", () => {
  const stepper = renderToStaticMarkup(E.edit("Quantity per bbl (lb)", "40.9", "number", undefined, { min: 0, onChange: () => {} }));
  const buttons = stepper.match(/<button[^>]*aria-label="(Decrease|Increase)"[^>]*>/g) ?? [];
  expect(buttons).toHaveLength(2);
  for (const button of buttons) {
    expect(button).toMatch(/class="[^"]*(?<![:\w-])border-input[^"]*"/);
    expect(button).toContain("disabled:border-input");
    expect(button).not.toMatch(/(?<![:\w-])border-border/);
  }
});

it("draws a compact number field as the same input under a small label, without the stepper's buttons", () => {
  const compact = renderToStaticMarkup(E.edit("Boil time min", "1e3", "number", undefined, { compact: true, min: 1, step: 1, onChange: () => {} }));
  expect(compact).not.toMatch(/aria-label="(Decrease|Increase)"/);
  expect(compact).toMatch(/<label[^>]*text-xs[^>]*>Boil time min<\/label>/);
  expect(compact).toMatch(/<input[^>]*type="number"[^>]*aria-label="Boil time min"/);
  expect(compact).toMatch(/min="1"/);
  expect(compact).toMatch(/step="1"/);
  // Exponent notation is still refused under the field.
  expect(compact).toContain('data-slot="field-error"');
  expect(compact).not.toMatch(/data-orientation="horizontal"/);
  // Every other caller keeps the stepper as it was.
  const stepper = renderToStaticMarkup(E.edit("Boil time min", "60", "number"));
  expect(stepper).toMatch(/aria-label="Decrease"[\s\S]*aria-label="Increase"/);
  expect(stepper).not.toMatch(/<label[^>]*text-xs/);
});

it("explains exponent notation on both numeric primitives", () => {
  for (const field of [E.edit("Amount", "1e3", "number"), createElement(Qty, { value: "1e3", unit: "units", label: "Quantity" })]) {
    const html = renderToStaticMarkup(field);
    expect(html).toContain('data-slot="field-error"');
    expect(html).toContain('aria-invalid="true"');
    expect(html).toContain('aria-describedby="');
  }
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
