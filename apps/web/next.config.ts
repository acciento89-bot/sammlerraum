import createNextIntlPlugin from "next-intl/plugin";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");
const workspaceRoot = join(dirname(fileURLToPath(import.meta.url)), "../..");

export default withNextIntl({
  output: "standalone",
  outputFileTracingRoot: workspaceRoot,
  poweredByHeader: false,
});
