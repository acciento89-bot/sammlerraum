import { randomBytes, randomUUID } from "node:crypto";
import { hashPassword } from "better-auth/crypto";
import { createTestDatabaseClient } from "@sammlerraum/db/test-database";
import { createCategoryTemplateMaintenanceService } from "@sammlerraum/domain/catalog/category-template-service";
import { createCatalogMaintenanceService } from "@sammlerraum/domain/catalog/catalog-service";
import { createItemService } from "@sammlerraum/domain/items/item-service";
import { createMarketDataService } from "@sammlerraum/domain/market-data/market-data-service";
import { createValuationQuery } from "@sammlerraum/domain/valuations/valuation-query";
import { ProviderRegistry } from "@sammlerraum/market-data/provider-registry";
import { observationKinds } from "@sammlerraum/market-data/types";
import { ValuationSummarySchema } from "@sammlerraum/contracts/valuations";
export const enabled = process.env.RUN_AUTH_E2E === "1";
export const db = enabled ? createTestDatabaseClient() : undefined;
export const origin = "http://localhost:3000";
export async function valuationFixture() {
  if (!db) throw new Error("Test database required");
  const f = {
    ownerId: randomUUID(),
    email: "",
    ip: "",
    rateLimitKey: "",
    password: "correct-horse-battery-staple",
    collectionId: "",
    itemId: "",
    entryId: "",
    categoryId: "",
    providerId: `values_${randomUUID().replaceAll("-", "")}`,
  };
  f.email = `${f.ownerId}@example.test`;
  try {
    const [guard] = await db.$queryRaw<
      Array<{ name: string; version: string }>
    >`SELECT current_database() AS name,current_setting('server_version') AS version`;
    if (!guard?.name.endsWith("_test") || !guard.version.startsWith("17."))
      throw new Error("Owned PostgreSQL 17 required");
    // Installed Better Auth normalizes IPv4 unchanged and keys `${ip}|${path}`.
    // Only credential sign-in requests carry this synthetic client address.
    for (let attempt = 0; attempt < 100; attempt++) {
      const bytes = randomBytes(2);
      const ip = `198.18.${bytes[0]}.${1 + (bytes[1]! % 254)}`;
      const key = `${ip}|/sign-in/email`;
      if (!(await db.rateLimit.findUnique({ where: { key } }))) {
        f.ip = ip;
        f.rateLimitKey = key;
        break;
      }
    }
    if (!f.rateLimitKey) throw new Error("Could not reserve a synthetic rate-limit key");
    await db.user.create({
      data: {
        id: f.ownerId,
        name: "Synthetic values collector",
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
    f.collectionId = (
      await db.collection.create({
        data: { ownerId: f.ownerId, name: "Synthetic values collection" },
      })
    ).id;
    f.itemId = (
      await createItemService(db, f.ownerId).createItem({
        collectionId: f.collectionId,
        title: "Synthetic collector's card",
        quantity: 3,
      })
    ).id;
    f.categoryId = (
      await createCategoryTemplateMaintenanceService(db).createCategoryTemplate({
        key: f.providerId,
        labels: { de: "Testkarten", en: "Test cards" },
      })
    ).id;
    const catalog = createCatalogMaintenanceService(db);
    f.entryId = (
      await catalog.createCatalogEntry({
        categoryTemplateId: f.categoryId,
        text: { language: "en", title: "Synthetic market reference" },
      })
    ).state.id;
    const identifier = await catalog.addExternalIdentifier(f.entryId, 1, {
      namespace: f.providerId,
      type: "product",
      value: "card-001",
    });
    await createItemService(db, f.ownerId).linkItemToCatalog(f.itemId, f.entryId);
    const registry = new ProviderRegistry([
      {
        provider: {
          id: f.providerId,
          fetch: async () => {
            throw new Error("No provider fetch permitted");
          },
        },
        identifierNamespace: f.providerId,
        identifierType: "product",
      },
    ]);
    const market = createMarketDataService(db, registry);
    const request = await market.prepareFetchRequest(f.providerId, {
      entryId: f.entryId,
      variantId: null,
      identifierId: identifier.id,
      pollId: randomUUID(),
    });
    for (let n = 0; n < 23; n++) {
      await market.recordObservations(
        f.providerId,
        observationKinds.map((kind, index) => ({
          externalId: "card-001",
          identity: { mode: "POLL" as const },
          sourceMetric: `synthetic-${kind.toLowerCase()}`,
          currency: index === 6 ? "USD" : "EUR",
          qualifiers: {
            condition: "Synthetic mint",
            shippingIncluded: false,
            printedReference: "SYNTHETIC-" + "R".repeat(100),
          },
          confidence: {
            sampleSize: 0,
            sourceLabel: "Synthetic sample",
            methodology: "Fixture observations, not live quotes",
          },
          sourceUrl: "https://example.org/card/001",
          sourceReference: `Synthetic ${kind} ${n}`,
          time:
            index === 0
              ? { basis: "SOURCE" as const, precision: "DAY" as const, value: "2025-01-02" }
              : index === 1
                ? {
                    basis: "SOURCE" as const,
                    precision: "SECOND" as const,
                    value: "2025-01-02T03:04:05.000Z",
                  }
                : { basis: "FETCH" as const, precision: "MILLISECOND" as const },
          ...(kind === "PRICE_RANGE"
            ? { kind, lowMinor: 100n, highMinor: 250n }
            : { kind, amountMinor: 9007199254740993n }),
        })),
        {
          request: { ...request, pollId: randomUUID() },
          fetchedAt: `2025-02-01T00:00:${String(n).padStart(2, "0")}.123Z`,
        },
      );
    }
    const query = createValuationQuery(
      db,
      {
        snapshotForOwner: (actor) =>
          actor === f.ownerId
            ? [
                {
                  providerId: f.providerId,
                  identifierNamespace: f.providerId,
                  identifierType: "product",
                  allowHistorical: true,
                },
              ]
            : [],
      },
      registry,
    );
    const summary = ValuationSummarySchema.parse(
      await query.getItemValuationSummary(f.itemId, { userId: f.ownerId }),
    );
    if (
      summary.external.groups.length !== 4 ||
      !summary.currencyConflict ||
      summary.aggregate !== null
    )
      throw new Error("Fixture projection mismatch");
    const persisted = await db.marketObservation.findFirstOrThrow({
      where: { entryId: f.entryId, kind: "ASKING_PRICE" },
    });
    if (persisted.amountMinor !== 9007199254740993n || persisted.minorUnitExponent !== 2)
      throw new Error("Persisted fixture mismatch");
    return { ...f, query };
  } catch (error) {
    try {
      await cleanupValuationFixture(f);
    } catch (cleanup) {
      throw new AggregateError([error, cleanup], "Setup and cleanup failed");
    }
    throw error;
  }
}
export async function cleanupValuationFixture(f: {
  ownerId: string;
  entryId: string;
  categoryId: string;
  providerId: string;
  rateLimitKey: string;
}) {
  if (!db) return;
  const failures: unknown[] = [];
  const attempt = async (work: () => Promise<unknown>) => {
    try {
      await work();
    } catch (e) {
      failures.push(e);
    }
  };
  await attempt(() => db!.user.deleteMany({ where: { id: f.ownerId } }));
  if (f.entryId) {
    await attempt(
      () =>
        db!
          .$executeRaw`DELETE FROM "MarketObservation" WHERE "entryId"=${f.entryId}::uuid AND "providerId"=${f.providerId}`,
    );
    await attempt(() =>
      db!.catalogExternalIdentifier.deleteMany({ where: { entryId: f.entryId } }),
    );
    await attempt(() => db!.catalogVariant.deleteMany({ where: { entryId: f.entryId } }));
    await attempt(() => db!.catalogRevision.deleteMany({ where: { entryId: f.entryId } }));
    await attempt(() => db!.catalogEntry.deleteMany({ where: { id: f.entryId } }));
  }
  if (f.categoryId)
    await attempt(() => db!.categoryTemplate.deleteMany({ where: { id: f.categoryId } }));
  if (f.rateLimitKey)
    await attempt(() => db!.rateLimit.deleteMany({ where: { key: f.rateLimitKey } }));
  if (failures.length) throw new AggregateError(failures, "Valuation fixture cleanup failed");
}
