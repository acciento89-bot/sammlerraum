import { randomUUID } from "node:crypto";
import { beforeAll, afterAll, describe, it, expect } from "vitest";
import { createLegacyMoneyTestSchema } from "@sammlerraum/db/test-legacy-money-schema";
import { createTestDatabaseClient } from "@sammlerraum/db/test-database";
import { createItemService } from "../items/item-service";
import { createPublicProfileService, publicCollectionSlug } from "./public-profile-service";
let db: ReturnType<typeof createTestDatabaseClient>;
let isolated: Awaited<ReturnType<typeof createLegacyMoneyTestSchema>>;
describe.runIf(process.env.RUN_DATABASE_INTEGRATION === "1")("public collector routes", () => {
  beforeAll(async () => {
    isolated = await createLegacyMoneyTestSchema();
    db = createTestDatabaseClient({ databaseUrl: isolated.databaseUrl, schema: isolated.schema });
  });
  afterAll(async () => {
    await db?.$disconnect();
    await isolated?.cleanup();
  });
  async function fixture() {
    const ownerId = randomUUID(),
      handle = `collector-${ownerId}`;
    await db.user.create({
      data: {
        id: ownerId,
        name: "Private login name",
        email: `${ownerId}@example.invalid`,
        profile: { create: { handle, displayName: "Public name", bio: "Public bio" } },
      },
    });
    const collection = await db.collection.create({
      data: { ownerId, name: "Public collection", visibility: "PUBLIC" },
    });
    const privateCollection = await db.collection.create({
      data: { ownerId, name: "Private collection", visibility: "PRIVATE" },
    });
    const items = createItemService(db, ownerId);
    const item = await items.createItem({
      collectionId: collection.id,
      title: "Public item",
      publicDescription: "Public description",
      privateNotes: "Hidden note",
      visibility: "PUBLIC",
    });
    await items.createItem({
      collectionId: collection.id,
      title: "Private item",
      visibility: "PRIVATE",
    });
    await items.createItem({
      collectionId: collection.id,
      title: "Unlisted item",
      visibility: "UNLISTED",
    });
    const parent = await db.collectionNode.create({
      data: { collectionId: collection.id, name: "Hidden ancestor", visibility: "PRIVATE" },
    });
    const nested = await items.createItem({
      collectionId: collection.id,
      nodeId: parent.id,
      title: "Hidden nested item",
      visibility: "PUBLIC",
    });
    return {
      ownerId,
      handle,
      collection,
      privateCollection,
      item,
      nested,
      service: createPublicProfileService(db),
    };
  }
  it("exposes only public profile fields and public collections without private totals", async () => {
    const f = await fixture();
    const result = await f.service.getProfile(`@${f.handle}`);
    expect(result?.profile.displayName).toBe("Public name");
    expect(result?.collections.map((c) => c.name)).toEqual(["Public collection"]);
    expect(JSON.stringify(result)).not.toMatch(
      /Private collection|Private login name|@example.invalid|Hidden note|itemCount/,
    );
    expect((await f.service.getProfile(`%40${f.handle}`))?.profile.displayName).toBe("Public name");
    expect(await f.service.getProfile(`%2540${f.handle}`)).toBeNull();
    expect(await f.service.getProfile("%ZZ")).toBeNull();
    expect(await f.service.getProfile(f.handle)).toBeNull();
  });
  it("resolves stable collision-free collection slugs after renames and rejects wrong owner/slug", async () => {
    const f = await fixture(),
      slug = publicCollectionSlug(f.collection.id);
    await db.collection.update({
      where: { id: f.collection.id },
      data: { name: "Renamed collection" },
    });
    expect((await f.service.getCollection(`@${f.handle}`, slug))?.collection.name).toBe(
      "Renamed collection",
    );
    expect(
      await f.service.getCollection(`@${f.handle}`, publicCollectionSlug(f.privateCollection.id)),
    ).toBeNull();
    expect(await f.service.getCollection("@someone-else", slug)).toBeNull();
    expect(await f.service.getCollection(`@${f.handle}`, "x" + slug)).toBeNull();
  });
  it("hides private/unlisted items and inaccessible ancestors even under a public collection URL", async () => {
    const f = await fixture(),
      slug = publicCollectionSlug(f.collection.id);
    expect(
      (await f.service.getCollection(`@${f.handle}`, slug))?.items.map((i) => i.title),
    ).toEqual(["Public item"]);
    expect((await f.service.getItem(`@${f.handle}`, slug, f.item.id))?.item.publicDescription).toBe(
      "Public description",
    );
    expect(await f.service.getItem(`@${f.handle}`, slug, f.nested.id)).toBeNull();
    await db.collection.update({ where: { id: f.collection.id }, data: { visibility: "PRIVATE" } });
    expect(await f.service.getItem(`@${f.handle}`, slug, f.item.id)).toBeNull();
  });
});
