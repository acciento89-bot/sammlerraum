import { defineProject } from "vitest/config";

export default [
  defineProject({
    test: {
      name: "workspace",
      include: ["apps/**/*.test.ts", "packages/**/*.test.ts"],
      setupFiles: ["./vitest.setup.ts"],
    },
  }),
];
