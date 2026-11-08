import { readdirSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

/** Actual route-tree guard, including nested future routes; own subscription checkout is separate. */
export function assertNoMarketplacePayments(
  root = fileURLToPath(new URL("../../../apps/web/src/app/api/v1", import.meta.url)),
): number {
  let count = 0;
  function visit(directory: string) {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) visit(path);
      else if (entry.name === "route.ts") {
        count++;
        const segments = relative(root, directory)
          .split(/[\\/]/u)
          .filter((segment) => !segment.startsWith("("));
        const ownBillingEndpoint = [
          "billing/checkout",
          "billing/portal",
          "billing/status",
          "billing/webhook",
        ].includes(segments.join("/"));
        if (
          !ownBillingEndpoint &&
          segments.some((segment) =>
            /^(?:checkout|payments?|payouts?|escrow|charges?|transfers?|connect)$/iu.test(segment),
          )
        )
          throw new Error("User-to-user payment route violates V1 boundary");
      }
    }
  }
  visit(root);
  if (!count) throw new Error("No actual API routes scanned");
  return count;
}
