import { expect, test } from "@playwright/test";
import {
  PersonalMilestoneDtoSchema,
  PersonalMilestonePageSchema,
} from "@sammlerraum/contracts/personal-milestones";
import { searchFixture, cleanupSearchFixture, db, enabled, origin } from "./support/search-fixture";
test.afterAll(async () => {
  await db?.$disconnect();
});
test("actual Next milestone HTTP routes enforce private cookie-authenticated CRUD", async ({
  page,
  context,
}) => {
  test.skip(!enabled, "Requires guarded auth database");
  const f = await searchFixture();
  try {
    const signed = await page.request.post("/api/auth/sign-in/email", {
      headers: { origin, "x-forwarded-for": f.ip },
      data: { email: f.email, password: f.password },
    });
    expect(signed.status()).toBe(200);
    await db!.personalMilestone.create({
      data: {
        ownerId: f.foreignId,
        title: "Foreign private milestone sentinel",
        milestoneDate: new Date("2026-11-05T00:00:00.000Z"),
      },
    });
    const created = await page.request.post("/api/v1/dashboard/milestones", {
      headers: { origin },
      data: { title: "  HTTP Café  ", milestoneDate: "0001-01-01" },
    });
    expect(created.status()).toBe(201);
    expect(created.headers()["cache-control"]).toBe("no-store");
    expect(created.headers()["x-request-id"]).toBeTruthy();
    const saved = PersonalMilestoneDtoSchema.parse(await created.json());
    expect(saved).toMatchObject({
      title: "HTTP Café",
      milestoneDate: "0001-01-01",
      revision: 1,
      dateBasis: "OWNER_ENTERED",
    });
    const listed = await page.request.post("/api/v1/dashboard/milestones/query", {
      headers: { origin },
      data: { limit: 5 },
    });
    expect(listed.status()).toBe(200);
    const actual = PersonalMilestonePageSchema.parse(await listed.json());
    expect(actual.total).toBe(1);
    expect(actual.items).toEqual([saved]);
    const foreign = await db!.personalMilestone.findFirstOrThrow({
      where: { ownerId: f.foreignId },
    });
    const denied = await page.request.patch(`/api/v1/dashboard/milestones/${foreign.id}`, {
      headers: { origin },
      data: { title: "Must not replace", milestoneDate: "2026-11-05", expectedRevision: 1 },
    });
    expect(denied.status()).toBe(404);
    expect(await denied.text()).not.toContain(foreign.title);
    const updated = await page.request.patch(`/api/v1/dashboard/milestones/${saved.id}`, {
      headers: { origin },
      data: {
        title: "Edited through actual HTTP",
        milestoneDate: "9999-12-31",
        expectedRevision: 1,
      },
    });
    expect(updated.status()).toBe(200);
    expect(PersonalMilestoneDtoSchema.parse(await updated.json())).toMatchObject({
      id: saved.id,
      title: "Edited through actual HTTP",
      milestoneDate: "9999-12-31",
      revision: 2,
    });
    const stale = await page.request.patch(`/api/v1/dashboard/milestones/${saved.id}`, {
      headers: { origin },
      data: { title: "Stale write", milestoneDate: "2026-11-05", expectedRevision: 1 },
    });
    expect(stale.status()).toBe(409);
    expect((await page.request.get("/api/v1/dashboard/milestones")).status()).toBe(405);
    const removed = await page.request.delete(`/api/v1/dashboard/milestones/${saved.id}`, {
      headers: { origin },
      data: { expectedRevision: 2 },
    });
    expect(removed.status()).toBe(200);
    expect(await db!.personalMilestone.findUnique({ where: { id: saved.id } })).toBeNull();
    const empty = await page.request.post("/api/v1/dashboard/milestones/query", {
      headers: { origin },
      data: {},
    });
    expect(PersonalMilestonePageSchema.parse(await empty.json()).total).toBe(0);
    const wrongOrigin = await page.request.post("/api/v1/dashboard/milestones/query", {
      headers: { origin: "https://foreign.invalid" },
      data: {},
    });
    expect(wrongOrigin.status()).toBe(403);
    await context.clearCookies();
    const loggedOut = await page.request.post("/api/v1/dashboard/milestones/query", {
      headers: { origin },
      data: {},
    });
    expect(loggedOut.status()).toBe(401);
    expect(await loggedOut.text()).not.toContain(saved.title);
  } finally {
    await cleanupSearchFixture(f);
  }
});
