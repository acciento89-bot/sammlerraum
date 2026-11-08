import { randomUUID } from "node:crypto";
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createTestDatabaseClient } from "@sammlerraum/db/test-database";
import { createCategoryTemplateMaintenanceService } from "./category-template-service";
import { createCatalogMaintenanceService } from "./catalog-service";
import { createCatalogReadService } from "./catalog-read-service";
const enabled = process.env.RUN_DATABASE_INTEGRATION === "1";
const db = enabled ? createTestDatabaseClient() : undefined;
let categoryId: string, entryId: string;
describe.runIf(enabled)("bounded canonical revision history", () => {
  beforeAll(async () => {
    categoryId = (
      await createCategoryTemplateMaintenanceService(db!).createCategoryTemplate({
        key: `history_${randomUUID().replaceAll("-", "")}`,
        labels: { de: "Historie", en: "History" },
      })
    ).id;
    const service = createCatalogMaintenanceService(db!);
    entryId = (
      await service.createCatalogEntry({
        categoryTemplateId: categoryId,
        text: { language: "en", title: "First" },
        sources: [{ note: "Authored source" }],
      })
    ).state.id;
    await service.updateCatalogEntry(entryId, 1, { text: { language: "en", title: "Second" } });
    await service.updateCatalogEntry(entryId, 2, { text: { language: "en", title: "Third" } });
  });
  afterAll(async () => {
    if (!db) return;
    await db.catalogRevision.deleteMany({ where: { entryId } });
    await db.catalogEntry.deleteMany({ where: { id: entryId } });
    await db.categoryTemplate.deleteMany({ where: { id: categoryId } });
    await db.$disconnect();
  });
  it("paginates immutable snapshots without private identities", async () => {
    const reads = createCatalogReadService(db!);
    const first = await reads.listCatalogRevisions(entryId, { limit: 2 });
    expect(first.revisions.map((row) => row.revision)).toEqual([3, 2]);
    expect(first.revisions[0]).toMatchObject({ text: { title: "Third" } });
    expect(first.nextCursor).toBeTypeOf("string");
    const last = await reads.listCatalogRevisions(entryId, { limit: 2, cursor: first.nextCursor! });
    expect(last.revisions.map((row) => row.revision)).toEqual([1]);
    expect(last.nextCursor).toBeNull();
    const detail = await reads.getCatalogRevision(entryId, 1);
    expect(detail.state.text.title).toBe("First");
    expect(detail.state.sources).toEqual([{ note: "Authored source" }]);
    expect(JSON.stringify(first)).not.toMatch(/proposer|moderator|email|owner|privateNotes/);
  });
  it("rejects invalid bounds, entry-mismatched cursors and absent revisions", async () => {
    const reads = createCatalogReadService(db!);
    for (const input of [{ limit: 0 }, { limit: 51 }, { cursor: "bad" }, { unexpected: true }])
      await expect(reads.listCatalogRevisions(entryId, input)).rejects.toThrow();
    const first = await reads.listCatalogRevisions(entryId, { limit: 1 });
    await expect(
      reads.listCatalogRevisions(randomUUID(), { cursor: first.nextCursor! }),
    ).rejects.toThrow();
    for (const revision of [0, 1.5, 2147483648, 4])
      await expect(reads.getCatalogRevision(entryId, revision)).rejects.toThrow();
  });
});
