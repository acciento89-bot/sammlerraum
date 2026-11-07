import { randomUUID } from "node:crypto";
import { createPrismaClient } from "@sammlerraum/db/create-client";
import { hashPassword } from "better-auth/crypto";
import { createCategoryTemplateMaintenanceService } from "@sammlerraum/domain/catalog/category-template-service";
import {
  createConditionMaintenanceService,
  createConditionService,
} from "@sammlerraum/domain/condition/condition-service";
import { createGradingService } from "@sammlerraum/domain/grading/grading-service";

const url = process.env.DATABASE_URL ?? "";
export const enabled = process.env.RUN_AUTH_E2E === "1";
if (enabled && (!new URL(url).pathname.endsWith("_test") || process.env.NODE_ENV === "production"))
  throw new Error("Catalog fixtures require a non-production _test database");
export const db = createPrismaClient(url);
export const origin = "http://localhost:3000";
export async function catalogFixture() {
  const id = randomUUID();
  const password = "correct-horse-battery-staple";
  const email = `${id}@example.test`;
  await db.user.create({
    data: {
      id,
      name: "Catalog collector",
      email,
      emailVerified: true,
      accounts: {
        create: {
          id: randomUUID(),
          accountId: id,
          providerId: "credential",
          password: await hashPassword(password),
        },
      },
    },
  });
  const collection = await db.collection.create({
    data: { ownerId: id, name: "Reference collection" },
  });
  const item = await db.collectibleItem.create({
    data: {
      ownerId: id,
      collectionId: collection.id,
      title: "My graded card",
      privateNotes: "PRIVATE CATALOG SECRET",
      purchaseAmountMinor: 12345,
      purchaseCurrency: "EUR",
    },
  });
  const key = `browser_${id.replaceAll("-", "")}`;
  const category = await createCategoryTemplateMaintenanceService(db).createCategoryTemplate({
    key,
    labels: { de: "Testkarten", en: "Test cards" },
    definitions: [{ key: "set", labels: { de: "Set", en: "Set" }, type: "SHORT_TEXT" }],
  });
  const scheme = await createConditionMaintenanceService(db).createConditionScheme({
    categoryTemplateId: category.id,
    key,
    labels: { de: "Kartenzustand", en: "Card condition" },
    options: [
      { labelKey: "mint", labels: { de: "Mint", en: "Mint" } },
      { labelKey: "near_mint", labels: { de: "Near Mint", en: "Near Mint" } },
    ],
  });
  await createConditionService(db, id).setItemCategory(item.id, {
    categoryTemplateId: category.id,
  });
  await createConditionService(db, id).setItemCondition(item.id, scheme.options[0]!.id);
  await createGradingService(db, id).addGrading(item.id, {
    provider: "PSA",
    grade: "9",
    certificateNo: "000123",
  });
  return { id, email, password, item, category, scheme };
}
export async function cleanupCatalog(fixture: Awaited<ReturnType<typeof catalogFixture>>) {
  const entries = await db.catalogEntry.findMany({
    where: { categoryTemplateId: fixture.category.id },
    select: { id: true },
  });
  const entryIds = entries.map((row) => row.id);
  await db.catalogProposal.deleteMany({
    where: {
      OR: [
        { proposerId: fixture.id },
        { targetEntryId: { in: entryIds } },
        { resultEntryId: { in: entryIds } },
      ],
    },
  });
  await db.catalogRollbackAudit.deleteMany({
    where: { OR: [{ actorId: fixture.id }, { entryId: { in: entryIds } }] },
  });
  await db.applicationRoleGrant.deleteMany({ where: { userId: fixture.id } });
  await db.user.delete({ where: { id: fixture.id } });
  await db.catalogAttributeValue.deleteMany({ where: { entryId: { in: entryIds } } });
  await db.catalogExternalIdentifier.deleteMany({ where: { entryId: { in: entryIds } } });
  await db.catalogVariant.deleteMany({ where: { entryId: { in: entryIds } } });
  await db.catalogRevision.deleteMany({ where: { entryId: { in: entryIds } } });
  await db.catalogEntry.deleteMany({ where: { id: { in: entryIds } } });
  await db.conditionOption.deleteMany({ where: { categoryTemplateId: fixture.category.id } });
  await db.conditionScheme.deleteMany({ where: { categoryTemplateId: fixture.category.id } });
  await db.categoryTemplate.delete({ where: { id: fixture.category.id } });
}
