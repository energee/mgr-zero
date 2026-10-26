import { existsSync, readFileSync } from "node:fs";
import { resolveTestEnv } from "./scripts/test-env.mjs";
import { configDefaults, defineConfig } from "vitest/config";
import { loadEnv } from "vite";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = fileURLToPath(new URL(".", import.meta.url));
// The screen-only proof contract, pure form checks, and harness regressions.
// Every unlisted file stays in the guarded database project.
const pureTests = [
  "tests/mgr-screens.test.ts",
  "tests/tap-coverage.test.ts",
  "tests/screen-links.test.ts",
  "tests/theme-contrast.test.ts",
  "tests/screen-persona.test.ts",
  "tests/design-docs.test.ts",
  "tests/docs.test.ts",
  "tests/tap-board-state.test.ts",
  "tests/tap-board-view.test.ts",
  "tests/date-format.test.ts",
  "tests/chat-failure.test.ts",
  "tests/monthly-compliance-view.test.ts",
  "tests/compliance-more-copy.test.ts",
  "tests/compliance-view.test.ts",
  "tests/more-consistency.test.ts",
  "tests/price-group-suggestion.test.ts",
  "tests/compliance-period.test.ts",
  "tests/reporting-basis-view.test.ts",
  "tests/confirm-destructive.test.ts",
  "tests/disabled-action-reasons.test.ts",
  "tests/screen-view-composition.test.ts",
  "tests/brand-selling-setup.test.ts",
  "tests/catalog-sku-redirects.test.ts",
  "tests/brand-sells-view.test.ts",
  "tests/catalog-view.test.ts",
  "tests/cola-review.test.ts",
  "tests/ttb-colas.test.ts",
  "tests/pour-sku-catalog.test.ts",
  "tests/app-screen-parity.test.ts",
  "tests/field-number-notation.test.ts",
  "tests/field-validation-followup.test.ts",
  "tests/settings-field-validation.test.ts",
  "tests/input-field-presentation.test.ts",
  "tests/quantity-field-validation.test.ts",
  "tests/quantity-field-blur.test.ts",
  "tests/quantity-form-submission.test.ts",
  "tests/water-profile-submission.test.ts",
  "tests/water-profiles-view.test.ts",
  "tests/location-team-consistency.test.ts",
  "tests/required-text-submission.test.ts",
  "tests/pricing-view.test.ts",
  "tests/auth-page-metadata.test.ts",
  "tests/shell-view.test.ts",
  "tests/route-error.test.ts",
  // Entry rendering and Auth-boundary tests use fixtures or explicit Auth mocks, not a database.
  "tests/entry-email-link.test.ts",
  "tests/invite-entry-view.test.ts",
  "tests/password-page.test.ts",
  "tests/password-signout-outcome.test.ts",
  "tests/auth-actions.test.ts",
  "tests/qbo-pay-route.test.ts",
  "tests/staff-login-return.test.ts",
  "tests/proxy.test.ts",
  "tests/register-cell-keys.test.ts",
  "tests/invite-errors.test.ts",
  "tests/command-field-shapes.test.ts",
  "tests/record-table.test.ts",
  "tests/integration-connect-availability.test.ts",
  "tests/invoices-view.test.ts",
  "tests/accounting-view.test.ts",
  "tests/pos-ui.test.ts",
  "tests/e-hint-roles.test.ts",
  "tests/import-csv.test.ts",
  "tests/import-view.test.ts",
  "tests/composer.test.ts",
  "tests/composer-proposal-dismiss.test.ts",
  "tests/orders-list-view.test.ts",
  "tests/field-primitives.test.ts",
  "tests/migrations-applied.test.ts",
  "tests/test-db-schema-guard.test.ts",
  "tests/test-db-selection.test.ts",
  "tests/record-page-titles.test.ts",
  "tests/detail-not-found-pages.test.ts",
  "tests/priced-sku-feedback.test.ts",
  "tests/order-pick-pages.test.ts",
  "tests/edit-draft-page.test.ts",
  "tests/menu-item-not-found.test.ts",
  "tests/app-screen-parity.test.ts",
  "tests/screen-view-composition.test.ts",
  "tests/production-view.test.ts",
  "tests/kegs-view.test.ts",
  "tests/batch-completion-form-state.test.ts",
  "tests/compliance-view.test.ts",
  "tests/shipment-parity.test.ts",
  "tests/order-sheets-view.test.ts",
];

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(projectRoot, "."),
      // Resolved, not a relative path: a worktree's node_modules is empty and
      // Bun walks up to the main checkout's.
      "server-only": createRequire(import.meta.url).resolve("next/dist/compiled/server-only/empty.js"),
    },
  },
  test: {
    projects: [
      { extends: true, test: { name: "pure", include: pureTests } },
      {
        extends: true,
        test: {
          name: "database",
          include: ["tests/**/*.test.ts"],
          exclude: [...configDefaults.exclude, ...pureTests],
          globalSetup: ["tests/test-db-lock.setup.ts"],
        },
      },
    ],
    testTimeout: 20000,
    // Lock-wait tests poll pg_stat_activity until a second backend is parked;
    // under CI shard load that can take past expect.poll's 1 s default (#1245).
    expect: { poll: { timeout: 10000 } },
    fileParallelism: false,
    // Mode "test" layers .env.test.local (written by scripts/test-db.sh: the
    // throwaway stack on 5435x) over .env.local (the app stack next dev uses).
    env: resolveTestEnv(loadEnv("test", projectRoot, ""),
      existsSync(path.join(projectRoot, ".env.test.local")) ? readFileSync(path.join(projectRoot, ".env.test.local"), "utf8") : undefined),
  },
});
