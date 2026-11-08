import { it, expect, vi } from "vitest";
import policy from "../../../../packages/testing/fixtures/legacy-billing-policy.json" with { type: "json" };
const data = {
  plan: "FREE",
  limits: policy.FREE,
  currentPeriodEnd: null,
  cancelAtPeriodEnd: false,
  hasCustomer: false,
  readAt: "2026-11-08T00:00:00.000Z",
  nextMonthlyResetAt: "2026-12-01T00:00:00.000Z",
  usage: {
    ITEM_CREATE: "0",
    MEDIA_COUNT: "0",
    MEDIA_BYTES: "0",
    AI_MONTHLY: "0",
    IMPORT_PROFILES: "0",
  },
};
async function fixture() {
  const path = "./billing-status-route";
  const module = await import(path).catch(() => null);
  expect(module?.createBillingStatusHandler).toBeTypeOf("function");
  const getSession = vi.fn(
      async () => ({ user: { id: "real-own-subject" } }) as { user: { id: string } } | null,
    ),
    getOverview = vi.fn(async (_: string) => data as unknown);
  return {
    handler: module!.createBillingStatusHandler({ getSession, getOverview }),
    getSession,
    getOverview,
  };
}
it("reads only the fresh session subject and returns private no-store local status", async () => {
  const f = await fixture(),
    r = await f.handler(new Request("https://example.invalid/api/v1/billing/status"));
  expect(r.status).toBe(200);
  expect(r.headers.get("cache-control")).toContain("no-store");
  expect(await r.json()).toEqual({ overview: data });
  expect(f.getOverview).toHaveBeenCalledWith("real-own-subject");
});
it("rejects foreign subject hints and unauthenticated reads before overview access", async () => {
  const f = await fixture();
  expect(
    (
      await f.handler(
        new Request("https://example.invalid/api/v1/billing/status?subjectId=foreign"),
      )
    ).status,
  ).toBe(400);
  f.getSession.mockResolvedValueOnce(null);
  expect(
    (await f.handler(new Request("https://example.invalid/api/v1/billing/status"))).status,
  ).toBe(401);
  expect(f.getOverview).not.toHaveBeenCalled();
});
it("does not expose malformed backend metadata as a fake Free account", async () => {
  const f = await fixture();
  f.getOverview.mockResolvedValueOnce({ ...data, privateCustomer: "cus_never_public" });
  const r = await f.handler(new Request("https://example.invalid/api/v1/billing/status"));
  expect(r.status).toBe(503);
  expect(await r.text()).not.toContain("cus_never_public");
});
