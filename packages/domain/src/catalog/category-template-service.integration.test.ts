import { randomUUID } from "node:crypto";

import { createTestDatabaseClient } from "@sammlerraum/db/test-database";
import { afterAll, describe, expect, it } from "vitest";

import { createCategoryTemplateMaintenanceService } from "./category-template-service";

const enabled = process.env.RUN_DATABASE_INTEGRATION === "1";
const prisma = enabled ? createTestDatabaseClient() : undefined;
const prefix = `fixture_${randomUUID().replaceAll("-", "")}`;
const labels = { de: "  Münzen  ", en: "  Coins  " };
const input = (suffix: string) => ({
  key: `${prefix}_${suffix}`,
  labels,
  definitions: [
    { key: "year", labels: { de: "Jahr", en: "Year" }, type: "INTEGER" as const },
    {
      key: "metal",
      labels: { de: "Metall", en: "Metal" },
      type: "SINGLE_SELECT" as const,
      options: [
        { key: "silver", labels: { de: "Silber", en: "Silver" } },
        { key: "gold", labels: { de: "Gold", en: "Gold" } },
      ],
    },
  ],
});

describe.runIf(enabled)("category templates PostgreSQL", () => {
  afterAll(async () => {
    if (!prisma) return;
    const templateScope = { key: { startsWith: prefix } };
    const definitionScope = { categoryTemplate: templateScope };
    // Delete only owned children, then their fixture parents.
    await prisma.catalogAttributeOptionLabel.deleteMany({
      where: { option: { definition: definitionScope } },
    });
    await prisma.catalogAttributeOption.deleteMany({ where: { definition: definitionScope } });
    await prisma.catalogAttributeLabel.deleteMany({ where: { definition: definitionScope } });
    await prisma.catalogAttributeDefinition.deleteMany({ where: definitionScope });
    await prisma.categoryTemplateLabel.deleteMany({ where: { categoryTemplate: templateScope } });
    await prisma.categoryTemplate.deleteMany({ where: templateScope });
    await prisma.$disconnect();
  });

  it("atomically creates and reads ordered localized definitions with stable keys", async () => {
    const service = createCategoryTemplateMaintenanceService(prisma!);
    const created = await service.createCategoryTemplate(input("read"));
    expect(created).toMatchObject({ key: `${prefix}_read`, labels: { de: "Münzen", en: "Coins" } });
    expect(created.definitions.map((field) => [field.key, field.position])).toEqual([
      ["year", 0],
      ["metal", 1],
    ]);
    const metal = created.definitions[1]!;
    expect(metal.options.map((option) => [option.key, option.position])).toEqual([
      ["silver", 0],
      ["gold", 1],
    ]);
    expect(metal.options[0]!.labels).toEqual({ de: "Silber", en: "Silver" });
    await expect(service.getCategoryTemplate(created.key)).resolves.toEqual(created);
    await expect(service.validateAttributeValue(metal, " SILVER ")).resolves.toBe("silver");
    await expect(service.getCategoryTemplate(`${prefix}_missing`)).resolves.toBeNull();
  });

  it("rejects invalid and private properties without leaving template rows", async () => {
    const service = createCategoryTemplateMaintenanceService(prisma!);
    for (const invalid of [
      { ...input("invalid"), ownerId: "private" },
      { ...input("invalid"), labels: { de: "Only German" } },
      {
        ...input("invalid"),
        definitions: [input("invalid").definitions[0], input("invalid").definitions[0]],
      },
      {
        ...input("invalid"),
        definitions: Array.from({ length: 101 }, (_, n) => ({
          key: `field_${n}`,
          labels,
          type: "INTEGER",
        })),
      },
      {
        ...input("invalid"),
        definitions: [
          {
            key: "metal",
            labels,
            type: "SINGLE_SELECT",
            options: [
              { key: "silver", labels },
              { key: "silver", labels },
            ],
          },
        ],
      },
    ]) {
      await expect(service.createCategoryTemplate(invalid)).rejects.toMatchObject({
        code: "CATALOG_TEMPLATE_INVALID",
      });
    }
    expect(await prisma!.categoryTemplate.count({ where: { key: `${prefix}_invalid` } })).toBe(0);
  });

  it("maps concurrent unique-key conflicts and permits identical attribute keys in different templates", async () => {
    const service = createCategoryTemplateMaintenanceService(prisma!);
    const results = await Promise.allSettled([
      service.createCategoryTemplate(input("race")),
      service.createCategoryTemplate(input("race")),
    ]);
    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    const failure = results.find((result) => result.status === "rejected");
    expect(failure).toMatchObject({
      status: "rejected",
      reason: { code: "CATALOG_TEMPLATE_ALREADY_EXISTS" },
    });
    await expect(service.createCategoryTemplate(input("scope"))).resolves.toMatchObject({
      definitions: [{ key: "year" }, { key: "metal" }],
    });
    expect(
      await prisma!.catalogAttributeDefinition.count({
        where: { categoryTemplate: { key: `${prefix}_race` } },
      }),
    ).toBe(2);
  });

  it("enforces scoped key and order uniqueness in PostgreSQL and rolls back nested failures", async () => {
    const service = createCategoryTemplateMaintenanceService(prisma!);
    const created = await service.createCategoryTemplate(input("constraints"));
    const year = created.definitions[0]!;
    const metal = created.definitions[1]!;
    await expect(
      prisma!.catalogAttributeDefinition.create({
        data: { categoryTemplateId: created.id, key: year.key, type: "INTEGER", position: 2 },
      }),
    ).rejects.toMatchObject({ code: "P2002" });
    await expect(
      prisma!.catalogAttributeDefinition.create({
        data: { categoryTemplateId: created.id, key: "new", type: "INTEGER", position: 0 },
      }),
    ).rejects.toMatchObject({ code: "P2002" });
    await expect(
      prisma!.catalogAttributeOption.create({
        data: { definitionId: metal.id, key: "silver", position: 2 },
      }),
    ).rejects.toMatchObject({ code: "P2002" });
    await expect(
      prisma!.catalogAttributeOption.create({
        data: { definitionId: metal.id, key: "bronze", position: 0 },
      }),
    ).rejects.toMatchObject({ code: "P2002" });
    await expect(
      prisma!.categoryTemplate.create({
        data: {
          key: `${prefix}_rollback`,
          definitions: {
            create: [
              { key: "duplicate", type: "INTEGER", position: 0 },
              { key: "duplicate", type: "INTEGER", position: 1 },
            ],
          },
        },
      }),
    ).rejects.toMatchObject({ code: "P2002" });
    expect(await prisma!.categoryTemplate.count({ where: { key: `${prefix}_rollback` } })).toBe(0);
  });
});
