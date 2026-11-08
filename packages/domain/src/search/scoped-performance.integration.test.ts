import { randomUUID } from "node:crypto";
import { beforeAll, afterAll, describe, it, expect } from "vitest";
import { Prisma } from "@sammlerraum/db/search-sql";
import { createLegacyMoneyTestSchema } from "@sammlerraum/db/test-legacy-money-schema";
import { createTestDatabaseClient } from "@sammlerraum/db/test-database";
import { createShareService } from "../sharing/share-service";
import { createMembershipService } from "../collaboration/membership-service";
import type { MembershipDatabase } from "../collaboration/transfer-transaction";
import { createScopedSearchService } from "./scoped-search-service";
import { createScopedDashboardService } from "../dashboard/scoped-dashboard-service";
import { runSearchRead } from "./search-read";
const sourceCounts = new Map<string, number>();
describe.runIf(process.env.RUN_DATABASE_INTEGRATION === "1")(
  "actual bounded scoped read plans without item-by-item authorization",
  () => {
    let db: ReturnType<typeof createTestDatabaseClient>;
    let isolated: Awaited<ReturnType<typeof createLegacyMoneyTestSchema>>;
    beforeAll(async () => {
      isolated = await createLegacyMoneyTestSchema();
      db = createTestDatabaseClient({ databaseUrl: isolated.databaseUrl, schema: isolated.schema });
    });
    afterAll(async () => {
      await db?.$disconnect();
      await isolated?.cleanup();
    });
    it.each(
      [1, 50, 500].flatMap((n) =>
        ["MEMBER", "SHARE_COLLECTION", "SHARE_NODE"].map((kind) => ({ n, kind })),
      ),
    )(
      "keeps raw query calls fixed for $n items in $kind",
      async ({ n, kind }) => {
        const owner = randomUUID(),
          viewer = randomUUID();
        for (const id of [owner, viewer])
          await db.user.create({
            data: {
              id,
              name: "Owned scope benchmark",
              email: `${id}@example.invalid`,
              emailVerified: true,
            },
          });
        const collection = await db.collection.create({
          data: { ownerId: owner, name: "Scoped benchmark parent" },
        });
        const node = await db.collectionNode.create({
          data: { collectionId: collection.id, name: "Selected subtree" },
        });
        const ids = Array.from({ length: n }, () => randomUUID());
        await db.collectibleItem.createMany({
          data: ids.map((id) => ({
            id,
            ownerId: owner,
            collectionId: collection.id,
            nodeId: node.id,
            title: "Scoped benchmark ceramic",
            quantity: 2,
          })),
        });
        const hidden = await db.collection.create({
          data: { ownerId: owner, name: "Excluded benchmark parent" },
        });
        await db.collectibleItem.create({
          data: {
            ownerId: owner,
            collectionId: hidden.id,
            title: "Excluded private item",
            quantity: 100,
          },
        });
        let target: unknown,
          actor: { userId: string } | null = null;
        if (kind === "MEMBER") {
          await createMembershipService(db).addMember(
            { userId: owner },
            { collectionId: collection.id, userId: viewer, role: "VIEWER", expectedRevision: 0 },
          );
          target = { kind: "MEMBER_COLLECTION", collectionId: collection.id };
          actor = { userId: viewer };
        } else {
          const created = await createShareService(db).createShare(
            { userId: owner },
            {
              target: {
                kind: kind === "SHARE_NODE" ? "NODE" : "COLLECTION",
                id: kind === "SHARE_NODE" ? node.id : collection.id,
              },
              recipient: { kind: "TOKEN" },
              expectedRevision: 0,
            },
          );
          target = { kind: "SHARE", access: { token: created.token } };
        }
        const calls: Prisma.Sql[] = [];
        const measured: MembershipDatabase = {
          $transaction: (work, options) =>
            db.$transaction(
              (tx) =>
                work({
                  $queryRaw: async <T>(sql: Prisma.Sql) => {
                    calls.push(sql);
                    return tx.$queryRaw<T>(sql);
                  },
                }),
              options,
            ),
        };
        const start = performance.now();
        const page = await createScopedSearchService(measured).search(actor, target, { limit: 1 });
        const searchMs = performance.now() - start,
          searchCalls = calls.length;
        expect(page.total).toBe(n);
        expect(page.items).toHaveLength(1);
        expect(ids).toContain(page.items[0]!.id);
        const overviewStart = performance.now();
        const overview = await createScopedDashboardService(measured).get(actor, target, {});
        const dashboardMs = performance.now() - overviewStart,
          dashboardCalls = calls.length - searchCalls;
        expect(overview.selection).toEqual({ itemCount: n, unitCount: String(n * 2) });
        expect(overview.values.state).toBe("UNAVAILABLE");
        for (const [operation, count] of [
          ["search", searchCalls],
          ["dashboard", dashboardCalls],
        ] as const) {
          const key = `${kind}:${operation}`;
          if (!sourceCounts.has(key)) sourceCounts.set(key, count);
          expect(count).toBe(sourceCounts.get(key));
          expect(count).toBeLessThan(100);
        }
        const selected = calls.filter(
          (sql) =>
            sql.text.includes("SELECT count(*) AS total") ||
            sql.text.includes("SELECT i.id,i.title,i.quantity") ||
            sql.text.includes("sum(i.quantity::numeric)"),
        );
        const plans = await runSearchRead(db, async (tx) => {
          const output = [];
          for (const sql of selected)
            output.push({
              query: sql.text,
              plan: await tx.$queryRaw(Prisma.sql`EXPLAIN (ANALYZE,BUFFERS,FORMAT JSON) ${sql}`),
            });
          return output;
        });
        console.info(
          "SCOPED_QUERY_PROOF",
          JSON.stringify({
            ownedItems: n,
            kind,
            searchMs,
            dashboardMs,
            searchRawCallsIncludingConfiguration: searchCalls,
            dashboardRawCallsIncludingConfiguration: dashboardCalls,
            plans,
          }),
        );
      },
      30_000,
    );
  },
);
