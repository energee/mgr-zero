// lib/commands/format-command-error.ts — turns the registry's
// "validation failed: <zod issue JSON>" message into per-field sentences a
// person can read (audit 2026-09-05, rendered-ux-perf #3). Used by
// use-command-form.ts before an error reaches the form. Anything that is not a
// zod issue array passes through untouched.

type Issue = { code?: string; format?: string; path?: (string | number)[]; message?: string };

const PREFIX = "validation failed: ";

export function formatCommandError(message: string): string {
  if (!message.startsWith(PREFIX)) return message;
  let issues: unknown;
  try {
    issues = JSON.parse(message.slice(PREFIX.length));
  } catch {
    return message;
  }
  if (!Array.isArray(issues) || issues.length === 0) return message;
  return (issues as Issue[]).map(sentence).join(" ");
}

function sentence(issue: Issue): string {
  const field = label(issue.path ?? []);
  if (issue.code === "invalid_format" && issue.format === "uuid") return `${field} is required.`;
  if (issue.code === "too_small" && issue.message?.includes("array")) return `${field}: add at least one.`;
  const detail = (issue.message ?? "invalid").replace(/^Too small: /, "").replace(/^Too big: /, "");
  return `${field}: ${detail}.`;
}

// ["lines", 0, "qty"] → "Line 1 qty"; "customerId" → "Customer".
function label(path: (string | number)[]): string {
  if (path.length === 0) return "Input";
  const words = path.map((seg) =>
    typeof seg === "number"
      ? String(seg + 1)
      : seg.replace(/Id$/, "").replace(/([a-z])([A-Z])/g, "$1 $2").toLowerCase(),
  );
  // Singularise a collection name that is followed by an index ("lines", 0 → "line 1").
  for (let i = 0; i < words.length - 1; i++) {
    if (/^\d+$/.test(words[i + 1]) && words[i].endsWith("s")) words[i] = words[i].slice(0, -1);
  }
  const text = words.join(" ");
  return text.charAt(0).toUpperCase() + text.slice(1);
}
