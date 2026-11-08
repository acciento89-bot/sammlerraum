import { Prisma } from "@sammlerraum/db/search-sql";
import type { SearchDatabase } from "../search/search-read";
import { randomUUID } from "node:crypto";
import { createPersonalMilestoneService } from "./personal-milestone-service";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestDatabaseClient } from "@sammlerraum/db/test-database";
const enabled = process.env.RUN_DATABASE_INTEGRATION === "1";
const db = enabled ? createTestDatabaseClient() : undefined;
describe.runIf(enabled)("private authored milestones PostgreSQL", () => {
  beforeAll(async () => {
    const [guard] = await db!.$queryRaw<
      Array<{ name: string; version: string }>
    >`SELECT current_database() AS name,current_setting('server_version') AS version`;
    if (!guard?.name.endsWith("_test") || !guard.version.startsWith("17.11"))
      throw Error("Guarded PostgreSQL17.11 required");
  });
  const owners: string[] = [];
  async function owner() {
    const id = `milestone_${randomUUID()}`;
    owners.push(id);
    await db!.user.create({
      data: { id, name: "Synthetic milestone owner", email: `${id}@example.invalid` },
    });
    return { userId: id };
  }
  const service = () => createPersonalMilestoneService(db!);
  const input = { title: "Owner-entered milestone", milestoneDate: "2026-11-05" };

  afterAll(async () => {
    await db?.user.deleteMany({ where: { id: { in: owners } } });
    await db?.$disconnect();
  });
  it("has an additive authored-record table rather than inventing inventory history", async () => {
    const [row] = await db!.$queryRaw<
      Array<{ table: string | null }>
    >`SELECT to_regclass('"PersonalMilestone"')::text AS "table"`;
    expect(row?.table, "authored milestone storage must exist").toBe('"PersonalMilestone"');
  });
  it("authors a real private record and lists its entered date separately from recording time", async () => {
    const id = `milestone_${randomUUID()}`;
    owners.push(id);
    await db!.user.create({
      data: { id, name: "Synthetic milestone owner", email: `${id}@example.invalid` },
    });
    const service = createPersonalMilestoneService(db!);
    const saved = await service.createMilestone(
      { userId: id },
      { title: "  An authored date  ", milestoneDate: "0001-01-01" },
    );
    expect(saved).toMatchObject({
      title: "An authored date",
      milestoneDate: "0001-01-01",
      dateBasis: "OWNER_ENTERED",
      revision: 1,
    });
    expect(saved.createdAt).not.toContain("0001-");
    const page = await service.listMilestones({ userId: id });
    expect(page).toMatchObject({
      version: 1,
      scope: "OWNED",
      selectionBasis: "ALL_PERSONAL_MILESTONES",
      total: 1,
      items: [saved],
      nextCursor: null,
    });
  });

  it("hides foreign and missing records for reads, edits and deletion", async () => {
    const a = await owner(),
      b = await owner();
    const saved = await service().createMilestone(a, input);
    expect((await service().listMilestones(b)).items).toEqual([]);
    for (const id of [saved.id, randomUUID()]) {
      await expect(
        service().updateMilestone(b, id, { ...input, expectedRevision: 1 }),
      ).rejects.toMatchObject({ code: "MILESTONE_NOT_FOUND" });
      await expect(service().deleteMilestone(b, id, { expectedRevision: 1 })).rejects.toMatchObject(
        { code: "MILESTONE_NOT_FOUND" },
      );
    }
    expect((await service().listMilestones(a)).total).toBe(1);
  });
  it("increments same-value CAS updates, rejects stale/max revisions and really deletes", async () => {
    const a = await owner(),
      saved = await service().createMilestone(a, input);
    const updated = await service().updateMilestone(a, saved.id, { ...input, expectedRevision: 1 });
    expect(updated).toMatchObject({ ...input, revision: 2, createdAt: saved.createdAt });
    expect(updated.updatedAt >= saved.updatedAt).toBe(true);
    for (const mutate of [
      () => service().updateMilestone(a, saved.id, { ...input, expectedRevision: 1 }),
      () => service().deleteMilestone(a, saved.id, { expectedRevision: 1 }),
    ])
      await expect(mutate()).rejects.toMatchObject({ code: "MILESTONE_CONFLICT" });
    const future = await service().updateMilestone(a, saved.id, {
      ...input,
      milestoneDate: "9999-12-31",
      expectedRevision: 2,
    });
    expect(future.milestoneDate).toBe("9999-12-31");
    await db!.personalMilestone.update({ where: { id: saved.id }, data: { revision: 2147483647 } });
    await expect(
      service().updateMilestone(a, saved.id, { ...input, expectedRevision: 2147483647 }),
    ).rejects.toMatchObject({ code: "MILESTONE_CONFLICT" });
    await expect(
      service().deleteMilestone(a, saved.id, { expectedRevision: 2147483647 }),
    ).rejects.toMatchObject({ code: "MILESTONE_CONFLICT" });
    const removable = await service().createMilestone(a, { ...input, title: "Remove me" });
    expect(await service().deleteMilestone(a, removable.id, { expectedRevision: 1 })).toEqual({
      id: removable.id,
    });
    expect(await db!.personalMilestone.findUnique({ where: { id: removable.id } })).toBeNull();
    await expect(
      service().deleteMilestone(a, removable.id, { expectedRevision: 1 }),
    ).rejects.toMatchObject({ code: "MILESTONE_NOT_FOUND" });
    await db!.user.delete({ where: { id: a.userId } });
    expect(await db!.personalMilestone.count({ where: { ownerId: a.userId } })).toBe(0);
  });
  it("paginates all retained dates with the exact three-column keyset and tied timestamps", async () => {
    const a = await owner();
    const rows = Array.from({ length: 53 }, (_, n) => ({
      id: randomUUID(),
      ownerId: a.userId,
      title: `Entry ${n}`,
      milestoneDate: new Date(
        n === 0
          ? "0001-01-01T00:00:00.000Z"
          : n === 1
            ? "9999-12-31T00:00:00.000Z"
            : "2026-11-05T00:00:00.000Z",
      ),
      createdAt: new Date(`2026-11-05T12:00:00.00${(n % 3) + 1}Z`),
      updatedAt: new Date(`2026-11-05T12:00:00.00${(n % 3) + 1}Z`),
    }));
    await db!.personalMilestone.createMany({ data: rows });
    const first = await service().listMilestones(a),
      second = await service().listMilestones(a, { cursor: first.nextCursor }),
      third = await service().listMilestones(a, { cursor: second.nextCursor });
    expect([first.items.length, second.items.length, third.items.length]).toEqual([20, 20, 13]);
    expect(first.total).toBe(53);
    expect(third.nextCursor).toBeNull();
    const actual = [...first.items, ...second.items, ...third.items].map((row) => row.id);
    const expected = rows
      .sort(
        (a, b) =>
          b.milestoneDate.getTime() - a.milestoneDate.getTime() ||
          b.createdAt.getTime() - a.createdAt.getTime() ||
          (a.id < b.id ? 1 : -1),
      )
      .map((row) => row.id);
    expect(actual).toEqual(expected);
    expect(new Set(actual).size).toBe(53);
    const b = await owner();
    await expect(service().listMilestones(b, { cursor: first.nextCursor })).rejects.toMatchObject({
      code: "MILESTONE_INVALID",
    });
    await expect(
      service().listMilestones(a, { limit: 5, cursor: first.nextCursor }),
    ).rejects.toMatchObject({ code: "MILESTONE_INVALID" });
  });
  it("allows exactly one concurrent edit and does not overwrite the newer revision", async () => {
    const a = await owner(),
      saved = await service().createMilestone(a, input);
    const outcomes = await Promise.allSettled(
      ["First", "Second"].map((title) =>
        service().updateMilestone(a, saved.id, { ...input, title, expectedRevision: 1 }),
      ),
    );
    expect(outcomes.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    const rejected = outcomes.find((r) => r.status === "rejected");
    expect(rejected?.status === "rejected" && rejected.reason.code).toBe("MILESTONE_CONFLICT");
    const page = await service().listMilestones(a);
    expect(page.items[0]!.revision).toBe(2);
    const winner = outcomes.find((r) => r.status === "fulfilled");
    expect(winner?.status === "fulfilled" && winner.value.title).toBe(page.items[0]!.title);
  });
  it("serializes edit/delete without resurrecting a permanently deleted record", async () => {
    const a = await owner(),
      saved = await service().createMilestone(a, input);
    const outcomes = await Promise.allSettled([
      service().updateMilestone(a, saved.id, { ...input, title: "Edited", expectedRevision: 1 }),
      service().deleteMilestone(a, saved.id, { expectedRevision: 1 }),
    ]);
    expect(outcomes.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    const rejected = outcomes.find((r) => r.status === "rejected");
    expect(
      rejected?.status === "rejected" &&
        ["MILESTONE_CONFLICT", "MILESTONE_NOT_FOUND"].includes(rejected.reason.code),
    ).toBe(true);
    const retained = await db!.personalMilestone.findUnique({ where: { id: saved.id } });
    if (retained) expect(retained.revision).toBe(2);
  });
  it("keeps clock/count/page in one native snapshot while another writer commits", async () => {
    const a = await owner();
    await service().createMilestone(a, input);
    let inserted = false;
    const queries: string[] = [];
    const wrapped: SearchDatabase = {
      $transaction: async (work, options) =>
        db!.$transaction(
          (tx) =>
            work({
              $queryRaw: async <T>(query: Prisma.Sql) => {
                queries.push(query.sql);
                const result = await tx.$queryRaw<T>(query);
                if (query.sql.includes("milestones:count") && !inserted) {
                  inserted = true;
                  await service().createMilestone(a, {
                    ...input,
                    title: "Concurrent later writer",
                  });
                }
                return result;
              },
            }),
          options,
        ),
    };
    const page = await createPersonalMilestoneService(wrapped).listMilestones(a);
    expect(inserted).toBe(true);
    expect(page.total).toBe(1);
    expect(page.items).toHaveLength(1);
    expect(queries).toHaveLength(7);
    expect((await service().listMilestones(a)).total).toBe(2);
  });
  it("measures fixed wrapper calls and rejects malformed inputs before opening a transaction", async () => {
    const a = await owner();
    const queries: string[] = [];
    const wrapped: SearchDatabase = {
      $transaction: async (work, options) =>
        db!.$transaction(
          (tx) =>
            work({
              $queryRaw: async <T>(query: Prisma.Sql) => {
                queries.push(query.sql);
                return tx.$queryRaw<T>(query);
              },
            }),
          options,
        ),
    };
    const s = createPersonalMilestoneService(wrapped);
    const saved = await s.createMilestone(a, input);
    expect(queries).toHaveLength(3);
    queries.length = 0;
    await s.listMilestones(a, { limit: 50 });
    expect(queries).toHaveLength(7);
    queries.length = 0;
    await s.updateMilestone(a, saved.id, { ...input, expectedRevision: 1 });
    expect(queries).toHaveLength(5);
    queries.length = 0;
    await s.deleteMilestone(a, saved.id, { expectedRevision: 2 });
    expect(queries).toHaveLength(5);
    queries.length = 0;
    for (const malformed of [{ limit: 51 }, { cursor: "invalid!" }, { lifecycle: "ACTIVE" }])
      await expect(s.listMilestones(a, malformed)).rejects.toMatchObject({
        code: "MILESTONE_INVALID",
      });
    expect(queries).toHaveLength(0);
  });
  it("enforces canonical title, revision and finite-date rules directly in PostgreSQL", async () => {
    const a = await owner();
    for (const title of [" untrimmed", "Cafe\u0301", "Control\n", "\u0085", "🐉".repeat(121)]) {
      await expect(
        db!.$executeRaw(
          Prisma.sql`INSERT INTO "PersonalMilestone" (id,"ownerId",title,"milestoneDate") VALUES (${randomUUID()}::uuid,${a.userId},${title},DATE '2026-11-05')`,
        ),
      ).rejects.toThrow();
    }
    for (const literal of [
      Prisma.sql`DATE 'infinity'`,
      Prisma.sql`DATE '10000-01-01'`,
      Prisma.sql`DATE '0001-01-01 BC'`,
    ])
      await expect(
        db!.$executeRaw(
          Prisma.sql`INSERT INTO "PersonalMilestone" (id,"ownerId",title,"milestoneDate") VALUES (${randomUUID()}::uuid,${a.userId},'Synthetic invalid date',${literal})`,
        ),
      ).rejects.toThrow();
    await expect(
      db!.$executeRaw(
        Prisma.sql`INSERT INTO "PersonalMilestone" (id,"ownerId",title,"milestoneDate",revision) VALUES (${randomUUID()}::uuid,${a.userId},'Invalid revision',DATE '2026-11-05',0)`,
      ),
    ).rejects.toThrow();
    expect(await db!.personalMilestone.count({ where: { ownerId: a.userId } })).toBe(0);
    const emoji = await service().createMilestone(a, {
      title: "🐉".repeat(120),
      milestoneDate: "0001-01-01",
    });
    expect([...emoji.title]).toHaveLength(120);
  });
  it("records successful edit time after an actual unmodified row-lock wait", async () => {
    const a = await owner(),
      saved = await service().createMilestone(a, input);
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    let arrived!: () => void;
    const locked = new Promise<void>((resolve) => {
      arrived = resolve;
    });
    const locker = db!.$transaction(
      async (tx) => {
        await tx.$queryRaw(
          Prisma.sql`SELECT id FROM "PersonalMilestone" WHERE id=${saved.id}::uuid FOR UPDATE`,
        );
        arrived();
        await gate;
      },
      { timeout: 10000 },
    );
    let edit: ReturnType<ReturnType<typeof service>["updateMilestone"]> | undefined;
    try {
      await locked;
      edit = service().updateMilestone(a, saved.id, {
        ...input,
        title: "Recorded after waiting",
        expectedRevision: 1,
      });
      let observedWait = false;
      for (let attempt = 0; attempt < 30; attempt++) {
        const [state] = await db!.$queryRaw<
          Array<{ waiting: boolean }>
        >`SELECT EXISTS(SELECT 1 FROM pg_stat_activity WHERE pid<>pg_backend_pid() AND wait_event_type='Lock' AND query LIKE '/* milestones:%') AS waiting`;
        if (state?.waiting) {
          observedWait = true;
          break;
        }
        await new Promise((resolve) => setTimeout(resolve, 5));
      }
      expect(observedWait, "real edit must have reached the held row lock").toBe(true);
      await db!.$queryRaw`SELECT true AS waited FROM pg_sleep(0.02)`;
      // Compare server epoch milliseconds: the outside-wrapper connection does
      // not promise UTC Date decoding, unlike the service's bounded transaction.
      const [clock] = await db!.$queryRaw<
        Array<{ milliseconds: bigint }>
      >`SELECT floor(extract(epoch FROM clock_timestamp()) * 1000)::bigint AS milliseconds`;
      release();
      await locker;
      const updated = await edit;
      expect(BigInt(Date.parse(updated.updatedAt)) >= clock!.milliseconds).toBe(true);
    } finally {
      release();
      await locker;
      await edit?.catch(() => {});
    }
  });
  it("maps a genuine row-lock timeout to unavailable without committing an edit", async () => {
    const a = await owner(),
      saved = await service().createMilestone(a, input);
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    let arrived!: () => void;
    const locked = new Promise<void>((resolve) => {
      arrived = resolve;
    });
    const locker = db!.$transaction(
      async (tx) => {
        await tx.$queryRaw(
          Prisma.sql`SELECT id FROM "PersonalMilestone" WHERE id=${saved.id}::uuid FOR UPDATE`,
        );
        arrived();
        await gate;
      },
      { timeout: 10000 },
    );
    try {
      await locked;
      await expect(
        service().updateMilestone(a, saved.id, {
          ...input,
          title: "Must not commit",
          expectedRevision: 1,
        }),
      ).rejects.toMatchObject({ code: "SEARCH_UNAVAILABLE" });
    } finally {
      release();
      await locker;
    }
    expect((await service().listMilestones(a)).items[0]!.revision).toBe(1);
  });
  it("keeps bounded pages for large owners and captures real1/50/500-row plans", async () => {
    const a = await owner();
    for (const size of [1, 50, 500]) {
      const existing = await db!.personalMilestone.count({ where: { ownerId: a.userId } });
      await db!.personalMilestone.createMany({
        data: Array.from({ length: size - existing }, () => ({
          ownerId: a.userId,
          title: "🐉".repeat(120),
          milestoneDate: new Date("2026-11-05T00:00:00.000Z"),
        })),
      });
      await db!.$executeRaw(Prisma.sql`ANALYZE "PersonalMilestone"`);
      const page = await service().listMilestones(a, { limit: 50 });
      expect(page.total).toBe(size);
      expect(page.items).toHaveLength(Math.min(size, 50));
      const plan = await db!.$queryRaw(
        Prisma.sql`EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) SELECT id,title,"milestoneDate","createdAt" FROM "PersonalMilestone" WHERE "ownerId"=${a.userId} ORDER BY "milestoneDate" DESC,"createdAt" DESC,id DESC LIMIT 51`,
      );
      console.info("personal-milestone-plan", JSON.stringify({ size, plan }));
    }
    await db!.personalMilestone.createMany({
      data: Array.from({ length: 4500 }, () => ({
        ownerId: a.userId,
        title: "🐉".repeat(120),
        milestoneDate: new Date("2026-11-05T00:00:00.000Z"),
      })),
    });
    const page = await service().listMilestones(a, { limit: 50 });
    expect(page.total).toBe(5000);
    expect(page.items).toHaveLength(50);
    expect(page.nextCursor).not.toBeNull();
    expect(Buffer.byteLength(JSON.stringify(page))).toBeLessThan(65536);
  });
});
