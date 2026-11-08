import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { assertNoMarketplacePayments } from "./marketplace-boundary";

describe("V1 user-to-user financial boundary", () => {
  it("scans every actual V1 API route while allowing only own Premium billing checkout", () => {
    expect(assertNoMarketplacePayments()).toBeGreaterThan(100);
  });
  it.each([
    "marketplace/checkout",
    "payouts",
    "escrow",
    "market/charges",
    "transactions/payments",
    "billing/payouts",
    "billing/escrow",
    "billing/connect",
  ])("rejects hidden or future financial route %s", (name) => {
    const dir = mkdtempSync(join(tmpdir(), "sammlerraum-route-boundary-"));
    try {
      mkdirSync(join(dir, name), { recursive: true });
      writeFileSync(join(dir, name, "route.ts"), "export async function POST() {}");
      expect(() => assertNoMarketplacePayments(dir)).toThrow("User-to-user payment route");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
