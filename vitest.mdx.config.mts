import { defineConfig } from "vitest/config";

// Publication/build safety must not load application credentials or a test DB lock.
export default defineConfig({
  test: { include: ["tests/mdx-safety.test.ts"] },
});
