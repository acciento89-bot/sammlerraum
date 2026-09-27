import createNextIntlPlugin from "next-intl/plugin";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");
const workspaceRoot = join(dirname(fileURLToPath(import.meta.url)), "../..");

export default withNextIntl({
  async headers() {
    return [
      ...[
        "/l/:token",
        "/:locale(de|en)/locations/:locationId",
        "/:locale(de|en)/locations/:locationId/label",
      ].map((source) => ({
        source,
        headers: [
          { key: "Cache-Control", value: "private, no-store" },
          { key: "X-Robots-Tag", value: "noindex, nofollow" },
          { key: "Referrer-Policy", value: "no-referrer" },
        ],
      })),
    ];
  },
  output: "standalone",
  outputFileTracingRoot: workspaceRoot,
  poweredByHeader: false,
});
