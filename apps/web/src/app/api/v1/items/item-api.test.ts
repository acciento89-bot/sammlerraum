import { PublicItemQueryError } from "@sammlerraum/domain/items/item-query";
import { describe, expect, it, vi } from "vitest";

import { createItemRouteHandlers } from "../../../../lib/collection-item-routes";

const itemId = "10000000-0000-4000-8000-000000000001";

describe("item API", () => {
  it("returns 404 for anonymous access to a public item under a private ancestor", async () => {
    const handlers = createItemRouteHandlers({
      appOrigin: "https://sammlerraum.example",
      getSession: vi.fn().mockResolvedValue(null),
      getPublicItem: vi.fn().mockRejectedValue(new PublicItemQueryError()),
      loadItem: vi.fn(),
      createItemService: vi.fn(),
    });

    const response = await handlers.GET_ITEM(
      new Request(`https://sammlerraum.example/api/v1/items/${itemId}`),
      itemId,
    );

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toMatchObject({
      error: { code: "NOT_FOUND" },
    });
  });
});
