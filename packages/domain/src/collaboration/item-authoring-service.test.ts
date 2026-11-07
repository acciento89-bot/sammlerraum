import { CreateItemInputSchema, UpdateItemInputSchema } from "@sammlerraum/contracts/items";
import {
  createItemInTransaction,
  updateItemInTransaction,
  type ItemDatabase,
} from "../items/item-service";
import { randomUUID } from "node:crypto";
import { beforeAll, afterAll, describe, it, expect } from "vitest";
import { createLegacyMoneyTestSchema } from "@sammlerraum/db/test-legacy-money-schema";
import { createTestDatabaseClient } from "@sammlerraum/db/test-database";
import { createMembershipService } from "./membership-service";
import { createCollaborativeItemService } from "./item-authoring-service";
let db: ReturnType<typeof createTestDatabaseClient>,
  isolated: Awaited<ReturnType<typeof createLegacyMoneyTestSchema>>;
describe.runIf(process.env.RUN_DATABASE_INTEGRATION === "1")(
  "real current-member inventory authorship",
  () => {
    beforeAll(async () => {
      isolated = await createLegacyMoneyTestSchema();
      db = createTestDatabaseClient({ databaseUrl: isolated.databaseUrl, schema: isolated.schema });
    });
    afterAll(async () => {
      await db?.$disconnect();
      await isolated?.cleanup();
    });
    it("lets an Editor create and edit real Owner inventory while preserving ownership, private data and original audit actor", async () => {
      const owner = randomUUID(),
        editor = randomUUID(),
        viewer = randomUUID();
      for (const id of [owner, editor, viewer])
        await db.user.create({
          data: {
            id,
            name: "Owned shared inventory fixture",
            email: `${id}@example.invalid`,
            emailVerified: true,
          },
        });
      const c = await db.collection.create({ data: { ownerId: owner, name: "Shared inventory" } }),
        members = createMembershipService(db);
      await members.addMember(
        { userId: owner },
        { collectionId: c.id, userId: editor, role: "EDITOR", expectedRevision: 0 },
      );
      await members.addMember(
        { userId: owner },
        { collectionId: c.id, userId: viewer, role: "VIEWER", expectedRevision: 1 },
      );
      const service = createCollaborativeItemService(db, editor),
        created = await service.createItem({
          collectionId: c.id,
          title: "Editor-created ceramic",
          quantity: 2,
        });
      expect(
        (await db.collectibleItem.findUniqueOrThrow({ where: { id: created.id } })).ownerId,
      ).toBe(owner);
      expect(
        await db.auditEvent.findFirst({
          where: { resourceId: created.id, action: "ITEM_CREATED" },
        }),
      ).toMatchObject({ actorId: editor, source: "USER" });
      await db.collectibleItem.update({
        where: { id: created.id },
        data: {
          privateNotes: "owner-only-private-sentinel",
          purchaseAmountMinor: 12345n,
          purchaseCurrency: "EUR",
        },
      });
      const financialBefore = await db.collectibleItem.findUniqueOrThrow({
        where: { id: created.id },
        select: {
          purchaseAmountMinor: true,
          purchaseCurrency: true,
          purchaseMoneyGeneration: true,
        },
      });
      const result = await service.updateItem(c.id, created.id, {
        title: "Editor title",
        quantity: 3,
      });
      expect(result.title).toBe("Editor title");
      expect(JSON.stringify(result)).not.toMatch(
        /owner-only-private-sentinel|privateNotes|purchaseAmountMinor/,
      );
      expect(
        (await db.collectibleItem.findUniqueOrThrow({ where: { id: created.id } })).privateNotes,
      ).toBe("owner-only-private-sentinel");
      expect(
        await db.collectibleItem.findUniqueOrThrow({
          where: { id: created.id },
          select: {
            purchaseAmountMinor: true,
            purchaseCurrency: true,
            purchaseMoneyGeneration: true,
          },
        }),
      ).toEqual(financialBefore);
      expect(
        await db.auditEvent.findFirst({
          where: { resourceId: created.id, action: "ITEM_DETAILS_CHANGED" },
        }),
      ).toMatchObject({ actorId: editor });
      await expect(
        createCollaborativeItemService(db, viewer).updateItem(c.id, created.id, {
          title: "Denied",
        }),
      ).rejects.toThrow();
      await expect(
        service.updateItem(c.id, created.id, { privateNotes: "Injected" }),
      ).rejects.toThrow();
      await expect(
        service.updateItem(c.id, created.id, { purchaseAmountMinor: 123, purchaseCurrency: "EUR" }),
      ).rejects.toThrow();
      await members.removeMember(
        { userId: owner },
        { collectionId: c.id, userId: editor, expectedRevision: 2 },
      );
      await expect(
        service.updateItem(c.id, created.id, { title: "Revoked editor" }),
      ).rejects.toThrow();
      expect(
        (await db.collectibleItem.findUniqueOrThrow({ where: { id: created.id } })).title,
      ).toBe("Editor title");
    });
    it("refuses private or monetary writes even through the internal shared writer seam", async () => {
      const owner = randomUUID(),
        editor = randomUUID();
      for (const id of [owner, editor])
        await db.user.create({
          data: {
            id,
            name: "Scoped shared writer",
            email: `${id}@example.invalid`,
            emailVerified: true,
          },
        });
      const c = await db.collection.create({
        data: { ownerId: owner, name: "Strict shared metadata" },
      });
      await createMembershipService(db).addMember(
        { userId: owner },
        { collectionId: c.id, userId: editor, role: "EDITOR", expectedRevision: 0 },
      );
      const item = await createCollaborativeItemService(db, editor).createItem({
        collectionId: c.id,
        title: "Protected original",
      });
      await expect(
        db.$transaction((tx) =>
          updateItemInTransaction(
            tx,
            editor,
            item.id,
            UpdateItemInputSchema.parse({ privateNotes: "Must never be written" }),
            { collaborativeCollectionId: c.id },
          ),
        ),
      ).rejects.toThrow();
      await expect(
        db.$transaction((tx) =>
          createItemInTransaction(
            tx,
            editor,
            CreateItemInputSchema.parse({
              collectionId: c.id,
              title: "Forbidden priced shared create",
              purchaseAmountMinor: 123,
              purchaseCurrency: "EUR",
            }),
            { collaborativeCollectionId: c.id },
          ),
        ),
      ).rejects.toThrow();
      expect(
        (await db.collectibleItem.findUniqueOrThrow({ where: { id: item.id } })).privateNotes,
      ).toBeNull();
    });
    it("rechecks actual membership after the collection lock rather than trusting an earlier Editor lookup", async () => {
      const owner = randomUUID(),
        editor = randomUUID();
      for (const id of [owner, editor])
        await db.user.create({
          data: {
            id,
            name: "Current-role writer race",
            email: `${id}@example.invalid`,
            emailVerified: true,
          },
        });
      const c = await db.collection.create({
          data: { ownerId: owner, name: "Revoked while waiting" },
        }),
        members = createMembershipService(db);
      await members.addMember(
        { userId: owner },
        { collectionId: c.id, userId: editor, role: "EDITOR", expectedRevision: 0 },
      );
      const item = await createCollaborativeItemService(db, editor).createItem({
        collectionId: c.id,
        title: "Untouched by late Editor",
      });
      let ready!: () => void, release!: () => void;
      const reached = new Promise<void>((r) => {
          ready = r;
        }),
        held = new Promise<void>((r) => {
          release = r;
        });
      const wrapped: ItemDatabase = {
        $transaction: (work, options) =>
          db.$transaction(
            (tx) =>
              work(
                new Proxy(tx, {
                  get(target, key, receiver) {
                    if (key !== "$queryRaw") return Reflect.get(target, key, receiver);
                    return async <T>(query: TemplateStringsArray, ...values: unknown[]) => {
                      const result = await tx.$queryRaw<T>(query, ...values);
                      if (query.join("?").includes('SELECT c.id FROM "Collection" c')) {
                        ready();
                        await held;
                      }
                      return result;
                    };
                  },
                }),
              ),
            options,
          ),
      };
      const editing = createCollaborativeItemService(wrapped, editor)
        .updateItem(c.id, item.id, { title: "Revoked update" })
        .then(
          (value) => ({ value }),
          (error) => ({ error }),
        );
      try {
        await reached;
        await members.removeMember(
          { userId: owner },
          { collectionId: c.id, userId: editor, expectedRevision: 1 },
        );
        release();
        expect(await editing).toHaveProperty("error");
        expect((await db.collectibleItem.findUniqueOrThrow({ where: { id: item.id } })).title).toBe(
          "Untouched by late Editor",
        );
      } finally {
        release();
        await editing;
      }
    });

    it("refuses a stale collaborative edit confirmation instead of overwriting newer metadata", async () => {
      const owner = randomUUID();
      await db.user.create({
        data: {
          id: owner,
          name: "Own conflict fixture",
          email: `${owner}@example.invalid`,
          emailVerified: true,
        },
      });
      const c = await db.collection.create({
          data: { ownerId: owner, name: "Concurrent shared edits" },
        }),
        service = createCollaborativeItemService(db, owner),
        item = await service.createItem({ collectionId: c.id, title: "Before preview" }),
        row = await db.collectibleItem.findUniqueOrThrow({ where: { id: item.id } }),
        event = await db.auditEvent.findFirstOrThrow({
          where: { resourceId: item.id },
          orderBy: { sequence: "desc" },
        }),
        preconditions = {
          expectedUpdatedAt: row.updatedAt.toISOString(),
          expectedLatestSequence: event.sequence.toString(),
        };
      await service.updateItem(c.id, item.id, { title: "Newer title" });
      await expect(
        service.updateItem(c.id, item.id, { title: "Stale overwrite" }, preconditions),
      ).rejects.toMatchObject({ code: "ITEM_EDIT_CONFLICT" });
      expect((await db.collectibleItem.findUniqueOrThrow({ where: { id: item.id } })).title).toBe(
        "Newer title",
      );
    });
  },
);
