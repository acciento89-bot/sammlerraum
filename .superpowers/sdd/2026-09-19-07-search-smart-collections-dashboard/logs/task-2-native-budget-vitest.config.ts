import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";
import base from "../../../../vitest.config";
import BudgetSequence from "./task-2-native-budget-sequencer";
const setup = fileURLToPath(new URL("./task-2-native-budget-setup.ts", import.meta.url));
export default defineConfig({ ...base, test: { ...base.test,
  projects: base.test.projects.map(project => ({ ...project, test: { ...project.test, setupFiles: [setup] } })),
  sequence: { sequencer: BudgetSequence }
} });
