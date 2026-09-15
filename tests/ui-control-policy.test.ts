import { ESLint } from "eslint";
import { expect, it } from "vitest";

const eslint = new ESLint();
const filePath = "components/mgr/views/control-policy-probe.tsx";

it.each(['<select />', '<input type="number" />', '<Input type="number" />', '<Input type={"number"} />'])("rejects hand-built screen controls: %s", async control => {
  const [result] = await eslint.lintText(`export function Probe() { return ${control}; }`, { filePath });
  expect(result.messages.some(message => message.ruleId === "no-restricted-syntax" && message.message.includes("Use E."))).toBe(true);
});

it("allows shared E fields", async () => {
  const [result] = await eslint.lintText('import { E } from "@/components/mgr/e"; export function Probe() { return <>{E.pick("Package", "", [])}{E.edit("Quantity", "1", "number")}</>; }', { filePath });
  expect(result.errorCount).toBe(0);
});
