import { randomBytes, randomUUID } from "node:crypto";
import { hashPassword } from "better-auth/crypto";
import { createTestDatabaseClient } from "@sammlerraum/db/test-database";
import { createItemService } from "@sammlerraum/domain/items/item-service";
export const enabled = process.env.RUN_AUTH_E2E === "1";
export const db = enabled ? createTestDatabaseClient() : undefined;
export const origin = "http://localhost:3000";
export async function searchFixture() {
  if (!db) throw new Error("Test database required");
  const f = {
    ownerId: randomUUID(),
    foreignId: randomUUID(),
    email: "",
    ip: "",
    password: "correct-horse-battery-staple",
    itemId: "",
    collectionId: "",
  };
  f.email = `${f.ownerId}@example.test`;
  const bytes = randomBytes(2);
  f.ip = `198.18.${bytes[0]}.${1 + (bytes[1]! % 254)}`;
  try {
    const [guard] = await db.$queryRaw<
      Array<{ name: string; version: string }>
    >`SELECT current_database() AS name,current_setting('server_version') AS version`;
    if (!guard?.name.endsWith("_test") || !guard.version.startsWith("17.11"))
      throw new Error("Guarded PostgreSQL 17.11 required");
    await db.user.create({
      data: {
        id: f.ownerId,
        name: "Synthetic search collector",
        email: f.email,
        emailVerified: true,
        accounts: {
          create: {
            id: randomUUID(),
            accountId: f.ownerId,
            providerId: "credential",
            password: await hashPassword(f.password),
          },
        },
      },
    });
    await db.user.create({
      data: {
        id: f.foreignId,
        name: "Foreign search collector",
        email: `${f.foreignId}@example.test`,
        emailVerified: true,
      },
    });
    f.collectionId = (
      await db.collection.create({
        data: { ownerId: f.ownerId, name: "Synthetic search collection" },
      })
    ).id;
    f.itemId = (
      await createItemService(db, f.ownerId).createItem({
        collectionId: f.collectionId,
        title: "Synthetic untagged card",
        quantity: 3,
      })
    ).id;
    const foreignCollection = await db.collection.create({
      data: { ownerId: f.foreignId, name: "Foreign collection", visibility: "PUBLIC" },
    });
    await createItemService(db, f.foreignId).createItem({
      collectionId: foreignCollection.id,
      title: "Foreign public card",
      visibility: "PUBLIC",
    });
    return f;
  } catch (error) {
    await cleanupSearchFixture(f);
    throw error;
  }
}
export async function cleanupSearchFixture(f: { ownerId: string; foreignId: string; ip: string }) {
  if (!db) return;
  await db.user.deleteMany({ where: { id: { in: [f.ownerId, f.foreignId] } } });
  await db.rateLimit.deleteMany({ where: { key: `${f.ip}|/sign-in/email` } });
}
