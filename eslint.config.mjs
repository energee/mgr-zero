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
  ]),
  {
    // Iron rule 4 (.agents/ARCHITECTURE.md): the service-role client bypasses RLS and
    // is only allowed in invites and the RLS-checking integration-token boundary.
    // Tests and scripts run outside request paths and are exempt below.
    files: ["app/**", "lib/**", "components/**", "proxy.ts"],
    ignores: ["lib/commands/invites.ts", "lib/supabase/admin.ts", "lib/supabase/integration-tokens.ts"],
    rules: {
      "no-restricted-imports": ["error", {
        paths: [{ name: "@/lib/supabase/admin", message: "createAdminClient() bypasses RLS. Only lib/commands/invites.ts and lib/supabase/integration-tokens.ts may import it — see .agents/ARCHITECTURE.md iron rule 4." }],
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
