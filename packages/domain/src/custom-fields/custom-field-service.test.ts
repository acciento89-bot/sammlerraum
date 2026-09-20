import { describe, expect, it, vi } from "vitest";

import {
  createCustomFieldService,
  type CustomFieldDatabase,
  validateFieldValue,
} from "./custom-field-service";

const itemId = "00000000-0000-4000-8000-000000000001";
const fieldId = "00000000-0000-4000-8000-000000000002";
const collectionId = "00000000-0000-4000-8000-000000000003";
const mintOptionId = "00000000-0000-4000-8000-000000000004";
const usedOptionId = "00000000-0000-4000-8000-000000000005";

describe("custom field service", () => {
  it("rejects text supplied to a number field", async () => {
    const transaction = {
      $queryRaw: vi.fn().mockResolvedValue([{ type: "INTEGER" }]),
      customFieldOption: { findMany: vi.fn().mockResolvedValue([]) },
      customFieldValue: { delete: vi.fn(), upsert: vi.fn() },
      customFieldMultiSelectValue: { deleteMany: vi.fn(), createMany: vi.fn() },
    };
    const service = createCustomFieldService(
      {
        $transaction: async <T>(operation: (tx: typeof transaction) => Promise<T>) =>
          operation(transaction),
      } as unknown as CustomFieldDatabase,
      "trusted-owner",
    );

    await expect(service.setFieldValue(itemId, fieldId, "twelve")).rejects.toMatchObject({
      code: "CUSTOM_FIELD_TYPE_MISMATCH",
    });
    expect(transaction.customFieldValue.upsert).not.toHaveBeenCalled();
  });

  it.each([
    ["SHORT_TEXT", "  Stamp  ", [], "Stamp"],
    ["LONG_TEXT", "  Line one\nLine two  ", [], "Line one\nLine two"],
    ["INTEGER", 12, [], 12],
    ["DECIMAL", "0012.3400", [], "12.34"],
    ["DATE", "2024-02-29", [], "2024-02-29"],
    ["BOOLEAN", true, [], true],
    ["SINGLE_SELECT", " Mint ", ["Mint", "Used"], "Mint"],
    ["MULTI_SELECT", ["Used", "Mint", "Used"], ["Mint", "Used"], ["Used", "Mint"]],
    ["URL", "https://example.com/catalog?q=1", [], "https://example.com/catalog?q=1"],
    ["MONEY", { amountMinor: 1_250, currency: "EUR" }, [], { amountMinor: 1_250, currency: "EUR" }],
  ] as const)("canonicalizes a valid %s value", (type, value, options, expected) => {
    expect(validateFieldValue(type, value, options)).toEqual(expected);
  });

  it.each([
    ["INTEGER", "12", []],
    ["DECIMAL", 12.5, []],
    ["BOOLEAN", "true", []],
    ["MULTI_SELECT", ["Mint", 2], ["Mint"]],
    ["MONEY", "EUR 12.50", []],
  ] as const)("rejects a mismatched primitive for %s", (type, value, options) => {
    expect(() => validateFieldValue(type, value, options)).toThrowError(
      expect.objectContaining({ code: "CUSTOM_FIELD_TYPE_MISMATCH" }),
    );
  });

  it.each([
    ["DECIMAL", "1e3", []],
    ["DECIMAL", "0.1234567890123456789", []],
    ["DECIMAL", "123456789012345678901234567890123456789", []],
    ["DATE", "2023-02-29", []],
    ["SINGLE_SELECT", "Unknown", ["Mint", "Used"]],
    ["MULTI_SELECT", ["Unknown"], ["Mint", "Used"]],
    ["URL", "javascript:alert(1)", []],
    ["URL", "https://user:secret@example.com/", []],
    ["MONEY", { amountMinor: 1250, currency: "eur" }, []],
    ["MONEY", { amountMinor: 12.5, currency: "EUR" }, []],
    ["SHORT_TEXT", "has\u0000nul", []],
  ] as const)("rejects an invalid %s value", (type, value, options) => {
    expect(() => validateFieldValue(type, value, options)).toThrowError(
      expect.objectContaining({ code: "CUSTOM_FIELD_VALUE_INVALID" }),
    );
  });

  it("creates an owner-scoped selection definition with canonical options", async () => {
    const calls: string[] = [];
    const transaction = {
      $queryRaw: vi.fn().mockImplementation(async () => {
        calls.push("lock collection");
        return [{ id: collectionId }];
      }),
      customFieldDefinition: {
        findUnique: vi.fn().mockImplementation(async () => {
          calls.push("check name");
          return null;
        }),
        create: vi.fn().mockImplementation(async ({ data }: { data: Record<string, unknown> }) => {
          calls.push("create definition");
          return { id: fieldId, ...data };
        }),
      },
      customFieldOption: {
        createMany: vi.fn().mockImplementation(async () => {
          calls.push("create options");
          return { count: 2 };
        }),
        findMany: vi.fn().mockImplementation(async () => {
          calls.push("read options");
          return [
            { id: mintOptionId, value: "Mint", position: 0 },
            { id: usedOptionId, value: "Used", position: 1 },
          ];
        }),
      },
      customFieldValue: { deleteMany: vi.fn(), upsert: vi.fn() },
      customFieldMultiSelectValue: { deleteMany: vi.fn(), createMany: vi.fn() },
    };
    const service = createCustomFieldService(
      {
        $transaction: async <T>(operation: (tx: typeof transaction) => Promise<T>) =>
          operation(transaction),
      } as unknown as CustomFieldDatabase,
      "trusted-owner",
    );

    await expect(
      service.createFieldDefinition({
        collectionId,
        name: " Condition ",
        type: "SINGLE_SELECT",
        options: [" Mint ", "Used"],
      }),
    ).resolves.toEqual({
      id: fieldId,
      collectionId,
      name: "Condition",
      type: "SINGLE_SELECT",
      options: ["Mint", "Used"],
    });
    expect(calls).toEqual([
      "lock collection",
      "check name",
      "create definition",
      "create options",
      "read options",
    ]);
  });

  it("rejects colliding canonical options before opening a transaction", async () => {
    const database = { $transaction: vi.fn() };
    const service = createCustomFieldService(
      database as unknown as CustomFieldDatabase,
      "trusted-owner",
    );

    await expect(
      service.createFieldDefinition({
        collectionId,
        name: "Condition",
        type: "MULTI_SELECT",
        options: ["Mint", "  mint  "],
      }),
    ).rejects.toMatchObject({ code: "CUSTOM_FIELD_DEFINITION_INVALID" });
    expect(database.$transaction).not.toHaveBeenCalled();
  });

  it("stores a canonical single selection and returns the public contract shape", async () => {
    const upsert = vi.fn().mockResolvedValue({ itemId, fieldDefinitionId: fieldId });
    const transaction = {
      $queryRaw: vi.fn().mockResolvedValue([{ type: "SINGLE_SELECT" }]),
      customFieldOption: {
        findMany: vi.fn().mockResolvedValue([
          { id: mintOptionId, value: "Mint", position: 0 },
          { id: usedOptionId, value: "Used", position: 1 },
        ]),
      },
      customFieldValue: { deleteMany: vi.fn(), upsert },
      customFieldMultiSelectValue: {
        deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
        createMany: vi.fn(),
      },
    };
    const service = createCustomFieldService(
      {
        $transaction: async <T>(operation: (tx: typeof transaction) => Promise<T>) =>
          operation(transaction),
      } as unknown as CustomFieldDatabase,
      "trusted-owner",
    );

    await expect(service.setFieldValue(itemId, fieldId, " mint ")).resolves.toEqual({
      itemId,
      fieldDefinitionId: fieldId,
      type: "SINGLE_SELECT",
      value: "Mint",
    });
    expect(upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          itemId,
          fieldDefinitionId: fieldId,
          fieldType: "SINGLE_SELECT",
          singleSelectOptionId: mintOptionId,
        }),
        update: expect.objectContaining({ singleSelectOptionId: mintOptionId }),
      }),
    );
  });

  it("replaces multi-selection links in caller order without duplicates", async () => {
    const createMany = vi.fn().mockResolvedValue({ count: 2 });
    const transaction = {
      $queryRaw: vi.fn().mockResolvedValue([{ type: "MULTI_SELECT" }]),
      customFieldOption: {
        findMany: vi.fn().mockResolvedValue([
          { id: mintOptionId, value: "Mint", position: 0 },
          { id: usedOptionId, value: "Used", position: 1 },
        ]),
      },
      customFieldValue: { deleteMany: vi.fn(), upsert: vi.fn().mockResolvedValue({}) },
      customFieldMultiSelectValue: {
        deleteMany: vi.fn().mockResolvedValue({ count: 1 }),
        createMany,
      },
    };
    const service = createCustomFieldService(
      {
        $transaction: async <T>(operation: (tx: typeof transaction) => Promise<T>) =>
          operation(transaction),
      } as unknown as CustomFieldDatabase,
      "trusted-owner",
    );

    await expect(
      service.setFieldValue(itemId, fieldId, ["Used", "Mint", "Used"]),
    ).resolves.toMatchObject({ value: ["Used", "Mint"] });
    expect(createMany).toHaveBeenCalledWith({
      data: [
        { itemId, fieldDefinitionId: fieldId, optionId: usedOptionId, position: 0 },
        { itemId, fieldDefinitionId: fieldId, optionId: mintOptionId, position: 1 },
      ],
    });
  });

  it("clears an optional value explicitly with null", async () => {
    const deleteMany = vi.fn().mockResolvedValue({ count: 1 });
    const transaction = {
      $queryRaw: vi.fn().mockResolvedValue([{ type: "SHORT_TEXT" }]),
      customFieldOption: { findMany: vi.fn().mockResolvedValue([]) },
      customFieldValue: { deleteMany, upsert: vi.fn() },
      customFieldMultiSelectValue: { deleteMany: vi.fn(), createMany: vi.fn() },
    };
    const service = createCustomFieldService(
      {
        $transaction: async <T>(operation: (tx: typeof transaction) => Promise<T>) =>
          operation(transaction),
      } as unknown as CustomFieldDatabase,
      "trusted-owner",
    );

    await expect(service.setFieldValue(itemId, fieldId, null)).resolves.toBeNull();
    expect(deleteMany).toHaveBeenCalledWith({
      where: { itemId, fieldDefinitionId: fieldId },
    });
    expect(transaction.customFieldValue.upsert).not.toHaveBeenCalled();
  });

  it("does not reveal or mutate a missing, foreign, or cross-collection target", async () => {
    const upsert = vi.fn();
    const transaction = {
      $queryRaw: vi.fn().mockResolvedValue([]),
      customFieldOption: { findMany: vi.fn() },
      customFieldValue: { deleteMany: vi.fn(), upsert },
      customFieldMultiSelectValue: { deleteMany: vi.fn(), createMany: vi.fn() },
    };
    const service = createCustomFieldService(
      {
        $transaction: async <T>(operation: (tx: typeof transaction) => Promise<T>) =>
          operation(transaction),
      } as unknown as CustomFieldDatabase,
      "trusted-owner",
    );

    await expect(service.setFieldValue(itemId, fieldId, "secret")).rejects.toMatchObject({
      code: "CUSTOM_FIELD_NOT_FOUND",
      message: "Custom field target not found",
    });
    expect(upsert).not.toHaveBeenCalled();
  });
});
