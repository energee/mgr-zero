import { readFileSync } from "node:fs";
import { ESLint } from "eslint";
import tseslint from "typescript-eslint";
import { expect, it } from "vitest";

// These virtual JSX probes exercise syntax rules, without a file in the TS project.
const eslint = new ESLint({ overrideConfig: tseslint.configs.disableTypeChecked });
const filePath = "components/mgr/views/control-policy-probe.tsx";

it.each(['<select />', '<input type="number" />', '<Input type="number" />', '<Input type={"number"} />'])("rejects hand-built screen controls: %s", async control => {
  const [result] = await eslint.lintText(`export function Probe() { return ${control}; }`, { filePath });
  expect(result.messages.some(message => message.ruleId === "no-restricted-syntax" && message.message.includes("Use E."))).toBe(true);
});

it("allows shared E fields", async () => {
  const [result] = await eslint.lintText('import { E } from "@/components/mgr/e"; export function Probe() { return <>{E.pick("Package", "", [])}{E.edit("Quantity", "1", "number")}</>; }', { filePath });
  expect(result.errorCount).toBe(0);
});

// The two documented exceptions are line-level disables, not rule gaps:
// each file lints clean as committed and fails once its disable lines are removed.
it.each(["components/mgr/qty.tsx", "components/mgr/venue.tsx"])("keeps the documented native-control exception in %s", async file => {
  const source = readFileSync(file, "utf8");
  const restricted = async (text: string) => (await eslint.lintText(text, { filePath: file }))[0].messages.filter(message => message.ruleId === "no-restricted-syntax" && message.message.includes("Use E."));
  expect(await restricted(source)).toEqual([]);
  expect((await restricted(source.replace(/^.*eslint-disable-next-line no-restricted-syntax.*$/gm, ""))).length).toBeGreaterThan(0);
});

// Lint is the one owner of the native select / numeric input ban; the
// source scan in field-primitives.test.ts must not duplicate it (#702).
it("leaves select and number bans to lint alone", () => {
  const scan = readFileSync("tests/field-primitives.test.ts", "utf8");
  expect(scan).not.toContain("<select\\b");
  expect(scan).not.toContain('type="number"/');
});
