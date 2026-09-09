import { beforeEach, expect, it, vi } from "vitest";

const subprocess = vi.hoisted(() => ({ calls: [] as unknown[][], failure: undefined as unknown, stdout: "" }));
vi.mock("node:child_process", () => ({
  execFileSync: (...args: unknown[]) => {
    subprocess.calls.push(args);
    if (subprocess.failure) throw subprocess.failure;
    return subprocess.stdout;
  },
}));

const { DB, sql } = await import("./helpers");

beforeEach(() => {
  subprocess.calls = [];
  subprocess.failure = undefined;
  subprocess.stdout = "";
});

it("streams large SQL to fail-fast psql without putting it in argv", () => {
  const query = `select '${"x".repeat(200_000)}'`;
  subprocess.stdout = "first\n\nsecond\n";

  expect(sql(query, true)).toEqual(["first", "second"]);
  expect(subprocess.calls[0]).toEqual([
    "psql",
    [DB, "-v", "ON_ERROR_STOP=1", "--single-transaction", "-Atq", "-f", "-"],
    { encoding: "utf8", input: query },
  ]);
});

it("preserves SQLSTATE verbosity without wrapping explicit transaction boundaries", () => {
  subprocess.stdout = "";

  sql("begin; select broken(); commit", false, "sqlstate");
  expect(subprocess.calls[0]).toEqual([
    "psql",
    [DB, "-v", "VERBOSITY=sqlstate", "-v", "ON_ERROR_STOP=1", "-At", "-f", "-"],
    { encoding: "utf8", input: "begin; select broken(); commit" },
  ]);
});

it("rethrows the original psql error with its stderr intact", () => {
  const failure = Object.assign(new Error("psql failed"), { stderr: "ERROR:  23514" });
  subprocess.failure = failure;

  let thrown: unknown;
  try { sql("select broken()", false, "sqlstate"); } catch (error) { thrown = error; }
  expect(thrown === failure).toBe(true);
});
