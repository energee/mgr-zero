// scripts/supabase-env.mjs — converts `supabase status -o env` output into the application's modern environment contract.
const chunks = [];
process.stdin.setEncoding("utf8");
for await (const chunk of process.stdin) chunks.push(chunk);
const source = chunks.join("");
const values = new Map();

for (const line of source.split(/\r?\n/)) {
  const separator = line.indexOf("=");
  if (separator === -1) continue;

  const name = line.slice(0, separator);
  const rawValue = line.slice(separator + 1).trim();
  if (!/^[A-Z0-9_]+$/.test(name)) continue;

  let value = rawValue;
  if (rawValue.startsWith('"') && rawValue.endsWith('"')) {
    value = JSON.parse(rawValue);
  }
  values.set(name, value);
}

function required(name) {
  const value = values.get(name);
  if (!value) throw new Error(`supabase status did not provide ${name}`);
  return value;
}

process.stdout.write(
  [
    `NEXT_PUBLIC_SUPABASE_URL=${required("API_URL")}`,
    `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=${required("ANON_KEY")}`,
    `SUPABASE_SECRET_KEY=${required("SERVICE_ROLE_KEY")}`,
  ].join("\n") + "\n"
);
