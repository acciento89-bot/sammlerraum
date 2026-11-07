import { describe, it, expect, vi } from "vitest";
import {
  createCollaborationManagementDependencies,
  createCollaborationManagementHandlers,
} from "./collaboration-management-routes";
const origin = "https://example.invalid",
  id = "00000000-0000-4000-8000-000000000001";
function fixture() {
  const transaction = vi.fn(async () => {
      throw Error("private-management-db-sentinel");
    }),
    getSession = vi.fn(async () => ({ user: { id: "actual-session-user" } })),
    handlers = createCollaborationManagementHandlers(
      createCollaborationManagementDependencies(
        {
          $transaction: transaction,
          $queryRaw: vi.fn(async () => {
            throw Error("private-management-db-sentinel");
          }),
        },
        { api: { getSession } },
        origin,
      ),
    );
  return { transaction, getSession, handlers };
}
function post(body: unknown, from = origin) {
  return new Request(`${origin}/api/v1/collections/${id}/members`, {
    method: "POST",
    headers: { origin: from, "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}
describe("collaboration management HTTP policy boundary", () => {
  it("refuses cross-origin role changes before any session or database read", async () => {
    const f = fixture();
    expect((await f.handlers.MUTATE_MEMBERS(post({}, "https://foreign.invalid"), id)).status).toBe(
      403,
    );
    expect(f.getSession).not.toHaveBeenCalled();
    expect(f.transaction).not.toHaveBeenCalled();
  });
  it.each([
    { action: "CHANGE_ROLE", userId: "target", role: "OWNER", expectedRevision: 0 },
    { action: "REMOVE", userId: "target", actorId: "forged-owner", expectedRevision: 0 },
    {
      action: "TRANSFER",
      newOwnerId: "target",
      expectedRevision: 0,
      confirmPrivateTransfer: false,
    },
  ])("rejects impossible roles, actor injection and unconfirmed private transfer", async (body) => {
    const f = fixture();
    expect((await f.handlers.MUTATE_MEMBERS(post(body), id)).status).toBe(400);
    expect(f.transaction).not.toHaveBeenCalled();
  });
  it("requires a bounded explicit audit resource and never returns database diagnostics", async () => {
    const f = fixture();
    expect(
      (
        await f.handlers.AUDIT(
          new Request(
            origin + "/api/v1/audit?resourceType=ITEM&resourceId=" + id + "&actorId=forged",
          ),
        )
      ).status,
    ).toBe(400);
    const result = await f.handlers.GET_MEMBERS(
      new Request(origin + "/api/v1/collections/" + id + "/members"),
      id,
    );
    expect(result.status).toBe(500);
    expect(result.headers.get("cache-control")).toBe("no-store");
    expect(await result.text()).not.toMatch(/private-management-db-sentinel|actual-session-user/);
  });
});
