import { Prisma } from "../../../db/node_modules/@prisma/client/default.js";
import { describe, expect, it } from "vitest";

import { validateFieldValue } from "../custom-fields/custom-field-service";
import { createResourceQuery, type ResourceQueryDatabase } from "./resource-query";

const itemId = "10000000-0000-4000-8000-000000000001";
const smallFieldId = "20000000-0000-4000-8000-000000000002";
const preciseFieldId = "30000000-0000-4000-8000-000000000003";

describe("resource query", () => {
  it.each([
    [smallFieldId, "0.0000001"],
    [preciseFieldId, "99999999999999999999.999999999999999999"],
  ])("returns DECIMAL %s in canonical write-contract form", async (fieldDefinitionId, written) => {
    const database = {
      async $queryRaw(query: TemplateStringsArray) {
        if (query.join("").includes('FROM "CustomFieldValue" value')) {
          return [
            {
              fieldDefinitionId,
              fieldType: "DECIMAL",
              decimalValue: new Prisma.Decimal(written),
            },
          ];
        }
        return [];
      },
    };

    const metadata = await createResourceQuery(database as ResourceQueryDatabase).getItemMetadata(
      itemId,
      "owner",
    );
    const returned = metadata.customFieldValues[0]?.value;

    expect(returned).toBe(written);
    expect(validateFieldValue("DECIMAL", returned)).toBe(written);
  });
});
