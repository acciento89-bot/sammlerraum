import {
  CreateCategoryTemplateInputSchema,
  type CreateCategoryTemplateInput,
} from "@sammlerraum/contracts/catalog";
import {
  createConditionMaintenanceService,
  type ConditionDatabase,
} from "../condition/condition-service";
import { CreateConditionSchemeInputSchema } from "@sammlerraum/contracts/condition";
import {
  createCategoryTemplateMaintenanceService,
  type CategoryTemplateDatabase,
} from "./category-template-service";
export type StarterDefinition = {
  template: CreateCategoryTemplateInput;
  scheme: {
    key: string;
    labels: { de: string; en: string };
    options: Array<{ labelKey: string; labels: { de: string; en: string }; normalizedBand: null }>;
  };
};
const field = (key: string, de: string, en: string) => ({
  key,
  labels: { de, en },
  type: "SHORT_TEXT" as const,
});
const options = (values: readonly string[]) =>
  values.map((label, index) => ({
    labelKey: `condition_${index + 1}`,
    labels: { de: label, en: label },
    normalizedBand: null,
  }));
export const STARTER_CATALOG: StarterDefinition[] = [
  {
    template: {
      key: "trading_cards",
      labels: { de: "Sammelkarten", en: "Trading cards" },
      definitions: [
        field("set", "Set", "Set"),
        field("collector_number", "Sammlernummer", "Collector number"),
      ],
    },
    scheme: {
      key: "cards_authored_v1",
      labels: { de: "Kartenzustand", en: "Card condition" },
      options: options(["Mint", "Near Mint", "Excellent", "Good", "Played", "Poor"]),
    },
  },
  {
    template: {
      key: "vinyl",
      labels: { de: "Schallplatten", en: "Vinyl records" },
      definitions: [
        field("artist", "Interpret", "Artist"),
        field("label", "Label", "Label"),
        field("catalogue_number", "Katalognummer", "Catalogue number"),
      ],
    },
    scheme: {
      key: "vinyl_authored_v1",
      labels: { de: "Plattenzustand", en: "Record condition" },
      options: options(["M", "NM", "VG+", "VG", "G", "F", "P"]),
    },
  },
];
type Query = { $queryRaw<T>(query: TemplateStringsArray, ...values: unknown[]): Promise<T> };
export type InitializerDatabase = {
  $transaction<T>(
    work: (tx: Query & CategoryTemplateDatabase) => Promise<T>,
    options: { isolationLevel: "ReadCommitted" },
  ): Promise<T>;
};
function conflict(key: string): never {
  throw new Error(`CATALOG_INITIALIZER_CONFLICT: ${key}`);
}
const same = (left: unknown, right: unknown) => JSON.stringify(left) === JSON.stringify(right);
/** Operator-only, never invoked by application startup. All preflight and writes share one transaction. */
export async function initializeCatalogDefinitions(
  database: InitializerDatabase,
  input: { definitions?: StarterDefinition[]; apply?: boolean } = {},
) {
  const definitions = input.definitions ?? STARTER_CATALOG;
  // Run the canonical validators before opening the maintenance transaction.
  for (const row of definitions) {
    CreateCategoryTemplateInputSchema.parse(row.template);
    CreateConditionSchemeInputSchema.parse({
      ...row.scheme,
      categoryTemplateId: "00000000-0000-4000-8000-000000000000",
    });
  }
  if (new Set(definitions.map((row) => row.template.key)).size !== definitions.length)
    conflict("duplicate category key");
  return database.$transaction(
    async (tx) => {
      await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended('sammlerraum:catalog-starter-initializer:v1',0))::text`;
      const categories = createCategoryTemplateMaintenanceService(tx);
      const planned: Array<{
        definition: StarterDefinition;
        categoryId: string | null;
        schemeMissing: boolean;
      }> = [];
      for (const definition of definitions) {
        const existing = await categories.getCategoryTemplate(definition.template.key);
        const [keyOwner] = await tx.$queryRaw<
          Array<{ categoryTemplateId: string }>
        >`SELECT "categoryTemplateId" FROM "ConditionScheme" WHERE key=${definition.scheme.key} FOR SHARE`;
        if (keyOwner && keyOwner.categoryTemplateId !== existing?.id)
          conflict(`${definition.template.key}: scheme key scope`);
        if (!existing) {
          planned.push({ definition, categoryId: null, schemeMissing: true });
          continue;
        }
        if (!same(existing.labels, definition.template.labels)) conflict(`${existing.key}: labels`);
        for (const [position, expected] of (definition.template.definitions ?? []).entries()) {
          const stored = existing.definitions.find((row) => row.key === expected.key);
          if (
            !stored ||
            stored.position !== position ||
            stored.type !== expected.type ||
            !same(stored.labels, expected.labels) ||
            !same(
              stored.options.map((row) => ({ key: row.key, labels: row.labels })),
              expected.options ?? [],
            )
          )
            conflict(`${existing.key}: ${expected.key}`);
        }
        const [scheme] = await tx.$queryRaw<
          Array<{ id: string; key: string; labelDe: string; labelEn: string }>
        >`SELECT id,key,"labelDe","labelEn" FROM "ConditionScheme" WHERE "categoryTemplateId"=${existing.id}::uuid FOR SHARE`;
        if (scheme) {
          if (
            scheme.key !== definition.scheme.key ||
            scheme.labelDe !== definition.scheme.labels.de ||
            scheme.labelEn !== definition.scheme.labels.en
          )
            conflict(`${existing.key}: condition scheme`);
          const options = await tx.$queryRaw<
            Array<{
              labelKey: string;
              position: number;
              labelDe: string;
              labelEn: string;
              normalizedBand: number | null;
            }>
          >`SELECT "labelKey",position,"labelDe","labelEn","normalizedBand" FROM "ConditionOption" WHERE "schemeId"=${scheme.id}::uuid ORDER BY position FOR SHARE`;
          for (const [position, expected] of definition.scheme.options.entries()) {
            const stored = options.find((row) => row.labelKey === expected.labelKey);
            if (
              !stored ||
              stored.position !== position ||
              stored.labelDe !== expected.labels.de ||
              stored.labelEn !== expected.labels.en ||
              stored.normalizedBand !== expected.normalizedBand
            )
              conflict(`${existing.key}: ${expected.labelKey}`);
          }
        }
        planned.push({ definition, categoryId: existing.id, schemeMissing: !scheme });
      }
      const actions = planned.map((row) => ({
        key: row.definition.template.key,
        action:
          row.categoryId === null
            ? "CREATE_CATEGORY_AND_SCHEME"
            : row.schemeMissing
              ? "CREATE_SCHEME"
              : "PRESERVE",
      }));
      if (input.apply) {
        // Typed adapter reuses the existing maintenance transaction implementation without nested transactions.
        const conditionDatabase: ConditionDatabase = {
          $queryRaw: (query, ...values) => tx.$queryRaw(query, ...values),
          $transaction: (work) => work(tx),
        };
        const conditions = createConditionMaintenanceService(conditionDatabase);
        for (const row of planned) {
          const categoryId =
            row.categoryId ?? (await categories.createCategoryTemplate(row.definition.template)).id;
          if (row.schemeMissing)
            await conditions.createConditionScheme({
              ...row.definition.scheme,
              categoryTemplateId: categoryId,
            });
        }
      }
      return { applied: input.apply === true, actions };
    },
    { isolationLevel: "ReadCommitted" },
  );
}
