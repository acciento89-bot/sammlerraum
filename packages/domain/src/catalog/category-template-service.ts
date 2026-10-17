import {
  CatalogAttributeDefinitionInputSchema,
  CatalogAttributeDefinitionSchema,
  CatalogKeySchema,
  CategoryTemplateSchema,
  CreateCategoryTemplateInputSchema,
  type CanonicalCatalogAttributeValue,
  type CatalogLabels,
  type CategoryTemplate,
} from "@sammlerraum/contracts/catalog";
import type { CustomFieldType } from "@sammlerraum/contracts/custom-fields";

import { CustomFieldServiceError, validateFieldValue } from "../custom-fields/custom-field-service";

type CatalogErrorCode =
  | "CATALOG_TEMPLATE_INVALID"
  | "CATALOG_TEMPLATE_ALREADY_EXISTS"
  | "CATALOG_ATTRIBUTE_DEFINITION_INVALID"
  | "CATALOG_ATTRIBUTE_TYPE_MISMATCH"
  | "CATALOG_ATTRIBUTE_VALUE_INVALID";

export class CategoryTemplateServiceError extends Error {
  constructor(readonly code: CatalogErrorCode) {
    super(code);
    this.name = "CategoryTemplateServiceError";
  }
}

/** Validates input definitions or persisted DTOs; selection values are stable option keys. */
export async function validateAttributeValue(
  definitionInput: unknown,
  value: unknown,
): Promise<CanonicalCatalogAttributeValue> {
  const parsed = CatalogAttributeDefinitionInputSchema.safeParse(definitionInput);
  const stored = parsed.success
    ? parsed
    : CatalogAttributeDefinitionSchema.safeParse(definitionInput);
  if (!stored.success) {
    throw new CategoryTemplateServiceError("CATALOG_ATTRIBUTE_DEFINITION_INVALID");
  }
  const definition = stored.data;
  // Bound work before the shared validator normalizes values and deduplicates selections.
  if (
    (definition.type === "MULTI_SELECT" &&
      Array.isArray(value) &&
      (value.length > 100 ||
        value.some((entry) => typeof entry === "string" && entry.length > 20_000))) ||
    (!["INTEGER", "BOOLEAN", "MONEY", "MULTI_SELECT"].includes(definition.type) &&
      typeof value === "string" &&
      value.length > 20_000)
  ) {
    throw new CategoryTemplateServiceError("CATALOG_ATTRIBUTE_VALUE_INVALID");
  }
  try {
    return validateFieldValue(
      definition.type,
      value,
      definition.options.map((option) => option.key),
    );
  } catch (error) {
    if (error instanceof CustomFieldServiceError) {
      throw new CategoryTemplateServiceError(
        error.code === "CUSTOM_FIELD_TYPE_MISMATCH"
          ? "CATALOG_ATTRIBUTE_TYPE_MISMATCH"
          : "CATALOG_ATTRIBUTE_VALUE_INVALID",
      );
    }
    throw error;
  }
}

type LabelRow = { locale: string; label: string };
type OptionRow = { id: string; key: string; position: number; labels: LabelRow[] };
type DefinitionRow = {
  id: string;
  categoryTemplateId: string;
  key: string;
  type: CustomFieldType;
  position: number;
  labels: LabelRow[];
  options: OptionRow[];
};
type TemplateRow = { id: string; key: string; labels: LabelRow[]; definitions: DefinitionRow[] };
const templateInclude = {
  labels: true,
  definitions: {
    orderBy: { position: "asc" },
    include: {
      labels: true,
      options: { orderBy: { position: "asc" }, include: { labels: true } },
    },
  },
} as const;
type LabelsCreate = { create: LabelRow[] };
type TemplateCreateData = {
  key: string;
  labels: LabelsCreate;
  definitions: {
    create: Array<{
      key: string;
      type: CustomFieldType;
      position: number;
      labels: LabelsCreate;
      options: { create: Array<{ key: string; position: number; labels: LabelsCreate }> };
    }>;
  };
};
export type CategoryTemplateDatabase = {
  categoryTemplate: {
    create(args: {
      data: TemplateCreateData;
      include: typeof templateInclude;
    }): Promise<TemplateRow>;
    findUnique(args: {
      where: { key: string };
      include: typeof templateInclude;
    }): Promise<TemplateRow | null>;
  };
};

function labelsCreate(labels: CatalogLabels): LabelsCreate {
  return {
    create: [
      { locale: "de", label: labels.de },
      { locale: "en", label: labels.en },
    ],
  };
}
function labelsDto(labels: LabelRow[]): CatalogLabels {
  return {
    de: labels.find((label) => label.locale === "de")?.label ?? "",
    en: labels.find((label) => label.locale === "en")?.label ?? "",
  };
}
function templateDto(row: TemplateRow): CategoryTemplate {
  return CategoryTemplateSchema.parse({
    id: row.id,
    key: row.key,
    labels: labelsDto(row.labels),
    definitions: row.definitions.map((definition) => ({
      id: definition.id,
      categoryTemplateId: definition.categoryTemplateId,
      key: definition.key,
      type: definition.type,
      position: definition.position,
      labels: labelsDto(definition.labels),
      options: definition.options.map((option) => ({
        id: option.id,
        key: option.key,
        position: option.position,
        labels: labelsDto(option.labels),
      })),
    })),
  });
}

/**
 * Server maintenance entry point. Do not expose creation through ordinary-user routes.
 * Operator-granted mutation authority is intentionally outside this maintenance API.
 */
export function createCategoryTemplateMaintenanceService(database: CategoryTemplateDatabase) {
  async function createCategoryTemplate(input: unknown): Promise<CategoryTemplate> {
    const parsed = CreateCategoryTemplateInputSchema.safeParse(input);
    if (!parsed.success) throw new CategoryTemplateServiceError("CATALOG_TEMPLATE_INVALID");
    const template = parsed.data;
    try {
      // Prisma nested creation is one atomic transaction including all labels and options.
      const created = await database.categoryTemplate.create({
        data: {
          key: template.key,
          labels: labelsCreate(template.labels),
          definitions: {
            create: template.definitions.map((definition, position) => ({
              key: definition.key,
              type: definition.type,
              position,
              labels: labelsCreate(definition.labels),
              options: {
                create: definition.options.map((option, optionPosition) => ({
                  key: option.key,
                  position: optionPosition,
                  labels: labelsCreate(option.labels),
                })),
              },
            })),
          },
        },
        include: templateInclude,
      });
      return templateDto(created);
    } catch (error) {
      if (
        typeof error === "object" &&
        error !== null &&
        "code" in error &&
        error.code === "P2002"
      ) {
        throw new CategoryTemplateServiceError("CATALOG_TEMPLATE_ALREADY_EXISTS");
      }
      throw error;
    }
  }

  async function getCategoryTemplate(keyInput: string): Promise<CategoryTemplate | null> {
    const key = CatalogKeySchema.safeParse(keyInput);
    if (!key.success) throw new CategoryTemplateServiceError("CATALOG_TEMPLATE_INVALID");
    const row = await database.categoryTemplate.findUnique({
      where: { key: key.data },
      include: templateInclude,
    });
    return row ? templateDto(row) : null;
  }

  return { createCategoryTemplate, getCategoryTemplate, validateAttributeValue };
}
