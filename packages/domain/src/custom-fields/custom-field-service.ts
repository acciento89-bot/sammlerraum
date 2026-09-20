import {
  CreateCustomFieldDefinitionInputSchema,
  CustomFieldDefinitionSchema,
  CustomFieldMoneyValueSchema,
  CustomFieldTypeSchema,
  type CanonicalCustomFieldValue,
  type CreateCustomFieldDefinitionInput,
  type CustomFieldDefinition,
  type CustomFieldType,
  type CustomFieldValueRecord,
} from "@sammlerraum/contracts/custom-fields";

type FieldTypeRow = { type: CustomFieldType; collectionId: string };
type CustomFieldOptionRow = { id: string; value: string; position: number };

const definitionSelect = {
  id: true,
  collectionId: true,
  name: true,
  type: true,
} as const;

type DefinitionCreateData = {
  collectionId: string;
  name: string;
  normalizedName: string;
  type: CustomFieldType;
};

type ValueWriteData = {
  fieldType: CustomFieldType;
  shortTextValue: string | null;
  longTextValue: string | null;
  integerValue: bigint | null;
  decimalValue: string | null;
  dateValue: Date | null;
  booleanValue: boolean | null;
  singleSelectOptionId: string | null;
  urlValue: string | null;
  moneyAmountMinor: bigint | null;
  moneyCurrency: string | null;
};

type CustomFieldTransaction = {
  $queryRaw<T>(query: TemplateStringsArray, ...values: unknown[]): Promise<T>;
  customFieldDefinition: {
    findUnique(args: {
      where: { collectionId_normalizedName: { collectionId: string; normalizedName: string } };
      select: { id: true };
    }): Promise<{ id: string } | null>;
    create(args: {
      data: DefinitionCreateData;
      select: typeof definitionSelect;
    }): Promise<{ id: string; collectionId: string; name: string; type: CustomFieldType }>;
  };
  customFieldOption: {
    createMany(args: {
      data: Array<{
        fieldDefinitionId: string;
        value: string;
        normalizedValue: string;
        position: number;
      }>;
    }): Promise<{ count: number }>;
    findMany(args: {
      where: { fieldDefinitionId: string };
      select: { id: true; value: true; position: true };
      orderBy: { position: "asc" };
    }): Promise<CustomFieldOptionRow[]>;
  };
  customFieldValue: {
    deleteMany(args: {
      where: { itemId: string; fieldDefinitionId: string };
    }): Promise<{ count: number }>;
    upsert(args: {
      where: { itemId_fieldDefinitionId: { itemId: string; fieldDefinitionId: string } };
      create: ValueWriteData & {
        itemId: string;
        fieldDefinitionId: string;
        collectionId: string;
      };
      update: ValueWriteData;
    }): Promise<unknown>;
  };
  customFieldMultiSelectValue: {
    deleteMany(args: {
      where: { itemId: string; fieldDefinitionId: string };
    }): Promise<{ count: number }>;
    createMany(args: {
      data: Array<{
        itemId: string;
        fieldDefinitionId: string;
        optionId: string;
        position: number;
      }>;
    }): Promise<{ count: number }>;
  };
};

export type CustomFieldDatabase = {
  $transaction<T>(
    operation: (transaction: CustomFieldTransaction) => Promise<T>,
    options: { isolationLevel: "ReadCommitted" },
  ): Promise<T>;
};

export type CustomFieldServiceErrorCode =
  | "COLLECTION_NOT_FOUND"
  | "CUSTOM_FIELD_DEFINITION_INVALID"
  | "CUSTOM_FIELD_ALREADY_EXISTS"
  | "CUSTOM_FIELD_NOT_FOUND"
  | "CUSTOM_FIELD_TYPE_MISMATCH"
  | "CUSTOM_FIELD_VALUE_INVALID";

const errorMessages: Record<CustomFieldServiceErrorCode, string> = {
  COLLECTION_NOT_FOUND: "Collection not found",
  CUSTOM_FIELD_DEFINITION_INVALID: "Custom field definition is invalid",
  CUSTOM_FIELD_ALREADY_EXISTS: "A custom field with this name already exists",
  CUSTOM_FIELD_NOT_FOUND: "Custom field target not found",
  CUSTOM_FIELD_TYPE_MISMATCH: "Custom field value does not match its definition type",
  CUSTOM_FIELD_VALUE_INVALID: "Custom field value is invalid",
};

export class CustomFieldServiceError extends Error {
  constructor(readonly code: CustomFieldServiceErrorCode) {
    super(errorMessages[code]);
    this.name = "CustomFieldServiceError";
  }
}

function typeMismatch(): never {
  throw new CustomFieldServiceError("CUSTOM_FIELD_TYPE_MISMATCH");
}

function invalidValue(): never {
  throw new CustomFieldServiceError("CUSTOM_FIELD_VALUE_INVALID");
}

function normalizeText(value: string, maximumLength: number): string {
  if (value.includes("\u0000")) invalidValue();
  const normalized = value.normalize("NFKC").trim();
  if (normalized.length === 0 || normalized.length > maximumLength) invalidValue();
  return normalized;
}

function normalizeOption(value: string): string {
  if (value.includes("\u0000")) invalidValue();
  const normalized = value.normalize("NFKC").trim().replace(/\s+/gu, " ");
  if (normalized.length === 0) invalidValue();
  return normalized.toLocaleLowerCase("und");
}

function canonicalDecimal(value: string): string {
  if (!/^[+-]?\d+(?:\.\d+)?$/u.test(value)) invalidValue();
  const negative = value.startsWith("-");
  const unsigned = value.replace(/^[+-]/u, "");
  const [rawInteger = "", rawFraction = ""] = unsigned.split(".");
  const integer = rawInteger.replace(/^0+(?=\d)/u, "");
  const fraction = rawFraction.replace(/0+$/u, "");
  if (integer.length > 20 || rawFraction.length > 18 || integer.length + fraction.length > 38) {
    invalidValue();
  }
  const magnitude = fraction.length === 0 ? integer : `${integer}.${fraction}`;
  return negative && magnitude !== "0" ? `-${magnitude}` : magnitude;
}

function isCanonicalCalendarDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/u.test(value) || value.startsWith("0000-")) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.valueOf()) && date.toISOString().slice(0, 10) === value;
}

function canonicalUrl(value: string): string {
  if (value.includes("\u0000") || value.length > 2_048) invalidValue();
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return invalidValue();
  }
  if (
    (url.protocol !== "http:" && url.protocol !== "https:") ||
    url.username.length > 0 ||
    url.password.length > 0
  ) {
    invalidValue();
  }
  const canonical = url.toString();
  if (canonical.length > 2_048) invalidValue();
  return canonical;
}

function canonicalOption(value: string, allowedOptions: readonly string[]): string {
  const normalized = normalizeOption(value);
  const option = allowedOptions.find((candidate) => normalizeOption(candidate) === normalized);
  if (!option) invalidValue();
  return option;
}

export function validateFieldValue(
  typeInput: CustomFieldType,
  value: unknown,
  allowedOptions: readonly string[] = [],
): CanonicalCustomFieldValue {
  const parsedType = CustomFieldTypeSchema.safeParse(typeInput);
  if (!parsedType.success) invalidValue();
  const type = parsedType.data;

  switch (type) {
    case "SHORT_TEXT":
      if (typeof value !== "string") return typeMismatch();
      return normalizeText(value, 255);
    case "LONG_TEXT":
      if (typeof value !== "string") return typeMismatch();
      return normalizeText(value, 10_000);
    case "INTEGER":
      if (typeof value !== "number") return typeMismatch();
      if (!Number.isSafeInteger(value)) return invalidValue();
      return value;
    case "DECIMAL":
      if (typeof value !== "string") return typeMismatch();
      return canonicalDecimal(value);
    case "DATE":
      if (typeof value !== "string") return typeMismatch();
      if (!isCanonicalCalendarDate(value)) return invalidValue();
      return value;
    case "BOOLEAN":
      if (typeof value !== "boolean") return typeMismatch();
      return value;
    case "SINGLE_SELECT":
      if (typeof value !== "string") return typeMismatch();
      return canonicalOption(value, allowedOptions);
    case "MULTI_SELECT": {
      if (!Array.isArray(value) || value.some((entry) => typeof entry !== "string")) {
        return typeMismatch();
      }
      const canonical: string[] = [];
      const seen = new Set<string>();
      for (const entry of value) {
        const option = canonicalOption(entry, allowedOptions);
        const key = normalizeOption(option);
        if (!seen.has(key)) {
          canonical.push(option);
          seen.add(key);
        }
      }
      return canonical;
    }
    case "URL":
      if (typeof value !== "string") return typeMismatch();
      return canonicalUrl(value);
    case "MONEY": {
      if (typeof value !== "object" || value === null || Array.isArray(value)) {
        return typeMismatch();
      }
      const money = CustomFieldMoneyValueSchema.safeParse(value);
      if (!money.success) return invalidValue();
      return money.data;
    }
  }
}

function parseDefinition(input: CreateCustomFieldDefinitionInput): {
  collectionId: string;
  name: string;
  normalizedName: string;
  type: CustomFieldType;
  options: Array<{ value: string; normalizedValue: string; position: number }>;
} {
  const parsed = CreateCustomFieldDefinitionInputSchema.safeParse(input);
  if (!parsed.success || parsed.data.name.includes("\u0000")) {
    throw new CustomFieldServiceError("CUSTOM_FIELD_DEFINITION_INVALID");
  }
  const name = parsed.data.name.normalize("NFKC").trim().replace(/\s+/gu, " ");
  if (name.length === 0 || name.length > 120) {
    throw new CustomFieldServiceError("CUSTOM_FIELD_DEFINITION_INVALID");
  }
  const normalizedName = name.toLocaleLowerCase("und");
  const seen = new Set<string>();
  const options = parsed.data.options.map((inputOption, position) => {
    let value: string;
    let normalizedValue: string;
    try {
      value = normalizeText(inputOption, 200).replace(/\s+/gu, " ");
      normalizedValue = normalizeOption(value);
    } catch {
      throw new CustomFieldServiceError("CUSTOM_FIELD_DEFINITION_INVALID");
    }
    if (seen.has(normalizedValue)) {
      throw new CustomFieldServiceError("CUSTOM_FIELD_DEFINITION_INVALID");
    }
    seen.add(normalizedValue);
    return { value, normalizedValue, position };
  });
  return {
    collectionId: parsed.data.collectionId,
    name,
    normalizedName,
    type: parsed.data.type,
    options,
  };
}

function emptyValueData(type: CustomFieldType): ValueWriteData {
  return {
    fieldType: type,
    shortTextValue: null,
    longTextValue: null,
    integerValue: null,
    decimalValue: null,
    dateValue: null,
    booleanValue: null,
    singleSelectOptionId: null,
    urlValue: null,
    moneyAmountMinor: null,
    moneyCurrency: null,
  };
}

function persistenceData(
  type: CustomFieldType,
  value: CanonicalCustomFieldValue,
  options: readonly CustomFieldOptionRow[],
): ValueWriteData {
  const data = emptyValueData(type);
  switch (type) {
    case "SHORT_TEXT":
      data.shortTextValue = value as string;
      break;
    case "LONG_TEXT":
      data.longTextValue = value as string;
      break;
    case "INTEGER":
      data.integerValue = BigInt(value as number);
      break;
    case "DECIMAL":
      data.decimalValue = value as string;
      break;
    case "DATE":
      data.dateValue = new Date(`${value as string}T00:00:00.000Z`);
      break;
    case "BOOLEAN":
      data.booleanValue = value as boolean;
      break;
    case "SINGLE_SELECT": {
      const option = options.find((candidate) => candidate.value === value);
      if (!option) invalidValue();
      data.singleSelectOptionId = option.id;
      break;
    }
    case "MULTI_SELECT":
      break;
    case "URL":
      data.urlValue = value as string;
      break;
    case "MONEY":
      data.moneyAmountMinor = BigInt((value as { amountMinor: number }).amountMinor);
      data.moneyCurrency = (value as { currency: string }).currency;
      break;
  }
  return data;
}

export function createCustomFieldService(database: CustomFieldDatabase, actorUserId: string) {
  async function createFieldDefinition(
    input: CreateCustomFieldDefinitionInput,
  ): Promise<CustomFieldDefinition> {
    const definition = parseDefinition(input);
    return database.$transaction(
      async (transaction) => {
        const collections = await transaction.$queryRaw<Array<{ id: string }>>`
          SELECT "id"
          FROM "Collection"
          WHERE "id" = ${definition.collectionId}::uuid
            AND "ownerId" = ${actorUserId}
            AND "deletedAt" IS NULL
          FOR UPDATE
        `;
        if (collections.length !== 1) {
          throw new CustomFieldServiceError("COLLECTION_NOT_FOUND");
        }
        const duplicate = await transaction.customFieldDefinition.findUnique({
          where: {
            collectionId_normalizedName: {
              collectionId: definition.collectionId,
              normalizedName: definition.normalizedName,
            },
          },
          select: { id: true },
        });
        if (duplicate) {
          throw new CustomFieldServiceError("CUSTOM_FIELD_ALREADY_EXISTS");
        }
        const created = await transaction.customFieldDefinition.create({
          data: {
            collectionId: definition.collectionId,
            name: definition.name,
            normalizedName: definition.normalizedName,
            type: definition.type,
          },
          select: definitionSelect,
        });
        if (definition.options.length > 0) {
          await transaction.customFieldOption.createMany({
            data: definition.options.map((option) => ({
              fieldDefinitionId: created.id,
              ...option,
            })),
          });
        }
        const options = await transaction.customFieldOption.findMany({
          where: { fieldDefinitionId: created.id },
          select: { id: true, value: true, position: true },
          orderBy: { position: "asc" },
        });
        return CustomFieldDefinitionSchema.parse({
          ...created,
          options: options.map((option) => option.value),
        });
      },
      { isolationLevel: "ReadCommitted" },
    );
  }

  async function setFieldValue(
    itemIdInput: string,
    fieldDefinitionIdInput: string,
    value: unknown,
  ): Promise<CustomFieldValueRecord | null> {
    const itemIdResult = CustomFieldDefinitionSchema.shape.id.safeParse(itemIdInput);
    const fieldIdResult = CustomFieldDefinitionSchema.shape.id.safeParse(fieldDefinitionIdInput);
    if (!itemIdResult.success || !fieldIdResult.success) {
      throw new CustomFieldServiceError("CUSTOM_FIELD_NOT_FOUND");
    }
    const itemId = itemIdResult.data;
    const fieldDefinitionId = fieldIdResult.data;

    return database.$transaction(
      async (transaction) => {
        const fields = await transaction.$queryRaw<FieldTypeRow[]>`
          SELECT definition."type", definition."collectionId"
          FROM "CollectibleItem" item
          JOIN "Collection" collection ON collection."id" = item."collectionId"
          JOIN "CustomFieldDefinition" definition
            ON definition."collectionId" = item."collectionId"
          WHERE item."id" = ${itemId}::uuid
            AND definition."id" = ${fieldDefinitionId}::uuid
            AND collection."ownerId" = ${actorUserId}
            AND item."deletedAt" IS NULL
            AND collection."deletedAt" IS NULL
          FOR UPDATE OF item, definition
        `;
        const field = fields[0];
        if (!field) {
          throw new CustomFieldServiceError("CUSTOM_FIELD_NOT_FOUND");
        }
        if (value === null) {
          await transaction.customFieldValue.deleteMany({ where: { itemId, fieldDefinitionId } });
          return null;
        }
        const options = await transaction.customFieldOption.findMany({
          where: { fieldDefinitionId },
          select: { id: true, value: true, position: true },
          orderBy: { position: "asc" },
        });
        const canonical = validateFieldValue(
          field.type,
          value,
          options.map((option) => option.value),
        );
        const data = persistenceData(field.type, canonical, options);
        await transaction.customFieldValue.upsert({
          where: { itemId_fieldDefinitionId: { itemId, fieldDefinitionId } },
          create: {
            itemId,
            fieldDefinitionId,
            collectionId: field.collectionId,
            ...data,
          },
          update: data,
        });
        await transaction.customFieldMultiSelectValue.deleteMany({
          where: { itemId, fieldDefinitionId },
        });
        if (field.type === "MULTI_SELECT") {
          const selected = canonical as string[];
          const optionByValue = new Map(options.map((option) => [option.value, option]));
          if (selected.length > 0) {
            await transaction.customFieldMultiSelectValue.createMany({
              data: selected.map((optionValue, position) => {
                const option = optionByValue.get(optionValue);
                if (!option) invalidValue();
                return { itemId, fieldDefinitionId, optionId: option.id, position };
              }),
            });
          }
        }
        return { itemId, fieldDefinitionId, type: field.type, value: canonical };
      },
      { isolationLevel: "ReadCommitted" },
    );
  }

  return { createFieldDefinition, setFieldValue };
}
