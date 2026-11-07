import { randomUUID } from "node:crypto";
import { beforeAll, afterAll, describe, it, expect } from "vitest";
import { createLegacyMoneyTestSchema } from "@sammlerraum/db/test-legacy-money-schema";
import { createTestDatabaseClient } from "@sammlerraum/db/test-database";
import { createItemService } from "@sammlerraum/domain/items/item-service";
import { createCommentDependencies, createCommentHandlers } from "./comment-routes";
let db: ReturnType<typeof createTestDatabaseClient>,
  isolated: Awaited<ReturnType<typeof createLegacyMoneyTestSchema>>;
const origin = "https://example.invalid";
function request(path: string, body?: unknown, method = "POST") {
  return new Request(
    origin + path,
    body === undefined
      ? {}
      : {
          method,
          headers: { origin, "content-type": "application/json" },
          body: JSON.stringify(body),
        },
  );
}
describe.runIf(process.env.RUN_DATABASE_INTEGRATION === "1")(
  "comment/report Request and Response with PostgreSQL",
  () => {
    beforeAll(async () => {
      isolated = await createLegacyMoneyTestSchema();
      db = createTestDatabaseClient({ databaseUrl: isolated.databaseUrl, schema: isolated.schema });
    });
    afterAll(async () => {
      await db?.$disconnect();
      await isolated?.cleanup();
    });
    it("handles valid escaped multibyte content and binds actual author, owner controls and reporter", async () => {
      const owner = randomUUID(),
        peer = randomUUID();
      for (const id of [owner, peer])
        await db.user.create({
          data: {
            id,
            name: "Own comment HTTP fixture",
            email: `${id}@example.invalid`,
            emailVerified: true,
          },
        });
      const handlers = (userId: string | null) =>
          createCommentHandlers(
            createCommentDependencies(
              db,
              { api: { getSession: async () => (userId ? { user: { id: userId } } : null) } },
              origin,
            ),
          ),
        c = await db.collection.create({
          data: { ownerId: owner, name: "Public HTTP comments", visibility: "PUBLIC" },
        }),
        item = await createItemService(db, owner).createItem({
          collectionId: c.id,
          title: "HTTP comment target",
          visibility: "PUBLIC",
        }),
        path = "/api/v1/community/comments",
        target = { type: "ITEM", id: item.id },
        content = "品".repeat(4000);
      const escaped = new Request(origin + path, {
        method: "POST",
        headers: { origin, "content-type": "application/json" },
        body: JSON.stringify({ target, body: content }).replaceAll("品", "\\u54c1"),
      });
      const created = await handlers(peer).CREATE_COMMENT(escaped);
      expect(created.status).toBe(200);
      const comment = (await created.json()) as { id: string };
      expect(
        (await db.communityComment.findUniqueOrThrow({ where: { id: comment.id } })).body,
      ).toBe(content);
      const listing = await handlers(null).COMMENTS(request(path + "?type=ITEM&id=" + item.id));
      expect(listing.status).toBe(200);
      expect(listing.headers.get("cache-control")).toBe("no-store");
      expect(((await listing.json()) as { comments: unknown[] }).comments).toHaveLength(1);
      expect(
        (
          await handlers(peer).SET_POLICY(
            request(path + "/policy", { scope: "ITEM", targetId: item.id, enabled: false }),
          )
        ).status,
      ).toBe(404);
      expect(
        (
          await handlers(owner).SET_POLICY(
            request(path + "/policy", { scope: "ITEM", targetId: item.id, enabled: false }),
          )
        ).status,
      ).toBe(200);
      expect(
        (await handlers(peer).CREATE_COMMENT(request(path, { target, body: "Disabled now" })))
          .status,
      ).toBe(403);
      const reported = await handlers(owner).CREATE_REPORT(
        request("/api/v1/community/reports", {
          type: "COMMENT",
          commentId: comment.id,
          category: "SPAM",
          reason: "Own report before hiding",
        }),
      );
      expect(reported.status).toBe(200);
      expect(
        await db.communityReport.findFirstOrThrow({ where: { commentId: comment.id } }),
      ).toMatchObject({ reporterId: owner });
      expect(
        (
          await handlers(owner).HIDE_COMMENT(
            request(path + "/" + comment.id, { hidden: true }, "PATCH"),
            comment.id,
          )
        ).status,
      ).toBe(200);
      expect(
        (
          (await (
            await handlers(null).COMMENTS(request(path + "?type=ITEM&id=" + item.id))
          ).json()) as { comments: unknown[] }
        ).comments,
      ).toEqual([]);
      expect(
        (
          await handlers(peer).DELETE_COMMENT(
            new Request(origin + path + "/" + comment.id, {
              method: "DELETE",
              body: "",
              headers: { origin },
            }),
            comment.id,
          )
        ).status,
      ).toBe(200);
    });
  },
);
