import { randomUUID } from "node:crypto";
import { z } from "zod";
import {
  PersonalMilestoneDtoSchema,
  PersonalMilestonePageSchema,
  type PersonalMilestoneDto,
  type PersonalMilestonePage,
} from "@sammlerraum/contracts/personal-milestones";
import type { ApiErrorEnvelope } from "@sammlerraum/contracts/errors";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createTestDatabaseClient } from "@sammlerraum/db/test-database";
import { createPersonalMilestoneService } from "@sammlerraum/domain/dashboard/personal-milestone-service";
import {
  createPersonalMilestoneRouteDependencies,
  createPersonalMilestoneRouteHandlers,
} from "./personal-milestone-routes";
const enabled = process.env.RUN_DATABASE_INTEGRATION === "1",
  db = enabled ? createTestDatabaseClient() : undefined;
const owner = `milestone_route_${randomUUID()}`,
  foreign = `milestone_foreign_${randomUUID()}`,
  origin = "https://example.invalid",
  body = { title: "A routed date", milestoneDate: "0001-01-01" };
function request(payload: unknown) {
  return new Request(`${origin}/api/v1/dashboard/milestones`, {
    method: "POST",
    headers: { origin, "content-type": "application/json" },
    body: JSON.stringify(payload),
  });
}
function write(method: "PATCH" | "DELETE", payload: unknown, id: string) {
  return new Request(`${origin}/api/v1/dashboard/milestones/${id}`, {
    method,
    headers: { origin, "content-type": "application/json" },
    body: JSON.stringify(payload),
  });
}
function handlers(userId = owner) {
  const getSession = vi.fn(async (_input: unknown) => ({ user: { id: userId } }));
  return {
    getSession,
    handler: createPersonalMilestoneRouteHandlers(
      createPersonalMilestoneRouteDependencies(db!, { api: { getSession } }, origin),
    ),
  };
}
const errorEnvelope = z
  .object({
    error: z.object({ code: z.string(), message: z.string(), requestId: z.string() }).strict(),
  })
  .strict();
async function check(response: Response, status: 200, kind: "page"): Promise<PersonalMilestonePage>;
async function check(response: Response, status: 200, kind: "deleted"): Promise<{ id: string }>;
async function check(
  response: Response,
  status: 200 | 201,
  kind?: "record",
): Promise<PersonalMilestoneDto>;
async function check(response: Response, status: 400 | 404 | 409): Promise<ApiErrorEnvelope>;
async function check(response: Response, status: number, kind = "record") {
  expect(response.status).toBe(status);
  expect(response.headers.get("cache-control")).toBe("no-store");
  expect(response.headers.get("x-request-id")).toBeTruthy();
  const body: unknown = await response.json();
  if (status >= 400) return errorEnvelope.parse(body);
  if (kind === "page") return PersonalMilestonePageSchema.parse(body);
  if (kind === "deleted") return z.object({ id: z.string().uuid() }).strict().parse(body);
  return PersonalMilestoneDtoSchema.parse(body);
}
describe.runIf(enabled)(
  "native private milestone wire handlers (synthetic fresh-auth adapter)",
  () => {
    beforeAll(async () => {
      const [guard] = await db!.$queryRaw<
        Array<{ name: string; version: string }>
      >`SELECT current_database() AS name,current_setting('server_version') AS version`;
      if (!guard?.name.endsWith("_test") || !guard.version.startsWith("17.11"))
        throw Error("Guarded PostgreSQL17.11 required");
      for (const id of [owner, foreign])
        await db!.user.create({
          data: { id, name: "Synthetic routed milestone owner", email: `${id}@example.invalid` },
        });
    });
    beforeEach(async () => {
      await db!.personalMilestone.deleteMany({ where: { ownerId: { in: [owner, foreign] } } });
    });
    afterAll(async () => {
      await db?.user.deleteMany({ where: { id: { in: [owner, foreign] } } });
      await db?.$disconnect();
    });
    it("creates a real authored record without replacing unrelated existing private records", async () => {
      const existing = await createPersonalMilestoneService(db!).createMilestone(
        { userId: owner },
        { ...body, title: "Existing private entry" },
      );
      const { handler } = handlers();
      const created = await check(await handler.POST(request(body)), 201);
      expect(created).toMatchObject({ ...body, revision: 1, dateBasis: "OWNER_ENTERED" });
      expect(await check(await handler.QUERY(request({})), 200, "page")).toMatchObject({
        scope: "OWNED",
        selectionBasis: "ALL_PERSONAL_MILESTONES",
        total: 2,
      });
      expect(await db!.personalMilestone.findUnique({ where: { id: existing.id } })).not.toBeNull();
    });
    it("updates the real full record with CAS, rejects stale state and permanently removes it", async () => {
      const { handler, getSession } = handlers();
      const saved = await check(
        await handler.POST(request({ ...body, title: " Cafe\u0301 " })),
        201,
      );
      expect(saved.title).toBe("Café");
      const updated = await check(
        await handler.PATCH(
          write(
            "PATCH",
            { title: "Changed", milestoneDate: "9999-12-31", expectedRevision: 1 },
            saved.id,
          ),
          saved.id,
        ),
        200,
      );
      expect(updated).toMatchObject({
        id: saved.id,
        title: "Changed",
        milestoneDate: "9999-12-31",
        revision: 2,
        createdAt: saved.createdAt,
      });
      const stale = await check(
        await handler.PATCH(write("PATCH", { ...body, expectedRevision: 1 }, saved.id), saved.id),
        409,
      );
      expect(stale.error.code).toBe("MILESTONE_CONFLICT");
      expect(
        (
          await check(
            await handler.DELETE(write("DELETE", { expectedRevision: 2 }, saved.id), saved.id),
            200,
            "deleted",
          )
        ).id,
      ).toBe(saved.id);
      expect(await db!.personalMilestone.findUnique({ where: { id: saved.id } })).toBeNull();
      expect(
        (
          await check(
            await handler.DELETE(write("DELETE", { expectedRevision: 2 }, saved.id), saved.id),
            404,
          )
        ).error.code,
      ).toBe("MILESTONE_NOT_FOUND");
      for (const [call] of getSession.mock.calls)
        expect(call).toMatchObject({ query: { disableCookieCache: true, disableRefresh: true } });
    });
    it("keeps foreign and missing resource errors indistinguishable and never returns foreign rows", async () => {
      const saved = await createPersonalMilestoneService(db!).createMilestone(
          { userId: owner },
          body,
        ),
        { handler } = handlers(foreign);
      expect(await check(await handler.QUERY(request({})), 200, "page")).toMatchObject({
        items: [],
        total: 0,
      });
      for (const id of [saved.id, randomUUID()])
        for (const op of ["PATCH", "DELETE"] as const) {
          const payload =
            op === "PATCH" ? { ...body, expectedRevision: 1 } : { expectedRevision: 1 };
          const result = await check(await handler[op](write(op, payload, id), id), 404);
          expect(result.error.code).toBe("MILESTONE_NOT_FOUND");
          expect(JSON.stringify(result)).not.toContain(saved.title);
        }
      expect(
        (await db!.personalMilestone.findUniqueOrThrow({ where: { id: saved.id } })).revision,
      ).toBe(1);
    });
    it("roundtrips canonical paged native cursors and denies actor/limit/context changes", async () => {
      await db!.personalMilestone.createMany({
        data: Array.from({ length: 7 }, (_, n) => ({
          ownerId: owner,
          title: `Routed ${n}`,
          milestoneDate: new Date("2026-11-05T00:00:00.000Z"),
        })),
      });
      const { handler } = handlers(),
        first = await check(await handler.QUERY(request({ limit: 5 })), 200, "page"),
        last = await check(
          await handler.QUERY(request({ limit: 5, cursor: first.nextCursor })),
          200,
          "page",
        );
      expect([first.items.length, last.items.length]).toEqual([5, 2]);
      expect(first.total).toBe(7);
      expect(last.nextCursor).toBeNull();
      expect(new Set([...first.items, ...last.items].map((row) => row.id)).size).toBe(7);
      for (const h of [handler, handlers(foreign).handler])
        expect(
          (
            await check(
              await h.QUERY(request({ limit: h === handler ? 20 : 5, cursor: first.nextCursor })),
              400,
            )
          ).error.code,
        ).toBe("MILESTONE_INVALID");
    });
    it("commits at most one simultaneous API edit for the fetched expected revision", async () => {
      const { handler } = handlers(),
        saved = await check(await handler.POST(request(body)), 201);
      const results = await Promise.all(
        ["First routed writer", "Second routed writer"].map((title) =>
          handler.PATCH(
            write("PATCH", { ...body, title, expectedRevision: 1 }, saved.id),
            saved.id,
          ),
        ),
      );
      expect(results.map((r) => r.status).sort()).toEqual([200, 409]);
      const row = await db!.personalMilestone.findUniqueOrThrow({ where: { id: saved.id } });
      expect(row.revision).toBe(2);
      expect(["First routed writer", "Second routed writer"]).toContain(row.title);
    });
    it("accepts only exact operation fields and actual dates without persisting invalid requests", async () => {
      const { handler } = handlers();
      for (const payload of [
        { ...body, ownerId: foreign },
        { ...body, dateBasis: "VERIFIED" },
        { ...body, milestoneDate: "1900-02-29" },
        { ...body, title: "bad\n" },
        { ...body, expectedRevision: 1 },
      ])
        expect((await check(await handler.POST(request(payload)), 400)).error.code).toBe(
          "MILESTONE_INVALID",
        );
      expect(await db!.personalMilestone.count({ where: { ownerId: owner } })).toBe(0);
      const saved = await check(await handler.POST(request(body)), 201);
      await db!.personalMilestone.update({
        where: { id: saved.id },
        data: { revision: 2147483647 },
      });
      expect(
        (
          await check(
            await handler.DELETE(
              write("DELETE", { expectedRevision: 2147483647 }, saved.id),
              saved.id,
            ),
            409,
          )
        ).error.code,
      ).toBe("MILESTONE_CONFLICT");
    });
  },
);
