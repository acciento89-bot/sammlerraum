# Task3 review package
BASE92e9f70a44dfbb7c848679bf1cb4cad746a13d22 HEAD312b53e1bc993ee5c46b264190db9839a7c6e683
Commits:87b3e99 tests-only RED;312b53e1 implementation

### .github/workflows/ci.yml
modified +5 -0
```diff
@@ -59,6 +59,10 @@ jobs:
           cache: pnpm
       - run: pnpm install --frozen-lockfile
       - run: pnpm --filter @sammlerraum/db prisma generate
+      - name: Run identifier and tag service focused tests
+        run: pnpm vitest run packages/domain/src/items/identifier-service.test.ts
+      - name: Run item domain tests
+        run: pnpm vitest run packages/domain/src/items
       - name: Apply PostgreSQL migrations
         run: pnpm --filter @sammlerraum/db prisma migrate deploy
       - run: pnpm test
@@ -77,6 +81,7 @@ jobs:
           packages/domain/src/identity/security-service.test.ts
           packages/domain/src/collections/collection-service.test.ts
           packages/domain/src/items/item-service.test.ts
+          packages/domain/src/items/identifier-service.test.ts
           apps/web/src/lib/security-service.integration.test.ts
       - name: Install Chromium for authentication journeys
         run: pnpm --filter @sammlerraum/web exec playwright install --with-deps chromium
```

### packages/db/prisma/migrations/20260920213000_item_identifiers_tags/migration.sql
added +49 -0
```diff
@@ -0,0 +1,49 @@
+-- CreateTable
+CREATE TABLE "ItemIdentifier" (
+    "id" UUID NOT NULL,
+    "itemId" UUID NOT NULL,
+    "type" TEXT NOT NULL,
+    "value" TEXT NOT NULL,
+    "normalizedValue" TEXT NOT NULL,
+
+    CONSTRAINT "ItemIdentifier_pkey" PRIMARY KEY ("id")
+);
+
+-- CreateTable
+CREATE TABLE "Tag" (
+    "id" UUID NOT NULL,
+    "ownerId" TEXT NOT NULL,
+    "name" TEXT NOT NULL,
+    "normalizedName" TEXT NOT NULL,
+
+    CONSTRAINT "Tag_pkey" PRIMARY KEY ("id")
+);
+
+-- CreateTable
+CREATE TABLE "ItemTag" (
+    "itemId" UUID NOT NULL,
+    "tagId" UUID NOT NULL,
+
+    CONSTRAINT "ItemTag_pkey" PRIMARY KEY ("itemId","tagId")
+);
+
+-- CreateIndex
+CREATE UNIQUE INDEX "ItemIdentifier_itemId_type_normalizedValue_key" ON "ItemIdentifier"("itemId", "type", "normalizedValue");
+
+-- CreateIndex
+CREATE UNIQUE INDEX "Tag_ownerId_normalizedName_key" ON "Tag"("ownerId", "normalizedName");
+
+-- CreateIndex
+CREATE INDEX "ItemTag_tagId_idx" ON "ItemTag"("tagId");
+
+-- AddForeignKey
+ALTER TABLE "ItemIdentifier" ADD CONSTRAINT "ItemIdentifier_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "CollectibleItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;
+
+-- AddForeignKey
+ALTER TABLE "Tag" ADD CONSTRAINT "Tag_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
+
+-- AddForeignKey
+ALTER TABLE "ItemTag" ADD CONSTRAINT "ItemTag_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "CollectibleItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;
+
+-- AddForeignKey
+ALTER TABLE "ItemTag" ADD CONSTRAINT "ItemTag_tagId_fkey" FOREIGN KEY ("tagId") REFERENCES "Tag"("id") ON DELETE CASCADE ON UPDATE CASCADE;
```

### packages/db/prisma/schema.prisma
modified +35 -0
```diff
@@ -58,6 +58,7 @@ model User {
   passkeys      Passkey[]
   profile       UserProfile?
   collections   Collection[]
+  tags          Tag[]
 
   @@unique([email])
   @@map("user")
@@ -115,11 +116,45 @@ model CollectibleItem {
   updatedAt           DateTime        @updatedAt
   collection          Collection      @relation(fields: [collectionId], references: [id], onDelete: Cascade)
   node                CollectionNode? @relation(fields: [nodeId, collectionId], references: [id, collectionId], onDelete: Restrict)
+  identifiers         ItemIdentifier[]
+  itemTags            ItemTag[]
 
   @@index([collectionId])
   @@index([nodeId, collectionId])
 }
 
+model ItemIdentifier {
+  id              String          @id @default(uuid()) @db.Uuid
+  itemId          String          @db.Uuid
+  type            String
+  value           String
+  normalizedValue String
+  item            CollectibleItem @relation(fields: [itemId], references: [id], onDelete: Cascade)
+
+  @@unique([itemId, type, normalizedValue])
+}
+
+model Tag {
+  id             String    @id @default(uuid()) @db.Uuid
+  ownerId        String
+  name           String
+  normalizedName String
+  owner          User      @relation(fields: [ownerId], references: [id], onDelete: Cascade)
+  itemTags       ItemTag[]
+
+  @@unique([ownerId, normalizedName])
+}
+
+model ItemTag {
+  itemId String          @db.Uuid
+  tagId  String          @db.Uuid
+  item   CollectibleItem @relation(fields: [itemId], references: [id], onDelete: Cascade)
+  tag    Tag             @relation(fields: [tagId], references: [id], onDelete: Cascade)
+
+  @@id([itemId, tagId])
+  @@index([tagId])
+}
+
 model Session {
   id        String   @id
   expiresAt DateTime
```

### packages/domain/package.json
modified +3 -1
```diff
@@ -6,7 +6,9 @@
     "./collections/collection-service": "./src/collections/collection-service.ts",
     "./items/item-service": "./src/items/item-service.ts",
     "./identity/profile-service": "./src/identity/profile-service.ts",
-    "./identity/security-service": "./src/identity/security-service.ts"
+    "./identity/security-service": "./src/identity/security-service.ts",
+    "./items/identifier-service": "./src/items/identifier-service.ts",
+    "./items/tag-service": "./src/items/tag-service.ts"
   },
   "scripts": {
     "build": "pnpm typecheck",
```

### packages/domain/src/items/identifier-service.test.ts
added +387 -0
```diff
@@ -0,0 +1,387 @@
+import { randomUUID } from "node:crypto";
+
+import { createPrismaClient } from "@sammlerraum/db/create-client";
+import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
+
+import { createIdentifierService, type IdentifierDatabase } from "./identifier-service";
+import { createTagService, type TagDatabase } from "./tag-service";
+
+const itemId = "00000000-0000-4000-8000-000000000001";
+const otherItemId = "00000000-0000-4000-8000-000000000002";
+
+describe("item identifier service", () => {
+  it("normalizes EAN values without removing meaningful leading zeroes", async () => {
+    let createdIdentifiers: Array<Record<string, string>> = [];
+    const createMany = vi.fn(
+      async ({ data }: { data: Array<Record<string, string>> }) => {
+        createdIdentifiers = data;
+        return { count: data.length };
+      },
+    );
+    const transaction = {
+      $queryRaw: vi.fn().mockResolvedValue([{ id: itemId }]),
+      itemIdentifier: {
+        deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
+        createMany,
+        findMany: vi.fn(async () =>
+          createdIdentifiers.map((row, index) => ({
+            id: `00000000-0000-4000-8000-00000000001${index}`,
+            ...row,
+          })),
+        ),
+      },
+    };
+    const database = {
+      $transaction: vi.fn(
+        async <T>(operation: (tx: typeof transaction) => Promise<T>) => operation(transaction),
+      ),
+    };
+    const service = createIdentifierService(
+      database as unknown as IdentifierDatabase,
+      "trusted-owner",
+    );
+
+    const saved = await service.setItemIdentifiers(itemId, [
+      { type: " ean ", value: " 0123456789012 " },
+    ]);
+
+    expect(saved).toMatchObject([
+      {
+        itemId,
+        type: "EAN",
+        value: "0123456789012",
+        normalizedValue: "0123456789012",
+      },
+    ]);
+    expect(createMany).toHaveBeenCalledWith({
+      data: [
+        {
+          itemId,
+          type: "EAN",
+          value: "0123456789012",
+          normalizedValue: "0123456789012",
+        },
+      ],
+    });
+  });
+
+  it("atomically replaces identifiers after locking the owned item", async () => {
+    const calls: string[] = [];
+    const transaction = {
+      $queryRaw: vi.fn().mockImplementation(async () => {
+        calls.push("lock");
+        return [{ id: itemId }];
+      }),
+      itemIdentifier: {
+        deleteMany: vi.fn().mockImplementation(async () => {
+          calls.push("delete");
+          return { count: 1 };
+        }),
+        createMany: vi.fn().mockImplementation(async () => {
+          calls.push("create");
+          return { count: 1 };
+        }),
+        findMany: vi.fn().mockImplementation(async () => {
+          calls.push("read");
+          return [
+            {
+              id: "00000000-0000-4000-8000-000000000010",
+              itemId,
+              type: "CERTIFICATE",
+              value: "AB-012",
+              normalizedValue: "AB-012",
+            },
+          ];
+        }),
+      },
+    };
+    const database = {
+      $transaction: vi.fn(
+        async <T>(operation: (tx: typeof transaction) => Promise<T>) => operation(transaction),
+      ),
+    };
+    const service = createIdentifierService(
+      database as unknown as IdentifierDatabase,
+      "trusted-owner",
+    );
+
+    await service.setItemIdentifiers(itemId, [{ type: "certificate", value: "AB-012" }]);
+
+    expect(database.$transaction).toHaveBeenCalledOnce();
+    expect(calls).toEqual(["lock", "delete", "create", "read"]);
+  });
+
+  it("returns a safe not-found error and performs no writes for another owner's item", async () => {
+    const deleteMany = vi.fn();
+    const createMany = vi.fn();
+    const transaction = {
+      $queryRaw: vi.fn().mockResolvedValue([]),
+      itemIdentifier: {
+        deleteMany,
+        createMany,
+        findMany: vi.fn(),
+      },
+    };
+    const database = {
+      $transaction: async <T>(operation: (tx: typeof transaction) => Promise<T>) =>
+        operation(transaction),
+    };
+    const service = createIdentifierService(
+      database as unknown as IdentifierDatabase,
+      "trusted-owner",
+    );
+
+    await expect(
+      service.setItemIdentifiers(itemId, [{ type: "EAN", value: "0123456789012" }]),
+    ).rejects.toMatchObject({ code: "ITEM_NOT_FOUND", message: "Item not found" });
+    expect(deleteMany).not.toHaveBeenCalled();
+    expect(createMany).not.toHaveBeenCalled();
+  });
+});
+
+describe("item tag service", () => {
+  it("normalizes, de-duplicates, and reuses tags within the trusted owner scope", async () => {
+    const upsert = vi.fn(
+      async ({ create }: { create: Record<string, string> }) => ({
+        id:
+          create.normalizedName === "signed"
+            ? "00000000-0000-4000-8000-000000000010"
+            : "00000000-0000-4000-8000-000000000011",
+        ownerId: create.ownerId,
+        name: create.name,
+        normalizedName: create.normalizedName,
+      }),
+    );
+    const createMany = vi.fn().mockResolvedValue({ count: 2 });
+    const transaction = {
+      $queryRaw: vi.fn().mockResolvedValue([{ id: itemId }]),
+      tag: { upsert },
+      itemTag: {
+        deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
+        createMany,
+      },
+    };
+    const database = {
+      $transaction: vi.fn(
+        async <T>(operation: (tx: typeof transaction) => Promise<T>) => operation(transaction),
+      ),
+    };
+    const service = createTagService(database as unknown as TagDatabase, "trusted-owner");
+
+    const saved = await service.setItemTags(itemId, [
+      " Signed ",
+      "signed",
+      "  Mint   Condition ",
+    ]);
+
+    expect(saved).toMatchObject([
+      { ownerId: "trusted-owner", name: "Signed", normalizedName: "signed" },
+      {
+        ownerId: "trusted-owner",
+        name: "Mint Condition",
+        normalizedName: "mint condition",
+      },
+    ]);
+    expect(upsert).toHaveBeenNthCalledWith(1, {
+      where: {
+        ownerId_normalizedName: {
+          ownerId: "trusted-owner",
+          normalizedName: "signed",
+        },
+      },
+      create: {
+        ownerId: "trusted-owner",
+        name: "Signed",
+        normalizedName: "signed",
+      },
+      update: {},
+    });
+    expect(createMany).toHaveBeenCalledWith({
+      data: [
+        {
+          itemId,
+          tagId: "00000000-0000-4000-8000-000000000010",
+        },
+        {
+          itemId,
+          tagId: "00000000-0000-4000-8000-000000000011",
+        },
+      ],
+    });
+  });
+
+  it("does not reveal or mutate another owner's item", async () => {
+    const deleteMany = vi.fn();
+    const upsert = vi.fn();
+    const transaction = {
+      $queryRaw: vi.fn().mockResolvedValue([]),
+      tag: { upsert },
+      itemTag: { deleteMany, createMany: vi.fn() },
+    };
+    const service = createTagService(
+      {
+        $transaction: async <T>(operation: (tx: typeof transaction) => Promise<T>) =>
+          operation(transaction),
+      } as unknown as TagDatabase,
+      "trusted-owner",
+    );
+
+    await expect(service.setItemTags(otherItemId, ["Secret"])).rejects.toMatchObject({
+      code: "ITEM_NOT_FOUND",
+      message: "Item not found",
+    });
+    expect(deleteMany).not.toHaveBeenCalled();
+    expect(upsert).not.toHaveBeenCalled();
+  });
+});
+
+const runIntegration = process.env.RUN_DATABASE_INTEGRATION === "1";
+const databaseUrl = process.env.DATABASE_URL ?? "";
+const prisma = runIntegration ? createPrismaClient(databaseUrl) : undefined;
+
+describe.runIf(runIntegration)("identifier and tag PostgreSQL integration", () => {
+  beforeAll(async () => prisma?.$connect());
+  afterAll(async () => prisma?.$disconnect());
+
+  async function createOwnerAndItem(label: string) {
+    const ownerId = randomUUID();
+    await prisma!.user.create({
+      data: {
+        id: ownerId,
+        name: label,
+        email: `${ownerId}@example.test`,
+        emailVerified: true,
+      },
+    });
+    const collection = await prisma!.collection.create({
+      data: { ownerId, name: `${label} collection` },
+    });
+    const item = await prisma!.collectibleItem.create({
+      data: { collectionId: collection.id, title: `${label} item` },
+    });
+    return { ownerId, collectionId: collection.id, itemId: item.id };
+  }
+
+  it("scopes identifier uniqueness to an item and tags to an owner", async () => {
+    const first = await createOwnerAndItem("First");
+    const second = await createOwnerAndItem("Second");
+    const firstIdentifiers = createIdentifierService(
+      prisma! as unknown as IdentifierDatabase,
+      first.ownerId,
+    );
+    const secondIdentifiers = createIdentifierService(
+      prisma! as unknown as IdentifierDatabase,
+      second.ownerId,
+    );
+    const firstTags = createTagService(prisma! as unknown as TagDatabase, first.ownerId);
+    const secondTags = createTagService(prisma! as unknown as TagDatabase, second.ownerId);
+    const sameOwnerItem = await prisma!.collectibleItem.create({
+      data: { collectionId: first.collectionId, title: "First owner second item" },
+    });
+
+    try {
+      await expect(
+        firstIdentifiers.setItemIdentifiers(first.itemId, [
+          { type: "EAN", value: "0123456789012" },
+        ]),
+      ).resolves.toMatchObject([{ normalizedValue: "0123456789012" }]);
+      await expect(
+        secondIdentifiers.setItemIdentifiers(second.itemId, [
+          { type: "EAN", value: "0123456789012" },
+        ]),
+      ).resolves.toMatchObject([{ normalizedValue: "0123456789012" }]);
+      await expect(
+        firstIdentifiers.setItemIdentifiers(sameOwnerItem.id, [
+          { type: "EAN", value: "0123456789012" },
+        ]),
+      ).resolves.toMatchObject([{ normalizedValue: "0123456789012" }]);
+
+      await firstTags.setItemTags(first.itemId, [" Signed "]);
+      await firstTags.setItemTags(sameOwnerItem.id, ["signed"]);
+      await secondTags.setItemTags(second.itemId, ["signed"]);
+
+      const matchingTags = await prisma!.tag.findMany({
+        where: { normalizedName: "signed" },
+      });
+      expect(matchingTags).toHaveLength(2);
+      expect(new Set(matchingTags.map((tag) => tag.ownerId))).toEqual(
+        new Set([first.ownerId, second.ownerId]),
+      );
+
+      await expect(
+        secondIdentifiers.setItemIdentifiers(first.itemId, [
+          { type: "EAN", value: "9999999999999" },
+        ]),
+      ).rejects.toMatchObject({ code: "ITEM_NOT_FOUND" });
+      await expect(secondTags.setItemTags(first.itemId, ["stolen"])).rejects.toMatchObject({
+        code: "ITEM_NOT_FOUND",
+      });
+      await expect(
+        prisma!.itemIdentifier.findMany({ where: { itemId: first.itemId } }),
+      ).resolves.toMatchObject([{ normalizedValue: "0123456789012" }]);
+    } finally {
+      await prisma!.user.deleteMany({
+        where: { id: { in: [first.ownerId, second.ownerId] } },
+      });
+    }
+  });
+
+  it("rolls back an identifier replacement when its insert fails", async () => {
+    const fixture = await createOwnerAndItem("Rollback");
+    const service = createIdentifierService(
+      prisma! as unknown as IdentifierDatabase,
+      fixture.ownerId,
+    );
+
+    try {
+      await service.setItemIdentifiers(fixture.itemId, [
+        { type: "CERTIFICATE", value: "ORIGINAL-01" },
+      ]);
+      const failingDatabase = {
+        $transaction: async <T>(
+          operation: (transaction: Record<string, unknown>) => Promise<T>,
+          options: { isolationLevel: "ReadCommitted" },
+        ) =>
+          prisma!.$transaction(
+            async (transaction) =>
+              operation({
+                $queryRaw: transaction.$queryRaw.bind(transaction),
+                itemIdentifier: {
+                  deleteMany: transaction.itemIdentifier.deleteMany.bind(
+                    transaction.itemIdentifier,
+                  ),
+                  createMany: async () => {
+                    throw new Error("fixture identifier insert failure");
+                  },
+                  findMany: transaction.itemIdentifier.findMany.bind(
+                    transaction.itemIdentifier,
+                  ),
+                },
+              }),
+            options,
+          ),
+      };
+      const failingService = createIdentifierService(
+        failingDatabase as unknown as IdentifierDatabase,
+        fixture.ownerId,
+      );
+
+      await expect(
+        failingService.setItemIdentifiers(fixture.itemId, [
+          { type: "CERTIFICATE", value: "REPLACEMENT-02" },
+        ]),
+      ).rejects.toThrow("fixture identifier insert failure");
+      await expect(
+        prisma!.itemIdentifier.findMany({ where: { itemId: fixture.itemId } }),
+      ).resolves.toMatchObject([
+        {
+          type: "CERTIFICATE",
+          value: "ORIGINAL-01",
+          normalizedValue: "ORIGINAL-01",
+        },
+      ]);
+    } finally {
+      await prisma!.user.delete({ where: { id: fixture.ownerId } });
+    }
+  });
+});
```

### packages/domain/src/items/identifier-service.ts
added +165 -0
```diff
@@ -0,0 +1,165 @@
+import { CollectibleItemSchema } from "@sammlerraum/contracts/items";
+
+export type ItemIdentifierInput = {
+  type: string;
+  value: string;
+};
+
+export type ItemIdentifier = {
+  id: string;
+  itemId: string;
+  type: string;
+  value: string;
+  normalizedValue: string;
+};
+
+type StoredIdentifier = ItemIdentifier;
+
+const identifierSelect = {
+  id: true,
+  itemId: true,
+  type: true,
+  value: true,
+  normalizedValue: true,
+} as const;
+
+type IdentifierCreateData = Omit<StoredIdentifier, "id">;
+
+type IdentifierTransaction = {
+  itemIdentifier: {
+    deleteMany(args: { where: { itemId: string } }): Promise<{ count: number }>;
+    createMany(args: { data: IdentifierCreateData[] }): Promise<{ count: number }>;
+    findMany(args: {
+      where: { itemId: string };
+      select: typeof identifierSelect;
+    }): Promise<StoredIdentifier[]>;
+  };
+  $queryRaw<T>(query: TemplateStringsArray, ...values: unknown[]): Promise<T>;
+};
+
+export type IdentifierDatabase = {
+  $transaction<T>(
+    operation: (transaction: IdentifierTransaction) => Promise<T>,
+    options: { isolationLevel: "ReadCommitted" },
+  ): Promise<T>;
+};
+
+export type IdentifierServiceErrorCode = "ITEM_NOT_FOUND" | "IDENTIFIERS_INVALID";
+
+const errorMessages: Record<IdentifierServiceErrorCode, string> = {
+  ITEM_NOT_FOUND: "Item not found",
+  IDENTIFIERS_INVALID: "Identifiers are invalid",
+};
+
+export class IdentifierServiceError extends Error {
+  constructor(readonly code: IdentifierServiceErrorCode) {
+    super(errorMessages[code]);
+    this.name = "IdentifierServiceError";
+  }
+}
+
+function normalizeWhitespace(value: string): string {
+  return value.normalize("NFKC").trim().replace(/\s+/gu, " ");
+}
+
+function normalizeIdentifier(input: ItemIdentifierInput): Omit<IdentifierCreateData, "itemId"> {
+  if (
+    typeof input !== "object" ||
+    input === null ||
+    typeof input.type !== "string" ||
+    typeof input.value !== "string"
+  ) {
+    throw new IdentifierServiceError("IDENTIFIERS_INVALID");
+  }
+
+  const type = normalizeWhitespace(input.type).toUpperCase();
+  const value = normalizeWhitespace(input.value);
+  if (type.length === 0 || type.length > 64 || value.length === 0 || value.length > 512) {
+    throw new IdentifierServiceError("IDENTIFIERS_INVALID");
+  }
+
+  const normalizedValue = /^(EAN|UPC|ISBN)$/u.test(type)
+    ? value.replace(/[\s-]+/gu, "").toUpperCase()
+    : value.toUpperCase();
+  if (normalizedValue.length === 0) {
+    throw new IdentifierServiceError("IDENTIFIERS_INVALID");
+  }
+  return { type, value, normalizedValue };
+}
+
+function parseIdentifiers(
+  inputs: readonly ItemIdentifierInput[],
+): Array<Omit<IdentifierCreateData, "itemId">> {
+  if (!Array.isArray(inputs) || inputs.length > 100) {
+    throw new IdentifierServiceError("IDENTIFIERS_INVALID");
+  }
+
+  const identifiers = new Map<string, Omit<IdentifierCreateData, "itemId">>();
+  for (const input of inputs) {
+    const identifier = normalizeIdentifier(input);
+    identifiers.set(`${identifier.type}\u0000${identifier.normalizedValue}`, identifier);
+  }
+  return [...identifiers.values()];
+}
+
+async function lockOwnedItem(
+  transaction: IdentifierTransaction,
+  itemId: string,
+  actorUserId: string,
+): Promise<void> {
+  const rows = await transaction.$queryRaw<Array<{ id: string }>>`
+    SELECT item."id"
+    FROM "CollectibleItem" item
+    JOIN "Collection" collection ON collection."id" = item."collectionId"
+    WHERE item."id" = ${itemId}::uuid AND collection."ownerId" = ${actorUserId}
+    FOR UPDATE OF item
+  `;
+  if (rows.length !== 1) {
+    throw new IdentifierServiceError("ITEM_NOT_FOUND");
+  }
+}
+
+export function createIdentifierService(database: IdentifierDatabase, actorUserId: string) {
+  async function setItemIdentifiers(
+    itemIdInput: string,
+    identifiersInput: readonly ItemIdentifierInput[],
+  ): Promise<ItemIdentifier[]> {
+    const itemId = CollectibleItemSchema.shape.id.parse(itemIdInput);
+    const identifiers = parseIdentifiers(identifiersInput);
+
+    return database.$transaction(
+      async (transaction) => {
+        await lockOwnedItem(transaction, itemId, actorUserId);
+        await transaction.itemIdentifier.deleteMany({ where: { itemId } });
+        if (identifiers.length > 0) {
+          await transaction.itemIdentifier.createMany({
+            data: identifiers.map((identifier) => ({ itemId, ...identifier })),
+          });
+        }
+
+        const saved = await transaction.itemIdentifier.findMany({
+          where: { itemId },
+          select: identifierSelect,
+        });
+        const byKey = new Map(
+          saved.map((identifier) => [
+            `${identifier.type}\u0000${identifier.normalizedValue}`,
+            identifier,
+          ]),
+        );
+        return identifiers.map((identifier) => {
+          const savedIdentifier = byKey.get(
+            `${identifier.type}\u0000${identifier.normalizedValue}`,
+          );
+          if (!savedIdentifier) {
+            throw new Error("Identifier replacement did not persist every row");
+          }
+          return savedIdentifier;
+        });
+      },
+      { isolationLevel: "ReadCommitted" },
+    );
+  }
+
+  return { setItemIdentifiers };
+}
```

### packages/domain/src/items/tag-service.ts
added +145 -0
```diff
@@ -0,0 +1,145 @@
+import { CollectibleItemSchema } from "@sammlerraum/contracts/items";
+
+export type ItemTag = {
+  id: string;
+  ownerId: string;
+  name: string;
+  normalizedName: string;
+};
+
+type TagCreateData = Omit<ItemTag, "id">;
+
+type TagTransaction = {
+  tag: {
+    upsert(args: {
+      where: {
+        ownerId_normalizedName: {
+          ownerId: string;
+          normalizedName: string;
+        };
+      };
+      create: TagCreateData;
+      update: Record<string, never>;
+    }): Promise<ItemTag>;
+  };
+  itemTag: {
+    deleteMany(args: { where: { itemId: string } }): Promise<{ count: number }>;
+    createMany(args: {
+      data: Array<{ itemId: string; tagId: string }>;
+    }): Promise<{ count: number }>;
+  };
+  $queryRaw<T>(query: TemplateStringsArray, ...values: unknown[]): Promise<T>;
+};
+
+export type TagDatabase = {
+  $transaction<T>(
+    operation: (transaction: TagTransaction) => Promise<T>,
+    options: { isolationLevel: "ReadCommitted" },
+  ): Promise<T>;
+};
+
+export type TagServiceErrorCode = "ITEM_NOT_FOUND" | "TAGS_INVALID";
+
+const errorMessages: Record<TagServiceErrorCode, string> = {
+  ITEM_NOT_FOUND: "Item not found",
+  TAGS_INVALID: "Tags are invalid",
+};
+
+export class TagServiceError extends Error {
+  constructor(readonly code: TagServiceErrorCode) {
+    super(errorMessages[code]);
+    this.name = "TagServiceError";
+  }
+}
+
+function normalizeTag(value: string): { name: string; normalizedName: string } {
+  if (typeof value !== "string") {
+    throw new TagServiceError("TAGS_INVALID");
+  }
+  const name = value.normalize("NFKC").trim().replace(/\s+/gu, " ");
+  if (name.length === 0 || name.length > 100) {
+    throw new TagServiceError("TAGS_INVALID");
+  }
+  return { name, normalizedName: name.toLowerCase() };
+}
+
+function parseTags(inputs: readonly string[]): Array<{
+  name: string;
+  normalizedName: string;
+}> {
+  if (!Array.isArray(inputs) || inputs.length > 100) {
+    throw new TagServiceError("TAGS_INVALID");
+  }
+
+  const tags = new Map<string, { name: string; normalizedName: string }>();
+  for (const input of inputs) {
+    const tag = normalizeTag(input);
+    if (!tags.has(tag.normalizedName)) {
+      tags.set(tag.normalizedName, tag);
+    }
+  }
+  return [...tags.values()];
+}
+
+async function lockOwnedItem(
+  transaction: TagTransaction,
+  itemId: string,
+  actorUserId: string,
+): Promise<void> {
+  const rows = await transaction.$queryRaw<Array<{ id: string }>>`
+    SELECT item."id"
+    FROM "CollectibleItem" item
+    JOIN "Collection" collection ON collection."id" = item."collectionId"
+    WHERE item."id" = ${itemId}::uuid AND collection."ownerId" = ${actorUserId}
+    FOR UPDATE OF item
+  `;
+  if (rows.length !== 1) {
+    throw new TagServiceError("ITEM_NOT_FOUND");
+  }
+}
+
+export function createTagService(database: TagDatabase, actorUserId: string) {
+  async function setItemTags(
+    itemIdInput: string,
+    tagsInput: readonly string[],
+  ): Promise<ItemTag[]> {
+    const itemId = CollectibleItemSchema.shape.id.parse(itemIdInput);
+    const tags = parseTags(tagsInput);
+
+    return database.$transaction(
+      async (transaction) => {
+        await lockOwnedItem(transaction, itemId, actorUserId);
+        await transaction.itemTag.deleteMany({ where: { itemId } });
+
+        const saved: ItemTag[] = [];
+        for (const tag of tags) {
+          saved.push(
+            await transaction.tag.upsert({
+              where: {
+                ownerId_normalizedName: {
+                  ownerId: actorUserId,
+                  normalizedName: tag.normalizedName,
+                },
+              },
+              create: {
+                ownerId: actorUserId,
+                name: tag.name,
+                normalizedName: tag.normalizedName,
+              },
+              update: {},
+            }),
+          );
+        }
+        if (saved.length > 0) {
+          await transaction.itemTag.createMany({
+            data: saved.map((tag) => ({ itemId, tagId: tag.id })),
+          });
+        }
+        return saved;
+      },
+      { isolationLevel: "ReadCommitted" },
+    );
+  }
+
+  return { setItemTags };
+}
```