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
    ".local/**",
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
    // lib/mgr/money.ts is the owner of the money rule; lib/qbo.ts sends a
    // decimal string to QuickBooks rather than drawing one for an operator.
    ignores: ["components/ui/**", "lib/mgr/money.ts", "lib/qbo.ts"],
    rules: {
      "no-restricted-syntax": ["error", {
        selector: "CallExpression[arguments.length=0][callee.object.type='NewExpression'][callee.object.callee.name='Date'][callee.property.name=/^toLocale(Date|Time)?String$/]",
        message: "Use formatDate / formatDateTime / formatDayHeader from @/lib/date-format so every surface reads the same (#253).",
      }, {
        // Money reads the same everywhere only if one module draws it:
        // lib/mgr/money.ts (`money` for display, `dollarsInput` for a field's
        // text). A local `(cents / 100).toFixed(2)` silently drops the
        // thousands separator and the credit memo's minus sign.
        selector: "CallExpression[callee.property.name='toFixed'][arguments.0.value=2][callee.object.type='BinaryExpression'][callee.object.operator='/'][callee.object.right.value=100]",
        message: "Use money() / dollarsInput() from @/lib/mgr/money so every surface reads the same.",
      }, {
        selector: "JSXOpeningElement[name.name='select']",
        message: "Use E.pick from @/components/mgr/e instead of a native select.",
      }, {
        selector: "JSXOpeningElement:has(JSXAttribute[name.name='type'][value.value='number']), JSXOpeningElement:has(JSXAttribute[name.name='type'] > JSXExpressionContainer > Literal[value='number'])",
        message: "Use E.edit(label, value, 'number') or E.volume from @/components/mgr/e instead of a standalone numeric input.",
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
