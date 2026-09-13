import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Gitignored local checkouts and remember-plugin scratch — not app source.
    ".agents/worktrees/**",
    ".remember/**",
  ]),
  {
    // Iron rule 4 (.agents/ARCHITECTURE.md): the service-role client bypasses RLS and
    // is only allowed in the RLS-checking integration-token boundary, durable
    // invitation boundary, chat internal-job owner, and safe website-menu projection.
    // Tests and scripts run outside request paths and are exempt below.
    files: ["app/**", "lib/**", "components/**", "proxy.ts"],
    ignores: ["lib/supabase/admin.ts", "lib/supabase/integration-tokens.ts", "lib/supabase/invites.ts", "lib/supabase/public-menu.ts", "lib/chat/jobs.ts"],
    rules: {
      "no-restricted-imports": ["error", {
        paths: [{ name: "@/lib/supabase/admin", message: "createAdminClient() bypasses RLS. Only the named service boundaries in .agents/ARCHITECTURE.md iron rule 4 may import it." }],
      }],
    },
  },
  {
    // Issue #253: one date format per context, from lib/date-format.ts. A bare
    // new Date(x).toLocaleString() renders "9/13/2026, 2:46:03 AM" — the format
    // the QA sweep kept finding. Calls that pass explicit options (a weekday,
    // a number's fraction digits) are deliberate and unaffected.
    files: ["app/**", "lib/**", "components/**"],
    ignores: ["components/ui/**"],
    rules: {
      "no-restricted-syntax": ["error", {
        selector: "CallExpression[arguments.length=0][callee.object.type='NewExpression'][callee.object.callee.name='Date'][callee.property.name=/^toLocale(Date|Time)?String$/]",
        message: "Use formatDate / formatDateTime / formatDayHeader from @/lib/date-format so every surface reads the same (#253).",
      }],
    },
  },
  {
    // Tests and seed scripts cast Supabase responses freely; `any` is fine there.
    files: ["tests/**", "scripts/**"],
    rules: { "@typescript-eslint/no-explicit-any": "off" },
  },
]);

export default eslintConfig;
