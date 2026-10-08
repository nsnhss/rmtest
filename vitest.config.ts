import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["packages/**/test/**/*.test.ts"],
    server: {
      deps: {
        inline: ["@rmtest/core", "@rmtest/adapter-mv", "@rmtest/checkers", "@rmtest/report", "@rmtest/dsl"],
      },
    },
  },
});
