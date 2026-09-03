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
    // is only allowed in the RLS-checking integration-token boundary and the chat
    // internal-job owner (lib/chat/jobs.ts).
    // Tests and scripts run outside request paths and are exempt below.
    files: ["app/**", "lib/**", "components/**", "proxy.ts"],
    ignores: ["lib/supabase/admin.ts", "lib/supabase/integration-tokens.ts", "lib/chat/jobs.ts"],
    rules: {
      "no-restricted-imports": ["error", {
        paths: [{ name: "@/lib/supabase/admin", message: "createAdminClient() bypasses RLS. Only lib/supabase/integration-tokens.ts and lib/chat/jobs.ts (chat internal jobs: named service_role RPCs, no user) may import it — see .agents/ARCHITECTURE.md iron rule 4." }],
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
