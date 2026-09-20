import { createTrustedResourceFacts } from "@sammlerraum/domain/authz/types";
import { describe, expect, it, vi } from "vitest";

import { createCollectionRouteHandlers } from "../../../../lib/collection-item-routes";

const collection = {
  id: "20000000-0000-4000-8000-000000000002",
  name: "Pokémon",
  visibility: "PUBLIC" as const,
};
const ownerId = "owner-user";
const facts = createTrustedResourceFacts({
  type: "COLLECTION",
  ownerId,
  visibility: "PUBLIC",
  ancestorVisibility: [],
  role: null,
  moderation: "VISIBLE",
  interactionBlocked: false,
});

function dependencies(overrides: Record<string, unknown> = {}) {
  return {
    appOrigin: "https://sammlerraum.example",
    getSession: vi.fn().mockResolvedValue(null),
    loadCollection: vi.fn().mockResolvedValue({ collection, facts }),
    loadNode: vi.fn(),
    listCollections: vi.fn().mockResolvedValue([collection]),
    listNodes: vi.fn(),
    createCollectionService: vi.fn(),
    ...overrides,
  };
}

describe("collection API", () => {
  it("lists only the already-whitelisted public collection DTO for anonymous users", async () => {
    const handlers = createCollectionRouteHandlers(dependencies());
    const response = await handlers.GET_COLLECTIONS(
      new Request("https://sammlerraum.example/api/v1/collections"),
    );
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ collections: [collection] });
  });

  it("does not expose children, counts, notes, or locations from public by-id reads", async () => {
    const handlers = createCollectionRouteHandlers(dependencies());
    const response = await handlers.GET_COLLECTION(
      new Request(`https://sammlerraum.example/api/v1/collections/${collection.id}`),
      collection.id,
    );
    await expect(response.json()).resolves.toEqual({ collection });
  });

  it("soft-deletes an owner collection through the domain service", async () => {
    const deleteCollection = vi.fn().mockResolvedValue(undefined);
    const handlers = createCollectionRouteHandlers(
      dependencies({
        getSession: vi.fn().mockResolvedValue({ user: { id: ownerId } }),
        createCollectionService: vi.fn().mockReturnValue({ deleteCollection }),
      }),
    );
    const response = await handlers.DELETE_COLLECTION(
      new Request(`https://sammlerraum.example/api/v1/collections/${collection.id}`, {
        method: "DELETE",
        headers: { origin: "https://sammlerraum.example" },
      }),
      collection.id,
    );
    expect(response.status).toBe(204);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(deleteCollection).toHaveBeenCalledWith(collection.id);
  });
});
